import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,blankLevel,validateProject,applyAction} from '../public/model.js';
import {copyLevel} from '../public/editing.js';
import {exportLevels,readLevelFile,reviewLevelImport,buildLevelImport} from '../public/level-transfer.js';
import {resolveTurn} from '../public/behaviours.js';

const asset=(id,extra={})=>({id,name:id,kind:'token',icon:'guard',rule:'',tags:[],range:1,color:'#b8cf96',parentId:null,...extra});
const piece=(id,assetId,x=2,y=2,extra={})=>({id,assetId,x,y,rotation:0,...extra});
const copyOptions=file=>({levelChoices:Object.fromEntries(file.levels.map(l=>[l.id,{mode:'copy'}]))});
function fixture(){
  let p=newProject();p.title='Do not transfer this project title';
  p.tags=[{id:'living',name:'Living',rule:'Affected by light',color:'#b8cf96'},{id:'unused-tag',name:'Unused',rule:'',color:'#b8cf96'}];
  p.assets=[asset('guard',{tags:['living'],behaviours:[{id:'spawn',type:'spawn',enabled:true,spawnAssetId:'rat',spawnCount:1}]}),asset('alive',{kind:'state',parentId:'guard',enabled:true}),asset('rat'),asset('unused')];
  p.assets.push(asset('light',{icon:'area',range:3,overlapAssetIds:['rat'],behaviours:[{id:'collect',type:'applyEffect',enabled:true,action:'graveyard',eligibleAssetIds:['rat']}]}));
  p=applyAction(p,{type:'parameter.attach',data:{id:'light',parentId:'alive',usageId:'guard-light',originalUsageId:'old-light'}});
  p=applyAction(p,{type:'behaviour.save',data:{id:'flee',name:'Flee',rule:'Keep away',behaviour:{id:'flee-source',type:'moveAway',enabled:true,steps:1}}});
  p=applyAction(p,{type:'behaviour.attach',data:{id:'guard',definitionId:'flee',usageId:'guard-flee'}});
  p.behaviourOrder=['guard-flee','spawn','collect'];
  p.levels=[blankLevel('courtyard','Courtyard'),blankLevel('unused-level','Unused level')];
  const l=p.levels[0];l.nodes=['2,2','3,2'];l.instances=[piece('g','guard',2,2,{stateOverrides:{alive:false},moveTarget:{type:'object',id:'r'}}),piece('r','rat',3,2)];
  l.startingInventory=[{assetId:'rat',count:0}];
  l.objectLinks=[{id:'friends',name:'Friends',rule:'Together',color:'#b8cf96',instanceIds:['g','r']}];
  l.patrols=[{id:'route',name:'Route',color:'#b8cf96',hidden:false,nodes:['2,2','3,2']}];
  l.postIts=[{id:'note',text:'guard is a name, not an ID to rewrite',x:1,y:1,color:'#b8cf96'}];
  return validateProject(p);
}

test('level files include only selected levels and their transitive library dependencies',()=>{
  const p=fixture(),before=structuredClone(p),file=exportLevels(p,['courtyard']);
  assert.deepEqual(file.levels.map(l=>l.id),['courtyard']);
  assert.deepEqual(file.assets.map(a=>a.id),['guard','alive','guard-light','rat','light']);
  assert.deepEqual(file.tags.map(t=>t.id),['living']);
  assert.deepEqual(file.behaviourLibrary.map(b=>b.id),['flee']);
  assert.equal(file.title,undefined);assert.equal(file.cardDraws,undefined);
  assert.deepEqual(readLevelFile(JSON.parse(JSON.stringify(file))),file);
  assert.deepEqual(p,before);
  assert.throws(()=>exportLevels(p,[]),/select/i);
  assert.throws(()=>exportLevels(p,['missing']),/select/i);
  assert.throws(()=>readLevelFile(p),/not a project/i);
  assert.throws(()=>readLevelFile({...file,version:2}),/level export/i);
  assert.throws(()=>readLevelFile({...file,levels:[{...file.levels[0],width:200}]}),/invalid level/i);
});

test('round trip into an empty library preserves hierarchy, shared blocks, layout, inventories, order and links',()=>{
  const source=fixture(),file=exportLevels(source,['courtyard']),target=newProject(),before=structuredClone(target);
  const {project:p,action,levelIds}=buildLevelImport(target,file),l=p.levels.find(l=>l.id===levelIds[0]);
  assert.deepEqual(target,before);assert.equal(p.title,target.title);
  assert.deepEqual(p.levels[0],target.levels[0]);
  assert.equal(l.name,'Courtyard');assert.deepEqual(l.tiles,file.levels[0].tiles);assert.deepEqual(l.nodes,['2,2','3,2']);
  const guard=p.assets.find(a=>a.name==='guard'),state=p.assets.find(a=>a.name==='alive'),rat=p.assets.find(a=>a.name==='rat');
  assert.notEqual(guard.id,'guard');assert.equal(state.parentId,guard.id);
  const g=l.instances.find(i=>i.assetId===guard.id),r=l.instances.find(i=>i.assetId===rat.id);
  assert.deepEqual(g.stateOverrides,{[state.id]:false});assert.equal(g.moveTarget.id,r.id);
  assert.deepEqual(l.objectLinks[0].instanceIds,[g.id,r.id]);
  assert.deepEqual(l.startingInventory,[{assetId:rat.id,count:0}]);
  assert.equal(l.postIts[0].text,file.levels[0].postIts[0].text);assert.notEqual(l.postIts[0].id,'note');
  const light=p.assets.find(a=>a.name==='light'&&!a.parentId),use=p.assets.find(a=>a.parameterId===light.id);
  assert.equal(use.parentId,state.id);assert.equal(use.behaviours[0].id,light.behaviours[0].id);
  assert.equal(guard.behaviours[0].spawnAssetId,rat.id);
  assert.equal(guard.behaviours[1].definitionId,p.behaviourLibrary[0].id);
  assert.deepEqual(p.behaviourOrder,[guard.behaviours[1].id,guard.behaviours[0].id,light.behaviours[0].id]);
  assert.deepEqual(applyAction(target,action),p);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  const turn=resolveTurn(p);assert.equal(turn.project.levels.find(item=>item.id===l.id).instances.length,3);
});

test('identical definitions are reused; case insensitive name conflicts require an explicit copy or replacement',()=>{
  const p=fixture(),file=exportLevels(p,['courtyard']),review=reviewLevelImport(p,file);
  assert.ok(review.rows.every(row=>row.status==='same'));
  assert.throws(()=>buildLevelImport(p,file),/make a copy or replace/i);
  const result=buildLevelImport(p,file,copyOptions(file));
  assert.equal(result.project.assets.length,p.assets.length);assert.equal(result.project.levels.at(-1).name,'Courtyard copy');
  const second=buildLevelImport(result.project,file,copyOptions(file));assert.equal(second.project.levels.at(-1).name,'Courtyard copy 2');
  const replace=buildLevelImport(p,file,{levelChoices:{courtyard:{mode:'replace',targetId:'courtyard'}}});
  assert.equal(replace.project.levels.length,2);assert.equal(replace.project.levels[0].id,'courtyard');assert.notEqual(replace.project.levels[0].instances[0].id,'g');
  assert.deepEqual(replace.project.levels[1],p.levels[1]);
  const renamed=structuredClone(p);renamed.levels[0].name='  COURTYARD  ';
  assert.equal(reviewLevelImport(renamed,file).conflicts[0].matches[0].id,'courtyard');
  assert.throws(()=>buildLevelImport(p,file,{levelChoices:{courtyard:{mode:'replace',targetId:'missing'}}}),/review/i);
});

test('different definitions import as independent variants and unchecked differences reuse current definitions',()=>{
  const source=fixture(),file=exportLevels(source,['courtyard']),target=structuredClone(source);
  target.assets.find(a=>a.id==='rat').rule='Current rat rules';
  const review=reviewLevelImport(target,file);
  assert.equal(review.rows.find(r=>r.id==='rat').status,'different');
  assert.equal(review.rows.find(r=>r.id==='guard').status,'different');
  const imported=buildLevelImport(target,file,copyOptions(file));
  assert.deepEqual(imported.project.assets.slice(0,target.assets.length),target.assets);
  const originalRat=imported.project.assets.find(a=>a.id==='rat'),newRat=imported.project.assets.filter(a=>a.name==='rat').at(-1);
  assert.notEqual(newRat.id,originalRat.id);assert.equal(newRat.rule,'');
  const newGuard=imported.project.assets.filter(a=>a.name==='guard').at(-1);assert.equal(newGuard.behaviours[0].spawnAssetId,newRat.id);
  const reused=buildLevelImport(target,file,{...copyOptions(file),definitionIds:[]});
  assert.deepEqual(reused.project.assets,target.assets);assert.equal(reused.project.levels.at(-1).instances[1].assetId,'rat');
});

test('a copied object reusing a parameter keeps shared behaviour IDs in runtime progress',()=>{
  const source=fixture();
  for(const id of ['light','guard-light'])source.assets.find(a=>a.id===id).behaviours=[{id:'collect',type:'wait',enabled:true,turns:2}];
  source.levels[0].instances[0].waitProgress=[{assignedId:'guard-light',behaviourId:'collect',remaining:1}];
  const target=structuredClone(source);target.assets[0].rule='Different guard';
  const file=exportLevels(source,['courtyard']),result=buildLevelImport(target,file,copyOptions(file)).project;
  const copiedGuard=result.assets.filter(a=>a.name==='guard').at(-1),copiedState=result.assets.find(a=>a.parentId===copiedGuard.id&&a.kind==='state'),use=result.assets.find(a=>a.parentId===copiedState.id&&a.parameterId);
  assert.equal(use.parameterId,'light');assert.equal(use.behaviours[0].id,'collect');
  assert.deepEqual(result.levels.at(-1).instances[0].waitProgress,[{assignedId:use.id,behaviourId:'collect',remaining:1}]);
});

test('definitions with different IDs are matched by unambiguous name, hierarchy and content',()=>{
  const source=fixture(),file=exportLevels(source,['courtyard']);
  const first=buildLevelImport(newProject(),file),review=reviewLevelImport(first.project,file);
  assert.ok(review.rows.every(r=>r.status==='same'),review.rows.map(r=>r.name+':'+r.status).join(', '));
  const second=buildLevelImport(first.project,file,copyOptions(file));assert.deepEqual(second.project.assets,first.project.assets);
});

test('unchecked missing objects omit placements, inventory entries and broken links, with valid state overrides',()=>{
  const file=exportLevels(fixture(),['courtyard']),review=reviewLevelImport(newProject(),file),selected=review.rows.filter(r=>r.id!=='rat').map(r=>r.id);
  const result=buildLevelImport(newProject(),file,{definitionIds:selected}),l=result.project.levels.at(-1);
  assert.equal(result.omittedPieces,1);assert.equal(result.omittedInventory,1);assert.equal(l.instances.length,1);
  assert.deepEqual(l.startingInventory,[]);assert.deepEqual(l.objectLinks,[]);
  const guard=result.project.assets.find(a=>a.name==='guard');assert.equal(guard.behaviours[0].enabled,false);
  const light=result.project.assets.find(a=>a.name==='light'&&!a.parentId);assert.deepEqual(light.overlapAssetIds,[]);assert.deepEqual(light.behaviours[0].eligibleAssetIds,[]);
  assert.doesNotThrow(()=>validateProject(result.project));
  const empty=buildLevelImport(newProject(),file,{definitionIds:[]});assert.equal(empty.project.assets.length,0);assert.deepEqual(empty.project.levels.at(-1).instances,[]);
});

test('skipping reusable parameters and behaviour blocks omits their attachments',()=>{
  const file=exportLevels(fixture(),['courtyard']),ids=reviewLevelImport(newProject(),file).rows.map(r=>r.id);
  const p=buildLevelImport(newProject(),file,{definitionIds:ids.filter(id=>!['light','flee'].includes(id))}).project;
  assert.ok(!p.assets.some(a=>a.parameterId));assert.equal(p.behaviourLibrary?.length||0,0);
  const guard=p.assets.find(a=>a.name==='guard');assert.equal(guard.behaviours.length,1);assert.equal(guard.behaviours[0].type,'spawn');
  assert.doesNotThrow(()=>validateProject(p));
});

test('different tags receive unique names and do not change tags on existing levels',()=>{
  const source=fixture(),file=exportLevels(source,['courtyard']),target=structuredClone(source);target.tags[0].rule='Other rules';
  const result=buildLevelImport(target,file,copyOptions(file)),newTag=result.project.tags.at(-1),newGuard=result.project.assets.filter(a=>a.name==='guard').at(-1);
  assert.equal(newTag.name,'Living imported');assert.notEqual(newTag.id,'living');assert.deepEqual(newGuard.tags,[newTag.id]);
  assert.deepEqual(result.project.tags[0],target.tags[0]);
});

test('scene references, copied aliases, state overrides and runtime identities survive imported levels',()=>{
  const source=fixture(),l=source.levels[0];
  source.assets.find(a=>a.id==='guard').behaviours.push({id:'teleport',type:'teleport',enabled:true,teleportTarget:'object',targetInstanceId:'r',destination:{type:'object',id:'g'}});
  source.assets.find(a=>a.id==='rat').behaviours=[{id:'patrol',type:'moveTo',enabled:true,steps:1,target:'patrolEnd',patrolId:'route'}];
  l.instances[1].carriedBy={levelId:l.id,instanceId:'g'};
  l.instances[1].distraction={sourceId:'g',origin:{x:1,y:1},destination:{x:2,y:2},phase:'approach',steps:1,returnToStart:true};
  l.instances[1].patrolProgress={patrol:'end'};
  const copied=copyLevel(l);source.levels.push(copied);
  const file=exportLevels(validateProject(source),[l.id,copied.id]),result=buildLevelImport(newProject(),file);
  const p=result.project,guard=p.assets.find(a=>a.name==='guard'),rat=p.assets.find(a=>a.name==='rat'),teleport=guard.behaviours.find(b=>b.type==='teleport');
  for(const id of result.levelIds){const imported=p.levels.find(l=>l.id===id),g=imported.instances[0],r=imported.instances[1];
    const resolve=id=>imported.referenceOverrides?.[id]||id;
    assert.equal(resolve(teleport.targetInstanceId),r.id);assert.equal(resolve(teleport.destination.id),g.id);
    assert.equal(resolve(rat.behaviours[0].patrolId),imported.patrols[0].id);
    assert.equal(r.distraction.sourceId,g.id);assert.deepEqual(r.patrolProgress,{[rat.behaviours[0].id]:'end'});
  }
  assert.deepEqual(p.levels[1].instances[1].carriedBy,{levelId:p.levels[1].id,instanceId:p.levels[1].instances[0].id});
});

test('limits and failed imports are atomic and an import can be undone and redone',()=>{
  const target=newProject();target.levels=Array.from({length:30},(_,n)=>blankLevel(`l${n}`,`Level ${n}`));
  const file=exportLevels(fixture(),['courtyard']),before=structuredClone(target);
  assert.throws(()=>buildLevelImport(target,file),/supported workshop project/i);assert.deepEqual(target,before);
  const start=newProject(),result=buildLevelImport(start,file);
  assert.deepEqual(applyAction(result.project,{type:'project.replace',data:start}),start);
  assert.deepEqual(applyAction(start,{type:'project.replace',data:result.project}),result.project);
});

test('resolution order can be kept or explicitly imported as a shared project setting',()=>{
  const source=fixture(),target=structuredClone(source),file=exportLevels(source,['courtyard']);
  target.behaviourOrder=['collect','spawn','guard-flee'];
  assert.equal(reviewLevelImport(target,file).hasSharedOrder,true);
  const kept=buildLevelImport(target,file,copyOptions(file));assert.deepEqual(kept.project.behaviourOrder,target.behaviourOrder);
  const adopted=buildLevelImport(target,file,{...copyOptions(file),importBehaviourOrder:true});assert.deepEqual(adopted.project.behaviourOrder,source.behaviourOrder);
  assert.deepEqual(adopted.project.assets,target.assets);
});

test('exporting copied levels keeps original scene aliases when reusing definitions',()=>{
  const p=fixture();p.assets[0].behaviours.push({id:'teleport',type:'teleport',enabled:true,teleportTarget:'object',targetInstanceId:'r',destination:{type:'object',id:'g'}});
  const copied=copyLevel(p.levels[0]);p.levels.push(copied);
  const file=exportLevels(p,[copied.id]),review=reviewLevelImport(p,file);assert.deepEqual(review.warnings,[]);
  const result=buildLevelImport(p,file,copyOptions(file)),level=result.project.levels.at(-1);
  assert.equal(level.referenceOverrides.r,level.instances[1].id);assert.equal(level.referenceOverrides.g,level.instances[0].id);
  const turn=resolveTurn(result.project),imported=turn.project.levels.at(-1);
  assert.deepEqual([imported.instances[1].x,imported.instances[1].y],[2,2]);
  const both=buildLevelImport(p,exportLevels(p,['courtyard',copied.id]),{levelChoices:{courtyard:{mode:'copy'},[copied.id]:{mode:'copy'}}});
  assert.equal(both.project.levels.at(-1).referenceOverrides.r,both.project.levels.at(-1).instances[1].id);
});

test('exports capture implicit behaviour order before regrouping nested definitions',()=>{
  const p=newProject();p.assets=[asset('a'),asset('b'),asset('c',{parentId:'a'})];
  for(const a of p.assets)a.behaviours=[{id:`wait-${a.id}`,type:'wait',turns:1,enabled:true}];
  p.levels[0].instances=[piece('a-piece','a'),piece('b-piece','b',3)];
  const file=exportLevels(p,[p.levels[0].id]);
  assert.deepEqual(file.assets.map(a=>a.id),['a','c','b']);
  assert.deepEqual(file.behaviourOrder,['wait-a','wait-b','wait-c']);
  const imported=buildLevelImport(newProject(),file,{...copyOptions(file)}).project;
  assert.deepEqual(imported.behaviourOrder.map(id=>imported.assets.find(a=>a.behaviours.some(b=>b.id===id)).name),['a','b','c']);
});

test('cross-level carried references are kept when their carrier level is included',()=>{
  const p=fixture();p.levels[1].instances=[piece('carried-rat','rat')];
  p.levels[1].instances[0].carriedBy={levelId:'courtyard',instanceId:'g'};
  const all=exportLevels(p,p.levels.map(l=>l.id)),result=buildLevelImport(newProject(),all).project;
  assert.deepEqual(result.levels[2].instances[0].carriedBy,{levelId:result.levels[1].id,instanceId:result.levels[1].instances[0].id});
  const alone=buildLevelImport(newProject(),exportLevels(p,['unused-level'])).project;
  assert.equal(alone.levels.at(-1).instances[0].carriedBy,undefined);
});

test('targets outside the selected levels are isolated and reported',()=>{
  const p=fixture();p.levels[1].instances=[piece('outside','guard')];
  p.assets[0].behaviours.push({id:'teleport',type:'teleport',enabled:true,teleportTarget:'object',targetInstanceId:'outside',destination:{type:'object',id:'g'}});
  const file=exportLevels(p,['courtyard']);assert.equal(reviewLevelImport(newProject(),file).warnings.length,1);
  const target=newProject();target.assets=[asset('local')];target.levels[0].instances=[piece('outside','local')];
  const result=buildLevelImport(target,file),guard=result.project.assets.find(a=>a.name==='guard');
  assert.notEqual(guard.behaviours.find(b=>b.id!==undefined&&b.type==='teleport').targetInstanceId,'outside');
  assert.equal(reviewLevelImport(newProject(),exportLevels(p,p.levels.map(l=>l.id))).warnings.length,0);
});

test('HTTP level imports reject stale reviews, persist atomically, undo/redo and survive restart',async()=>{
  const {createWorkshopServer}=await import('../server.mjs');
  const {mkdtemp,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const dataDir=await mkdtemp(join(tmpdir(),'workshop-level-import-'));let server;
  const start=async()=>{server=await createWorkshopServer({dataDir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;};
  const stop=async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;};
  try{
    let base=await start(),url=base+'/api/rooms/levels',state=await(await fetch(url)).json();
    assert.equal((await(await fetch(base+'/api/config')).json()).levelTransferVersion,1);
    const send=async(action,expectedRevision=state.revision,status=200)=>{
      const response=await fetch(url+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,actionId:crypto.randomUUID(),expectedRevision})});
      const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));if(response.ok)state=body;return body;
    };
    const initial=structuredClone(state.project),file=exportLevels(fixture(),['courtyard']),plan=buildLevelImport(initial,file);
    await send(plan.action,-1,409);assert.deepEqual((await(await fetch(url)).json()).project,initial);
    await send(plan.action);const saved=structuredClone(state.project);assert.deepEqual(saved,plan.project);
    await send({type:'project.replace',data:initial});assert.deepEqual(state.project,initial);
    await send({type:'project.replace',data:saved});
    const replacement=buildLevelImport(state.project,file,{levelChoices:{courtyard:{mode:'replace',targetId:plan.levelIds[0]}}});
    await send(replacement.action);assert.equal(state.project.levels.length,2);
    const committed=structuredClone(state.project);
    await send({...replacement.action,data:{...replacement.action.data,replacements:[{targetId:'missing',level:replacement.action.data.replacements[0].level}]}},state.revision,400);
    await stop();base=await start();url=base+'/api/rooms/levels';
    assert.deepEqual((await(await fetch(url)).json()).project,committed);
  }finally{if(server)await stop();await rm(dataDir,{recursive:true,force:true});}
});
