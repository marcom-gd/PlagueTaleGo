import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,applyAction,validateProject,stateEnabled} from '../public/model.js';
import {resolveTurn,orderedBehaviours} from '../public/behaviours.js';
import {createSequence,nextTurn,previousTurn,validateSequence} from '../public/turn-sequence.js';
import {copyHierarchy,copyLevel} from '../public/editing.js';
const asset=(id,icon='guard',extra={})=>({id,name:id,icon,kind:'token',rule:'',tags:[],range:1,color:'#b8cf96',parentId:null,...extra});
const placed=(id,assetId,x,y=2)=>({id,assetId,x,y,rotation:0,note:''});
const move=(id,extra={})=>({id,type:'moveTo',enabled:true,steps:1,target:'current',patrolId:null,...extra});
const apply=(id,action,extra={})=>({id,type:'applyEffect',enabled:true,action,eligibleAssetIds:null,...extra});
function fixture(){const p=newProject(),l=p.levels[0];l.width=12;l.height=8;l.tiles={};l.nodes=Array.from({length:10},(_,x)=>`${x},2`);p.assets=[asset('guard'),asset('source','torch'),asset('area','area',{parentId:'source'})];l.instances=[placed('s','source',1),placed('g','guard',2)];return {p,l};}

test('expansion copies full placement states once per node, does not mutate input, and new copies wait until next turn',()=>{
  const {p,l}=fixture();p.assets[2].behaviours=[{id:'spread',type:'expand',enabled:true,allowStacking:false}];
  p.assets.push(asset('lit','torch',{kind:'state',parentId:'source',enabled:true}));l.instances[0].stateOverrides={lit:false};
  const before=structuredClone(p);let n=0;const run=resolveTurn(p,[],[],()=>`copy-${++n}`);
  assert.deepEqual(p,before);assert.deepEqual(run.project.levels[0].instances.filter(i=>i.assetId==='source').map(i=>i.x).sort(),[0,1,2]);
  assert.deepEqual(run.project.levels[0].instances.find(i=>i.id==='copy-1').stateOverrides,{lit:false});
  assert.equal(run.log.length,1);assert.equal(run.log[0].count,2);
  const next=resolveTurn(run.project,[],[],()=>`copy-${++n}`);assert.equal(next.project.levels[0].instances.filter(i=>i.assetId==='source').length,4);
});

test('state-gated behaviours recheck activity after earlier effects change states',()=>{
  const {p,l}=fixture();p.assets[0].exclusiveStates=true;
  p.assets.push(asset('alive','guard',{kind:'state',parentId:'guard',enabled:true,behaviours:[move('walk')]}),asset('dead','guard',{kind:'state',parentId:'guard',enabled:false}));
  p.assets[2].behaviours=[apply('kill','switchState',{stateKey:'dead',stateEnabled:true,eligibleAssetIds:['guard']})];
  l.instances[1].moveTarget={type:'position',x:5,y:2};p.behaviourOrder=['kill','walk'];
  const run=resolveTurn(p),guard=run.project.levels[0].instances.find(i=>i.id==='g');
  assert.equal(guard.x,2);assert.equal(stateEnabled(run.project,run.project.assets.find(a=>a.id==='dead'),guard),true);assert.equal(run.log.length,1);
  p.behaviourOrder=['walk','kill'];assert.equal(resolveTurn(p).project.levels[0].instances.find(i=>i.id==='g').x,3);
  p.assets[2].behaviours[0].stateKey='missing';assert.equal(resolveTurn(p).project.levels[0].instances[1].x,3);
});

test('movement respects connections and occupancy, approaches tracked objects, and follows auto-facing',()=>{
  const {p,l}=fixture();p.assets[0].behaviours=[move('walk',{steps:5})];p.assets[0].autoFacing=true;
  l.instances[1].moveTarget={type:'object',id:'s'};l.instances[0].x=7;
  let run=resolveTurn(p);assert.equal(run.project.levels[0].instances[1].x,6);assert.equal(run.project.levels[0].instances[1].direction,90);
  l.blockedLinks=['3,2|4,2'];run=resolveTurn(p);assert.equal(run.project.levels[0].instances[1].x,2);
  l.blockedLinks=[];l.instances.push(placed('block','source',4));assert.equal(resolveTurn(p).project.levels[0].instances[1].x,2);
  l.instances[1].locked=true;assert.equal(resolveTurn(p).project.levels[0].instances[1].x,2);
});

test('patrols bounce along the saved route between start and end and preserve progress',()=>{
  const {p,l}=fixture();l.instances=[placed('g','guard',0)];p.assets[0].behaviours=[move('patrol',{target:'patrolStart',steps:2,patrolId:'route'})];
  l.patrols=[{id:'route',name:'Route',color:'#abcdef',hidden:false,nodes:['0,2','1,2','2,2','3,2']}];
  let run=resolveTurn(p);assert.equal(run.project.levels[0].instances[0].x,2);
  run=resolveTurn(run.project);assert.equal(run.project.levels[0].instances[0].x,2);assert.equal(run.project.levels[0].instances[0].patrolProgress.patrol,'start');
  run=resolveTurn(run.project);assert.equal(run.project.levels[0].instances[0].x,0);
  run=resolveTurn(run.project);assert.equal(run.project.levels[0].instances[0].x,2);
});

test('Apply Effect uses visible geometry and selection, sets targets, and graveyard removal prunes links',()=>{
  const {p,l}=fixture();p.assets[2].behaviours=[apply('target','setMoveTarget',{moveTarget:{type:'self'},eligibleAssetIds:['guard']})];
  let run=resolveTurn(p);assert.deepEqual(run.project.levels[0].instances[1].moveTarget,{type:'object',id:'s'});
  p.assets[2].behaviours=[apply('remove','graveyard',{eligibleAssetIds:['guard']})];l.objectLinks=[{id:'link',name:'Link',rule:'',color:'#abcdef',instanceIds:['s','g']}];
  run=resolveTurn(p);assert.equal(run.project.levels[0].instances.length,1);assert.equal(run.project.levels[0].objectLinks.length,0);assert.equal(run.graveyard[0].items[0].id,'g');
  p.assets[2].occludedByWalls=true;l.tiles={'2,2':'wall'};l.nodes=l.nodes.filter(key=>key!=='2,2');assert.equal(resolveTurn(p).graveyard.length,0);
  l.tiles={};p.assets[2].behaviours[0].eligibleAssetIds=[];assert.equal(resolveTurn(p).graveyard.length,0);
});

test('Flush propagates outside the effect only through touching active instances of the same selected type',()=>{
  const {p,l}=fixture();p.assets[2].behaviours=[apply('flush','flush',{eligibleAssetIds:['guard','source']})];
  p.assets.push(asset('rock','rock'));
  l.instances.push(placed('g2','guard',3),placed('g3','guard',4),placed('diagonal','guard',5,3),placed('gap','guard',6),placed('other','rock',5),placed('stack','guard',3));
  const run=resolveTurn(p);assert.deepEqual(run.graveyard[0].items.map(i=>i.id).sort(),['g','g2','g3','stack']);
  assert.deepEqual(run.project.levels[0].instances.map(i=>i.id).sort(),['diagonal','gap','other','s']);
  assert.equal(run.log[0].count,4);
});

test('turn history restores every private state, replays future turns, branches after manual changes, and round-trips files',()=>{
  const {p,l}=fixture();p.assets[2].behaviours=[apply('remove','graveyard')];
  const state={project:p,inventory:[],graveyard:[],levelId:l.id};let seq=createSequence(state);seq=nextTurn(seq,state);
  assert.equal(seq.cursor,1);assert.equal(seq.frames[1].graveyard.length,1);
  seq=previousTurn(seq,seq.frames[1]);assert.equal(seq.cursor,0);assert.equal(seq.frames[0].project.levels[0].instances.length,2);
  seq=nextTurn(seq,seq.frames[0]);assert.equal(seq.cursor,1);assert.equal(seq.frames.length,2);
  assert.deepEqual(validateSequence(JSON.parse(JSON.stringify(seq))),seq);
  seq=previousTurn(seq,seq.frames[1]);const changed=structuredClone(seq.frames[0]);changed.project.levels[0].instances[1].x=8;seq=nextTurn(seq,changed);
  assert.equal(seq.frames[1].graveyard.length,0);assert.equal(seq.frames[1].project.levels[0].instances[1].x,8);
  const malformed=structuredClone(seq);malformed.frames[0].inventory=[{id:'bad',count:1,items:[]}];assert.throws(()=>validateSequence(malformed));
  assert.throws(()=>validateSequence({...seq,cursor:-1}));
});

test('behaviours validate, synchronize reusable effects, and copies remap independent IDs and internal state references',()=>{
  const {p}=fixture();p.assets[2].parentId=null;p.assets[2].behaviours=[apply('kill','switchState',{stateKey:'dead',stateEnabled:true})];
  let next=applyAction(p,{type:'parameter.attach',data:{id:'area',parentId:'source',usageId:'use'}});
  next=applyAction(next,{type:'behaviour.configure',data:{id:'use',behaviours:[{id:'spread',type:'expand',enabled:true,allowStacking:false}],ids:['spread']}});
  assert.deepEqual(next.assets.find(a=>a.id==='use').behaviours,next.assets.find(a=>a.id==='area').behaviours);
  assert.equal(orderedBehaviours(next).length,1);
  assert.throws(()=>applyAction(next,{type:'asset.update',data:{id:'source',behaviours:[{id:'bad',type:'expand',enabled:true,allowStacking:false}]}}));
  p.assets[0].behaviours=[move('walk')];const copied=copyHierarchy(p,'guard');assert.notEqual(copied[0].behaviours[0].id,'walk');assert.doesNotThrow(()=>applyAction(p,{type:'asset.addMany',data:{assets:copied}}));
  const level=p.levels[0];level.instances[1].moveTarget={type:'object',id:'s'};const copy=copyLevel(level);assert.equal(copy.instances[1].moveTarget.id,copy.instances[0].id);
  assert.throws(()=>validateProject({...p,behaviourOrder:['walk','walk']}));
});

test('copied levels resolve explicit patrol and effect object-target references within their own level',()=>{
  const {p,l}=fixture();l.instances[1].x=0;
  l.patrols=[{id:'route',name:'Patrol',color:'#abcdef',hidden:false,nodes:['0,2','1,2','2,2']}];
  p.assets[0].behaviours=[move('patrol',{target:'patrolEnd',patrolId:'route'})];
  // Move the source out of the patrol route to keep nodes free.
  l.instances[0].y=1;p.assets[2].behaviours=[apply('target','setMoveTarget',{eligibleAssetIds:['guard'],moveTarget:{type:'object',id:'s'}})];
  const copy=copyLevel(l);p.levels.push(copy);
  const run=resolveTurn(p),copied=run.project.levels[1],guard=copied.instances.find(i=>i.assetId==='guard');
  assert.equal(guard.x,1);assert.deepEqual(guard.moveTarget,{type:'object',id:copied.instances.find(i=>i.assetId==='source').id});
  assert.notEqual(guard.moveTarget.id,'s');
});

test('the HTTP editing API persists behaviour configuration, shared effect uses and resolution order across restarts',async()=>{
  const {createWorkshopServer}=await import('../server.mjs');
  const {mkdtemp,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const dataDir=await mkdtemp(join(tmpdir(),'workshop-behaviours-'));
  let server;
  const start=async()=>{server=await createWorkshopServer({dataDir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}/api/rooms/test`;};
  const stop=async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;};
  try{
    let url=await start();const {p}=fixture();p.assets[2].parentId=null;
    let revision=(await (await fetch(url)).json()).revision;
    const send=async action=>{const response=await fetch(url+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,actionId:crypto.randomUUID(),expectedRevision:revision})});assert.equal(response.status,200);const result=await response.json();revision=result.revision;return result.project;};
    await send({type:'project.replace',data:p});
    await send({type:'parameter.attach',data:{id:'area',parentId:'source',usageId:'shared-area'}});
    await send({type:'behaviour.configure',data:{id:'shared-area',behaviours:[apply('flush','flush',{eligibleAssetIds:['guard']}),{id:'block',type:'blockNode',enabled:true,blockAssetIds:['guard'],blockScope:'movement'},{id:'use',type:'useEffect',enabled:true,usableAssetIds:['guard'],useTarget:'linked',action:'graveyard'},{id:'teleport',type:'teleport',enabled:false,teleportTarget:'self',targetInstanceId:null,destination:{type:'linked',id:null}},{id:'advance',type:'advanceOnEvent',enabled:true,events:['use','moved','inventoryAdded','inventoryDropped']}],ids:['flush','block','use','teleport','advance']}});
    const saved=await send({type:'asset.update',data:{id:'guard',behaviours:[move('walk')]}});
    await send({type:'behaviour.order',data:{ids:['walk','flush']}});
    const privateRun=resolveTurn(saved);assert.equal(privateRun.graveyard.length,1);
    const shared=(await (await fetch(url)).json()).project;assert.equal(shared.levels[0].instances.length,2);assert.deepEqual(shared.behaviourOrder,['walk','flush']);
    await stop();url=await start();const restored=(await (await fetch(url)).json()).project;
    assert.deepEqual(restored,shared);assert.equal(restored.assets.find(a=>a.id==='shared-area').behaviours[0].action,'flush');
  }finally{if(server)await stop();await rm(dataDir,{recursive:true,force:true});}
});

test('Flush does not cross an inactive instance, and no selected type means no catch',()=>{
  const {p,l}=fixture();p.assets[2].behaviours=[apply('flush','flush',{eligibleAssetIds:['guard']})];
  p.assets.push(asset('off','torch',{kind:'state',parentId:'source',enabled:false}),asset('inactive','guard',{parentId:'off'}));
  l.instances.push(placed('inactive-piece','inactive',3),placed('beyond','guard',4));
  const run=resolveTurn(p);assert.deepEqual(run.graveyard.flatMap(s=>s.items.map(i=>i.id)),['g']);
  p.assets[2].behaviours[0].eligibleAssetIds=[];assert.equal(resolveTurn(p).graveyard.length,0);
});

test('an expansion limit failure leaves the project and the entire turn history unchanged',()=>{
  const {p,l}=fixture();p.assets[2].behaviours=[{id:'spread',type:'expand',enabled:true,allowStacking:false}];
  for(let n=l.instances.length;n<1000;n++)l.instances.push(placed(`filler-${n}`,'guard',8,5));
  const state={project:p,inventory:[],graveyard:[],levelId:l.id},sequence=createSequence(state),before=structuredClone(sequence);
  assert.throws(()=>nextTurn(sequence,state),/1,000/);assert.deepEqual(sequence,before);assert.deepEqual(p,before.frames[0].project);
});

test('Move To finds a free detour, ignores disabled behaviours and tracks current object positions',()=>{
  const {p,l}=fixture();l.nodes.push('2,3','3,3','4,3','5,3','6,3','7,3');
  p.assets[0].behaviours=[move('walk',{steps:3})];l.instances[1].moveTarget={type:'object',id:'s'};l.instances[0].x=7;
  p.assets.push(asset('rock','rock'));l.instances.push(placed('block','rock',3));
  let run=resolveTurn(p);assert.deepEqual([run.project.levels[0].instances[1].x,run.project.levels[0].instances[1].y],[4,3]);
  run.project.levels[0].instances[0].x=6;run=resolveTurn(run.project);assert.equal(run.project.levels[0].instances[1].x,6);assert.equal(run.project.levels[0].instances[1].y,3);
  p.assets[0].behaviours[0].enabled=false;assert.equal(resolveTurn(p).project.levels[0].instances[1].x,2);
});
