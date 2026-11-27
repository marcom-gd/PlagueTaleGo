import {clone,uid,validateProject,isParameter,isState,hasNode} from './model.js';
import {placementBehaviours,effectOverlay} from './behaviour-areas.js';
import {orderedBehaviours,resolveHitStates} from './behaviours.js';
import {objectsHit,distractOnImpact,distractionReactions} from './distraction.js';
import {throwTargetGroups,matchesTargetGroups} from './object-selection.js';

const cell=p=>`${p.x},${p.y}`;
const throwable=(project,id)=>project.assets.find(a=>a.id===id&&!isParameter(a)&&!isState(a));
const inventoryStack=(inventory,id)=>inventory.find(s=>s.assetId===id&&s.items?.length&&!s.items.some(i=>i.carriedBy)&&(s.count===0||s.count>0));

// Clickable actions belong to the carrier, and never run during turn resolution.
export function availableThrows(project,level,inventory=[]){
  const ranks=new Map(orderedBehaviours(project).map(({behaviour},n)=>[behaviour.id,n])),choices=[];
  for(const owner of level.instances)for(const {assigned,behaviour:b} of placementBehaviours(project,owner)){
    if(b.type!=='throwObject'||!throwable(project,b.throwAssetId))continue;
    choices.push({levelId:level.id,instanceId:owner.id,assignedId:assigned.id,behaviourId:b.id,throwAssetId:b.throwAssetId,requireInventory:b.requireInventory,destroyOnHit:b.destroyOnHit??false,throwTargetAssetIds:b.throwTargetAssetIds??null,throwTargetConditions:b.throwTargetConditions??[],throwTargetGroups:throwTargetGroups(b),available:!b.requireInventory||!!inventoryStack(inventory,b.throwAssetId)});
  }
  return choices.sort((a,b)=>(ranks.get(a.behaviourId)??Infinity)-(ranks.get(b.behaviourId)??Infinity));
}

// A throw follows a straight flight line, independent of walking connections.
export function throwLine(start,end){
  const path=[],dx=end.x-start.x,dy=end.y-start.y,steps=Math.max(Math.abs(dx),Math.abs(dy));
  if(!steps)return [{x:start.x,y:start.y}];
  for(let n=0;n<=steps;n++)path.push({x:Math.round(start.x+dx*n/steps),y:Math.round(start.y+dy*n/steps)});
  return path;
}

export function throwPreview(project,inventory,choice,destination){
  const level=project.levels.find(l=>l.id===choice.levelId),current=level&&availableThrows(project,level,inventory).find(c=>c.instanceId===choice.instanceId&&c.assignedId===choice.assignedId&&c.behaviourId===choice.behaviourId);
  if(!current)return {valid:false,path:[],reason:'This throw is no longer available.'};
  const owner=level.instances.find(i=>i.id===current.instanceId),assigned=project.assets.find(a=>a.id===current.assignedId),root=project.assets.find(a=>a.id===owner.assetId);
  if(!destination||!Number.isInteger(destination.x)||!Number.isInteger(destination.y)||destination.x<0||destination.y<0||destination.x>=level.width||destination.y>=level.height)return {valid:false,path:[],reason:'Choose a destination node inside the parameter area.'};
  const area=new Set(effectOverlay(project,root,assigned,owner,level,inventory).cells.map(([x,y])=>`${x},${y}`));
  const path=throwLine(owner,destination).map((p,n)=>({...p,node:hasNode(level,cell(p)),legal:area.has(cell(p))||n===0&&cell(p)!==cell(destination)}));
  const allowedTarget=current.throwTargetGroups===null||objectsHit(project,level,destination).some(i=>matchesTargetGroups(project,i,current.throwTargetGroups));
  const inArea=hasNode(level,cell(destination))&&area.has(cell(destination))&&path.every(p=>p.legal);
  if(!allowedTarget)for(const step of path)step.legal=false;
  const valid=current.available&&inArea&&allowedTarget;
  const distractions=valid?distractionReactions(project,level,{assetId:current.throwAssetId},objectsHit(project,level,destination),inventory,owner).map(({sourceId,assignedId,cells,color,targetIds,destination})=>({sourceId,assignedId,cells,color,targetIds,destination})):[];
  return {valid,path,throwAssetId:current.throwAssetId,distractions,reason:!current.available?'The object must be in the player inventory.':!inArea?'Choose a destination node inside the parameter area.':!allowedTarget?'Only allowed target objects matching a throw target group can be thrown at.':''};
}

export function throwObject(input,inventory,graveyard,choice,destination,makeId=uid){
  const preview=throwPreview(input,inventory,choice,destination);
  if(!preview.valid)throw Error(preview.reason);
  const project=clone(validateProject(input)),level=project.levels.find(l=>l.id===choice.levelId),current=availableThrows(project,level,inventory).find(c=>c.instanceId===choice.instanceId&&c.assignedId===choice.assignedId&&c.behaviourId===choice.behaviourId);
  const nextInventory=clone(inventory),stack=current.requireInventory?inventoryStack(nextInventory,current.throwAssetId):null;
  const position={x:destination.x,y:destination.y};
  const item=stack?{...clone(stack.items[0]),...position}:{id:makeId(),assetId:current.throwAssetId,...position,rotation:0,note:''};
  if(stack?.count===0)item.id=makeId();
  if(stack?.count>0){stack.items.shift();stack.count--;if(!stack.count)nextInventory.splice(nextInventory.indexOf(stack),1);}
  const hits=objectsHit(project,level,position),destroyed=current.destroyOnHit&&hits.length>0;
  // React against the same scene the hover preview inspected. A projectile's
  // own passive behaviours must not change recipients before its impact.
  const owner=level.instances.find(i=>i.id===current.instanceId);
  const impactLog=distractOnImpact(project,level,item,hits,nextInventory,owner);
  impactLog.push(...resolveHitStates(project,level,item,hits,nextInventory));
  if(!destroyed)level.instances.push(item);
  const events=[{type:'use',levelId:level.id,instanceId:owner.id}];
  if(stack)events.push({type:'inventoryDropped',levelId:level.id,instanceId:item.id,instance:clone(item)});
  return {project:validateProject(project),inventory:nextInventory,graveyard:clone(graveyard),instanceId:destroyed?null:item.id,destroyed,events,log:[{assetName:project.assets.find(a=>a.id===owner.assetId).name,type:'throwObject',count:1},...impactLog]};
}
