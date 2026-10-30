import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,clone,applyAction} from '../public/model.js';
import {collectItems,releaseItem} from '../public/player-inventory.js';

function fixture(){
  let p=newProject();
  p.assets=[{id:'torch',name:'Torch',icon:'torch',color:'#edc47c',rule:'',range:2,tags:[],parentId:null},
    {id:'lit',name:'Lit',kind:'state',enabled:true,icon:'torch',color:'#edc47c',rule:'',range:2,tags:[],parentId:'torch'}];
  const l=p.levels[0];
  l.instances=[{id:'one',assetId:'torch',x:3,y:4,rotation:90,direction:180,note:'Carried torch',stateOverrides:{lit:false}},
    {id:'two',assetId:'torch',x:5,y:4,rotation:0}];
  p=applyAction(p,{type:'objectLink.add',data:{levelId:l.id,link:{id:'pair',name:'Pair',rule:'',color:'#edc47c',instanceIds:['one','two']}}});
  return {p,levelId:l.id};
}
test('collecting a canvas piece moves it privately, preserves its states and prunes dangling links',()=>{
  const {p,levelId}=fixture(),before=clone(p);
  const result=collectItems(p,[],levelId,{type:'instance',id:'one',levelId});
  assert.deepEqual(p,before);
  assert.deepEqual(result.inventory,[before.levels[0].instances[0]]);
  assert.deepEqual(result.project.levels[0].instances.map(i=>i.id),['two']);
  assert.deepEqual(result.project.levels[0].objectLinks,[]);
  const restored=releaseItem(result.project,result.inventory,levelId,'one',{x:6,y:6});
  assert.equal(restored.inventory.length,0);
  assert.deepEqual(restored.project.levels[0].instances.at(-1),{...before.levels[0].instances[0],x:6,y:6});
});
test('library drops create separate copies and never remove definitions or canvas pieces',()=>{
  const {p,levelId}=fixture();
  const a=collectItems(p,[],levelId,{type:'asset',id:'torch'});
  const b=collectItems(a.project,a.inventory,levelId,{type:'asset',id:'torch'});
  assert.equal(b.inventory.length,2);assert.notEqual(b.inventory[0].id,b.inventory[1].id);
  assert.deepEqual(b.project,p);
  assert.throws(()=>collectItems(p,[],levelId,{type:'asset',id:'lit'}),/parent object/);
});
test('group collection is atomic, respects locks, rejects stale sources and invalid placement',()=>{
  const {p,levelId}=fixture(),payload={type:'instance',id:'one',ids:['one','two'],levelId};
  const result=collectItems(p,[],levelId,payload);
  assert.equal(result.project.levels[0].instances.length,0);assert.equal(result.inventory.length,2);
  assert.throws(()=>collectItems(result.project,result.inventory,levelId,payload),/no longer/);
  assert.equal(collectItems(p,[],levelId,{...payload,levelId:'other'}),null);
  assert.throws(()=>releaseItem(result.project,result.inventory,levelId,'one',{x:6,y:6},true),/Snap/);
  assert.throws(()=>releaseItem(result.project,result.inventory,levelId,'one',{x:99,y:99}),/Invalid placed token/);
  const locked=clone(p);locked.levels[0].instances[1].locked=true;
  assert.throws(()=>collectItems(locked,[],levelId,payload),/Unlock/);
  assert.equal(locked.levels[0].instances.length,2);
});
