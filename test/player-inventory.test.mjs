import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,clone,applyAction,validateProject} from '../public/model.js';
import {collectItems,releaseItem,adjustStack,createPlaytestState} from '../public/player-inventory.js';
import {createSequence,validateSequence} from '../public/turn-sequence.js';
import {eventsAdvanceTurn} from '../public/behaviours.js';
import {copyLevel} from '../public/editing.js';

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

test('starting inventory initializes finite and infinite stacks at turn zero without gameplay events',()=>{
  let {p,levelId}=fixture();p.assets[0].behaviours=[{id:'advance',type:'advanceOnEvent',enabled:true,events:['inventoryAdded','inventoryDropped']}];
  p.assets.push({...p.assets[0],id:'rock',name:'Rock',icon:'rock',behaviours:[]});
  p=applyAction(p,{type:'level.update',data:{levelId,startingInventory:[{assetId:'torch',count:3},{assetId:'rock',count:0}]}});
  const before=clone(p),initial=createPlaytestState(p,levelId),sequence=createSequence(initial);
  assert.deepEqual(p,before);assert.equal(sequence.cursor,0);assert.equal(sequence.frames.length,1);assert.deepEqual(sequence.frames[0].log,[]);
  assert.deepEqual(initial.inventory.map(s=>[s.assetId,s.count,s.items.length]),[['torch',3,3],['rock',0,1]]);
  assert.equal(new Set(initial.inventory.flatMap(s=>s.items.map(i=>i.id))).size,4);assert.deepEqual(initial.project.levels[0].instances,p.levels[0].instances);
  assert.deepEqual(validateSequence(JSON.parse(JSON.stringify(sequence))),sequence);assert.equal(eventsAdvanceTurn(p,initial.project,[]),false);
  const collected=collectItems(initial.project,initial.inventory,levelId,{type:'instance',id:'one',levelId});assert.equal(eventsAdvanceTurn(initial.project,collected.project,[{type:'inventoryAdded',levelId,instanceId:'one'}]),true);
  const dropped=releaseItem(initial.project,initial.inventory,levelId,initial.inventory[0].id,{x:4,y:3});assert.equal(eventsAdvanceTurn(initial.project,dropped.project,[{type:'inventoryDropped',levelId,instanceId:dropped.instanceId}]),true);
});

test('starting inventory is per-level, survives copying and save/load, and prunes deleted object types',()=>{
  let {p,levelId}=fixture();p=applyAction(p,{type:'level.update',data:{levelId,startingInventory:[{assetId:'torch',count:2}]}});
  const copied=copyLevel(p.levels[0]);p=applyAction(p,{type:'level.add',data:copied});
  p=applyAction(p,{type:'level.update',data:{levelId:copied.id,startingInventory:[{assetId:'torch',count:5}]}});
  assert.equal(createPlaytestState(p,levelId).inventory[0].count,2);assert.equal(createPlaytestState(p,copied.id).inventory[0].count,5);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);assert.equal(copied.startingInventory[0].count,2);
  p=applyAction(p,{type:'asset.delete',data:{id:'torch'}});assert.deepEqual(p.levels.map(l=>l.startingInventory),[[],[]]);
  assert.deepEqual(createPlaytestState(p,levelId).inventory,[]);assert.throws(()=>createPlaytestState(p,'missing'),/existing level/);
});

test('invalid starting inventory cannot change the level and old projects keep empty starting backpacks',()=>{
  const {p,levelId}=fixture(),before=clone(p);assert.deepEqual(createPlaytestState(p,levelId).inventory,[]);
  const row={assetId:'torch',count:1};
  for(const startingInventory of [null,[{...row,count:-1}],[{...row,count:1.5}],[{...row,count:1001}],[row,row],[{assetId:'lit',count:1}],[{assetId:'missing',count:1}]])assert.throws(()=>applyAction(p,{type:'level.update',data:{levelId,startingInventory}}));
  p.assets.push({...p.assets[0],id:'self',icon:'self'});assert.throws(()=>applyAction(p,{type:'level.update',data:{levelId,startingInventory:[{assetId:'self',count:1}]}}));
  p.assets.push({...p.assets[0],id:'rock',icon:'rock'});
  assert.throws(()=>applyAction(p,{type:'level.update',data:{levelId,startingInventory:[{...row,count:1000},{assetId:'rock',count:1}]}}),/up to 1,000/);
  assert.deepEqual(p.levels,before.levels);
});
test('collecting a canvas piece moves it privately, preserves its states and prunes dangling links',()=>{
  const {p,levelId}=fixture(),before=clone(p);
  const result=collectItems(p,[],levelId,{type:'instance',id:'one',levelId});
  assert.deepEqual(p,before);
  assert.equal(result.inventory[0].count,1);
  assert.deepEqual(result.inventory[0].items,[{...before.levels[0].instances[0],sourceLevelId:levelId}]);
  assert.deepEqual(result.project.levels[0].instances.map(i=>i.id),['two']);
  assert.deepEqual(result.project.levels[0].objectLinks,[]);
  const restored=releaseItem(result.project,result.inventory,levelId,'one',{x:6,y:6});
  assert.equal(restored.inventory.length,0);
  assert.deepEqual(restored.project.levels[0].instances.at(-1),{...before.levels[0].instances[0],x:6,y:6});
});
test('library drops stack separate copies and never remove definitions or canvas pieces',()=>{
  const {p,levelId}=fixture();
  const a=collectItems(p,[],levelId,{type:'asset',id:'torch'});
  const b=collectItems(a.project,a.inventory,levelId,{type:'asset',id:'torch'});
  assert.equal(b.inventory.length,1);assert.equal(b.inventory[0].count,2);
  assert.notEqual(b.inventory[0].items[0].id,b.inventory[0].items[1].id);
  assert.deepEqual(b.project,p);
  assert.throws(()=>collectItems(p,[],levelId,{type:'asset',id:'lit'}),/parent object/);
});
test('group collection is atomic, respects locks, rejects stale sources and invalid placement',()=>{
  const {p,levelId}=fixture(),payload={type:'instance',id:'one',ids:['one','two'],levelId};
  const result=collectItems(p,[],levelId,payload);
  assert.equal(result.project.levels[0].instances.length,0);assert.equal(result.inventory.length,1);assert.equal(result.inventory[0].count,2);
  assert.throws(()=>collectItems(result.project,result.inventory,levelId,payload),/no longer/);
  assert.equal(collectItems(p,[],levelId,{...payload,levelId:'other'}),null);
  assert.throws(()=>releaseItem(result.project,result.inventory,levelId,'one',{x:6,y:6},true),/Snap/);
  assert.throws(()=>releaseItem(result.project,result.inventory,levelId,'one',{x:99,y:99}),/Invalid placed token/);
  const locked=clone(p);locked.levels[0].instances[1].locked=true;
  assert.throws(()=>collectItems(locked,[],levelId,payload),/Unlock/);
  assert.equal(locked.levels[0].instances.length,2);
});

test('stack controls treat zero as infinite and infinite placement never depletes or reuses an ID',()=>{
  const {p,levelId}=fixture();
  const {inventory}=collectItems(p,[],levelId,{type:'asset',id:'torch'}),id=inventory[0].id;
  const finite=adjustStack(inventory,id,1);
  assert.equal(finite[0].count,2);assert.equal(inventory[0].count,1);
  let result=releaseItem(p,finite,levelId,id,{x:2,y:2});
  assert.equal(result.inventory[0].count,1);
  result=releaseItem(result.project,result.inventory,levelId,id,{x:3,y:2});
  assert.equal(result.inventory.length,0);
  const infinite=adjustStack(inventory,id,-1);
  assert.equal(infinite[0].count,0);assert.equal(adjustStack(infinite,id,-1)[0].count,0);
  let supply=releaseItem(p,infinite,levelId,id,{x:2,y:2});
  const firstId=supply.instanceId;
  supply=releaseItem(supply.project,supply.inventory,levelId,id,{x:3,y:2});
  assert.notEqual(firstId,supply.instanceId);assert.equal(supply.inventory[0].count,0);
  const collected=collectItems(supply.project,supply.inventory,levelId,{type:'asset',id:'torch'});
  assert.equal(collected.inventory[0].count,0);
  const limited=adjustStack(collected.inventory,id,1);
  assert.equal(limited[0].count,1);assert.equal(limited[0].items.length,1);
});

test('graveyard collection and restoration retain individual states within a shared stack',()=>{
  const {p,levelId}=fixture();
  let result=collectItems(p,[],levelId,{type:'instance',ids:['one','two'],levelId});
  const stackId=result.inventory[0].id;
  result=releaseItem(result.project,result.inventory,levelId,stackId,{x:1,y:1});
  assert.deepEqual(result.project.levels[0].instances[0].stateOverrides,{lit:false});
  assert.equal(result.inventory[0].count,1);
  result=releaseItem(result.project,result.inventory,levelId,stackId,{x:2,y:1});
  assert.equal(result.project.levels[0].instances[1].stateOverrides,undefined);
  assert.equal(result.inventory.length,0);
  assert.equal(p.levels[0].instances.length,2);
});
