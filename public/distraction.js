import {assetIsActive,isParameter,isState,nodesConnected,hasNode,clone,facingDirection,descendants} from './model.js';
import {placementBehaviours,effectOverlay,blockedNodes} from './behaviour-areas.js';
import {matchesSelection} from './object-selection.js';

const cell=p=>`${p.x},${p.y}`;
export function objectsHit(project,level,destination,excludedId=null){
  return level.instances.filter(i=>i.id!==excludedId&&i.x===destination.x&&i.y===destination.y&&assetIsActive(project,i.assetId,i)&&!isParameter(project.assets.find(a=>a.id===i.assetId))&&!isState(project.assets.find(a=>a.id===i.assetId)));
}

// Both the hover preview and impact use exactly the same area and recipients.
export function distractionReactions(project,level,projectile,hits,inventory=[],thrower=null){
  const reactions=[];
  for(const source of hits)for(const {assigned,behaviour:b} of placementBehaviours(project,source)){
    if(b.type!=='distraction'||b.distractionTrigger==='stateChange'||!matchesSelection(project,projectile,b.hitAssetIds))continue;
    if(b.destinationMode==='throwerPosition'&&!thrower)continue;
    const self=b.distractTarget==='self',root=project.assets.find(a=>a.id===source.assetId);
    const overlay=self?{cells:[[source.x,source.y]],color:assigned.color||root.color}:effectOverlay(project,root,assigned,source,level,inventory),area=new Set(overlay.cells.map(([x,y])=>`${x},${y}`)),targetIds=[];
    for(const target of level.instances){
      const asset=project.assets.find(a=>a.id===target.assetId);
      if((self?target.id!==source.id:target.id===source.id)||target.id===projectile.id||target.locked||isParameter(asset)||isState(asset)||!assetIsActive(project,target.assetId,target)||!area.has(cell(target))||!self&&!matchesSelection(project,target,b.distractAssetIds))continue;
      targetIds.push(target.id);
    }
    const goal=b.destinationMode==='throwerPosition'?thrower:source;
    reactions.push({sourceId:source.id,assignedId:assigned.id,behaviour:b,cells:overlay.cells,color:overlay.color,targetIds,destination:{x:goal.x,y:goal.y}});
  }
  return reactions;
}

// Impact reactions run before the projectile is consumed. The receiver's own
// parameter supplies its attraction area; walking afterward may leave this area.
export function distractOnImpact(project,level,projectile,hits,inventory=[],thrower=null){
  const log=[];
  for(const reaction of distractionReactions(project,level,projectile,hits,inventory,thrower)){
    const source=level.instances.find(i=>i.id===reaction.sourceId),b=reaction.behaviour;
    for(const id of reaction.targetIds){
      startDistraction(project,level.instances.find(i=>i.id===id),source,b,reaction.destination,['throwerPosition','hitPosition'].includes(b.destinationMode));
    }
    log.push({assetName:project.assets.find(a=>a.id===source.assetId).name,type:'distraction',count:reaction.targetIds.length});
  }
  return log;
}

function startDistraction(project,target,source,b,destination,fixed=false){
  const previous=target.distraction,asset=project.assets.find(a=>a.id===target.assetId);
  const originFacing=Object.hasOwn(previous||{},'originFacing')?previous.originFacing:facingDirection(asset,target);
  const originFacingInherited=previous?.originFacingInherited??(target.direction===undefined);
  target.distraction={sourceId:source.id,behaviourId:b.id,origin:clone(previous?.origin||{x:target.x,y:target.y}),originFacing,originFacingInherited,destination:clone(destination),...(fixed?{fixedDestination:true}:{}),phase:'approach',steps:b.steps,returnToStart:b.returnToStart,approachWait:b.approachDelay??0,returnWait:b.returnDelay??0};
}

const activeStates=(project,source)=>JSON.stringify(descendants(project,source.assetId).filter(a=>isState(a)&&assetIsActive(project,a.id,source)).map(a=>a.id));
const areaCells=(project,level,source,assigned,inventory)=>new Set(effectOverlay(project,project.assets.find(a=>a.id===source.assetId),assigned,source,level,inventory).cells.map(([x,y])=>`${x},${y}`));
function beamCells(project,level,source,b,inventory){
  const covered=new Set();
  for(const parameter of descendants(project,source.assetId)){
    if(!isParameter(parameter)||!assetIsActive(project,parameter.id,source)||!b.beamParameterIds.some(id=>id===parameter.id||id===parameter.parameterId))continue;
    for(const key of areaCells(project,level,source,parameter,inventory))covered.add(key);
  }
  return covered;
}

// Capture geometry before an atomic state switch, including exclusive siblings.
// No persistent history is needed: each switch compares its own before/after beam.
export function captureStateDistractions(project,source,inventory=[]){
  const candidates=[project.assets.find(a=>a.id===source.assetId),...descendants(project,source.assetId)].flatMap(assigned=>(assigned.behaviours||[])
    .filter(b=>b.enabled&&b.type==='distraction'&&b.distractionTrigger==='stateChange'&&b.beamParameterIds.length).map(b=>({assigned,b})));
  if(!candidates.length)return null;
  const level=project.levels.find(l=>l.instances.includes(source));
  if(!level)return null;
  return {level,states:activeStates(project,source),entries:candidates.map(({assigned,b})=>({assigned,b,active:assetIsActive(project,assigned.id,source),area:areaCells(project,level,source,assigned,inventory),beam:beamCells(project,level,source,b,inventory)}))};
}

export function distractOnStateChange(project,source,before,inventory=[]){
  if(!before||before.states===activeStates(project,source))return;
  const {level}=before;
  for(const entry of before.entries){
    const {assigned,b}=entry,active=assetIsActive(project,assigned.id,source);
    if(!entry.active&&!active)continue;
    const area=active?areaCells(project,level,source,assigned,inventory):entry.area,beam=beamCells(project,level,source,b,inventory);
    for(const target of level.instances){
      const asset=project.assets.find(a=>a.id===target.assetId),key=cell(target);
      if(target.id===source.id||target.locked||isParameter(asset)||isState(asset)||!assetIsActive(project,target.assetId,target)||!area.has(key)||!matchesSelection(project,target,b.distractAssetIds))continue;
      // Outside now, or newly caught inside: only inside both beams is exempt.
      if(beam.has(key)&&entry.beam.has(key))continue;
      startDistraction(project,target,source,b,{x:source.x,y:source.y});
    }
  }
}

// Playtest inspector edits use model actions, outside the effect switch path.
export function distractAfterStateEdit(before,after,levelId,instanceId,inventory=[]){
  const old=before.levels.find(l=>l.id===levelId)?.instances.find(i=>i.id===instanceId),level=after.levels.find(l=>l.id===levelId),source=level?.instances.find(i=>i.id===instanceId);
  if(!old||!source)return;
  const snapshot=captureStateDistractions(before,old,inventory);
  if(snapshot)distractOnStateChange(after,source,{...snapshot,level},inventory);
}

function arrived(project,level,instance,d,inventory=[]){
  const goal=d.phase==='return'?d.origin:d.destination;
  if(!hasNode(level,cell(goal)))return false;
  if(cell(instance)===cell(goal))return true;
  if(d.phase==='return')return false;
  const occupied=level.instances.some(i=>i.id!==instance.id&&cell(i)===cell(goal)&&assetIsActive(project,i.assetId,i)&&!isParameter(project.assets.find(a=>a.id===i.assetId))&&!project.assets.find(a=>a.id===i.assetId).nonBlocking);
  return occupied&&nodesConnected(level,cell(instance),cell(goal))&&!blockedNodes(project,level,instance.assetId,'movement',instance.id,inventory).has(cell(instance));
}

// The ordinary move target and patrol progress are untouched, ready to resume.
// A completed return still owns this turn, preventing an extra patrol step.
export function advanceDistractions(project,level,move,inventory=[],instances=level.instances){
  const log=[];
  for(const instance of instances){
    const d=instance.distraction;
    if(!d||!level.instances.includes(instance))continue;
    // Dead is the same active-state convention used by game outcomes. A corpse
    // may remain on the board for its lifetime, but cannot investigate or return.
    if(descendants(project,instance.assetId).some(a=>isState(a)&&a.name.trim().toLowerCase()==='dead'&&assetIsActive(project,a.id,instance))){delete instance.distraction;continue;}
    if(instance.locked||!assetIsActive(project,instance.assetId,instance))continue;
    const source=level.instances.find(i=>i.id===d.sourceId&&assetIsActive(project,i.assetId,i));
    if(d.phase==='approach'&&!d.fixedDestination){
      if(source)d.destination={x:source.x,y:source.y};
      else if(d.returnToStart){d.phase='return';d.returnWait=0;}
      else{delete instance.distraction;continue;}
    }
    const waitKey=d.phase==='approach'?'approachWait':'returnWait';
    if((d[waitKey]??0)>0){
      d[waitKey]--;
      log.push({assetName:project.assets.find(a=>a.id===instance.assetId).name,type:'distraction',count:0});
      continue;
    }
    const destination=d.phase==='return'?d.origin:d.destination;
    const count=move(instance,{type:'position',...destination},d.steps,d.phase==='return');
    if(arrived(project,level,instance,d,inventory)){
      if(d.phase==='approach'&&d.returnToStart)d.phase='return';
      else{
        if(d.phase==='return'&&Object.hasOwn(d,'originFacing')){
          const root=project.assets.find(a=>a.id===instance.assetId);
          if(d.originFacingInherited&&(root.direction??null)===d.originFacing)delete instance.direction;
          else instance.direction=d.originFacing;
        }
        delete instance.distraction;
      }
    }
    log.push({assetName:project.assets.find(a=>a.id===instance.assetId).name,type:'distraction',count});
  }
  return log;
}
