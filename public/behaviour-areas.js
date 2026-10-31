import {descendants,assetIsActive,isParameter,hasNode,parameterOverlay,wallBlocks,nodesConnected} from './model.js';
import {matchesSelection} from './object-selection.js';

export const placementBehaviours=(project,instance)=>[project.assets.find(a=>a.id===instance.assetId),...descendants(project,instance.assetId)]
  .filter(a=>a&&assetIsActive(project,a.id,instance)).flatMap(assigned=>(assigned.behaviours||[]).filter(b=>b.enabled).map(behaviour=>({assigned,behaviour})));

// Blockers are passive and recomputed from current placements and state switches.
// Their own area uses geometry/walls directly, avoiding recursive blocker queries.
export function blockedNodes(project,level,assetId,scope='movement',instanceId=null){
  const blocked=new Set();
  for(const owner of level.instances){
    const root=project.assets.find(a=>a.id===owner.assetId);
    for(const {assigned,behaviour:b} of placementBehaviours(project,owner)){
      if(b.type!=='blockNode'||b.excludeSelf&&owner.id===instanceId||scope==='effects'&&b.blockScope!=='movementAndEffects'||!matchesSelection(project,level.instances.find(i=>i.id===instanceId)||{assetId},b.blockAssetIds,b.blockMode==='tags'?b.blockTagIds:undefined))continue;
      for(const [x,y] of parameterOverlay(project,root,assigned,owner,level).cells)if(hasNode(level,`${x},${y}`))blocked.add(`${x},${y}`);
    }
  }
  return blocked;
}
export function effectCanReach(project,level,owner,target,blocked=blockedNodes(project,level,owner.assetId,'effects',owner.id)){
  const walls=Object.fromEntries([...blocked].map(key=>[key,'wall']));
  return !blocked.has(`${target.x},${target.y}`)&&!wallBlocks(walls,owner.x,owner.y,target.x,target.y);
}
export function effectOverlay(project,root,effect,owner,level){
  const raw=parameterOverlay(project,root,effect,owner,level),blocked=blockedNodes(project,level,owner.assetId,'effects',owner.id);
  if(!blocked.size)return raw;
  const walls=Object.fromEntries([...blocked].map(key=>[key,'wall']));
  const cells=raw.cells.filter(([x,y])=>!blocked.has(`${x},${y}`)&&!wallBlocks(walls,owner.x,owner.y,x,y));
  const covered=new Set(cells.map(([x,y])=>`${x},${y}`));
  const count=level.instances.filter(i=>i.id!==owner.id&&assetIsActive(project,i.assetId,i)&&!isParameter(project.assets.find(a=>a.id===i.assetId))&&matchesSelection(project,i,effect.overlapAssetIds,effect.overlapTagIds)&&covered.has(`${i.x},${i.y}`)).length;
  return {cells,count,color:effect.overlapThreshold>0&&count>=effect.overlapThreshold?(effect.overlapColor??'#edc47c'):effect.color};
}
export function checkMovement(before,after){
  for(const level of after.levels)for(const instance of level.instances){
    const old=before.levels.find(l=>l.id===level.id)?.instances.find(i=>i.id===instance.id);
    if(old&&old.x===instance.x&&old.y===instance.y)continue;
    const blocked=blockedNodes(before,before.levels.find(l=>l.id===level.id)||level,instance.assetId,'movement',instance.id);
    const goal=`${instance.x},${instance.y}`;
    if(blocked.has(goal))throw Error('Block Node prevents this object from entering that node.');
    // Manual moves between nodes must also have a route around the blockers.
    if(!old||!blocked.size||!hasNode(level,`${old.x},${old.y}`)||!hasNode(level,goal))continue;
    const queue=[`${old.x},${old.y}`],seen=new Set(queue);
    for(let n=0;n<queue.length&&!seen.has(goal);n++){
      const [x,y]=queue[n].split(',').map(Number);
      for(const next of [`${x},${y-1}`,`${x+1},${y}`,`${x},${y+1}`,`${x-1},${y}`])if(!seen.has(next)&&!blocked.has(next)&&nodesConnected(level,queue[n],next)){seen.add(next);queue.push(next);}
    }
    if(!seen.has(goal))throw Error('Block Node leaves no connected route for this move.');
  }
}
