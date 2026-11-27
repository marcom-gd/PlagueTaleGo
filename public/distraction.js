import {assetIsActive,isParameter,isState,nodesConnected,hasNode,clone,facingDirection} from './model.js';
import {placementBehaviours,effectOverlay,blockedNodes} from './behaviour-areas.js';
import {matchesSelection} from './object-selection.js';

const cell=p=>`${p.x},${p.y}`;
export function objectsHit(project,level,destination,excludedId=null){
  return level.instances.filter(i=>i.id!==excludedId&&i.x===destination.x&&i.y===destination.y&&assetIsActive(project,i.assetId,i)&&!isParameter(project.assets.find(a=>a.id===i.assetId))&&!isState(project.assets.find(a=>a.id===i.assetId)));
}

// Both the hover preview and impact use exactly the same area and recipients.
export function distractionReactions(project,level,projectile,hits,inventory=[]){
  const reactions=[];
  for(const source of hits)for(const {assigned,behaviour:b} of placementBehaviours(project,source)){
    if(b.type!=='distraction'||!matchesSelection(project,projectile,b.hitAssetIds))continue;
    const root=project.assets.find(a=>a.id===source.assetId),overlay=effectOverlay(project,root,assigned,source,level,inventory),area=new Set(overlay.cells.map(([x,y])=>`${x},${y}`)),targetIds=[];
    for(const target of level.instances){
      const asset=project.assets.find(a=>a.id===target.assetId);
      if(target.id===source.id||target.id===projectile.id||target.locked||isParameter(asset)||isState(asset)||!assetIsActive(project,target.assetId,target)||!area.has(cell(target))||!matchesSelection(project,target,b.distractAssetIds))continue;
      targetIds.push(target.id);
    }
    reactions.push({sourceId:source.id,assignedId:assigned.id,behaviour:b,cells:overlay.cells,color:overlay.color,targetIds});
  }
  return reactions;
}

// Impact reactions run before the projectile is consumed. The receiver's own
// parameter supplies its attraction area; walking afterward may leave this area.
export function distractOnImpact(project,level,projectile,hits,inventory=[]){
  const log=[];
  for(const reaction of distractionReactions(project,level,projectile,hits,inventory)){
    const source=level.instances.find(i=>i.id===reaction.sourceId),b=reaction.behaviour;
    for(const id of reaction.targetIds){
      const target=level.instances.find(i=>i.id===id),previous=target.distraction,asset=project.assets.find(a=>a.id===target.assetId);
      const originFacing=Object.hasOwn(previous||{},'originFacing')?previous.originFacing:facingDirection(asset,target);
      const originFacingInherited=previous?.originFacingInherited??(target.direction===undefined);
      target.distraction={sourceId:source.id,origin:clone(previous?.origin||{x:target.x,y:target.y}),originFacing,originFacingInherited,destination:{x:source.x,y:source.y},phase:'approach',steps:b.steps,returnToStart:b.returnToStart,approachWait:b.approachDelay??0,returnWait:b.returnDelay??0};
    }
    log.push({assetName:project.assets.find(a=>a.id===source.assetId).name,type:'distraction',count:reaction.targetIds.length});
  }
  return log;
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
export function advanceDistractions(project,level,move,inventory=[]){
  const log=[];
  for(const instance of level.instances){
    const d=instance.distraction;
    if(!d||instance.locked||!assetIsActive(project,instance.assetId,instance))continue;
    const source=level.instances.find(i=>i.id===d.sourceId&&assetIsActive(project,i.assetId,i));
    if(d.phase==='approach'){
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
