import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,applyAction,validateProject,stateEnabled} from '../public/model.js';
import {resolveTurn,availableUses,useObject} from '../public/behaviours.js';
import {createSequence,nextTurn,previousTurn,validateSequence} from '../public/turn-sequence.js';

const asset=(id,icon='rat',extra={})=>({id,name:id,icon,kind:'token',rule:'',tags:[],range:1,color:'#b8cf96',parentId:null,...extra});
const placed=(id,assetId,x,y=2)=>({id,assetId,x,y,rotation:0});
const flushed=result=>result.graveyard.flatMap(s=>s.items.map(i=>i.id)).sort();
function fixture(){
  const p=newProject(),l=p.levels[0];l.width=12;l.height=8;l.tiles={};l.nodes=[];
  const b={id:'flush',type:'applyEffect',enabled:true,action:'flush',eligibleAssetIds:['rat']};
  p.assets=[asset('guard','guard'),asset('rat'),asset('effect','self',{parentId:'guard',behaviours:[b]})];
  l.instances=[placed('g','guard',2),placed('a','rat',2),placed('b','rat',3),placed('c','rat',4)];return {p,l,b};
}

test('preserved starting cells propagate the flush without removing their rats or changing inputs',()=>{
  const {p,l,b}=fixture();b.flushPreserve=1;l.instances.push(placed('stack','rat',2),placed('branch','rat',2,3),placed('branch-end','rat',2,4),placed('gap','rat',7),placed('diagonal','rat',5,3));
  const before=structuredClone(p),result=resolveTurn(p);
  assert.deepEqual(flushed(result),['b','branch','branch-end','c']);
  assert.deepEqual(result.project.levels[0].instances.map(i=>i.id).sort(),['a','diagonal','g','gap','stack']);
  assert.equal(result.log[0].count,4);assert.deepEqual(p,before);
});

test('preservation counts continuous cells on every branch and consumes the existing maximum reach',()=>{
  const {p,l,b}=fixture();b.flushPreserve=2;l.instances.push(placed('branch','rat',2,3),placed('branch-end','rat',2,4));
  assert.deepEqual(flushed(resolveTurn(p)),['branch-end','c']);
  b.flushReach=3;assert.deepEqual(flushed(resolveTurn(p)),['branch-end','c']);
  for(const reach of [1,2]){b.flushReach=reach;assert.deepEqual(flushed(resolveTurn(p)),[]);}
  b.flushReach=null;b.flushPreserve=768;assert.deepEqual(flushed(resolveTurn(p)),[]);
});

test('multiple catches preserve cells nearest any seed, with separate distances for each object type',()=>{
  const {p,l,b}=fixture();b.flushPreserve=2;b.eligibleMode='linked';b.eligibleAssetIds=null;
  p.assets.push(asset('mouse'));l.instances.push(placed('d','rat',5),placed('e','rat',6),placed('m1','mouse',3),placed('m2','mouse',4),placed('m3','mouse',5));
  l.objectLinks=[{id:'link',name:'Seeds',rule:'',color:'#abcdef',instanceIds:['g','a','e','m1']}];
  assert.deepEqual(flushed(resolveTurn(p)),['c','m3']);
  // A linked seed at the far end remains safe even if the first seed reaches it.
  b.flushPreserve=1;assert.deepEqual(flushed(resolveTurn(p)),['b','c','d','m2','m3']);
});

test('preservation respects inactive chain gaps and effect blockers',()=>{
  const {p,l,b}=fixture();b.flushPreserve=1;
  p.assets.push(asset('off','rat',{kind:'state',parentId:'rat',enabled:false}),asset('inactive','rat',{parentId:'off'}));
  l.instances=l.instances.filter(i=>i.id!=='b');l.instances.push(placed('inactive-rat','inactive',3));
  assert.deepEqual(flushed(resolveTurn(p)),[]);
  l.instances=l.instances.filter(i=>i.id!=='inactive-rat');l.instances.push(placed('b','rat',3));l.nodes=['3,2'];
  p.assets.push(asset('barrier','rock'),asset('barrier-self','self',{parentId:'barrier',behaviours:[{id:'block',type:'blockNode',enabled:true,blockAssetIds:['guard'],blockScope:'movementAndEffects'}]}));
  l.instances.push(placed('barrier1','barrier',3));assert.deepEqual(flushed(resolveTurn(p)),[]);
});

test('Use Flush supports preservation in legacy actions and nested Apply Effect triggers',()=>{
  for(const nested of [false,true]){
    const {p,l,b}=fixture();b.flushPreserve=1;b.flushReach=2;
    p.assets[2].behaviours=[{id:'use',type:'useEffect',enabled:true,usableAssetIds:['rat'],useTarget:'used',...(nested?{trigger:b}:{action:'flush',flushPreserve:1,flushReach:2})}];
    const result=useObject(p,[],[],availableUses(p,l).find(u=>u.usedId==='a'));
    assert.deepEqual(flushed(result),['b']);assert.equal(result.log[0].count,1);
    assert.ok(result.project.levels[0].instances.some(i=>i.id==='a'));
  }
});

test('default preservation retains legacy results, validates bounds and survives reusable configuration',()=>{
  let {p,b}=fixture();const original=resolveTurn(p);b.flushPreserve=0;const explicit=resolveTurn(p);
  assert.deepEqual(explicit.graveyard,original.graveyard);assert.deepEqual(explicit.log,original.log);assert.deepEqual(explicit.project.levels,original.project.levels);
  for(const flushPreserve of [-1,1.5,769,'1',null]){
    assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:'effect',behaviours:[{...b,flushPreserve}]}}),/preserve/);
    const copy=structuredClone(p);copy.assets[2].behaviours=[{id:'use',type:'useEffect',enabled:true,usableAssetIds:['rat'],useTarget:'used',trigger:{...b,flushPreserve}}];
    assert.throws(()=>validateProject(copy),/preserve/);
  }
  p=applyAction(p,{type:'behaviour.save',data:{id:'shared-flush',name:'Keep the first rat',rule:'',behaviour:{...b,id:'shared',flushPreserve:1}}});
  p=applyAction(p,{type:'behaviour.configure',data:{id:'effect',behaviours:[],ids:[]}});
  p=applyAction(p,{type:'behaviour.attach',data:{id:'effect',definitionId:'shared-flush',usageId:'attached'}});
  assert.deepEqual(flushed(resolveTurn(validateProject(JSON.parse(JSON.stringify(p))))),['b','c']);
});

test('rat attack preserves the original rat without spawning, while other guard deaths create no rats',()=>{
  const {p,l,b}=fixture();p.assets[0].exclusiveStates=true;b.flushPreserve=1;p.assets[2].parentId='dead';
  p.assets.push(asset('alive','guard',{kind:'state',parentId:'guard',enabled:true}),asset('dead','guard',{kind:'state',parentId:'guard',enabled:false,behaviours:[{id:'bury',type:'addToTray',enabled:true,tray:'graveyard'}]}),
    asset('bite','self',{parentId:'rat',behaviours:[{id:'kill',type:'applyEffect',enabled:true,action:'switchState',eligibleAssetIds:['guard'],stateKey:'dead',stateEnabled:true}]}));
  p.behaviourOrder=['kill','flush','bury'];const state={project:p,inventory:[],graveyard:[],levelId:l.id};
  const sequence=nextTurn(createSequence(state),state),result=sequence.frames[1];
  assert.deepEqual(result.project.levels[0].instances.map(i=>i.id),['a']);assert.deepEqual(flushed(result),['b','c','g']);
  assert.equal(stateEnabled(result.project,result.project.assets.find(a=>a.id==='dead'),result.graveyard.find(s=>s.assetId==='guard').items[0]),true);
  assert.deepEqual(validateSequence(JSON.parse(JSON.stringify(sequence))),sequence);assert.deepEqual(previousTurn(sequence,result).frames[0].project,p);
  l.instances=[placed('g','guard',2)];l.instances[0].stateOverrides={alive:false,dead:true};
  const otherDeath=resolveTurn(p);assert.equal(otherDeath.project.levels[0].instances.length,0);assert.deepEqual(flushed(otherDeath),['g']);
});
