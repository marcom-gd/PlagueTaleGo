import {clone,uid,validateProject,descendants,assetIsActive,isState,isParameter,parameterOverlay,effectRotation,hasNode,nodesConnected,isClosedPatrol,wallBlocks,pruneWaitProgress} from './model.js';
import {eligibilityMode} from './behaviour-schema.js';
import {matchesSelection,taggedObjects,nearestTaggedObject} from './object-selection.js';
import {blockedNodes,effectOverlay,effectCanReach,placementBehaviours} from './behaviour-areas.js';
import {floorBlocks} from './model.js';
import {advanceDistractions} from './distraction.js';
import {gameOutcome} from './game-outcomes.js';
import {carriedItems,interactionOwners,pickUpObject,releaseMissingCarriers} from './carried-items.js';
import {syncLifetimes,advanceLifetimes} from './lifetimes.js';
import {setState} from './state-effects.js';

export function orderedBehaviours(project) {
  const rows=project.assets.filter(a=>!a.parameterId).flatMap(asset=>(asset.behaviours||[]).map(behaviour=>({asset,behaviour})));
  const ranks=new Map((project.behaviourOrder||[]).map((id,n)=>[id,n]));
  return rows.sort((a,b)=>(ranks.get(a.behaviour.id)??Infinity)-(ranks.get(b.behaviour.id)??Infinity));
}
const cell=i=>`${i.x},${i.y}`;
const neighbours=key=>{const [x,y]=key.split(',').map(Number);return [`${x},${y-1}`,`${x+1},${y}`,`${x},${y+1}`,`${x-1},${y}`];};
function pathTo(level,start,goal,occupied) {
  if(start===goal)return [];
  if(!hasNode(level,start)||!hasNode(level,goal))return [];
  const previous=new Map([[start,null]]),queue=[start];
  for(let n=0;n<queue.length;n++){
    const key=queue[n];
    for(const next of neighbours(key)){
      if(previous.has(next)||occupied.has(next)||!nodesConnected(level,key,next))continue;
      previous.set(next,key);
      if(next===goal){const result=[next];while(previous.get(result[0])!==start)result.unshift(previous.get(result[0]));return result;}
      queue.push(next);
    }
  }
  return [];
}
function move(project,level,instance,b,owner,currentTarget=instance.moveTarget,inventory=[]) {
  if(instance.locked)return 0;
  const occupied=new Set(level.instances.filter(i=>{
    if(i===instance)return false;
    const asset=project.assets.find(a=>a.id===i.assetId);
    return !asset.nonBlocking&&!isParameter(asset)&&assetIsActive(project,i.assetId,i);
  }).map(cell));
  for(const key of blockedNodes(project,level,instance.assetId,'movement',instance.id,inventory))occupied.add(key);
  let moved=0;
  const step=next=>{
    if(!next||occupied.has(next)||!nodesConnected(level,cell(instance),next))return false;
    const [x,y]=next.split(',').map(Number),dx=x-instance.x,dy=y-instance.y;
    if(owner.autoFacing)instance.direction=dx?(dx>0?90:270):(dy>0?180:0);
    instance.x=x;instance.y=y;moved++;return true;
  };
  if(b.type==='moveAway'){
    const target=currentTarget;
    const position=target?.type==='object'?interactionOwners(project,level,inventory).find(i=>i.id===target.id&&assetIsActive(project,i.assetId,i)):target?.type==='tags'?nearestTaggedObject(project,level,instance,target.tagIds):target?.type==='position'?target:null;
    if(!position||position===instance)return 0;
    const distance=key=>{const [x,y]=key.split(',').map(Number);return Math.abs(x-position.x)+Math.abs(y-position.y);};
    for(let n=0;n<b.steps;n++){
      const current=cell(instance),next=neighbours(current).filter(key=>!occupied.has(key)&&nodesConnected(level,current,key)&&distance(key)>distance(current)).sort((a,b)=>distance(b)-distance(a))[0];
      if(!step(next))break;
    }
    return moved;
  }
  if(b.target==='current'){
    const target=currentTarget;
    const position=target?.type==='object'?interactionOwners(project,level,inventory).find(i=>i.id===target.id&&assetIsActive(project,i.assetId,i)):target?.type==='tags'?nearestTaggedObject(project,level,instance,target.tagIds):target?.type==='position'?target:instance;
    if(!position)return 0;
    const goal=cell(position);
    if(goal===cell(instance))return 0;
    // An occupied object target is approached to an adjacent free node.
    const goals=occupied.has(goal)?b.exactDestination?[]:neighbours(goal).filter(key=>nodesConnected(level,key,goal)&&!occupied.has(key)):[goal];
    if(goals.includes(cell(instance)))return 0;
    const routes=goals.map(g=>pathTo(level,cell(instance),g,occupied)).filter(r=>r.length).sort((a,b)=>a.length-b.length);
    for(const next of (routes[0]||[]).slice(0,b.steps))if(!step(next))break;
    return moved;
  }
  const patrolId=instance.referenceOverrides?.[b.patrolId]||level.referenceOverrides?.[b.patrolId]||b.patrolId;
  const patrol=level.patrols.find(p=>patrolId?p.id===patrolId:instance.patrolColor&&p.color.toLowerCase()===instance.patrolColor.toLowerCase());
  if(!patrol||patrol.nodes.length<2)return 0;
  instance.patrolProgress??={};
  const initial=b.target==='patrolStart'?'start':'end',loop=b.patrolMode==='loop';
  const progress=Object.hasOwn(instance.patrolProgress,b.id)?instance.patrolProgress[b.id]:null;
  if(isClosedPatrol(patrol.nodes)){
    const nodes=patrol.nodes.slice(0,-1);
    const entry=nodes[0];
    let joining=progress!=='start'&&progress!=='end'&&cell(instance)!==entry;
    let direction=(progress==='start'||progress==='end'?progress==='end':initial==='start')?1:-1;
    for(let n=0;n<b.steps;n++){
      const index=nodes.indexOf(cell(instance));
      if(joining||index<0){
        if(!step(pathTo(level,cell(instance),entry,occupied)[0]))break;
        joining=cell(instance)!==entry;
        continue;
      }
      const next=(index+direction+nodes.length)%nodes.length;
      if(!step(nodes[next]))break;
      if(!loop&&next===0)direction=-direction;
    }
    instance.patrolProgress={...instance.patrolProgress,[b.id]:joining?(direction===1?'loopStart':'loopEnd'):(direction===1?'end':'start')};
    return moved;
  }
  let destination=progress||initial;
  if(!loop&&destination.startsWith('loop'))destination=destination==='loopStart'?'start':'end';
  for(let n=0;n<b.steps;n++){
    if(destination.startsWith('loop')){
      const goal=destination==='loopStart'?patrol.nodes[0]:patrol.nodes.at(-1);
      if(cell(instance)!==goal){if(!step(pathTo(level,cell(instance),goal,occupied)[0]))break;continue;}
      destination=initial==='start'?'end':'start';
    }
    let index=patrol.nodes.indexOf(cell(instance));
    if(index<0){const goal=destination==='start'?patrol.nodes[0]:patrol.nodes.at(-1);if(!step(pathTo(level,cell(instance),goal,occupied)[0]))break;continue;}
    if(loop&&destination!==initial&&(index===0&&destination==='start'||index===patrol.nodes.length-1&&destination==='end')){
      destination=initial==='start'?'loopStart':'loopEnd';
      const goal=initial==='start'?patrol.nodes[0]:patrol.nodes.at(-1);
      if(!step(pathTo(level,cell(instance),goal,occupied)[0]))break;
      continue;
    }
    if(index===0&&destination==='start')destination='end';
    if(index===patrol.nodes.length-1&&destination==='end')destination='start';
    if(!step(patrol.nodes[index+(destination==='end'?1:-1)]))break;
  }
  instance.patrolProgress={...instance.patrolProgress,[b.id]:destination};
  return moved;
}

export const resolveReference=(level,owner,id)=>owner.referenceOverrides?.[id]||level.referenceOverrides?.[id]||id;
export function linkedObjects(project,level,owner){
  const ids=new Set(level.objectLinks.filter(link=>link.instanceIds.includes(owner.id)).flatMap(link=>link.instanceIds));
  return [...ids].filter(id=>id!==owner.id).map(id=>level.instances.find(i=>i.id===id)).filter(i=>i&&assetIsActive(project,i.assetId,i)&&!isParameter(project.assets.find(a=>a.id===i.assetId)));
}
function putInTray(tray,target){
  if(tray.reduce((n,s)=>n+s.items.length,0)>=30000)throw Error('Tray exceeds the 30,000 stored objects limit. Previous state preserved.');
  const stack=tray.find(s=>s.assetId===target.assetId&&!s.items.some(i=>i.carriedBy||i.lifetimeProgress)&&!target.lifetimeProgress);
  if(stack){stack.items.push(clone(target));if(stack.count!==0)stack.count++;}
  else tray.push({id:target.id,assetId:target.assetId,count:1,items:[clone(target)]});
}
function transferObject(project,level,tray,instance,assetId,makeId,inventory=[],visualEffects=[],destination='inventory'){
  const stored=inventory.find(s=>s.items.some(i=>i.id===instance.id)),source=stored?.items.find(i=>i.id===instance.id)||instance;
  if(assetId===instance.assetId){
    const item={...source,x:instance.x,y:instance.y,sourceLevelId:level.id};delete item.carriedBy;
    if(stored){stored.items=stored.items.filter(i=>i.id!==instance.id);if(stored.count!==0)stored.count=stored.items.length;if(!stored.items.length)inventory.splice(inventory.indexOf(stored),1);}
    else level.instances=level.instances.filter(i=>i.id!==instance.id);
    putInTray(tray,item);visualEffects.push({type:'tray',levelId:level.id,instance:clone(item),from:{x:instance.x,y:instance.y},tray:destination});return item;
  }
  const root=project.assets.find(a=>a.id===instance.assetId),asset=project.assets.find(a=>a.id===assetId);
  const parent=project.assets.find(a=>a.id===asset.parentId),contents=new Set(descendants(project,assetId).map(a=>a.id));
  const item={id:makeId(),assetId,x:instance.x,y:instance.y,rotation:effectRotation(project,root,parent,instance.rotation),detached:true,sourceLevelId:level.id};
  if(source.stateOverrides)item.stateOverrides=Object.fromEntries(Object.entries(source.stateOverrides).filter(([id])=>contents.has(id)));
  if(source.removedAssetIds)item.removedAssetIds=source.removedAssetIds.filter(id=>contents.has(id));
  if(source.referenceOverrides)item.referenceOverrides=source.referenceOverrides;
  const waitProgress=source.waitProgress?.filter(entry=>entry.assignedId===assetId||contents.has(entry.assignedId));
  if(waitProgress?.length)item.waitProgress=waitProgress;
  const lifetimeProgress=source.lifetimeProgress?.filter(entry=>entry.assignedId===assetId||contents.has(entry.assignedId));
  if(lifetimeProgress?.length)item.lifetimeProgress=lifetimeProgress;
  putInTray(tray,item);
  visualEffects.push({type:'tray',levelId:level.id,instance:clone(item),from:{x:instance.x,y:instance.y},tray:destination});
  source.removedAssetIds=[...(source.removedAssetIds||[]).filter(id=>!contents.has(id)),assetId];
  pruneWaitProgress(project,source);
  return item;
}
function pruneLinks(level){
  const ids=new Set(level.instances.map(i=>i.id));
  level.objectLinks=level.objectLinks.map(link=>({...link,instanceIds:link.instanceIds.filter(id=>ids.has(id))})).filter(link=>link.instanceIds.length>=2);
}
function teleport(project,level,owner,target,destination,events,inventory=[]){
  if(target.carriedBy)return false;
  if(target.locked)return false;
  let position=destination;
  if(destination.type==='tags')position=nearestTaggedObject(project,level,target,destination.tagIds);
  if(destination.type==='object')position=interactionOwners(project,level,inventory).find(i=>i.id===resolveReference(level,owner,destination.id)&&assetIsActive(project,i.assetId,i));
  if(destination.type==='linked'){
    const linked=linkedObjects(project,level,target),id=destination.id&&resolveReference(level,owner,destination.id);
    position=id?linked.find(i=>i.id===id):linked[0];
  }
  if(!position||position.x<0||position.y<0||position.x>=level.width||position.y>=level.height||level.tiles[cell(position)]==='wall'||blockedNodes(project,level,target.assetId,'movement',target.id,inventory).has(cell(position)))return false;
  if(cell(position)===cell(target))return false;
  const dx=position.x-target.x,dy=position.y-target.y;
  if(project.assets.find(a=>a.id===target.assetId)?.autoFacing)target.direction=Math.abs(dx)>=Math.abs(dy)?(dx>0?90:270):(dy>0?180:0);
  target.x=position.x;target.y=position.y;
  events.push({type:'moved',levelId:level.id,instanceId:target.id});return true;
}
const placedTarget=instance=>({instance,assetId:instance.assetId});
function nestedTargets(project,instance,assetIds){
  return descendants(project,instance.assetId).filter(a=>assetIds.has(a.id)&&!isState(a)&&!isParameter(a)&&assetIsActive(project,a.id,instance)).map(a=>({instance,assetId:a.id}));
}
function effectTargets(project,level,owner,assigned,b,inventory=[]){
  const mode=eligibilityMode(b);
  if(mode==='linked')return linkedObjects(project,level,owner).filter(target=>!floorBlocks(level.tiles,owner.x,owner.y,target.x,target.y)&&effectCanReach(project,level,owner,target,null,inventory)&&(!assigned.occludedByWalls||!wallBlocks(level.tiles,owner.x,owner.y,target.x,target.y))).map(placedTarget);
  const cells=new Set(effectOverlay(project,project.assets.find(a=>a.id===owner.assetId),assigned,owner,level,inventory).cells.map(([x,y])=>`${x},${y}`));
  const selectedIds=mode==='selected'&&['switchState','graveyard','inventory','flush'].includes(b.action)?b.eligibleAssetIds:null;
  const nestedIds=new Set(selectedIds?project.assets.filter(a=>a.parentId&&selectedIds.includes(a.id)).map(a=>a.id):[]);
  return level.instances.flatMap(i=>{
    if(!cells.has(cell(i))||!assetIsActive(project,i.assetId,i))return [];
    const placed=i.id!==owner.id&&!isParameter(project.assets.find(a=>a.id===i.assetId))&&matchesSelection(project,i,mode==='any'?null:b.eligibleAssetIds,mode==='tags'?b.eligibleTagIds:undefined);
    return [...(placed?[placedTarget(i)]:[]),...(nestedIds.size?nestedTargets(project,i,nestedIds):[])];
  });
}
function applyEffectTo(project,level,owner,b,targets,inventory,graveyard,events,makeId,visualEffects){
  let eligible=[...targets];
  if(b.action==='flush'){
    const types=new Set(eligible.map(t=>t.assetId)),blocked=blockedNodes(project,level,owner.assetId,'effects',owner.id,inventory);
    const nestedIds=new Set(b.type==='applyEffect'&&eligibilityMode(b)==='selected'?b.eligibleAssetIds?.filter(id=>types.has(id)):[]);
    const candidates=level.instances.flatMap(i=>{
      if(blocked.has(cell(i))||!assetIsActive(project,i.assetId,i))return [];
      return [...(i.id!==owner.id&&types.has(i.assetId)?[placedTarget(i)]:[]),...(nestedIds.size?nestedTargets(project,i,nestedIds):[])];
    });
    const targetKey=t=>JSON.stringify([t.instance.id,t.assetId]);
    const visited=new Set(eligible.map(targetKey)),groups=new Map(),queue=[],reached=new Map(),reach=b.flushReach??Infinity;
    const key=(assetId,position)=>JSON.stringify([assetId,position]);
    for(const target of candidates){const id=key(target.assetId,cell(target.instance));if(!groups.has(id))groups.set(id,[]);groups.get(id).push(target);}
    for(const seed of eligible){const position=cell(seed.instance),id=key(seed.assetId,position);if(!reached.has(id)){reached.set(id,1);queue.push({assetId:seed.assetId,position,depth:1});}}
    for(let n=0;n<queue.length;n++){
      const source=queue[n];
      for(const target of groups.get(key(source.assetId,source.position))||[])if(!visited.has(targetKey(target))){visited.add(targetKey(target));eligible.push(target);}
      if(source.depth>=reach)continue;
      for(const position of neighbours(source.position)){
        const id=key(source.assetId,position);if(reached.has(id)||!groups.has(id))continue;
        reached.set(id,source.depth+1);queue.push({assetId:source.assetId,position,depth:source.depth+1});
      }
    }
    // Preserved cells still propagate the flush. Distance is measured from the
    // nearest initial catch, with stacks sharing one cell and one distance.
    eligible=eligible.filter(target=>(reached.get(key(target.assetId,cell(target.instance)))??1)>(b.flushPreserve??0));
  }
  let count=0;
  for(const {instance:target,assetId} of eligible){
    const stored=inventory.find(s=>s.items.includes(target));
    if(!level.instances.includes(target)&&!stored||(assetId!==target.assetId&&!assetIsActive(project,assetId,target)))continue;
    if(b.action==='switchState'){if(setState(project,target,b,assetId))count++;}
    if(b.action==='setMoveTarget'){
      target.moveTarget=b.moveTarget.type==='self'?{type:'object',id:owner.id}:clone(b.moveTarget);
      if(b.moveTarget.type==='object')target.moveTarget.id=resolveReference(level,owner,b.moveTarget.id);count++;
    }
    if(['graveyard','flush','inventory'].includes(b.action)){
      if(stored){
        if(b.action==='inventory')continue;
        stored.items=stored.items.filter(i=>i!==target);stored.count=stored.items.length;
        if(!stored.count)inventory.splice(inventory.indexOf(stored),1);
        const item=clone(target);delete item.carriedBy;putInTray(graveyard,item);
        const carrier=level.instances.find(i=>i.id===target.carriedBy?.instanceId);
        visualEffects.push({type:'tray',levelId:level.id,instance:clone(item),from:{x:carrier?.x??target.x,y:carrier?.y??target.y},tray:'graveyard'});count++;continue;
      }
      const item=transferObject(project,level,b.action==='inventory'?inventory:graveyard,target,assetId,makeId,inventory,visualEffects,b.action==='inventory'?'inventory':'graveyard');count++;
      if(b.action==='inventory')events.push({type:'inventoryAdded',levelId:level.id,instanceId:item.id,instance:clone(item)});
    }
    if(b.action==='teleport'&&!stored&&teleport(project,level,owner,target,b.destination,events,inventory))count++;
  }
  pruneLinks(level);return count;
}
function expand(project,level,owner,assigned,b,makeId,inventory=[],visualEffects=[]){
  const root=project.assets.find(a=>a.id===owner.assetId);let count=0;
  for(const [x,y] of effectOverlay(project,root,assigned,owner,level,inventory).cells){
    if(!hasNode(level,`${x},${y}`)||(!b.allowStacking&&level.instances.some(i=>i.assetId===root.id&&i.x===x&&i.y===y)))continue;
    if(level.instances.length>=1000)throw Error('Expansion exceeds the 1,000 objects per level limit. Previous turn preserved.');
    const copy={...clone(owner),id:makeId(),x,y,locked:false};delete copy.carriedBy;delete copy.sourceLevelId;
    level.instances.push(copy);count++;
    visualEffects.push({type:'expand',levelId:level.id,instance:clone(copy),from:{x:owner.x,y:owner.y}});
  }
  return count;
}
function spawn(project,level,owner,b,makeId,visualEffects){
  const asset=project.assets.find(a=>a.id===b.spawnAssetId);
  if(!asset||isState(asset)||isParameter(asset))return 0;
  if(level.instances.length+b.spawnCount>1000)throw Error('Spawn exceeds the 1,000 objects per level limit. Previous state preserved.');
  for(let n=0;n<b.spawnCount;n++){
    const instance={id:makeId(),assetId:asset.id,x:owner.x,y:owner.y,rotation:asset.rotation??0,locked:false,note:''};
    level.instances.push(instance);visualEffects.push({type:'spawn',levelId:level.id,instance:clone(instance),from:{x:owner.x,y:owner.y}});
  }
  return b.spawnCount;
}
function teleportTargets(project,level,owner,b){
  if(b.teleportTarget==='tags')return taggedObjects(project,level,b.targetTagIds);
  const target=b.teleportTarget==='self'?owner:level.instances.find(i=>i.id===resolveReference(level,owner,b.targetInstanceId)&&assetIsActive(project,i.assetId,i));
  return target?[target]:[];
}
const logEntry=(project,owner,b,count)=>({instanceId:owner.id,assetName:project.assets.find(a=>a.id===owner.assetId).name,type:b.type,...((b.trigger?.action||b.action)?{action:b.trigger?.action||b.action}:{}),...(b.trigger?{triggerType:b.trigger.type}:{}),count});

function waitTurn(instance,assignedId,b){
  instance.waitProgress??=[];
  let progress=instance.waitProgress.find(entry=>entry.assignedId===assignedId&&entry.behaviourId===b.id);
  if(!progress){
    progress={assignedId,behaviourId:b.id,remaining:b.turns};
    instance.waitProgress.push(progress);
  }
  if(progress.remaining===0)return false;
  progress.remaining--;
  return true;
}

// A fixed queue keeps new copies from acting until the following turn. Passive
// blockers and clickable Use actions are evaluated from the current state.
export function resolveTurn(input,inventory=[],graveyard=[],makeId=uid,outcomeLevelId=input.levels[0]?.id,freshLifetimeKeys=[]){
  const project=clone(validateProject(input)),nextInventory=clone(inventory),nextGraveyard=clone(graveyard),log=[],events=[],visualEffects=[];
  const initialized=syncLifetimes(project,nextInventory);
  let outcome=gameOutcome(project,nextGraveyard,outcomeLevelId);
  const ranks=new Map(orderedBehaviours(project).map(({behaviour},n)=>[behaviour.id,n])),queue=[],waiting=new Set();
  const distracted=new Set(project.levels.flatMap(l=>l.instances.filter(i=>i.distraction).map(i=>i.id)));
  for(const level of project.levels)log.push(...advanceDistractions(project,level,(instance,target,steps,exactDestination)=>move(project,level,instance,{type:'moveTo',target:'current',steps,exactDestination},project.assets.find(a=>a.id===instance.assetId),target,nextInventory),nextInventory));
  for(const level of project.levels)for(const instance of interactionOwners(project,level,nextInventory)){
    pruneWaitProgress(project,nextInventory.flatMap(s=>s.items).find(i=>i.id===instance.id)||instance);
    for(const assigned of [project.assets.find(a=>a.id===instance.assetId),...descendants(project,instance.assetId)]){
      for(const b of assigned.behaviours||[])if(!['useEffect','pickUp','lifetime','throwObject','onHit','distraction','advanceOnEvent'].includes(b.type))queue.push({levelId:level.id,instanceId:instance.id,assignedId:assigned.id,b});
    }
  }
  queue.sort((a,b)=>(ranks.get(a.b.id)??Infinity)-(ranks.get(b.b.id)??Infinity));
  for(const entry of queue){
    const {b}=entry,level=project.levels.find(l=>l.id===entry.levelId),owner=interactionOwners(project,level,nextInventory).find(i=>i.id===entry.instanceId);
    if(!b.enabled||!owner||!assetIsActive(project,entry.assignedId,owner))continue;
    if(distracted.has(owner.id)&&['moveTo','moveAway'].includes(b.type))continue;
    if(waiting.has(owner.id)&&b.type!=='blockNode')continue;
    const root=project.assets.find(a=>a.id===owner.assetId),assigned=project.assets.find(a=>a.id===entry.assignedId);let count=0;
    const stored=nextInventory.flatMap(s=>s.items).find(i=>i.id===owner.id);
    if(b.type==='wait'&&waitTurn(stored||owner,assigned.id,b)){waiting.add(owner.id);count=1;}
    if(!owner.carriedBy&&(b.type==='moveTo'||b.type==='moveAway'))count=move(project,level,owner,b,root,undefined,nextInventory);
    if(b.type==='blockNode')count=parameterOverlay(project,root,assigned,owner,level).cells.filter(([x,y])=>hasNode(level,`${x},${y}`)).length;
    if(b.type==='expand')count=expand(project,level,owner,assigned,b,makeId,nextInventory,visualEffects);
    if(b.type==='spawn')count=spawn(project,level,owner,b,makeId,visualEffects);
    if(b.type==='addToTray'){
      let target=assigned;
      while(target!==root&&(isState(target)||isParameter(target)))target=project.assets.find(a=>a.id===target.parentId);
      transferObject(project,level,b.tray==='inventory'?nextInventory:nextGraveyard,owner,target.id,makeId,nextInventory,visualEffects,b.tray);pruneLinks(level);count=1;
    }
    if(b.type==='applyEffect')count=applyEffectTo(project,level,owner,b,effectTargets(project,level,owner,assigned,b,nextInventory),nextInventory,nextGraveyard,events,makeId,visualEffects);
    if(b.type==='teleport'){
      for(const target of teleportTargets(project,level,owner,b))if(effectCanReach(project,level,owner,target,null,nextInventory)&&teleport(project,level,owner,target,b.destination,events,nextInventory))count++;
    }
    const detected=gameOutcome(project,nextGraveyard,outcomeLevelId);
    if(detected && (!outcome || detected.type==='gameOver'))outcome=detected;
    if(['gameOver','levelComplete'].includes(b.type))count=Number(detected?.type===b.type&&level.id===outcomeLevelId);
    log.push(logEntry(project,owner,b,count));
  }
  const activated=syncLifetimes(project,nextInventory);
  log.push(...advanceLifetimes(project,nextInventory,[...freshLifetimeKeys,...initialized,...activated]));
  releaseMissingCarriers(project,nextInventory);
  return {project:validateProject(project),inventory:nextInventory,graveyard:nextGraveyard,log,visualEffects,...(outcome?{outcome}:{})};
}

// A fixed impact queue prevents a newly enabled state from reacting to the
// same hit again. Existing reactions follow the configured resolution order.
export function resolveHitStates(project,level,projectile,hits){
  const ranks=new Map(orderedBehaviours(project).map(({behaviour},n)=>[behaviour.id,n]));
  const queue=hits.flatMap(receiver=>placementBehaviours(project,receiver)
    .filter(({behaviour:b})=>b.type==='onHit'&&matchesSelection(project,projectile,b.hitAssetIds))
    .map(({assigned,behaviour:b})=>({receiver,assigned,b})));
  queue.sort((a,b)=>(ranks.get(a.b.id)??Infinity)-(ranks.get(b.b.id)??Infinity));
  const log=[];
  for(const {receiver,assigned,b} of queue){
    if(!level.instances.includes(receiver)||!assetIsActive(project,assigned.id,receiver))continue;
    log.push(logEntry(project,receiver,b,Number(setState(project,receiver,b))));
  }
  return log;
}

export function availableUses(project,level,inventory=[]){
  const ranks=new Map(orderedBehaviours(project).map(({behaviour},n)=>[behaviour.id,n])),uses=[];
  for(const owner of interactionOwners(project,level,inventory))for(const {assigned,behaviour:b} of placementBehaviours(project,owner)){
    if(!['useEffect','pickUp'].includes(b.type)||b.type==='pickUp'&&owner.carriedBy)continue;
    const cells=new Set(effectOverlay(project,project.assets.find(a=>a.id===owner.assetId),assigned,owner,level,inventory).cells.map(([x,y])=>`${x},${y}`));
    for(const used of level.instances)if(used.id!==owner.id&&assetIsActive(project,used.assetId,used)&&!isParameter(project.assets.find(a=>a.id===used.assetId))&&cells.has(cell(used))&&matchesSelection(project,used,b.usableMode==='any'?null:b.usableAssetIds,b.usableMode==='tags'?b.usableTagIds:undefined)){
      if(b.type==='pickUp'){
        const item=b.pickupTarget==='used'?used:owner,collector=b.pickupTarget==='used'?owner:used;
        if(item.locked||isParameter(project.assets.find(a=>a.id===collector.assetId)))continue;
        uses.push({levelId:level.id,instanceId:owner.id,assignedId:assigned.id,behaviourId:b.id,usedId:item.id,collectorId:collector.id,triggerType:'pickUp'});
      }else{
        if(b.useTarget==='carried'&&!carriedItems(inventory,level.id,used.id).length)continue;
        uses.push({levelId:level.id,instanceId:owner.id,assignedId:assigned.id,behaviourId:b.id,usedId:used.id,action:b.trigger?.action||b.action,triggerType:b.trigger?.type});
      }
    }
  }
  return uses.sort((a,b)=>(ranks.get(a.behaviourId)??Infinity)-(ranks.get(b.behaviourId)??Infinity));
}
export function useObject(input,inventory,graveyard,choice){
  const project=clone(validateProject(input)),level=project.levels.find(l=>l.id===choice.levelId),nextInventory=clone(inventory),nextGraveyard=clone(graveyard),events=[],visualEffects=[];
  const use=level&&availableUses(project,level,nextInventory).find(u=>u.instanceId===choice.instanceId&&u.assignedId===choice.assignedId&&u.behaviourId===choice.behaviourId&&u.usedId===choice.usedId&&u.collectorId===choice.collectorId);
  if(!use)throw Error('This object is no longer usable from here.');
  const owner=interactionOwners(project,level,nextInventory).find(i=>i.id===use.instanceId),used=level.instances.find(i=>i.id===use.usedId),b=project.assets.find(a=>a.id===use.assignedId).behaviours.find(b=>b.id===use.behaviourId);
  if(b.type==='pickUp'){
    const result=pickUpObject(project,nextInventory,level.id,used.id,use.collectorId);
    syncLifetimes(result.project,result.inventory);
    return {...result,graveyard:nextGraveyard,log:[{...logEntry(project,owner,b,1),message:`Picked up ${project.assets.find(a=>a.id===used.assetId).name}.`}],events:[{type:'use',levelId:level.id,instanceId:use.collectorId},{type:'use',levelId:level.id,instanceId:used.id,instance:clone(used)},{type:'inventoryAdded',levelId:level.id,instanceId:use.collectorId},{type:'inventoryAdded',levelId:level.id,instanceId:result.item.id,instance:clone(result.item)}]};
  }
  const canReach=i=>!floorBlocks(level.tiles,owner.x,owner.y,i.x,i.y)&&effectCanReach(project,level,owner,i,null,nextInventory);
  const targets=b.useTarget==='linked'?linkedObjects(project,level,used).filter(canReach):b.useTarget==='tags'?taggedObjects(project,level,b.targetTagIds).filter(canReach):b.useTarget==='carried'?carriedItems(nextInventory,level.id,used.id).filter(i=>canReach({...i,x:used.x,y:used.y})):[used];
  events.push({type:'use',levelId:level.id,instanceId:owner.id},{type:'use',levelId:level.id,instanceId:used.id});
  if(owner.carriedBy)events.push({type:'use',levelId:level.id,instanceId:owner.carriedBy.instanceId});
  const trigger=b.trigger||b;let count=0;
  if(trigger.enabled!==false){
    if(['applyEffect','useEffect'].includes(trigger.type))count=applyEffectTo(project,level,owner,trigger,targets.map(placedTarget),nextInventory,nextGraveyard,events,uid,visualEffects);
    else for(const target of targets){
      if(!level.instances.some(i=>i.id===target.id))continue;
      if(['moveTo','moveAway'].includes(trigger.type)){
        const moved=move(project,level,target,trigger,project.assets.find(a=>a.id===target.assetId),undefined,nextInventory);count+=moved;
        if(moved)events.push({type:'moved',levelId:level.id,instanceId:target.id});
      }
      if(trigger.type==='teleport')for(const item of teleportTargets(project,level,target,trigger))if(effectCanReach(project,level,target,item,null,nextInventory)&&teleport(project,level,target,item,trigger.destination,events,nextInventory))count++;
      if(trigger.type==='expand')count+=expand(project,level,target,project.assets.find(a=>a.id===use.assignedId),trigger,uid,nextInventory,visualEffects);
      if(trigger.type==='spawn')count+=spawn(project,level,target,trigger,uid,visualEffects);
      if(trigger.type==='addToTray'){
        transferObject(project,level,trigger.tray==='inventory'?nextInventory:nextGraveyard,target,target.assetId,uid,nextInventory,visualEffects,trigger.tray);pruneLinks(level);count++;
        if(trigger.tray==='inventory')events.push({type:'inventoryAdded',levelId:level.id,instanceId:target.id,instance:clone(target)});
      }
    }
  }
  syncLifetimes(project,nextInventory);
  return {project:validateProject(project),inventory:nextInventory,graveyard:nextGraveyard,log:[logEntry(project,owner,b,count)],events,visualEffects};
}
export function eventsAdvanceTurn(before,after,events){
  return events.some(event=>[before,after].some(project=>{
    const level=project.levels.find(l=>l.id===event.levelId),instance=level?.instances.find(i=>i.id===event.instanceId)||event.instance;
    return instance&&placementBehaviours(project,instance).some(({behaviour:b})=>b.type==='advanceOnEvent'&&b.events.includes(event.type));
  }));
}
export function movementEvents(before,after){
  return after.levels.flatMap(level=>level.instances.flatMap(i=>{
    const old=before.levels.find(l=>l.id===level.id)?.instances.find(item=>item.id===i.id);
    return old&&(old.x!==i.x||old.y!==i.y)?[{type:'moved',levelId:level.id,instanceId:i.id}]:[];
  }));
}
