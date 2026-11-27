import {assetIsActive,facingDirection} from './model.js';

// A carried item is a behaviour source at its carrier's position. It remains
// inventory data: it neither occupies an extra node nor becomes a board target.
export function interactionOwners(project,level,inventory=[]){
  return [...level.instances,...inventory.flatMap(s=>s.items).flatMap(item=>{
    if(item.carriedBy?.levelId!==level.id)return [];
    const carrier=level.instances.find(i=>i.id===item.carriedBy.instanceId);
    return carrier&&assetIsActive(project,carrier.assetId,carrier)&&assetIsActive(project,item.assetId,item)?[{...item,x:carrier.x,y:carrier.y,direction:facingDirection(project.assets.find(a=>a.id===carrier.assetId),carrier)}]:[];
  })];
}
