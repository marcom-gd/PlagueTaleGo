import {applyAction,clone,isState,uid,hasNode,validateProject} from './model.js';
import {checkMovement} from './behaviour-areas.js';
import {syncLifetimes} from './lifetimes.js';

// Initialization is data construction, never collection/drop actions. It must
// not emit gameplay events or resolve a turn, even for event-driven objects.
export function createPlaytestState(input,levelId,makeId=uid){
  const project=clone(validateProject(input)),level=project.levels.find(l=>l.id===levelId);
  if(!level)throw Error('Choose an existing level to start the playtest.');
  const inventory=(level.startingInventory||[]).map(entry=>{
    const items=Array.from({length:entry.count||1},()=>({id:makeId(),assetId:entry.assetId,x:0,y:0,rotation:0,note:''}));
    return {id:items[0].id,assetId:entry.assetId,count:entry.count,items};
  });
  syncLifetimes(project,inventory);
  return {project,inventory,graveyard:[],levelId};
}

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
  const stacks=clone(inventory);
  for(const item of items){
    const stored={...clone(item),sourceLevelId:levelId};
    const stack=stacks.find(s=>s.assetId===item.assetId&&!s.items.some(i=>i.carriedBy||i.lifetimeProgress)&&!item.lifetimeProgress);
    if(stack){stack.items.push(stored);if(stack.count!==0)stack.count++;}
    else stacks.push({id:item.id,assetId:item.assetId,count:1,items:[stored]});
  }
  return {project:next,inventory:stacks};
}

// Zero is an intentional infinite supply. Consuming the last finite item,
// unlike adjusting its quantity to zero, removes the stack.
export function adjustStack(inventory,id,delta) {
  if(inventory.find(s=>s.id===id)?.items.some(i=>i.carriedBy||i.lifetimeProgress))throw Error('Carried objects and objects with a lifetime have individual quantities.');
  return inventory.map(stack=>{
    if(stack.id!==id)return stack;
    const count=Math.max(0,stack.count+delta),items=clone(stack.items);
    if(count>0){
      while(items.length<count)items.push({...clone(items[0]),id:uid()});
      items.length=count;
    }
    return {...stack,count,items};
  });
}

export function releaseItem(project, inventory, levelId, id, position, snap=false) {
  const stack=inventory.find(i=>i.id===id),level=project.levels.find(l=>l.id===levelId);
  if(!stack||!level)throw Error('This inventory object is no longer available.');
  if(snap&&!hasNode(level,`${position.x},${position.y}`))throw Error('Snap to Nodes is on. Choose an existing node.');
  const item={...clone(stack.items[0]),...position};
  delete item.sourceLevelId;
  delete item.carriedBy;
  if(stack.count===0)item.id=uid();
  const next=applyAction(project,{type:'instance.add',data:{levelId,instance:item}});
  checkMovement(project,next,inventory);
  const remaining=inventory.flatMap(s=>s.id!==id||s.count===0?[s]:s.count===1?[]:[{...s,count:s.count-1,items:s.items.slice(1)}]);
  return {project:next,inventory:remaining,instanceId:item.id};
}
