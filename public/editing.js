import {clone,uid,descendants} from './model.js';
export function copyHierarchy(project,id,makeId=uid){
  const root=project.assets.find(a=>a.id===id);if(!root)throw Error('Token no longer exists.');
  const originals=[root,...descendants(project,id)],ids=new Map(originals.map(a=>[a.id,makeId()]));
  const behaviours=new Map(originals.filter(a=>!a.parameterId).flatMap(a=>(a.behaviours||[]).map(b=>[b.id,makeId()])));
  return originals.map(a=>({...clone(a),id:ids.get(a.id),name:a.id===id&&!a.parameterId?(a.name+' copy').slice(0,80):a.name,parentId:ids.get(a.parentId)||a.parentId, ...(a.parameterId?{parameterId:ids.get(a.parameterId)||a.parameterId}:{}), ...(a.overlapAssetIds?{overlapAssetIds:a.overlapAssetIds.map(id=>ids.get(id)||id)}:{}), ...(a.behaviours?{behaviours:a.behaviours.map(b=>({...clone(b),id:behaviours.get(b.id)||b.id,...(b.stateKey?{stateKey:ids.get(b.stateKey)||b.stateKey}:{}),...Object.fromEntries(['eligibleAssetIds','usableAssetIds','blockAssetIds'].filter(key=>b[key]).map(key=>[key,b[key].map(id=>ids.get(id)||id)]))}))}:{})}));
}
export function copyWholeHierarchy(project,id,makeId=uid){
  let root=project.assets.find(a=>a.id===id);
  if(!root)throw Error('Token no longer exists.');
  while(root.parentId)root=project.assets.find(a=>a.id===root.parentId);
  return copyHierarchy(project,root.id,makeId);
}
export function copyLevel(level,makeId=uid){
  const result=clone(level),ids=new Map(level.instances.map(i=>[i.id,makeId()]));
  result.id=makeId();result.name=(level.name+' copy').slice(0,80);
  result.instances=result.instances.map(i=>({...i,id:ids.get(i.id)}));
  result.objectLinks=result.objectLinks.map(l=>({...l,id:makeId(),instanceIds:l.instanceIds.map(id=>ids.get(id))}));
  result.patrols=(result.patrols||[]).map(p=>{const id=makeId();ids.set(p.id,id);return {...p,id};});
  for(const i of result.instances)if(i.moveTarget?.type==='object'&&ids.has(i.moveTarget.id))i.moveTarget.id=ids.get(i.moveTarget.id);
  result.referenceOverrides={...Object.fromEntries(Object.entries(level.referenceOverrides||{}).map(([key,value])=>[key,ids.get(value)||value])),...Object.fromEntries(ids)};
  for(const i of result.instances)if(i.referenceOverrides)i.referenceOverrides=Object.fromEntries(Object.entries(i.referenceOverrides).map(([key,value])=>[key,ids.get(value)||value]));
  result.postIts=result.postIts.map(n=>({...n,id:makeId()}));return result;
}
