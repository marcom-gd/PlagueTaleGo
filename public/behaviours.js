import {clone,uid,validateProject,descendants,assetIsActive,isState,isParameter,parameterOverlay,hasNode,nodesConnected,wallBlocks} from './model.js';
import {eligibilityMode} from './behaviour-schema.js';
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
function setState(project,instance,behaviour) {
  const states=descendants(project,instance.assetId).filter(isState);
  // IDs select a precise state. A name/key matches the target's own hierarchy.
  const state=states.find(s=>s.id===behaviour.stateKey)||states.find(s=>s.name.toLowerCase()===behaviour.stateKey.toLowerCase());
  if(!state)return false;
  instance.stateOverrides??={};
  if(behaviour.stateEnabled){
    let ancestor=project.assets.find(a=>a.id===state.parentId);
    const enable=s=>{
      if(project.assets.find(a=>a.id===s.parentId)?.exclusiveStates)for(const sibling of states.filter(a=>a.parentId===s.parentId))instance.stateOverrides[sibling.id]=false;
      instance.stateOverrides[s.id]=true;
    };
    const parents=[];while(ancestor){if(isState(ancestor))parents.unshift(ancestor);ancestor=project.assets.find(a=>a.id===ancestor.parentId);}
    for(const parent of parents)enable(parent);
    enable(state);
  }else instance.stateOverrides[state.id]=false;
  return true;
}
function move(project,level,instance,b,owner) {
  if(instance.locked)return 0;
  const occupied=new Set(level.instances.filter(i=>i.id!==instance.id&&!isParameter(project.assets.find(a=>a.id===i.assetId))&&assetIsActive(project,i.assetId,i)).map(cell));
  for(const key of blockedNodes(project,level,instance.assetId))occupied.add(key);
  let moved=0;
  const step=next=>{
    if(!next||occupied.has(next)||!nodesConnected(level,cell(instance),next))return false;
    const [x,y]=next.split(',').map(Number),dx=x-instance.x,dy=y-instance.y;
    if(owner.autoFacing)instance.direction=dx?(dx>0?90:270):(dy>0?180:0);
    instance.x=x;instance.y=y;moved++;return true;
  };
  if(b.target==='current'){
    const target=instance.moveTarget;
    const position=target?.type==='object'?level.instances.find(i=>i.id===target.id&&assetIsActive(project,i.assetId,i)):target?.type==='position'?target:instance;
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
  let destination=instance.patrolProgress[b.id]||(b.target==='patrolStart'?'start':'end');
  for(let n=0;n<b.steps;n++){
    let index=patrol.nodes.indexOf(cell(instance));
    if(index<0){const goal=destination==='start'?patrol.nodes[0]:patrol.nodes.at(-1);if(!step(pathTo(level,cell(instance),goal,occupied)[0]))break;continue;}
    if(index===0&&destination==='start')destination='end';
    if(index===patrol.nodes.length-1&&destination==='end')destination='start';
    if(!step(patrol.nodes[index+(destination==='end'?1:-1)]))break;
  }
  instance.patrolProgress[b.id]=destination;
  return moved;
}

export const resolveReference=(level,owner,id)=>owner.referenceOverrides?.[id]||level.referenceOverrides?.[id]||id;
export function linkedObjects(project,level,owner){
  const ids=new Set(level.objectLinks.filter(link=>link.instanceIds.includes(owner.id)).flatMap(link=>link.instanceIds));
  return [...ids].filter(id=>id!==owner.id).map(id=>level.instances.find(i=>i.id===id)).filter(i=>i&&assetIsActive(project,i.assetId,i)&&!isParameter(project.assets.find(a=>a.id===i.assetId)));
}
function putInGraveyard(level,graveyard,target){
  const stack=graveyard.find(s=>s.assetId===target.assetId);
  if(stack){stack.items.push(clone(target));if(stack.count!==0)stack.count++;}
  else graveyard.push({id:target.id,assetId:target.assetId,count:1,items:[clone(target)]});
  level.instances=level.instances.filter(i=>i.id!==target.id);
}
function pruneLinks(level){
  const ids=new Set(level.instances.map(i=>i.id));
  level.objectLinks=level.objectLinks.map(link=>({...link,instanceIds:link.instanceIds.filter(id=>ids.has(id))})).filter(link=>link.instanceIds.length>=2);
}
function teleport(project,level,owner,target,destination,events){
  if(target.locked)return false;
  let position=destination;
  if(destination.type==='object')position=level.instances.find(i=>i.id===resolveReference(level,owner,destination.id)&&assetIsActive(project,i.assetId,i));
  if(destination.type==='linked'){
    const linked=linkedObjects(project,level,target),id=destination.id&&resolveReference(level,owner,destination.id);
    position=id?linked.find(i=>i.id===id):linked[0];
  }
  if(!position||position.x<0||position.y<0||position.x>=level.width||position.y>=level.height||level.tiles[cell(position)]==='wall'||blockedNodes(project,level,target.assetId).has(cell(position)))return false;
  if(cell(position)===cell(target))return false;
  const dx=position.x-target.x,dy=position.y-target.y;
  if(project.assets.find(a=>a.id===target.assetId)?.autoFacing)target.direction=Math.abs(dx)>=Math.abs(dy)?(dx>0?90:270):(dy>0?180:0);
  target.x=position.x;target.y=position.y;
  events.push({type:'moved',levelId:level.id,instanceId:target.id});return true;
}
function effectTargets(project,level,owner,assigned,b){
  if(eligibilityMode(b)==='linked')return linkedObjects(project,level,owner).filter(target=>effectCanReach(project,level,owner,target)&&(!assigned.occludedByWalls||!wallBlocks(level.tiles,owner.x,owner.y,target.x,target.y)));
  const cells=new Set(effectOverlay(project,project.assets.find(a=>a.id===owner.assetId),assigned,owner,level).cells.map(([x,y])=>`${x},${y}`));
  return level.instances.filter(i=>i.id!==owner.id&&cells.has(cell(i))&&assetIsActive(project,i.assetId,i)&&!isParameter(project.assets.find(a=>a.id===i.assetId))&&(eligibilityMode(b)==='any'||b.eligibleAssetIds?.includes(i.assetId)));
}
function applyEffectTo(project,level,owner,b,targets,graveyard,events){
  const eligible=[...targets];
  if(b.action==='flush'){
    const types=new Set(eligible.map(i=>i.assetId)),blocked=blockedNodes(project,level,owner.assetId,'effects');
    const candidates=level.instances.filter(i=>i.id!==owner.id&&types.has(i.assetId)&&assetIsActive(project,i.assetId,i)&&!blocked.has(cell(i)));
    const visited=new Set(eligible.map(i=>i.id));
    for(let n=0;n<eligible.length;n++)for(const target of candidates){
      const source=eligible[n];
      if(!visited.has(target.id)&&target.assetId===source.assetId&&Math.abs(target.x-source.x)+Math.abs(target.y-source.y)<=1){visited.add(target.id);eligible.push(target);}
    }
  }
  let count=0;
  for(const target of eligible){
    if(!level.instances.some(i=>i.id===target.id))continue;
    if(b.action==='switchState'){if(setState(project,target,b))count++;}
    if(b.action==='setMoveTarget'){
      target.moveTarget=b.moveTarget.type==='self'?{type:'object',id:owner.id}:clone(b.moveTarget);
      if(b.moveTarget.type==='object')target.moveTarget.id=resolveReference(level,owner,b.moveTarget.id);count++;
    }
    if(b.action==='graveyard'||b.action==='flush'){putInGraveyard(level,graveyard,target);count++;}
    if(b.action==='teleport'&&teleport(project,level,owner,target,b.destination,events))count++;
  }
  pruneLinks(level);return count;
}
const logEntry=(project,owner,b,count)=>({instanceId:owner.id,assetName:project.assets.find(a=>a.id===owner.assetId).name,type:b.type,...(b.action?{action:b.action}:{}),count});

// A fixed queue keeps new copies from acting until the following turn. Passive
// blockers and clickable Use actions are evaluated from the current state.
export function resolveTurn(input,inventory=[],graveyard=[],makeId=uid){
  const project=clone(validateProject(input)),nextGraveyard=clone(graveyard),log=[],events=[];
  const ranks=new Map(orderedBehaviours(project).map(({behaviour},n)=>[behaviour.id,n])),queue=[];
  for(const level of project.levels)for(const instance of level.instances)for(const assigned of [project.assets.find(a=>a.id===instance.assetId),...descendants(project,instance.assetId)]){
    for(const b of assigned.behaviours||[])if(!['useEffect','advanceOnEvent'].includes(b.type))queue.push({levelId:level.id,instanceId:instance.id,assignedId:assigned.id,b});
  }
  queue.sort((a,b)=>(ranks.get(a.b.id)??Infinity)-(ranks.get(b.b.id)??Infinity));
  for(const entry of queue){
    const {b}=entry,level=project.levels.find(l=>l.id===entry.levelId),owner=level.instances.find(i=>i.id===entry.instanceId);
    if(!b.enabled||!owner||!assetIsActive(project,entry.assignedId,owner))continue;
    const root=project.assets.find(a=>a.id===owner.assetId),assigned=project.assets.find(a=>a.id===entry.assignedId);let count=0;
    if(b.type==='moveTo')count=move(project,level,owner,b,root);
    if(b.type==='blockNode')count=parameterOverlay(project,root,assigned,owner,level).cells.filter(([x,y])=>hasNode(level,`${x},${y}`)).length;
    if(b.type==='expand')for(const [x,y] of effectOverlay(project,root,assigned,owner,level).cells){
      if(!hasNode(level,`${x},${y}`)||(!b.allowStacking&&level.instances.some(i=>i.assetId===root.id&&i.x===x&&i.y===y)))continue;
      if(level.instances.length>=1000)throw Error('Expansion exceeds the 1,000 objects per level limit. Previous turn preserved.');
      level.instances.push({...clone(owner),id:makeId(),x,y,locked:false});count++;
    }
    if(b.type==='applyEffect')count=applyEffectTo(project,level,owner,b,effectTargets(project,level,owner,assigned,b),nextGraveyard,events);
    if(b.type==='teleport'){
      const target=b.teleportTarget==='self'?owner:level.instances.find(i=>i.id===resolveReference(level,owner,b.targetInstanceId)&&assetIsActive(project,i.assetId,i));
      if(target&&effectCanReach(project,level,owner,target)&&teleport(project,level,owner,target,b.destination,events))count++;
    }
    log.push(logEntry(project,owner,b,count));
  }
  return {project:validateProject(project),inventory:clone(inventory),graveyard:nextGraveyard,log};
}

export function availableUses(project,level){
  const ranks=new Map(orderedBehaviours(project).map(({behaviour},n)=>[behaviour.id,n])),uses=[];
  for(const owner of level.instances)for(const {assigned,behaviour:b} of placementBehaviours(project,owner)){
    if(b.type!=='useEffect')continue;
    const cells=new Set(effectOverlay(project,project.assets.find(a=>a.id===owner.assetId),assigned,owner,level).cells.map(([x,y])=>`${x},${y}`));
    for(const used of level.instances)if(used.id!==owner.id&&assetIsActive(project,used.assetId,used)&&!isParameter(project.assets.find(a=>a.id===used.assetId))&&cells.has(cell(used))&&(b.usableAssetIds===null||b.usableAssetIds.includes(used.assetId))){
      uses.push({levelId:level.id,instanceId:owner.id,assignedId:assigned.id,behaviourId:b.id,usedId:used.id,action:b.action});
    }
  }
  return uses.sort((a,b)=>(ranks.get(a.behaviourId)??Infinity)-(ranks.get(b.behaviourId)??Infinity));
}
export function useObject(input,inventory,graveyard,choice){
  const project=clone(validateProject(input)),level=project.levels.find(l=>l.id===choice.levelId),nextGraveyard=clone(graveyard),events=[];
  const use=level&&availableUses(project,level).find(u=>u.instanceId===choice.instanceId&&u.assignedId===choice.assignedId&&u.behaviourId===choice.behaviourId&&u.usedId===choice.usedId);
  if(!use)throw Error('This object is no longer usable from here.');
  const owner=level.instances.find(i=>i.id===use.instanceId),used=level.instances.find(i=>i.id===use.usedId),b=project.assets.find(a=>a.id===use.assignedId).behaviours.find(b=>b.id===use.behaviourId);
  const targets=b.useTarget==='linked'?linkedObjects(project,level,used).filter(i=>effectCanReach(project,level,owner,i)):[used];
  events.push({type:'use',levelId:level.id,instanceId:owner.id},{type:'use',levelId:level.id,instanceId:used.id});
  const count=applyEffectTo(project,level,owner,b,targets,nextGraveyard,events);
  return {project:validateProject(project),inventory:clone(inventory),graveyard:nextGraveyard,log:[logEntry(project,owner,b,count)],events};
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
