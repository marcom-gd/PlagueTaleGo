import {clone,uid,validateProject,descendants,assetIsActive,isState,isParameter,parameterOverlay,hasNode,nodesConnected} from './model.js';

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

// Each turn resolves a fixed queue of the placements present at its beginning.
// New copies first act next turn; current state/position is read at resolution.
export function resolveTurn(input,inventory=[],graveyard=[],makeId=uid) {
  const project=clone(validateProject(input)),nextGraveyard=clone(graveyard),log=[];
  const ranks=new Map(orderedBehaviours(project).map(({behaviour},n)=>[behaviour.id,n]));
  const queue=[];
  for(const level of project.levels)for(const instance of level.instances){
    for(const assigned of [project.assets.find(a=>a.id===instance.assetId),...descendants(project,instance.assetId)]){
      for(const b of assigned.behaviours||[])queue.push({levelId:level.id,instanceId:instance.id,assignedId:assigned.id,b});
    }
  }
  queue.sort((a,b)=>(ranks.get(a.b.id)??Infinity)-(ranks.get(b.b.id)??Infinity));
  for(const entry of queue){
    const {b}=entry,level=project.levels.find(l=>l.id===entry.levelId),instance=level.instances.find(i=>i.id===entry.instanceId);
    if(!b.enabled||!instance||!assetIsActive(project,entry.assignedId,instance))continue;
    const root=project.assets.find(a=>a.id===instance.assetId),assigned=project.assets.find(a=>a.id===entry.assignedId);
    let count=0;
    if(b.type==='moveTo')count=move(project,level,instance,b,root);
    else {
      const cells=parameterOverlay(project,root,assigned,instance,level).cells;
      if(b.type==='expand'){
        for(const [x,y] of cells){
          if(!hasNode(level,`${x},${y}`)||(!b.allowStacking&&level.instances.some(i=>i.assetId===root.id&&i.x===x&&i.y===y)))continue;
          if(level.instances.length>=1000)throw Error('Expansion exceeds the 1,000 objects per level limit. Previous turn preserved.');
          level.instances.push({...clone(instance),id:makeId(),x,y,locked:false});count++;
        }
      }else{
        const covered=new Set(cells.map(([x,y])=>`${x},${y}`));
        const candidates=level.instances.filter(i=>i.id!==instance.id&&assetIsActive(project,i.assetId,i)&&!isParameter(project.assets.find(a=>a.id===i.assetId))&&(b.eligibleAssetIds===null||b.eligibleAssetIds.includes(i.assetId)));
        const eligible=candidates.filter(i=>covered.has(cell(i)));
        if(b.action==='flush'){
          const visited=new Set(eligible.map(i=>i.id));
          for(let n=0;n<eligible.length;n++){
            const source=eligible[n];
            for(const target of candidates)if(!visited.has(target.id)&&target.assetId===source.assetId&&Math.abs(target.x-source.x)+Math.abs(target.y-source.y)<=1){visited.add(target.id);eligible.push(target);}
          }
        }
        for(const target of eligible){
          if(b.action==='switchState'){if(setState(project,target,b))count++;}
          if(b.action==='setMoveTarget'){
            target.moveTarget=b.moveTarget.type==='self'?{type:'object',id:instance.id}:clone(b.moveTarget);count++;
            if(b.moveTarget.type==='object')target.moveTarget.id=instance.referenceOverrides?.[b.moveTarget.id]||level.referenceOverrides?.[b.moveTarget.id]||b.moveTarget.id;
          }
          if(b.action==='graveyard'||b.action==='flush'){
            const stack=nextGraveyard.find(s=>s.assetId===target.assetId);
            if(stack){stack.items.push(clone(target));if(stack.count!==0)stack.count++;}
            else nextGraveyard.push({id:target.id,assetId:target.assetId,count:1,items:[clone(target)]});
            level.instances=level.instances.filter(i=>i.id!==target.id);count++;
          }
        }
        level.objectLinks=level.objectLinks.map(link=>({...link,instanceIds:link.instanceIds.filter(id=>level.instances.some(i=>i.id===id))})).filter(link=>link.instanceIds.length>=2);
      }
    }
    log.push({instanceId:instance.id,assetName:root.name,type:b.type,action:b.action,count});
  }
  return {project:validateProject(project),inventory:clone(inventory),graveyard:nextGraveyard,log};
}
