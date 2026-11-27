import {descendants,activeDescendants,assetIsActive,isState,isParameter} from './model.js';

// Tags in inactive branches do not describe the placement's current state.
export function matchesTags(project,instance,tagIds=[]){
  const root=project.assets.find(a=>a.id===instance.assetId);
  return !!root&&[root,...activeDescendants(project,root.id,instance)].some(a=>a.tags?.some(id=>tagIds.includes(id)));
}
export function matchesSelection(project,instance,assetIds,tagIds){
  return tagIds!=null?matchesTags(project,instance,tagIds):assetIds==null||assetIds.includes(instance.assetId);
}
// Every condition applies to the same placement. Choices within a type/tag row
// are alternatives; separate rows are combined with AND.
export function matchesTargetConditions(project,instance,conditions=[]){
  return conditions.every(c=>{
    if(c.type==='objects')return c.assetIds.includes(instance.assetId);
    if(c.type==='tags')return matchesTags(project,instance,c.tagIds);
    if(c.type==='state'){
      const states=descendants(project,instance.assetId).filter(isState),key=c.stateKey.trim().toLowerCase();
      const state=states.find(s=>s.id===c.stateKey)||states.find(s=>s.name.trim().toLowerCase()===key);
      return !!state&&assetIsActive(project,state.id,instance)===c.enabled;
    }
    return false;
  });
}
// Older filters form a single AND group. New groups are alternatives, with an
// explicit AND/OR choice inside each group. An empty group never permits a hit.
export function throwTargetGroups(behaviour){
  if(behaviour.throwTargetGroups!==undefined)return behaviour.throwTargetGroups;
  const conditions=[...(behaviour.throwTargetAssetIds!=null?[{type:'objects',assetIds:behaviour.throwTargetAssetIds}]:[]),...(behaviour.throwTargetConditions||[])];
  return conditions.length?[{mode:'all',conditions}]:null;
}
export function matchesTargetGroups(project,instance,groups){
  return groups===null||groups.some(g=>g.conditions.length>0&&(g.mode==='any'
    ?g.conditions.some(c=>matchesTargetConditions(project,instance,[c]))
    :matchesTargetConditions(project,instance,g.conditions)));
}
export function taggedObjects(project,level,tagIds,excludeId=null){
  return level.instances.filter(i=>i.id!==excludeId&&assetIsActive(project,i.assetId,i)&&!isState(project.assets.find(a=>a.id===i.assetId))&&!isParameter(project.assets.find(a=>a.id===i.assetId))&&matchesTags(project,i,tagIds));
}
export function nearestTaggedObject(project,level,origin,tagIds){
  return taggedObjects(project,level,tagIds,origin.id).sort((a,b)=>(Math.abs(a.x-origin.x)+Math.abs(a.y-origin.y))-(Math.abs(b.x-origin.x)+Math.abs(b.y-origin.y)))[0];
}
