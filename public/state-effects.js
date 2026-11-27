import {descendants,isState,stateEnabled,pruneWaitProgress} from './model.js';

// Shared by area effects, Use, and carried torches. A switch affects one
// placement, enables ancestor states, and respects exclusive sibling groups.
export function setState(project,instance,behaviour,assetId=instance.assetId) {
  const states=descendants(project,assetId).filter(isState);
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
