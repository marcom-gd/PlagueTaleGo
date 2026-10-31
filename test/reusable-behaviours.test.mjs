import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,applyAction,validateProject} from '../public/model.js';
import {resolveTurn,orderedBehaviours} from '../public/behaviours.js';
import {copyHierarchy} from '../public/editing.js';
import {createSequence,nextTurn,previousTurn,validateSequence} from '../public/turn-sequence.js';
import {behaviourHierarchy} from '../public/behaviour-ui.js';

const asset=(id,extra={})=>({id,name:id,kind:'token',icon:'guard',rule:'',tags:[],range:1,color:'#b8cf96',parentId:null,...extra});
const block=(type='moveAway',extra={})=>({id:'flee',name:'Flee danger',rule:'Keep your distance.',behaviour:{id:'flee-source',type,enabled:true,steps:2,...extra}});
const send=(p,type,data)=>applyAction(p,{type,data});
const attach=(p,id,usageId=id+'-flee')=>send(p,'behaviour.attach',{id,definitionId:'flee',usageId});
function fixture(){
  const p=newProject(),l=p.levels[0];
  p.assets=[asset('guard',{autoFacing:true}),asset('other'),asset('area',{icon:'area'})];
  l.tiles={};l.nodes=Array.from({length:8},(_,x)=>`${x},2`);
  l.instances=[{id:'g',assetId:'guard',x:3,y:2,rotation:0,moveTarget:{type:'position',x:1,y:2}}];
  return p;
}

test('reusable behaviour edits synchronize all uses, preserve identities/order, and survive save/load and hierarchy copies',()=>{
  let p=send(fixture(),'behaviour.save',block());p=attach(p,'guard');p=attach(p,'other');
  p=attach(p,'guard','redundant');assert.equal(p.assets[0].behaviours.length,1);
  p=send(p,'behaviour.order',{ids:['other-flee','guard-flee']});
  p=send(p,'behaviour.save',block('moveAway',{steps:4}));
  assert.equal(p.assets[0].behaviours[0].steps,4);assert.equal(p.assets[1].behaviours[0].steps,4);
  assert.deepEqual(orderedBehaviours(p).map(r=>r.behaviour.id),['other-flee','guard-flee']);
  p=send(p,'asset.addMany',{assets:copyHierarchy(p,'guard')});
  const copy=p.assets.at(-1);assert.equal(copy.behaviours[0].definitionId,'flee');assert.notEqual(copy.behaviours[0].id,'guard-flee');
  p=send(p,'behaviour.save',block('moveAway',{steps:1}));assert.equal(p.assets.at(-1).behaviours[0].steps,1);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  const reordered=structuredClone(p);reordered.assets[0].behaviours[0]=Object.fromEntries(Object.entries(reordered.assets[0].behaviours[0]).reverse());
  assert.doesNotThrow(()=>validateProject(reordered));
});

test('shared behaviours compose with reusable parameters and inactive states, and deletion preserves attached logic',()=>{
  let p=fixture();p.assets.push(asset('off',{kind:'state',parentId:'guard',enabled:false}));
  p=send(p,'behaviour.save',block());p=attach(p,'off');
  assert.equal(resolveTurn(p).project.levels[0].instances[0].x,3);
  p=send(p,'asset.update',{id:'off',enabled:true});assert.equal(resolveTurn(p).project.levels[0].instances[0].x,5);
  p=attach(p,'area');p=send(p,'parameter.attach',{id:'area',parentId:'other',usageId:'area-use'});
  p=send(p,'behaviour.save',block('moveAway',{steps:3}));
  assert.equal(p.assets.find(a=>a.id==='area-use').behaviours[0].steps,3);
  p=send(p,'behaviour.delete',{id:'flee'});
  assert.equal(p.behaviourLibrary.length,0);assert.equal(p.assets.find(a=>a.id==='off').behaviours[0].definitionId,undefined);
  assert.equal(resolveTurn(p).project.levels[0].instances[0].x,6);
  assert.doesNotThrow(()=>validateProject(p));
});

test('incompatible shared edits, divergent imports, missing references and behaviour limits are rejected atomically',()=>{
  let p=send(fixture(),'behaviour.save',block());p=attach(p,'guard');const before=structuredClone(p);
  assert.throws(()=>send(p,'behaviour.save',block('expand',{allowStacking:false})),/Area behaviours/);assert.deepEqual(p,before);
  const changed=structuredClone(p);changed.assets[0].behaviours[0].steps=7;assert.throws(()=>validateProject(changed),/reusable behaviour reference/);
  assert.throws(()=>attach(p,'missing'));assert.throws(()=>validateProject({...p,behaviourLibrary:[]}));
  assert.throws(()=>send(p,'behaviour.save',block('moveAway',{steps:0})));
  p.assets[1].behaviours=Array.from({length:30},(_,n)=>({id:'walk-'+n,type:'moveAway',enabled:true,steps:1}));
  assert.throws(()=>attach(p,'other'),/30 behaviours/);
  const areaOnly=send(fixture(),'behaviour.save',block('expand',{allowStacking:false}));
  assert.doesNotThrow(()=>attach(areaOnly,'area'));assert.throws(()=>attach(areaOnly,'guard'),/Area behaviours/);
});

test('Move Away From increases distance, tracks object targets, auto-faces, stops at occupied/broken nodes, and honors locks',()=>{
  let p=attach(send(fixture(),'behaviour.save',block()),'guard'),l=p.levels[0];
  let run=resolveTurn(p);assert.equal(run.project.levels[0].instances[0].x,5);assert.equal(run.project.levels[0].instances[0].direction,90);assert.equal(run.log[0].count,2);
  l.instances[0].moveTarget={type:'object',id:'threat'};l.instances.push({id:'threat',assetId:'other',x:6,y:2,rotation:0});
  assert.equal(resolveTurn(p).project.levels[0].instances[0].x,1);
  l.instances[1].x=1;l.blockedLinks=['4,2|5,2'];assert.equal(resolveTurn(p).project.levels[0].instances[0].x,4);
  l.blockedLinks=[];l.instances.push({id:'obstacle',assetId:'other',x:4,y:2,rotation:0});assert.equal(resolveTurn(p).project.levels[0].instances[0].x,3);
  l.instances.pop();l.instances[0].locked=true;assert.equal(resolveTurn(p).project.levels[0].instances[0].x,3);
  l.instances[0].locked=false;l.instances[0].moveTarget={type:'object',id:'missing'};assert.equal(resolveTurn(p).log[0].count,0);
  l.instances[0].moveTarget={type:'self'};assert.equal(resolveTurn(p).log[0].count,0);
});

test('Move Away From respects live blockers and turn history restores and replays shared behaviour movement',()=>{
  let p=attach(send(fixture(),'behaviour.save',block()),'guard');
  p.assets[2].parentId='other';p.assets[2].behaviours=[{id:'barrier',type:'blockNode',enabled:true,blockAssetIds:['guard'],blockScope:'movement'}];
  p.levels[0].instances.push({id:'blocker',assetId:'other',x:5,y:2,rotation:0});
  assert.equal(resolveTurn(p).project.levels[0].instances[0].x,3);
  p.assets[2].behaviours[0].enabled=false;
  const state={project:p,inventory:[],graveyard:[],levelId:p.levels[0].id};
  let seq=nextTurn(createSequence(state),state);assert.equal(seq.frames[1].project.levels[0].instances[0].x,4);
  seq=previousTurn(seq,seq.frames[1]);assert.equal(seq.frames[0].project.levels[0].instances[0].x,3);
  assert.deepEqual(validateSequence(JSON.parse(JSON.stringify(seq))),seq);
});

test('HTTP actions persist the reusable library, attachments and shared edits across a server restart',async()=>{
  const {createWorkshopServer}=await import('../server.mjs');
  const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const dataDir=await mkdtemp(join(tmpdir(),'workshop-reusable-'));let server;
  const start=async()=>{server=await createWorkshopServer({dataDir});await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}/api/rooms/test`;};
  const stop=async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));server=null;};
  try{
    let url=await start();let revision=(await(await fetch(url)).json()).revision;
    const send=async(type,data)=>{const res=await fetch(url+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:{type,data},actionId:crypto.randomUUID(),expectedRevision:revision})});const result=await res.json();assert.equal(res.status,200,JSON.stringify(result));revision=result.revision;return result.project;};
    await send('project.replace',fixture());await send('behaviour.save',block());await send('behaviour.attach',{id:'guard',definitionId:'flee',usageId:'attached'});
    const saved=await send('behaviour.save',block('moveAway',{steps:3}));await stop();url=await start();
    const restored=(await(await fetch(url)).json()).project;assert.deepEqual(restored,saved);assert.equal(resolveTurn(restored).project.levels[0].instances[0].x,6);
  }finally{if(server)await stop();await rm(dataDir,{recursive:true,force:true});}
});

test('behaviour summaries keep state-bearing paths, include their parameter logic and retain inactive state context',()=>{
  const p=fixture(),move=id=>({id,type:'moveAway',enabled:true,steps:1});
  p.assets.push(
    asset('child',{parentId:'guard'}),
    asset('lit',{parentId:'child',kind:'state',enabled:false}),
    asset('light',{parentId:'lit',icon:'area',behaviours:[move('light-move')]}),
    asset('unrelated',{parentId:'guard',behaviours:[move('unrelated-move')]}),
    asset('bare-parameter',{parentId:'guard',icon:'area',behaviours:[move('bare-move')]}),
    asset('empty-state',{parentId:'guard',kind:'state',enabled:true})
  );
  validateProject(p);
  let summary=behaviourHierarchy(p,'guard',p.levels[0].instances[0]);
  assert.deepEqual(summary.children.map(c=>c.asset.id),['child']);
  assert.equal(summary.children[0].children[0].asset.id,'lit');
  assert.equal(summary.children[0].children[0].active,false);
  assert.equal(summary.children[0].children[0].children[0].asset.id,'light');
  assert.equal(summary.children[0].children[0].children[0].active,false);
  p.levels[0].instances[0].stateOverrides={lit:true};
  summary=behaviourHierarchy(p,'guard',p.levels[0].instances[0]);assert.equal(summary.children[0].children[0].children[0].active,true);
  assert.equal(behaviourHierarchy(p,'missing'),null);
});

test('custom behaviour colors persist through edits, attachments and JSON and reject unsafe color values',()=>{
  const definition={...block(),color:'#aa55cc'};
  let p=attach(send(fixture(),'behaviour.save',definition),'guard');
  assert.equal(validateProject(JSON.parse(JSON.stringify(p))).behaviourLibrary[0].color,'#aa55cc');
  p=send(p,'behaviour.save',{...definition,color:'#4499aa'});assert.equal(p.behaviourLibrary[0].color,'#4499aa');
  assert.throws(()=>send(p,'behaviour.save',{...definition,color:'red;display:none'}),/behaviour color/);
});
