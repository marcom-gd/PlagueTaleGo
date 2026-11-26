import {clone,uid,validateProject,descendants,assetIsActive,isState,isParameter,parameterOverlay,effectRotation,hasNode,nodesConnected,isClosedPatrol,wallBlocks,stateEnabled,pruneWaitProgress} from './model.js';
import {eligibilityMode} from './behaviour-schema.js';
import {matchesSelection,taggedObjects,nearestTaggedObject} from './object-selection.js';
import {blockedNodes,effectOverlay,effectCanReach,placementBehaviours} from './behaviour-areas.js';

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
function setState(project,instance,behaviour,assetId=instance.assetId) {
  const states=descendants(project,assetId).filter(isState);
  // IDs select a precise state. A name/key matches the target's own hierarchy.
  let state=states.find(s=>s.id===behaviour.stateKey)||states.find(s=>s.name.toLowerCase()===behaviour.stateKey.toLowerCase());
  if(!state)return false;
  if(behaviour.stateToggle){
    const siblings=states.filter(s=>s.parentId===state.parentId);
    if(!project.assets.find(a=>a.id===state.parentId)?.exclusiveStates||siblings.length<2)return false;
    const current=siblings.findIndex(s=>stateEnabled(project,s,instance));
    if(current>=0)state=siblings[(current+1)%siblings.length];
  }
  instance.stateOverrides??={};
  if(behaviour.stateToggle||behaviour.stateEnabled){
    let ancestor=project.assets.find(a=>a.id===state.parentId);
    const enable=s=>{
      if(project.assets.find(a=>a.id===s.parentId)?.exclusiveStates)for(const sibling of project.assets.filter(a=>isState(a)&&a.parentId===s.parentId))instance.stateOverrides={...instance.stateOverrides,[sibling.id]:false};
      instance.stateOverrides={...instance.stateOverrides,[s.id]:true};
    };
    const parents=[];while(ancestor&&ancestor.id!==instance.assetId){if(isState(ancestor))parents.unshift(ancestor);ancestor=project.assets.find(a=>a.id===ancestor.parentId);}
    for(const parent of parents)enable(parent);
    enable(state);
  }else instance.stateOverrides={...instance.stateOverrides,[state.id]:false};
  pruneWaitProgress(project,instance);
  return true;
}
function move(project,level,instance,b,owner) {
  if(instance.locked)return 0;
  const occupied=new Set(level.instances.filter(i=>{
    if(i===instance)return false;
    const asset=project.assets.find(a=>a.id===i.assetId);
    return !asset.nonBlocking&&!isParameter(asset)&&assetIsActive(project,i.assetId,i);
  }).map(cell));
  for(const key of blockedNodes(project,level,instance.assetId,'movement',instance.id))occupied.add(key);
  let moved=0;
  const step=next=>{
    if(!next||occupied.has(next)||!nodesConnected(level,cell(instance),next))return false;
    const [x,y]=next.split(',').map(Number),dx=x-instance.x,dy=y-instance.y;
    if(owner.autoFacing)instance.direction=dx?(dx>0?90:270):(dy>0?180:0);
    instance.x=x;instance.y=y;moved++;return true;
  };
  if(b.type==='moveAway'){
    const target=instance.moveTarget;
    const position=target?.type==='object'?level.instances.find(i=>i.id===target.id&&assetIsActive(project,i.assetId,i)):target?.type==='tags'?nearestTaggedObject(project,level,instance,target.tagIds):target?.type==='position'?target:null;
    if(!position||position===instance)return 0;
    const distance=key=>{const [x,y]=key.split(',').map(Number);return Math.abs(x-position.x)+Math.abs(y-position.y);};
    for(let n=0;n<b.steps;n++){
      const current=cell(instance),next=neighbours(current).filter(key=>!occupied.has(key)&&nodesConnected(level,current,key)&&distance(key)>distance(current)).sort((a,b)=>distance(b)-distance(a))[0];
      if(!step(next))break;
    }
    return moved;
  }
  if(b.target==='current'){
    const target=instance.moveTarget;
    const position=target?.type==='object'?level.instances.find(i=>i.id===target.id&&assetIsActive(project,i.assetId,i)):target?.type==='tags'?nearestTaggedObject(project,level,instance,target.tagIds):target?.type==='position'?target:instance;
    if(!position)return 0;
    const goal=cell(position);
    if(goal===cell(instance))return 0;
    // An occupied object target is approached to an adjacent free node.
    const goals=occupied.has(goal)?neighbours(goal).filter(key=>nodesConnected(level,key,goal)&&!occupied.has(key)):[goal];
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
  const stack=tray.find(s=>s.assetId===target.assetId);
  if(stack){stack.items.push(clone(target));if(stack.count!==0)stack.count++;}
  else tray.push({id:target.id,assetId:target.assetId,count:1,items:[clone(target)]});
}
function transferObject(project,level,tray,instance,assetId,makeId){
  if(assetId===instance.assetId){
    putInTray(tray,instance);
    level.instances=level.instances.filter(i=>i.id!==instance.id);
    return instance;
  }
  const root=project.assets.find(a=>a.id===instance.assetId),asset=project.assets.find(a=>a.id===assetId);
  const parent=project.assets.find(a=>a.id===asset.parentId),contents=new Set(descendants(project,assetId).map(a=>a.id));
  const item={id:makeId(),assetId,x:instance.x,y:instance.y,rotation:effectRotation(project,root,parent,instance.rotation),detached:true};
  if(instance.stateOverrides)item.stateOverrides=Object.fromEntries(Object.entries(instance.stateOverrides).filter(([id])=>contents.has(id)));
  if(instance.removedAssetIds)item.removedAssetIds=instance.removedAssetIds.filter(id=>contents.has(id));
  if(instance.referenceOverrides)item.referenceOverrides=instance.referenceOverrides;
  const waitProgress=instance.waitProgress?.filter(entry=>entry.assignedId===assetId||contents.has(entry.assignedId));
  if(waitProgress?.length)item.waitProgress=waitProgress;
  putInTray(tray,item);
  instance.removedAssetIds=[...(instance.removedAssetIds||[]).filter(id=>!contents.has(id)),assetId];
  pruneWaitProgress(project,instance);
  return item;
}
function pruneLinks(level){
  const ids=new Set(level.instances.map(i=>i.id));
  level.objectLinks=level.objectLinks.map(link=>({...link,instanceIds:link.instanceIds.filter(id=>ids.has(id))})).filter(link=>link.instanceIds.length>=2);
}
function teleport(project,level,owner,target,destination,events){
  if(target.locked)return false;
  let position=destination;
  if(destination.type==='tags')position=nearestTaggedObject(project,level,target,destination.tagIds);
  if(destination.type==='object')position=level.instances.find(i=>i.id===resolveReference(level,owner,destination.id)&&assetIsActive(project,i.assetId,i));
  if(destination.type==='linked'){
    const linked=linkedObjects(project,level,target),id=destination.id&&resolveReference(level,owner,destination.id);
    position=id?linked.find(i=>i.id===id):linked[0];
  }
  if(!position||position.x<0||position.y<0||position.x>=level.width||position.y>=level.height||level.tiles[cell(position)]==='wall'||blockedNodes(project,level,target.assetId,'movement',target.id).has(cell(position)))return false;
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
function effectTargets(project,level,owner,assigned,b){
  const mode=eligibilityMode(b);
  if(mode==='linked')return linkedObjects(project,level,owner).filter(target=>effectCanReach(project,level,owner,target)&&(!assigned.occludedByWalls||!wallBlocks(level.tiles,owner.x,owner.y,target.x,target.y))).map(placedTarget);
  const cells=new Set(effectOverlay(project,project.assets.find(a=>a.id===owner.assetId),assigned,owner,level).cells.map(([x,y])=>`${x},${y}`));
  const selectedIds=mode==='selected'&&['switchState','graveyard','inventory','flush'].includes(b.action)?b.eligibleAssetIds:null;
  const nestedIds=new Set(selectedIds?project.assets.filter(a=>a.parentId&&selectedIds.includes(a.id)).map(a=>a.id):[]);
  return level.instances.flatMap(i=>{
    if(!cells.has(cell(i))||!assetIsActive(project,i.assetId,i))return [];
    const placed=i.id!==owner.id&&!isParameter(project.assets.find(a=>a.id===i.assetId))&&matchesSelection(project,i,mode==='any'?null:b.eligibleAssetIds,mode==='tags'?b.eligibleTagIds:undefined);
    return [...(placed?[placedTarget(i)]:[]),...(nestedIds.size?nestedTargets(project,i,nestedIds):[])];
  });
}
function applyEffectTo(project,level,owner,b,targets,inventory,graveyard,events,makeId){
  let eligible=[...targets];
  if(b.action==='flush'){
    const types=new Set(eligible.map(t=>t.assetId)),blocked=blockedNodes(project,level,owner.assetId,'effects',owner.id);
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
    if(!level.instances.includes(target)||(assetId!==target.assetId&&!assetIsActive(project,assetId,target)))continue;
    if(b.action==='switchState'){if(setState(project,target,b,assetId))count++;}
    if(b.action==='setMoveTarget'){
      target.moveTarget=b.moveTarget.type==='self'?{type:'object',id:owner.id}:clone(b.moveTarget);
      if(b.moveTarget.type==='object')target.moveTarget.id=resolveReference(level,owner,b.moveTarget.id);count++;
    }
    if(['graveyard','flush','inventory'].includes(b.action)){
      const item=transferObject(project,level,b.action==='inventory'?inventory:graveyard,target,assetId,makeId);count++;
      if(b.action==='inventory')events.push({type:'inventoryAdded',levelId:level.id,instanceId:item.id,instance:clone(item)});
    }
    if(b.action==='teleport'&&teleport(project,level,owner,target,b.destination,events))count++;
  }
  pruneLinks(level);return count;
}
function expand(project,level,owner,assigned,b,makeId){
  const root=project.assets.find(a=>a.id===owner.assetId);let count=0;
  for(const [x,y] of effectOverlay(project,root,assigned,owner,level).cells){
    if(!hasNode(level,`${x},${y}`)||(!b.allowStacking&&level.instances.some(i=>i.assetId===root.id&&i.x===x&&i.y===y)))continue;
    if(level.instances.length>=1000)throw Error('Expansion exceeds the 1,000 objects per level limit. Previous turn preserved.');
    level.instances.push({...clone(owner),id:makeId(),x,y,locked:false});count++;
  }
  return count;
}
function spawn(project,level,owner,b,makeId){
  const asset=project.assets.find(a=>a.id===b.spawnAssetId);
  if(!asset||isState(asset)||isParameter(asset))return 0;
  if(level.instances.length+b.spawnCount>1000)throw Error('Spawn exceeds the 1,000 objects per level limit. Previous state preserved.');
  for(let n=0;n<b.spawnCount;n++)level.instances.push({id:makeId(),assetId:asset.id,x:owner.x,y:owner.y,rotation:asset.rotation??0,locked:false,note:''});
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
export function resolveTurn(input,inventory=[],graveyard=[],makeId=uid){
  const project=clone(validateProject(input)),nextInventory=clone(inventory),nextGraveyard=clone(graveyard),log=[],events=[];
  const ranks=new Map(orderedBehaviours(project).map(({behaviour},n)=>[behaviour.id,n])),queue=[],waiting=new Set();
  for(const level of project.levels)for(const instance of level.instances){
    pruneWaitProgress(project,instance);
    for(const assigned of [project.assets.find(a=>a.id===instance.assetId),...descendants(project,instance.assetId)]){
      for(const b of assigned.behaviours||[])if(!['useEffect','advanceOnEvent'].includes(b.type))queue.push({levelId:level.id,instanceId:instance.id,assignedId:assigned.id,b});
    }
  }
  queue.sort((a,b)=>(ranks.get(a.b.id)??Infinity)-(ranks.get(b.b.id)??Infinity));
  for(const entry of queue){
    const {b}=entry,level=project.levels.find(l=>l.id===entry.levelId),owner=level.instances.find(i=>i.id===entry.instanceId);
    if(!b.enabled||!owner||!assetIsActive(project,entry.assignedId,owner))continue;
    if(waiting.has(owner.id)&&b.type!=='blockNode')continue;
    const root=project.assets.find(a=>a.id===owner.assetId),assigned=project.assets.find(a=>a.id===entry.assignedId);let count=0;
    if(b.type==='wait'&&waitTurn(owner,assigned.id,b)){waiting.add(owner.id);count=1;}
    if(b.type==='moveTo'||b.type==='moveAway')count=move(project,level,owner,b,root);
    if(b.type==='blockNode')count=parameterOverlay(project,root,assigned,owner,level).cells.filter(([x,y])=>hasNode(level,`${x},${y}`)).length;
    if(b.type==='expand')count=expand(project,level,owner,assigned,b,makeId);
    if(b.type==='spawn')count=spawn(project,level,owner,b,makeId);
    if(b.type==='addToTray'){
      let target=assigned;
      while(target!==root&&(isState(target)||isParameter(target)))target=project.assets.find(a=>a.id===target.parentId);
      transferObject(project,level,b.tray==='inventory'?nextInventory:nextGraveyard,owner,target.id,makeId);pruneLinks(level);count=1;
    }
    if(b.type==='applyEffect')count=applyEffectTo(project,level,owner,b,effectTargets(project,level,owner,assigned,b),nextInventory,nextGraveyard,events,makeId);
    if(b.type==='teleport'){
      for(const target of teleportTargets(project,level,owner,b))if(effectCanReach(project,level,owner,target)&&teleport(project,level,owner,target,b.destination,events))count++;
    }
    log.push(logEntry(project,owner,b,count));
  }
  return {project:validateProject(project),inventory:nextInventory,graveyard:nextGraveyard,log};
}

export function availableUses(project,level){
  const ranks=new Map(orderedBehaviours(project).map(({behaviour},n)=>[behaviour.id,n])),uses=[];
  for(const owner of level.instances)for(const {assigned,behaviour:b} of placementBehaviours(project,owner)){
    if(b.type!=='useEffect')continue;
    const cells=new Set(effectOverlay(project,project.assets.find(a=>a.id===owner.assetId),assigned,owner,level).cells.map(([x,y])=>`${x},${y}`));
    for(const used of level.instances)if(used.id!==owner.id&&assetIsActive(project,used.assetId,used)&&!isParameter(project.assets.find(a=>a.id===used.assetId))&&cells.has(cell(used))&&matchesSelection(project,used,b.usableMode==='any'?null:b.usableAssetIds,b.usableMode==='tags'?b.usableTagIds:undefined)){
      uses.push({levelId:level.id,instanceId:owner.id,assignedId:assigned.id,behaviourId:b.id,usedId:used.id,action:b.trigger?.action||b.action,triggerType:b.trigger?.type});
    }
  }
  return uses.sort((a,b)=>(ranks.get(a.behaviourId)??Infinity)-(ranks.get(b.behaviourId)??Infinity));
}
export function useObject(input,inventory,graveyard,choice){
  const project=clone(validateProject(input)),level=project.levels.find(l=>l.id===choice.levelId),nextInventory=clone(inventory),nextGraveyard=clone(graveyard),events=[];
  const use=level&&availableUses(project,level).find(u=>u.instanceId===choice.instanceId&&u.assignedId===choice.assignedId&&u.behaviourId===choice.behaviourId&&u.usedId===choice.usedId);
  if(!use)throw Error('This object is no longer usable from here.');
  const owner=level.instances.find(i=>i.id===use.instanceId),used=level.instances.find(i=>i.id===use.usedId),b=project.assets.find(a=>a.id===use.assignedId).behaviours.find(b=>b.id===use.behaviourId);
  const targets=b.useTarget==='linked'?linkedObjects(project,level,used).filter(i=>effectCanReach(project,level,owner,i)):b.useTarget==='tags'?taggedObjects(project,level,b.targetTagIds).filter(i=>effectCanReach(project,level,owner,i)):[used];
  events.push({type:'use',levelId:level.id,instanceId:owner.id},{type:'use',levelId:level.id,instanceId:used.id});
  const trigger=b.trigger||b;let count=0;
  if(trigger.enabled!==false){
    if(['applyEffect','useEffect'].includes(trigger.type))count=applyEffectTo(project,level,owner,trigger,targets.map(placedTarget),nextInventory,nextGraveyard,events,uid);
    else for(const target of targets){
      if(!level.instances.some(i=>i.id===target.id))continue;
      if(['moveTo','moveAway'].includes(trigger.type)){
        const moved=move(project,level,target,trigger,project.assets.find(a=>a.id===target.assetId));count+=moved;
        if(moved)events.push({type:'moved',levelId:level.id,instanceId:target.id});
      }
      if(trigger.type==='teleport')for(const item of teleportTargets(project,level,target,trigger))if(effectCanReach(project,level,target,item)&&teleport(project,level,target,item,trigger.destination,events))count++;
      if(trigger.type==='expand')count+=expand(project,level,target,project.assets.find(a=>a.id===use.assignedId),trigger,uid);
      if(trigger.type==='spawn')count+=spawn(project,level,target,trigger,uid);
      if(trigger.type==='addToTray'){
        transferObject(project,level,trigger.tray==='inventory'?nextInventory:nextGraveyard,target,target.assetId,uid);pruneLinks(level);count++;
        if(trigger.tray==='inventory')events.push({type:'inventoryAdded',levelId:level.id,instanceId:target.id,instance:clone(target)});
      }
    }
  }
  return {project:validateProject(project),inventory:nextInventory,graveyard:nextGraveyard,log:[logEntry(project,owner,b,count)],events};
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
