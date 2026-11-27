import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../public/model.js';
import {resolveTurn,availableUses,useObject} from '../public/behaviours.js';
import {createSequence,nextTurn,previousTurn,eventTurn,validateSequence} from '../public/turn-sequence.js';
import {collectItems} from '../public/player-inventory.js';
import {trayTransferEffects} from '../public/entity-effects.js';

const asset=(id,extra={})=>({id,name:id,icon:'rat',kind:'token',rule:'',tags:[],range:1,color:'#b8cf96',parentId:null,...extra});
const placed=(id,assetId,x,y=2)=>({id,assetId,x,y,rotation:0,note:''});
const b=(id,type,extra={})=>({id,type,enabled:true,...extra});
function fixture(){
  const p=newProject(),l=p.levels[0];l.width=12;l.height=8;l.tiles={};l.nodes=Array.from({length:11},(_,x)=>`${x},2`);
  p.assets=[asset('rat'),asset('reach',{icon:'area',parentId:'rat',behaviours:[b('spread','expand',{allowStacking:false})]})];
  l.instances=[placed('left','rat',2),placed('right','rat',8)];
  return {p,l,state:{project:p,inventory:[],graveyard:[],levelId:l.id}};
}

test('Expand records the exact origin of every new copy from multiple owners without changing input',()=>{
  const {p,l}=fixture(),before=structuredClone(p);let id=0;
  const run=resolveTurn(p,[],[],()=>`copy-${++id}`);
  assert.equal(run.visualEffects.length,4);
  assert.deepEqual(run.visualEffects.map(e=>[e.from.x,e.instance.x]),[[2,1],[2,3],[8,7],[8,9]]);
  assert.ok(run.visualEffects.every(e=>e.type==='expand'&&e.levelId===l.id));
  assert.deepEqual(p,before);
});

test('Spawn followed by removal retains both effects even when the copy is absent from the final board',()=>{
  const {p,l}=fixture();p.assets[1].behaviours=[];
  p.assets[0].behaviours=[b('spawn','spawn',{spawnAssetId:'stone',spawnCount:1}),b('retire','addToTray',{tray:'graveyard'})];
  p.assets.push(asset('stone',{icon:'rock'}));
  const run=resolveTurn(p,[],[],()=>crypto.randomUUID());
  assert.deepEqual(run.visualEffects.map(e=>e.type),['spawn','spawn','tray','tray']);
  assert.deepEqual(run.visualEffects.filter(e=>e.type==='tray').map(e=>[e.instance.id,e.from.x,e.tray]),[['left',2,'graveyard'],['right',8,'graveyard']]);
  assert.ok(run.project.levels[0].instances.every(i=>i.assetId==='stone'));
});

test('nested inventory transfers retain the extracted object appearance and owner location',()=>{
  const {p}=fixture();p.assets[1].behaviours=[b('collect','addToTray',{tray:'inventory'})];
  const run=resolveTurn(p);
  // Parameters resolve to the nearest object; a nested object transfers itself.
  p.assets[1].icon='lantern';
  const nested=resolveTurn(p);
  assert.ok(nested.visualEffects.every(e=>e.instance.assetId==='reach'&&e.tray==='inventory'));
  assert.deepEqual(nested.visualEffects.map(e=>e.from.x),[2,8]);
  assert.equal(run.visualEffects[0].instance.assetId,'rat');
});

test('Use-triggered expansion and transfers produce presentation records without extra gameplay events',()=>{
  const {p,l}=fixture();l.instances=[placed('left','rat',2),placed('right','rat',3)];
  p.assets[1].behaviours=[b('use','useEffect',{usableAssetIds:['rat'],useTarget:'used',trigger:b('spread','expand',{allowStacking:false})})];
  let run=useObject(p,[],[],availableUses(p,l)[0]);
  assert.ok(run.visualEffects.length>0);assert.ok(run.visualEffects.every(e=>e.from.x===3));
  assert.deepEqual(run.events.map(e=>e.type),['use','use']);
  p.assets[1].behaviours[0].trigger=b('bury','addToTray',{tray:'graveyard'});
  run=useObject(p,[],[],availableUses(p,l)[0]);
  assert.equal(run.visualEffects[0].tray,'graveyard');assert.equal(run.visualEffects[0].instance.id,'right');
});

test('manual collection detects additions to an existing stack and uses the source level',()=>{
  const {p,l,state}=fixture();
  const collected=collectItems(p,[],l.id,{type:'instance',id:'left',levelId:l.id});
  const after={...state,project:collected.project,inventory:collected.inventory};
  assert.deepEqual(trayTransferEffects(state,after).map(e=>[e.instance.id,e.from,e.tray,e.levelId]),[['left',{x:2,y:2},'inventory',l.id]]);
  const next=collectItems(after.project,after.inventory,l.id,{type:'instance',id:'right',levelId:l.id});
  assert.deepEqual(trayTransferEffects(after,{...after,project:next.project,inventory:next.inventory}).map(e=>e.instance.id),['right']);
});

test('forward replay retains effects; an event turn combines action and turn effects once',()=>{
  const {p,l,state}=fixture();let id=0;
  let seq=nextTurn(createSequence(state),state,()=>`copy-${++id}`),frame=seq.frames[1];
  const effects=structuredClone(frame.visualEffects);
  seq=previousTurn(seq,frame);seq=nextTurn(seq,seq.frames[0]);
  assert.deepEqual(seq.frames[1].visualEffects,effects);
  assert.deepEqual(validateSequence(JSON.parse(JSON.stringify(seq))),seq);
  p.assets[1].behaviours=[];
  const collected=collectItems(p,[],l.id,{type:'instance',id:'left',levelId:l.id});
  const after={project:collected.project,inventory:collected.inventory,graveyard:[],levelId:l.id};
  const actionEffects=trayTransferEffects(state,after);
  seq=eventTurn(createSequence(state),state,after,[],actionEffects);
  assert.deepEqual(seq.frames[1].visualEffects,actionEffects);
  assert.doesNotThrow(()=>validateSequence(seq));
  seq=eventTurn(createSequence(state),state,{...after,outcome:{type:'levelComplete',levelId:l.id},visualEffects:actionEffects});
  assert.deepEqual(seq.frames[1].visualEffects,actionEffects);
});

test('recording validation accepts old frames and rejects invalid animation data',()=>{
  const {state}=fixture();assert.doesNotThrow(()=>validateSequence(createSequence(state)));
  const seq=nextTurn(createSequence(state),state),bad=structuredClone(seq);
  bad.frames[1].visualEffects[0].from.x=-1;
  assert.throws(()=>validateSequence(bad),/visual effect/);
  bad.frames[1].visualEffects=structuredClone(seq.frames[1].visualEffects);
  bad.frames[1].visualEffects[0].instance.rotation='invalid';
  assert.throws(()=>validateSequence(bad),/Invalid placed token/);
});
