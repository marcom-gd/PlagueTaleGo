import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,applyAction,validateProject} from '../public/model.js';
import {orderedBehaviours,resolveTurn} from '../public/behaviours.js';
import {behaviourHierarchy,behaviourChip} from '../public/behaviour-ui.js';

const asset=(id,extra={})=>({id,name:id,kind:'token',icon:'guard',rule:'',tags:[],range:1,color:'#b8cf96',parentId:null,...extra});
const move=id=>({id,type:'moveAway',enabled:true,steps:1});
const send=(p,type,data)=>applyAction(p,{type,data});
function fixture(){
  const p=newProject();p.assets=[asset('guard',{behaviours:[move('first'),move('second'),move('third')]}),asset('off',{kind:'state',enabled:false,parentId:'guard'}),asset('area',{icon:'area',behaviours:[move('area-move')]}),asset('other')];
  p.levels[0].tiles={};p.levels[0].nodes=['1,1','2,1','3,1','4,1'];
  p.levels[0].instances=[{id:'piece',assetId:'guard',x:2,y:1,rotation:0,moveTarget:{type:'position',x:1,y:1}}];
  return validateProject(p);
}
const ids=p=>orderedBehaviours(p).map(row=>row.behaviour.id);

test('hierarchy moves reorder execution without losing IDs or changing unrelated relative order',()=>{
  let p=send(fixture(),'behaviour.order',{ids:['area-move','second','first','third']});
  const before=structuredClone(p);
  p=send(p,'behaviour.move',{sourceId:'guard',targetId:'guard',usageId:'third',beforeId:'second'});
  assert.deepEqual(p.assets[0].behaviours.map(b=>b.id),['third','second','first']);
  assert.deepEqual(ids(p),['area-move','third','second','first']);
  p=send(p,'behaviour.move',{sourceId:'guard',targetId:'guard',usageId:'first',beforeId:null});
  assert.deepEqual(p.assets[0].behaviours.map(b=>b.id),['third','second','first']);
  assert.deepEqual(ids(p),['area-move','third','second','first']);
  assert.deepEqual(before.assets[0].behaviours.map(b=>b.id),['first','second','third']);
});

test('moving a behaviour into an inactive state changes gating and survives save/load',()=>{
  let p=fixture();p.assets[0].behaviours=[move('first')];
  assert.equal(resolveTurn(p).project.levels[0].instances[0].x,3);
  p=send(p,'behaviour.move',{sourceId:'guard',targetId:'off',usageId:'first'});
  assert.deepEqual(p.assets[0].behaviours,[]);assert.equal(p.assets[1].behaviours[0].id,'first');
  const restored=validateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(resolveTurn(restored).project.levels[0].instances[0].x,2);
  const enabled=send(restored,'asset.update',{id:'off',enabled:true});
  assert.equal(resolveTurn(enabled).project.levels[0].instances[0].x,3);
});

test('moves through shared parameter usages update every use while keeping a single behaviour identity',()=>{
  let p=send(fixture(),'parameter.attach',{id:'area',parentId:'guard',usageId:'area-use'});
  p=send(p,'behaviour.move',{sourceId:'guard',targetId:'area-use',usageId:'first',beforeId:'area-move'});
  for(const id of ['area','area-use'])assert.deepEqual(p.assets.find(a=>a.id===id).behaviours.map(b=>b.id),['first','area-move']);
  assert.equal(ids(p).filter(id=>id==='first').length,1);
  p=send(p,'behaviour.move',{sourceId:'area-use',targetId:'off',usageId:'first'});
  for(const id of ['area','area-use'])assert.deepEqual(p.assets.find(a=>a.id===id).behaviours.map(b=>b.id),['area-move']);
  assert.deepEqual(p.assets.find(a=>a.id==='off').behaviours.map(b=>b.id),['first']);
});

test('catalog drops insert at the requested position and retain the reusable block link',()=>{
  let p=send(fixture(),'behaviour.save',{id:'flee',name:'Flee',rule:'',behaviour:move('flee-template')});
  p=send(p,'behaviour.insert',{id:'guard',definitionId:'flee',usageId:'flee-use',beforeId:'second'});
  assert.deepEqual(p.assets[0].behaviours.map(b=>b.id),['first','flee-use','second','third']);
  assert.ok(ids(p).indexOf('flee-use')<ids(p).indexOf('second'));
  p=send(p,'behaviour.move',{sourceId:'guard',targetId:'off',usageId:'flee-use'});
  p=send(p,'behaviour.save',{id:'flee',name:'Flee',rule:'',behaviour:{...move('flee-template'),steps:3}});
  assert.equal(p.assets[1].behaviours[0].steps,3);
  assert.equal(p.assets[1].behaviours[0].definitionId,'flee');
  p=send(p,'behaviour.insert',{id:'off',definitionId:'flee',usageId:'ignored'});
  assert.deepEqual(p.assets[1].behaviours.map(b=>b.id),['flee-use']);
});

test('stale and conflicting drops fail atomically and dropping onto itself is harmless',()=>{
  let p=send(fixture(),'behaviour.save',{id:'flee',name:'Flee',rule:'',behaviour:move('template')});
  p=send(p,'behaviour.attach',{id:'guard',definitionId:'flee',usageId:'guard-flee'});
  p=send(p,'behaviour.attach',{id:'off',definitionId:'flee',usageId:'off-flee'});
  const original=structuredClone(p);
  for(const data of [
    {sourceId:'guard',targetId:'missing',usageId:'first'},
    {sourceId:'guard',targetId:'off',usageId:'missing'},
    {sourceId:'guard',targetId:'off',usageId:'first',beforeId:'missing'},
    {sourceId:'guard',targetId:'off',usageId:'guard-flee'},
  ])assert.throws(()=>send(p,'behaviour.move',data));
  assert.deepEqual(p,original);
  assert.deepEqual(send(p,'behaviour.move',{sourceId:'guard',targetId:'guard',usageId:'first',beforeId:'first'}),original);
});

test('editable hierarchy includes empty states as drop destinations, with draggable usage identities',()=>{
  const p=fixture();
  assert.deepEqual(behaviourHierarchy(p,'guard').children,[]);
  const hierarchy=behaviourHierarchy(p,'guard',null,{includeEmpty:true});
  assert.equal(hierarchy.children[0].asset.id,'off');assert.equal(hierarchy.children[0].active,false);
  assert.match(behaviourChip(p,p.assets[0].behaviours[0],{assetId:'guard',hierarchy:true}),/data-behaviour-usage="first".*draggable="true"/);
  assert.match(behaviourChip(p,p.assets[0].behaviours[0],{assetId:'guard',hierarchy:true,play:true}),/draggable="false"/);
});

test('incompatible area behaviour drops preserve the complete source and destination',()=>{
  const p=fixture();p.assets.find(a=>a.id==='area').behaviours=[{id:'expand',type:'expand',enabled:true,allowStacking:false}];
  validateProject(p);const before=structuredClone(p);
  assert.throws(()=>send(p,'behaviour.move',{sourceId:'area',targetId:'off',usageId:'expand'}),/Area behaviours/);
  assert.deepEqual(p,before);
});

test('HTTP hierarchy moves and catalog drops persist atomically across server restarts',async()=>{
  const {createWorkshopServer}=await import('../server.mjs');
  const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const dataDir=await mkdtemp(join(tmpdir(),'workshop-behaviour-drag-'));let server;
  const start=async()=>{server=await createWorkshopServer({dataDir});await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}/api/rooms/test`;};
  const stop=async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));server=null;};
  try{
    let url=await start(),revision=(await(await fetch(url)).json()).revision;
    const post=async(type,data,status=200)=>{const res=await fetch(url+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:{type,data},actionId:crypto.randomUUID(),expectedRevision:revision})});const result=await res.json();assert.equal(res.status,status,JSON.stringify(result));if(res.ok)revision=result.revision;return result.project;};
    await post('project.replace',fixture());
    await post('behaviour.move',{sourceId:'guard',targetId:'off',usageId:'first'});
    await post('behaviour.save',{id:'flee',name:'Flee',rule:'',behaviour:move('template')});
    const saved=await post('behaviour.insert',{id:'off',definitionId:'flee',usageId:'shared-use',beforeId:'first'});
    await post('behaviour.move',{sourceId:'off',targetId:'missing',usageId:'first'},400);
    await stop();url=await start();
    const restored=(await(await fetch(url)).json()).project;assert.deepEqual(restored,saved);
    assert.deepEqual(restored.assets.find(a=>a.id==='off').behaviours.map(b=>b.id),['shared-use','first']);
  }finally{if(server)await stop();await rm(dataDir,{recursive:true,force:true});}
});
