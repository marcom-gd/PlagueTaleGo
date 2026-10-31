import {activeDescendants,assetIsActive,isState,isParameter} from './model.js';

// Tags in inactive branches do not describe the placement's current state.
export function matchesTags(project,instance,tagIds=[]){
  const root=project.assets.find(a=>a.id===instance.assetId);
  return !!root&&[root,...activeDescendants(project,root.id,instance)].some(a=>a.tags?.some(id=>tagIds.includes(id)));
}
export function matchesSelection(project,instance,assetIds,tagIds){
  return tagIds!=null?matchesTags(project,instance,tagIds):assetIds==null||assetIds.includes(instance.assetId);
}
export function taggedObjects(project,level,tagIds,excludeId=null){
  return level.instances.filter(i=>i.id!==excludeId&&assetIsActive(project,i.assetId,i)&&!isState(project.assets.find(a=>a.id===i.assetId))&&!isParameter(project.assets.find(a=>a.id===i.assetId))&&matchesTags(project,i,tagIds));
}
export function nearestTaggedObject(project,level,origin,tagIds){
  return taggedObjects(project,level,tagIds,origin.id).sort((a,b)=>(Math.abs(a.x-origin.x)+Math.abs(a.y-origin.y))-(Math.abs(b.x-origin.x)+Math.abs(b.y-origin.y)))[0];
}
