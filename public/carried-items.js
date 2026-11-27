import {clone,uid} from './model.js';
import {collectItems,releaseItem} from './player-inventory.js';
export {interactionOwners} from './object-locations.js';

export const carriedItems=(inventory,levelId,instanceId)=>inventory.flatMap(s=>s.items).filter(i=>i.carriedBy?.levelId===levelId&&i.carriedBy.instanceId===instanceId);

export function pickUpObject(project,inventory,levelId,itemId,collectorId){
  const level=project.levels.find(l=>l.id===levelId),collector=level?.instances.find(i=>i.id===collectorId);
  if(!collector||collector.id===itemId)throw Error('Choose a separate object to carry this item.');
  const result=collectItems(project,inventory,levelId,{type:'instance',id:itemId,levelId});
  const stack=result.inventory.find(s=>s.items.some(i=>i.id===itemId)),item=stack.items.find(i=>i.id===itemId);
  // A real placement stays finite even if an infinite supply of its type exists.
  stack.items=stack.items.filter(i=>i.id!==itemId);
  if(stack.count!==0)stack.count--;
  result.inventory=result.inventory.filter(s=>s.items.length);
  item.carriedBy={levelId,instanceId:collector.id};
  result.inventory.push({id:result.inventory.some(s=>s.id===item.id)?uid():item.id,assetId:item.assetId,count:1,items:[item]});
  return {...result,item};
}

export function dropCarriedItem(project,inventory,graveyard,levelId,itemId){
  const stack=inventory.find(s=>s.items.some(i=>i.id===itemId&&i.carriedBy?.levelId===levelId));
  const held=stack?.items.find(i=>i.id===itemId),owner=project.levels.find(l=>l.id===levelId)?.instances.find(i=>i.id===held?.carriedBy.instanceId);
  if(!owner)throw Error('This object is no longer carried here.');
  const result=releaseItem(project,inventory,levelId,stack.id,{x:owner.x,y:owner.y});
  return {...result,graveyard:clone(graveyard),events:[{type:'inventoryDropped',levelId,instanceId:owner.id},{type:'inventoryDropped',levelId,instanceId:itemId}],log:[]};
}

export function releaseMissingCarriers(project,inventory){
  for(const item of inventory.flatMap(s=>s.items))if(item.carriedBy&&!project.levels.find(l=>l.id===item.carriedBy.levelId)?.instances.some(i=>i.id===item.carriedBy.instanceId))delete item.carriedBy;
}
