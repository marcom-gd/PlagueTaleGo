import {clone, uid, validateProject, descendants, isParameter, isState, applyAction} from './model.js';

export const levelFileFormat = 'plague-tale-go-levels';
const nameKey = name => name.trim().toLowerCase();
const referenceKeys = new Set(['assetId','parentId','parameterId','definitionId','stateKey','spawnAssetId','throwAssetId','targetAssetId','targetInstanceId','patrolId','assignedId','behaviourId','sourceId','levelId','instanceId']);
const referenceArrays = new Set(['tags','overlapAssetIds','overlapTagIds','eligibleAssetIds','usableAssetIds','blockAssetIds','throwTargetAssetIds','assetIds','hitAssetIds','distractAssetIds','beamParameterIds','eligibleTagIds','usableTagIds','blockTagIds','targetTagIds','removedAssetIds','instanceIds','behaviourOrder','tagIds']);
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if(Array.isArray(value))return value.map(sort);
  if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])]));
  return value;
}
// Only rewrite schema references. Names, rules, notes and cell coordinates are text.
function rewrite(value, map, key='', parent=null) {
  const mapped = id => map.get(id) ?? id;
  if(Array.isArray(value))return referenceArrays.has(key)?value.map(mapped):value.map(v=>rewrite(v,map,'',value));
  if(value && typeof value==='object') {
    if(['stateOverrides','patrolProgress'].includes(key))return Object.fromEntries(Object.entries(value).map(([id,v])=>[mapped(id),v]));
    if(key==='referenceOverrides')return Object.fromEntries(Object.entries(value).map(([id,v])=>[mapped(id),mapped(v)]));
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v,map,k,value)]));
  }
  if(typeof value==='string' && (referenceKeys.has(key)||key==='id'&&(!parent?.type||['object','linked'].includes(parent.type)||'enabled' in parent)))return mapped(value);
  return value;
}
function refs(value) {
  const result=new Set();
  function visit(v,key='',parent=null){
    if(Array.isArray(v)){if(referenceArrays.has(key))v.forEach(id=>result.add(id));else v.forEach(x=>visit(x,'',v));}
    else if(v && typeof v==='object') {
      if(key==='referenceOverrides'){Object.entries(v).forEach(([id,target])=>{result.add(id);result.add(target);});}
      else if(['stateOverrides','patrolProgress'].includes(key))Object.keys(v).forEach(id=>result.add(id));
      else Object.entries(v).forEach(([k,x])=>visit(x,k,v));
    }else if(typeof v==='string'&&(referenceKeys.has(key)||key==='id'&&['object','linked'].includes(parent?.type)))result.add(v);
  }
  visit(value);return result;
}
function sceneRefs(value) {
  const result=new Set();
  function visit(v,key='',parent=null){
    if(Array.isArray(v))v.forEach(x=>visit(x));
    else if(v&&typeof v==='object')Object.entries(v).forEach(([k,x])=>visit(x,k,v));
    else if(typeof v==='string'&&(['targetInstanceId','patrolId','sourceId','instanceId'].includes(key)||key==='id'&&['object','linked'].includes(parent?.type)))result.add(v);
  }
  visit(value);return result;
}
function groups(project) {
  const result=[];
  for(const root of project.assets.filter(a=>!a.parentId))result.push({id:root.id,type:isParameter(root)?'Parameter':'Object',name:root.name,items:[root,...descendants(project,root.id)],collection:'assets'});
  for(const tag of project.tags)result.push({id:tag.id,type:'Tag',name:tag.name,items:[tag],collection:'tags'});
  for(const block of project.behaviourLibrary||[])result.push({id:block.id,type:'Behaviour',name:block.name,items:[block],collection:'behaviourLibrary'});
  return result;
}
function identities(group) {
  const result=new Map();
  function add(item,path){
    result.set(path,item.id);
    // Parameter uses share their definition's behaviour identities.
    if(!item.parameterId)(item.behaviours||[]).forEach((b,n)=>add(b,`${path}/behaviour:${n}`));
    if(item.behaviour)add(item.behaviour,`${path}/definition`);
    if(item.trigger&&!item.definitionId)add(item.trigger,`${path}/trigger`);
    const children=group.items.includes(item)?group.items.filter(a=>a.parentId===item.id):[],counts=new Map();
    for(const child of children){const key=`${child.kind||'token'}:${nameKey(child.name)}`,n=counts.get(key)||0;counts.set(key,n+1);add(child,`${path}/${key}:${n}`);}
  }
  add(group.items[0],'root');return result;
}
function indexGroups(list){return new Map(list.flatMap(group=>group.items.map(item=>[item.id,group])));}
function behaviourQueue(project, assets=project.assets) {
  const ranks=new Map((project.behaviourOrder||[]).map((id,n)=>[id,n]));
  return assets.filter(a=>!a.parameterId).flatMap(a=>a.behaviours||[]).sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity)).map(b=>b.id);
}
function needed(project, levels) {
  const all=groups(project),index=indexGroups(all),selected=new Set(),queue=[...levels.flatMap(level=>[...refs(level)])];
  while(queue.length){const group=index.get(queue.pop());if(!group||selected.has(group))continue;selected.add(group);for(const item of group.items)queue.push(...refs(item));}
  return all.filter(group=>selected.has(group));
}
function projectInFile(file) {
  if(!file || file.format!==levelFileFormat || file.version!==1)throw Error('Choose a level export (.levels.json), not a project backup.');
  // Deliberately exclude unrelated project metadata and card history.
  return validateProject(clone({version:3,title:'Imported levels',assets:file.assets,tags:file.tags,behaviourLibrary:file.behaviourLibrary||[],behaviourOrder:file.behaviourOrder||[],levels:file.levels,cardDraws:[]}));
}
export function readLevelFile(file) {projectInFile(file);return clone(file);}
export function exportLevels(input, levelIds) {
  const project=validateProject(clone(input)),ids=new Set(levelIds),levels=project.levels.filter(l=>ids.has(l.id));
  if(!levels.length||levels.length!==ids.size)throw Error('Select at least one existing level to export.');
  const dependencies=needed(project,levels),assets=dependencies.filter(g=>g.collection==='assets').flatMap(g=>g.items),behaviourIds=new Set(assets.filter(a=>!a.parameterId).flatMap(a=>(a.behaviours||[]).map(b=>b.id)));
  const file={format:levelFileFormat,version:1,levels,assets,tags:dependencies.filter(g=>g.collection==='tags').flatMap(g=>g.items),behaviourLibrary:dependencies.filter(g=>g.collection==='behaviourLibrary').flatMap(g=>g.items),behaviourOrder:behaviourQueue(project).filter(id=>behaviourIds.has(id))};
  projectInFile(file);return file;
}
export function reviewLevelImport(input, file, levelIds=file.levels?.map(l=>l.id)) {
  const current=validateProject(clone(input)),source=projectInFile(file),chosen=new Set(levelIds),levels=source.levels.filter(l=>chosen.has(l.id));
  if(!levels.length||levels.length!==chosen.size)throw Error('Select at least one level to import.');
  const incoming=needed(source,levels),existing=groups(current),matchIds=new Map();
  const rows=incoming.map(group=>{
    const names=existing.filter(g=>g.type===group.type&&nameKey(g.name)===nameKey(group.name));
    const match=existing.find(g=>g.type===group.type&&g.id===group.id)||(names.length===1?names[0]:null);
    if(match){const paths=identities(match);for(const [path,id] of identities(group))if(paths.has(path))matchIds.set(id,paths.get(path));}
    return {...group,match};
  });
  for(const row of rows)row.status=!row.match?'missing':canonical(rewrite(row.items,matchIds))===canonical(row.match.items)?'same':'different';
  // Surface dependencies too, so Select all retains the incoming rules throughout.
  const index=indexGroups(rows);
  let changed;
  do{changed=false;for(const row of rows)if(row.status==='same'&&row.items.some(item=>[...refs(item)].some(id=>{const dependency=index.get(id);return dependency&&dependency!==row&&dependency.status!=='same';}))){row.status='different';changed=true;}}while(changed);
  const conflicts=levels.map(l=>({id:l.id,name:l.name,matches:current.levels.filter(existing=>nameKey(existing.name)===nameKey(l.name)).map(l=>({id:l.id,name:l.name}))}));
  const sceneIds=new Set(levels.flatMap(l=>[...l.instances.map(i=>i.id),...l.patrols.map(p=>p.id)]));
  const external=new Set([...incoming.flatMap(g=>g.items.flatMap(item=>[...sceneRefs(item)])),...levels.flatMap(l=>[...sceneRefs(l)])].filter(id=>!sceneIds.has(id)&&!levels.some(l=>sceneIds.has(l.referenceOverrides?.[id])||l.instances.some(i=>sceneIds.has(i.referenceOverrides?.[id])))));
  const incomingOrder=behaviourQueue(source,incoming.filter(g=>g.collection==='assets').flatMap(g=>g.items));
  return {source,levels,rows,matchIds,conflicts,incomingOrder,hasSharedOrder:incomingOrder.length>0&&behaviourQueue(current).length>0,warnings:external.size?['Some targets are outside the selected levels or no longer exist. Those object / patrol targets will be unavailable. Include the related levels when exporting and importing to retain them.']:[]};
}
function freshName(name, used, suffix=' copy', max=80) {
  let n=1,candidate;
  do{const ending=n===1?suffix:`${suffix} ${n}`;candidate=name.slice(0,max-ending.length)+ending;n++;}while(used.has(nameKey(candidate)));
  used.add(nameKey(candidate));return candidate;
}
export function buildLevelImport(input, file, options={}, makeId=uid) {
  const review=reviewLevelImport(input,file,options.levelIds),{source,rows,levels,matchIds}=review;
  const selected=new Set(options.definitionIds??rows.filter(r=>r.status!=='same').map(r=>r.id)),map=new Map(matchIds),additions={assets:[],tags:[],behaviourLibrary:[]},available=new Set(),omitted=new Set();
  const used=new Set();
  function collectIds(v){if(Array.isArray(v))v.forEach(collectIds);else if(v&&typeof v==='object'){if(typeof v.id==='string')used.add(v.id);Object.values(v).forEach(collectIds);}}
  collectIds(input);
  const fresh=()=>{const id=makeId();if(used.has(id))throw Error('Could not create a unique import ID. Try again.');used.add(id);return id;};
  for(const row of rows){
    const importing=selected.has(row.id)&&row.status!=='same';
    for(const id of identities(row).values()) {
      if(importing)map.set(id,fresh());
      else if(!row.match||!map.has(id)){map.set(id,fresh());omitted.add(id);}
      if(importing||row.match&&!omitted.has(id))available.add(id);
    }
  }
  const replacements=[],newLevels=[],names=new Set(input.levels.map(l=>nameKey(l.name))),replaced=new Set(),levelMap=new Map();
  for(const l of levels){
    const choice=options.levelChoices?.[l.id],matches=review.conflicts.find(c=>c.id===l.id).matches;
    if(matches.length&&!choice)throw Error(`Choose Make a copy or Replace for “${l.name}”.`);
    const target=choice?.mode==='replace'?matches.find(m=>m.id===choice.targetId):null;
    if(choice?.mode==='replace'&&!target)throw Error('The level to replace no longer matches. Review the import again.');
    if(target&&replaced.has(target.id))throw Error('Two incoming levels cannot replace the same level. Choose a copy for one.');
    if(target)replaced.add(target.id);
    const id=target?.id||fresh();map.set(l.id,id);levelMap.set(l.id,{id,name:target?l.name:matches.length||names.has(nameKey(l.name))?freshName(l.name,names):l.name,target});names.add(nameKey(levelMap.get(l.id).name));
    for(const item of [...l.instances,...l.objectLinks,...l.patrols,...l.postIts])map.set(item.id,fresh());
  }
  // Isolate unselected / stale scene targets from IDs in the destination project.
  for(const item of [...rows.flatMap(row=>row.items),...levels])for(const id of refs(item))if(!map.has(id)&&!available.has(id))map.set(id,fresh());
  const tagNames=new Set(input.tags.map(t=>nameKey(t.name)));
  function cleanBehaviour(b){
    const result=rewrite(b,map);
    for(const key of referenceArrays)if(Array.isArray(b[key]))result[key]=b[key].filter(id=>!omitted.has(id)).map(id=>map.get(id)??id);
    for(const key of ['spawnAssetId','throwAssetId','targetAssetId','stateKey'])if(omitted.has(b[key]))result.enabled=false;
    function cleanCondition(c){
        const next=rewrite(c,map);
        for(const key of ['assetIds','tagIds'])if(c[key])next[key]=c[key].filter(id=>!omitted.has(id)).map(id=>map.get(id)??id);
        return next;
    }
    if(b.throwTargetConditions){
      result.throwTargetConditions=b.throwTargetConditions.map(cleanCondition);
      if(b.throwTargetGroups===undefined&&b.throwTargetConditions.some(c=>c.stateKey&&omitted.has(c.stateKey)))result.enabled=false;
    }
    if(b.throwTargetGroups)result.throwTargetGroups=b.throwTargetGroups.map(g=>({...g,conditions:g.conditions.map(cleanCondition)}));
    if(b.trigger)result.trigger=cleanBehaviour(b.trigger);
    return result;
  }
  for(const row of rows)if(selected.has(row.id)&&row.status!=='same'){
    const skipped=new Set();
    for(const a of row.items)if(a.parameterId&&omitted.has(a.parameterId))for(const child of [a,...descendants(source,a.id)]){skipped.add(child.id);omitted.add(child.id);}
    for(const item of row.items)if(!skipped.has(item.id)){
      const next=rewrite(item,map);
      if(next.tags)next.tags=item.tags.filter(id=>!omitted.has(id)).map(id=>map.get(id));
      for(const key of ['overlapAssetIds','overlapTagIds'])if(item[key])next[key]=item[key].filter(id=>!omitted.has(id)).map(id=>map.get(id)??id);
      if(item.behaviours)next.behaviours=item.behaviours.filter(b=>!omitted.has(b.definitionId)).map(cleanBehaviour);
      if(item.behaviour)next.behaviour=cleanBehaviour(item.behaviour);
      if(row.collection==='tags'&&tagNames.has(nameKey(next.name)))next.name=freshName(next.name,tagNames,' imported',60);
      if(row.collection==='tags')tagNames.add(nameKey(next.name));
      additions[row.collection].push(next);
    }
  }
  const mergedAssets=[...input.assets,...additions.assets],mergedBlocks=[...(input.behaviourLibrary||[]),...additions.behaviourLibrary];
  // Reused blocks and parameters use the destination's shared settings.
  for(const a of additions.assets)for(const b of a.behaviours||[])if(b.definitionId){const block=mergedBlocks.find(d=>d.id===b.definitionId);if(block){const id=b.id;Object.keys(b).forEach(k=>delete b[k]);Object.assign(b,clone(block.behaviour),{id,definitionId:block.id});}}
  const parameterKeys=['name','icon','variant','rule','tags','color','range','width','rotation','direction','parameterLayer','followTokenFacing','occludedByWalls','overlapThreshold','overlapColor','overlapAssetIds','overlapTagIds','behaviours'];
  for(const a of additions.assets)if(a.parameterId){const definition=mergedAssets.find(d=>d.id===a.parameterId);for(const key of parameterKeys)if(key in definition)a[key]=clone(definition[key]);else delete a[key];}
  const instanceLocations=new Map(levels.flatMap(l=>l.instances.filter(i=>!omitted.has(i.assetId)).map(i=>[map.get(i.id),map.get(l.id)])));
  let omittedPieces=0,omittedInventory=0;
  for(const l of levels){
    const info=levelMap.get(l.id),next=rewrite(l,map);next.id=info.id;next.name=info.name;
    next.instances=next.instances.filter((i,n)=>{if(omitted.has(l.instances[n].assetId)){omittedPieces++;return false;}return true;});
    const instanceIds=new Set(next.instances.map(i=>i.id));
    next.objectLinks=next.objectLinks.map(link=>({...link,instanceIds:link.instanceIds.filter(id=>instanceIds.has(id))})).filter(link=>link.instanceIds.length>=2);
    if(l.startingInventory)next.startingInventory=l.startingInventory.filter(entry=>{if(omitted.has(entry.assetId)){omittedInventory++;return false;}return true;}).map(entry=>rewrite(entry,map));
    // Shared definitions may still contain the original scene IDs (including copied-level aliases).
    const aliases=Object.fromEntries(Object.entries(l.referenceOverrides||{}).map(([id,target])=>[id,map.get(target)??target]));
    next.referenceOverrides={...next.referenceOverrides,...Object.fromEntries([...map].filter(([id])=>source.levels.some(l=>l.instances.some(i=>i.id===id)||l.patrols.some(p=>p.id===id)))),...aliases};
    for(const i of next.instances){
      const original=l.instances.find(item=>map.get(item.id)===i.id);
      if(original.referenceOverrides)i.referenceOverrides={...i.referenceOverrides,...Object.fromEntries(Object.entries(original.referenceOverrides).map(([id,target])=>[id,map.get(target)??target]))};
      const scope=new Set(descendants({assets:mergedAssets},i.assetId).map(a=>a.id)),objects=new Set([...scope].filter(id=>{const a=mergedAssets.find(a=>a.id===id);return !isState(a)&&!isParameter(a);}));
      if(i.stateOverrides)i.stateOverrides=Object.fromEntries(Object.entries(i.stateOverrides).filter(([id])=>scope.has(id)&&isState(mergedAssets.find(a=>a.id===id))));
      if(i.removedAssetIds)i.removedAssetIds=i.removedAssetIds.filter(id=>objects.has(id));
      if(i.carriedBy&&instanceLocations.get(i.carriedBy.instanceId)!==i.carriedBy.levelId)delete i.carriedBy;
    }
    if(info.target)replacements.push({targetId:info.target.id,level:next});else newLevels.push(next);
  }
  const behaviourIds=new Set(additions.assets.filter(a=>!a.parameterId).flatMap(a=>(a.behaviours||[]).map(b=>b.id)));
  const allowedOrder=options.importBehaviourOrder?new Set(behaviourQueue({...input,assets:mergedAssets})):behaviourIds;
  const ordered=[...new Set(review.incomingOrder.map(id=>map.get(id)).filter(id=>allowedOrder.has(id)))];
  const action={type:'level.import',data:{...additions,levels:newLevels,replacements,behaviourOrder:ordered}};
  const result=applyAction(input,action);
  return {action,project:result,levelIds:levels.map(l=>levelMap.get(l.id).id),omittedPieces,omittedInventory,warnings:review.warnings};
}
