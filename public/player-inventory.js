import {applyAction,clone,isState,uid} from './model.js';

// Kept outside the shared project: a backpack belongs to one private playtest.
export function collectItems(project, inventory, levelId, payload) {
  const level=project.levels.find(l=>l.id===levelId);
  if(!level)throw Error('This level is no longer available.');
  let items, next=project;
  if(payload.type==='asset'){
    const asset=project.assets.find(a=>a.id===payload.id);
    if(!asset)throw Error('This object is no longer available.');
    if(isState(asset))throw Error('Collect the parent object instead of a state.');
    items=[{id:uid(),assetId:asset.id,x:0,y:0,rotation:0,note:''}];
  }else if(payload.type==='instance'&&payload.levelId===levelId){
    const ids=payload.ids||[payload.id];
    items=[...new Set(ids)].map(id=>level.instances.find(i=>i.id===id));
    if(!items.length||items.some(i=>!i))throw Error('This piece is no longer on the canvas.');
    if(items.some(i=>i.locked))throw Error('Unlock scenery before putting it in the inventory.');
    next=applyAction(project,{type:'instance.batch',data:{levelId,removeIds:items.map(i=>i.id)}});
  }else return null;
  return {project:next,inventory:[...inventory,...clone(items)]};
}

export function releaseItem(project, inventory, levelId, id, position, snap=false) {
  const item=inventory.find(i=>i.id===id),level=project.levels.find(l=>l.id===levelId);
  if(!item||!level)throw Error('This inventory object is no longer available.');
  if(snap&&level.tiles[`${position.x},${position.y}`]!=='node')throw Error('Snap to Nodes is on. Choose an existing node.');
  const next=applyAction(project,{type:'instance.add',data:{levelId,instance:{...clone(item),...position}}});
  return {project:next,inventory:inventory.filter(i=>i.id!==id)};
}
