import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,validateProject,clone,stateEnabled,applyAction} from '../public/model.js';
import {availableThrows,throwObject} from '../public/throw-object.js';
import {resolveTurn} from '../public/behaviours.js';
import {createSequence,eventTurn,previousTurn,validateSequence} from '../public/turn-sequence.js';
import {copyHierarchy} from '../public/editing.js';
import {createWorkshopServer} from '../server.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const a=(id,icon,extra={})=>({id,name:id,icon,kind:'token',parentId:null,color:'#b8cf96',tags:[],rule:'',range:5,...extra});
const i=(id,assetId,x,y=2,extra={})=>({id,assetId,x,y,rotation:0,...extra});
const reaction=(id,extra={})=>({id,type:'onHit',enabled:true,hitAssetIds:['stone'],action:'switchState',stateKey:'broken',stateEnabled:true,...extra});
function fixture(){
  const p=newProject(),l=p.levels[0];l.width=12;l.height=8;l.tiles={};l.nodes=Array.from({length:10},(_,x)=>`${x},2`);
  p.assets=[a('player','girl'),a('stone','rock'),a('pot','barrel',{exclusiveStates:true,behaviours:[reaction('hit')]}),a('intact','barrel',{kind:'state',parentId:'pot',enabled:true}),a('broken','rock',{kind:'state',parentId:'pot',enabled:false}),a('throw-range','area',{parentId:'player',range:10,behaviours:[{id:'throw',type:'throwObject',enabled:true,throwAssetId:'stone',requireInventory:false,destroyOnHit:true,throwTargetAssetIds:['pot']}]})];
  l.instances=[i('player1','player',1),i('pot1','pot',4),i('pot2','pot',8)];
  return {p,l,b:p.assets[2].behaviours[0]};
}
const throwAt=(p,x=4,inventory=[])=>throwObject(p,inventory,[],availableThrows(p,p.levels[0],inventory)[0],{x,y:2});
const enabled=(p,key='broken',id='pot1')=>stateEnabled(p,p.assets.find(a=>a.id===key),p.levels[0].instances.find(i=>i.id===id));

test('On Hit switches only the receiving placement immediately, including when the Stone is destroyed',()=>{
  for(const destroyOnHit of [true,false]){
    const {p}=fixture();p.assets[5].behaviours[0].destroyOnHit=destroyOnHit;validateProject(p);const before=JSON.stringify(p);
    const run=throwAt(p);
    assert.equal(enabled(run.project),true);assert.equal(enabled(run.project,'intact'),false);assert.equal(enabled(run.project,'broken','pot2'),false);
    assert.equal(run.destroyed,destroyOnHit);assert.equal(run.project.levels[0].instances.filter(i=>i.assetId==='stone').length,destroyOnHit?0:1);
    assert.equal(run.log.find(e=>e.type==='onHit').count,1);assert.equal(JSON.stringify(p),before);assert.equal(p.assets[4].enabled,false);
  }
});

test('On Hit does not run at turn start, on a miss, for a different projectile, or while disabled',()=>{
  const {p}=fixture();assert.equal(enabled(resolveTurn(p).project),false);
  p.assets[5].behaviours[0].throwTargetAssetIds=null;assert.equal(enabled(throwAt(p,5).project),false);
  for(const settings of [{hitAssetIds:[]},{hitAssetIds:['player']},{enabled:false}]){
    const f=fixture();Object.assign(f.b,settings);assert.equal(enabled(throwAt(f.p).project),false);
  }
  const f=fixture();f.b.hitAssetIds=null;assert.equal(enabled(throwAt(f.p).project),true);
});

test('enable, disable, names, ancestor states and exclusive Toggle reuse the existing state semantics',()=>{
  const f=fixture();f.b.stateKey='BROKEN';assert.equal(enabled(throwAt(f.p).project),true);
  f.b.stateToggle=true;let p=f.p;
  for(const expected of [true,false,true]){p=throwAt(p).project;assert.equal(enabled(p),expected);}
  f.b.stateToggle=false;f.b.stateEnabled=false;f.b.stateKey='intact';assert.equal(enabled(throwAt(f.p).project,'intact'),false);
  const nested=fixture();nested.p.assets.push(a('damage','barrel',{kind:'state',parentId:'pot',enabled:false,exclusiveStates:true}));nested.p.assets[3].parentId='damage';nested.p.assets[4].parentId='damage';
  p=throwAt(nested.p).project;assert.equal(enabled(p,'damage'),true);assert.equal(enabled(p),true);
});

test('state-gated and parameter-attached reactions only act while active; newly enabled reactions wait for another hit',()=>{
  const f=fixture();f.p.assets[2].behaviours=[];f.p.assets[3].behaviours=[reaction('break')];f.p.assets[4].behaviours=[reaction('repair',{stateKey:'intact'})];
  let p=throwAt(f.p).project;assert.equal(enabled(p),true);assert.equal(p.levels[0].instances[1].stateOverrides.intact,false);
  p=throwAt(p).project;assert.equal(enabled(p),false);
  f.p.assets[3].behaviours=[];f.p.assets[4].behaviours=[];f.p.assets.push(a('hit-parameter','self',{parentId:'broken',behaviours:[reaction('area-hit')]}));
  assert.equal(throwAt(f.p).log.some(e=>e.type==='onHit'),false);
  f.p.assets.at(-1).parentId='pot';assert.equal(enabled(throwAt(f.p).project),true);
});

test('resolution order rechecks state activity and missing state choices safely do nothing',()=>{
  const f=fixture();f.p.assets[3].behaviours=[reaction('active-only',{stateKey:'intact'})];f.p.behaviourOrder=['throw','hit','active-only'];
  let run=throwAt(f.p);assert.equal(enabled(run.project),true);assert.equal(run.log.filter(e=>e.type==='onHit').length,1);
  f.b.stateKey='missing';run=throwAt(f.p);assert.equal(enabled(run.project),false);assert.equal(run.log.find(e=>e.type==='onHit').count,0);
});

test('stacked receivers react independently, including locked scenery, and Distraction still triggers before state changes',()=>{
  const f=fixture();f.l.instances[1].locked=true;f.l.instances[2].x=4;f.p.assets.push(a('guard','guard'),a('attraction','area',{parentId:'intact',behaviours:[{id:'distract',type:'distraction',enabled:true,hitAssetIds:['stone'],distractAssetIds:['guard'],steps:1,returnToStart:true}]}));f.l.instances.push(i('guard1','guard',6));
  const run=throwAt(f.p);assert.equal(enabled(run.project),true);assert.equal(enabled(run.project,'broken','pot2'),true);
  assert.ok(run.project.levels[0].instances.find(i=>i.id==='guard1').distraction);assert.equal(run.log.filter(e=>e.type==='onHit').length,2);
});

test('On Hit filters and states validate and remap when copied, including shared blocks on tokens, states and parameters',()=>{
  const f=fixture();validateProject(f.p);
  for(const settings of [{hitAssetIds:undefined},{hitAssetIds:['stone','stone']},{action:'graveyard'},{stateKey:''},{stateEnabled:'yes'},{stateToggle:1}]){
    const p=clone(f.p);Object.assign(p.assets[2].behaviours[0],settings);assert.throws(()=>validateProject(p));
  }
  f.p.assets[1].parentId='pot';const copies=copyHierarchy(f.p,'pot');
  assert.equal(copies[0].behaviours[0].stateKey,copies.find(a=>a.name==='broken').id);assert.deepEqual(copies[0].behaviours[0].hitAssetIds,[copies.find(a=>a.name==='stone').id]);
  const definition={id:'shared-hit',name:'Break on hit',rule:'',behaviour:reaction('shared-logic')};
  let p=applyAction(f.p,{type:'behaviour.save',data:definition});
  for(const [id,usageId] of [['pot','root-hit'],['intact','state-hit'],['throw-range','parameter-hit']])p=applyAction(p,{type:'behaviour.attach',data:{id,definitionId:definition.id,usageId}});
  p=applyAction(p,{type:'behaviour.save',data:{...definition,behaviour:{...definition.behaviour,stateKey:'intact'}}});assert.equal(p.assets[2].behaviours.find(b=>b.id==='root-hit').stateKey,'intact');
});

test('event turn history restores the pre-impact state and preserves On Hit logs on export',()=>{
  const f=fixture();f.p.assets[0].behaviours=[{id:'advance',type:'advanceOnEvent',enabled:true,events:['use']}];
  const before={project:f.p,inventory:[],graveyard:[],levelId:f.l.id},run=throwAt(f.p);
  const sequence=validateSequence(JSON.parse(JSON.stringify(eventTurn(createSequence(before),before,{...run,levelId:f.l.id},run.log))));
  assert.equal(enabled(sequence.frames[1].project),true);assert.ok(sequence.frames[1].log.some(e=>e.type==='onHit'));
  const previous=previousTurn(sequence,sequence.frames[1]);assert.equal(enabled(previous.frames[previous.cursor].project),false);
});

test('HTTP On Hit configuration persists across a server restart',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'on-hit-test-'));let server;
  t.after(async()=>{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await rm(dir,{recursive:true,force:true});});
  const start=async()=>{server=await createWorkshopServer({dataDir:dir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;};
  let base=await start(),url=base+'/api/rooms/hit',room=await(await fetch(url)).json();const f=fixture();
  const send=async action=>{const response=await fetch(url+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,actionId:crypto.randomUUID(),expectedRevision:room.revision})});assert.equal(response.status,200,await response.clone().text());room=await response.json();};
  assert.ok((await(await fetch(base+'/api/config')).json()).behaviourTypes.includes('onHit'));
  await send({type:'project.replace',data:f.p});await send({type:'behaviour.configure',data:{id:'pot',behaviours:[{...f.b,stateToggle:true}],ids:['throw','hit']}});
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;base=await start();url=base+'/api/rooms/hit';room=await(await fetch(url)).json();
  assert.equal(room.project.assets[2].behaviours[0].stateToggle,true);assert.equal(enabled(throwAt(room.project).project),true);
});
