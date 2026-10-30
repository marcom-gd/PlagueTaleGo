import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,applyAction,validateProject,stateEnabled} from '../public/model.js';
import {blockedNodes,effectOverlay,checkMovement} from '../public/behaviour-areas.js';
import {resolveTurn,availableUses,useObject,eventsAdvanceTurn,movementEvents} from '../public/behaviours.js';
import {createSequence,eventTurn,previousTurn,validateSequence} from '../public/turn-sequence.js';
import {collectItems,releaseItem} from '../public/player-inventory.js';
import {copyHierarchy,copyLevel} from '../public/editing.js';
const a=(id,icon='guard',extra={})=>({id,name:id,icon,kind:'token',parentId:null,color:'#b8cf96',tags:[],rule:'',range:2,...extra});
const i=(id,assetId,x,y=2,extra={})=>({id,assetId,x,y,rotation:0,...extra});
const b=(id,type,extra={})=>({id,type,enabled:true,...extra});
const link=(id,instanceIds)=>({id,name:id,rule:'',color:'#abcdef',instanceIds});
function fixture(){
  const p=newProject(),l=p.levels[0];l.width=12;l.height=8;l.tiles={};l.nodes=Array.from({length:10},(_,x)=>`${x},2`);
  p.assets=[a('actor'),a('usable','lever'),a('door','door'),a('effect','area',{parentId:'actor'})];
  l.instances=[i('actor1','actor',1),i('lever1','usable',2),i('door1','door',8)];
  return {p,l};
}
function blocker(p,l,types=null,scope='movement'){
  p.assets.push(a('blocker','rock'),a('block-area','self',{parentId:'blocker',behaviours:[b('block','blockNode',{blockAssetIds:types,blockScope:scope})]}));
  l.instances.push(i('barrier','blocker',4));
}
test('Block Node passively restricts selected movers, rejects manual node crossings atomically, and follows state and owner changes',()=>{
  let {p,l}=fixture();blocker(p,l,['actor']);
  assert.deepEqual([...blockedNodes(p,l,'actor')],['4,2']);assert.equal(blockedNodes(p,l,'door').size,0);
  let next=applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'actor1',x:4}});
  assert.throws(()=>checkMovement(p,next),/Block Node/);assert.equal(p.levels[0].instances[0].x,1);
  next=applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'actor1',x:7}});assert.throws(()=>checkMovement(p,next),/route/);
  p.assets.push(a('blocking','rock',{kind:'state',enabled:false,parentId:'blocker'}));p.assets.find(a=>a.id==='block-area').parentId='blocking';assert.equal(blockedNodes(p,l,'actor').size,0);
  p=applyAction(p,{type:'instance.state',data:{levelId:l.id,id:'barrier',stateId:'blocking',enabled:true}});assert.ok(blockedNodes(p,p.levels[0],'actor').has('4,2'));
  p=applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'barrier',x:5}});assert.deepEqual([...blockedNodes(p,p.levels[0],'actor')],['5,2']);
});
test('Block Node stops automated movement and effect cells on and behind the barrier for selected casters',()=>{
  const {p,l}=fixture();blocker(p,l,['actor'],'movementAndEffects');l.instances=l.instances.filter(i=>i.id!=='lever1');
  p.assets[0].behaviours=[b('walk','moveTo',{steps:8,target:'current',patrolId:null})];l.instances[0].moveTarget={type:'position',x:9,y:2};
  assert.equal(resolveTurn(p).project.levels[0].instances[0].x,1);
  const effect=p.assets.find(a=>a.id==='effect');effect.range=9;
  const cells=effectOverlay(p,p.assets[0],effect,l.instances[0],l).cells;
  assert.ok(cells.some(([x,y])=>x===3&&y===2));assert.ok(!cells.some(([x,y])=>x>=4&&y===2));
  p.assets.find(a=>a.id==='block-area').behaviours[0].blockScope='movement';assert.ok(effectOverlay(p,p.assets[0],effect,l.instances[0],l).cells.some(([x,y])=>x===8&&y===2));
  p.assets.find(a=>a.id==='block-area').behaviours[0].blockScope='movementAndEffects';p.assets.find(a=>a.id==='block-area').behaviours[0].blockAssetIds=['door'];assert.ok(effectOverlay(p,p.assets[0],effect,l.instances[0],l).cells.some(([x,y])=>x===8&&y===2));
});
test('Apply Effect Linked Object(s) reaches direct links outside the area, deduplicates memberships, and respects effect blockers',()=>{
  const {p,l}=fixture();p.assets[3].behaviours=[b('remove','applyEffect',{action:'graveyard',eligibleMode:'linked',eligibleAssetIds:null})];
  l.objectLinks=[link('one',['actor1','door1']),link('two',['actor1','door1'])];
  let run=resolveTurn(p);assert.deepEqual(run.graveyard.flatMap(s=>s.items.map(i=>i.id)),['door1']);assert.ok(run.project.levels[0].instances.some(i=>i.id==='lever1'));
  blocker(p,l,['actor'],'movementAndEffects');run=resolveTurn(p);assert.equal(run.graveyard.length,0);
});
test('Use actions appear only in range, do not resolve automatically, affect the clicked object or its links, and recheck stale clicks',()=>{
  const {p,l}=fixture();p.assets[3].behaviours=[b('use','useEffect',{usableAssetIds:['usable'],useTarget:'linked',action:'graveyard'})];
  l.objectLinks=[link('door-control',['lever1','door1'])];
  const uses=availableUses(p,l);assert.equal(uses.length,1);assert.equal(uses[0].usedId,'lever1');assert.equal(resolveTurn(p).graveyard.length,0);
  const run=useObject(p,[],[],uses[0]);assert.equal(run.graveyard[0].items[0].id,'door1');assert.ok(run.project.levels[0].instances.some(i=>i.id==='lever1'));
  assert.deepEqual(run.events.map(e=>[e.type,e.instanceId]),[['use','actor1'],['use','lever1']]);
  p.assets[3].behaviours[0].useTarget='used';assert.equal(useObject(p,[],[],uses[0]).graveyard[0].items[0].id,'lever1');
  l.instances[1].x=7;assert.equal(availableUses(p,l).length,0);assert.throws(()=>useObject(p,[],[],uses[0]),/no longer usable/);
});
test('Use respects effect occlusion, selected usable types, and inactive state branches',()=>{
  const {p,l}=fixture();p.assets[3].behaviours=[b('use','useEffect',{usableAssetIds:[],useTarget:'used',action:'graveyard'})];assert.equal(availableUses(p,l).length,0);
  p.assets[3].behaviours[0].usableAssetIds=['usable'];assert.equal(availableUses(p,l).length,1);
  p.assets.push(a('off','guard',{kind:'state',enabled:false,parentId:'actor'}));p.assets[3].parentId='off';assert.equal(availableUses(p,l).length,0);
  p.assets[3].parentId='actor';blocker(p,l,['actor'],'movementAndEffects');l.instances.find(i=>i.id==='barrier').x=2;assert.equal(availableUses(p,l).length,0);
});
test('Teleport supports self or selected targets, cells, linked and selected destinations, stacks, blocks, and locked pieces',()=>{
  const {p,l}=fixture();const tele=b('tele','teleport',{teleportTarget:'self',targetInstanceId:null,destination:{type:'position',x:5,y:2}});p.assets[0].behaviours=[tele];
  assert.equal(resolveTurn(p).project.levels[0].instances[0].x,5);
  tele.destination={type:'object',id:'door1'};assert.equal(resolveTurn(p).project.levels[0].instances[0].x,8);
  tele.destination={type:'linked',id:null};l.objectLinks=[link('portal',['actor1','door1'])];assert.equal(resolveTurn(p).project.levels[0].instances[0].x,8);
  tele.teleportTarget='object';tele.targetInstanceId='lever1';tele.destination={type:'position',x:6,y:2};assert.equal(resolveTurn(p).project.levels[0].instances[1].x,6);
  l.instances[1].locked=true;assert.equal(resolveTurn(p).project.levels[0].instances[1].x,2);delete l.instances[1].locked;
  tele.destination={type:'position',x:31,y:23};assert.equal(resolveTurn(p).project.levels[0].instances[1].x,2);
  blocker(p,l,['usable']);tele.destination={type:'position',x:4,y:2};assert.equal(resolveTurn(p).project.levels[0].instances[1].x,2);
});
test('Use can teleport a clicked object and report movement, while copied levels retain selected destinations',()=>{
  const {p,l}=fixture();p.assets[3].behaviours=[b('use','useEffect',{usableAssetIds:['usable'],useTarget:'used',action:'teleport',destination:{type:'object',id:'door1'}})];
  const run=useObject(p,[],[],availableUses(p,l)[0]);assert.equal(run.project.levels[0].instances[1].x,8);assert.ok(run.events.some(e=>e.type==='moved'&&e.instanceId==='lever1'));
  p.assets[0].behaviours=[b('tele','teleport',{teleportTarget:'self',targetInstanceId:null,destination:{type:'object',id:'door1'}})];
  const copied=copyLevel(l);p.levels.push(copied);const next=resolveTurn(p);assert.equal(next.project.levels[1].instances[0].x,8);
});
test('turn events cover drag/drop-style position updates, grouped moves, Use, and inventory transfer; ignore rotation and unselected events',()=>{
  const {p,l}=fixture();p.assets[0].behaviours=[b('advance','advanceOnEvent',{events:['moved','use','inventoryAdded','inventoryDropped']})];
  const moved=applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'actor1',x:3}}),events=movementEvents(p,moved);
  assert.equal(events.length,1);assert.equal(eventsAdvanceTurn(p,moved,events),true);
  const rotated=applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'actor1',direction:90}});assert.deepEqual(movementEvents(p,rotated),[]);
  const collection=collectItems(p,[],l.id,{type:'instance',id:'actor1',levelId:l.id});assert.ok(eventsAdvanceTurn(p,collection.project,[{type:'inventoryAdded',levelId:l.id,instanceId:'actor1'}]));
  const dropped=releaseItem(collection.project,collection.inventory,l.id,'actor1',{x:1,y:2});assert.ok(eventsAdvanceTurn(collection.project,dropped.project,[{type:'inventoryDropped',levelId:l.id,instanceId:'actor1'}]));
  assert.ok(eventsAdvanceTurn(p,p,[{type:'use',levelId:l.id,instanceId:'actor1'}]));
  p.assets[0].behaviours[0].events=['use'];moved.assets[0].behaviours[0].events=['use'];assert.equal(eventsAdvanceTurn(p,moved,events),false);
});
test('event turns preserve the pre-action snapshot, advance once without recursion, and survive sequence save/load',()=>{
  const {p,l}=fixture();l.instances=l.instances.filter(i=>i.id==='actor1');p.assets[0].behaviours=[b('advance','advanceOnEvent',{events:['moved']}),b('move','moveTo',{steps:1,target:'current',patrolId:null})];l.instances[0].moveTarget={type:'position',x:7,y:2};
  const before={project:p,inventory:[],graveyard:[],levelId:l.id},after={...before,project:applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'actor1',x:2}})};
  let sequence=eventTurn(createSequence(before),before,after);assert.equal(sequence.cursor,1);assert.equal(sequence.frames[1].project.levels[0].instances[0].x,3);assert.equal(sequence.frames[0].project.levels[0].instances[0].x,1);
  sequence=validateSequence(JSON.parse(JSON.stringify(sequence)));sequence=previousTurn(sequence,sequence.frames[1]);assert.equal(sequence.frames[sequence.cursor].project.levels[0].instances[0].x,1);
});
test('new behaviour validation rejects incomplete configurations and hierarchy copies remap type selections',()=>{
  const {p}=fixture();for(const invalid of [b('bad','advanceOnEvent',{events:[]}),b('bad','teleport',{teleportTarget:'object',destination:{type:'position',x:1,y:1}}),b('bad','useEffect',{action:'graveyard',usableAssetIds:[],useTarget:'bad'}),b('bad','blockNode',{blockAssetIds:null,blockScope:'bad'})])assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:'effect',behaviours:[invalid]}}));
  p.assets[3].behaviours=[b('block','blockNode',{blockAssetIds:['actor'],blockScope:'movement'}),b('use','useEffect',{action:'graveyard',usableAssetIds:['actor'],useTarget:'used'})];
  const copy=copyHierarchy(p,'actor');assert.equal(copy[1].behaviours[0].blockAssetIds[0],copy[0].id);assert.equal(copy[1].behaviours[1].usableAssetIds[0],copy[0].id);assert.doesNotThrow(()=>validateProject({...p,assets:[...p.assets,...copy]}));
});

test('inventory drops cannot enter blocked nodes and retain their stack when rejected',()=>{
  const {p,l}=fixture();blocker(p,l,['actor']);
  const collected=collectItems(p,[],l.id,{type:'instance',id:'actor1',levelId:l.id});
  assert.throws(()=>releaseItem(collected.project,collected.inventory,l.id,'actor1',{x:4,y:2}),/Block Node/);
  assert.equal(collected.inventory[0].count,1);assert.equal(collected.project.levels[0].instances.some(i=>i.id==='actor1'),false);
});

test('multiple stacked usable objects expose independent actions and a chosen action affects only its selected object',()=>{
  const {p,l}=fixture();l.instances.push(i('lever2','usable',2));p.assets[3].behaviours=[b('use','useEffect',{usableAssetIds:['usable'],useTarget:'used',action:'graveyard'})];
  const choices=availableUses(p,l);assert.equal(choices.length,2);
  const run=useObject(p,[],[],choices.find(choice=>choice.usedId==='lever2'));
  assert.deepEqual(run.graveyard[0].items.map(i=>i.id),['lever2']);assert.ok(run.project.levels[0].instances.some(i=>i.id==='lever1'));
});

test('Use Toggle alternates exclusive states on the clicked object or its linked target without changing defaults or other placements',()=>{
  for(const useTarget of ['used','linked']){
    let {p,l}=fixture();const targetAsset=useTarget==='used'?'usable':'door',targetId=useTarget==='used'?'lever1':'door1';
    p.assets.find(a=>a.id===targetAsset).exclusiveStates=true;
    p.assets.push(a('closed',targetAsset==='door'?'door':'lever',{kind:'state',parentId:targetAsset,enabled:true,name:'Closed'}),a('open',targetAsset==='door'?'door':'lever',{kind:'state',parentId:targetAsset,enabled:false,name:'Open'}));
    l.instances.push(i('other',targetAsset,9));l.objectLinks=[link('control',['lever1','door1'])];
    p.assets[3].behaviours=[b('toggle','useEffect',{usableAssetIds:['usable'],useTarget,action:'switchState',stateKey:'Open',stateEnabled:true,stateToggle:true})];
    const defaults=structuredClone(p.assets);
    for(const expected of ['open','closed','open','closed']){
      const run=useObject(p,[],[],availableUses(p,p.levels[0])[0]);p=run.project;
      const target=p.levels[0].instances.find(i=>i.id===targetId),other=p.levels[0].instances.find(i=>i.id==='other');
      assert.equal(stateEnabled(p,p.assets.find(a=>a.id===expected),target),true);
      assert.equal(['open','closed'].filter(id=>stateEnabled(p,p.assets.find(a=>a.id===id),target)).length,1);
      assert.equal(stateEnabled(p,p.assets.find(a=>a.id==='closed'),other),true);assert.equal(run.log[0].count,1);
      assert.deepEqual(p.assets,defaults);
    }
    assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  }
});

test('Use Toggle starts with the chosen state when none is enabled, cycles larger nested groups, and enables ancestors',()=>{
  let {p,l}=fixture();p.assets.push(a('mode','lever',{kind:'state',parentId:'usable',enabled:false,exclusiveStates:true}));
  for(const id of ['first','second','third'])p.assets.push(a(id,'lever',{kind:'state',parentId:'mode',enabled:false}));
  p.assets[3].behaviours=[b('toggle','useEffect',{usableAssetIds:['usable'],useTarget:'used',action:'switchState',stateKey:'second',stateEnabled:true,stateToggle:true})];
  for(const expected of ['second','third','first','second']){
    p=useObject(p,[],[],availableUses(p,p.levels[0])[0]).project;
    const target=p.levels[0].instances.find(i=>i.id==='lever1');
    assert.equal(stateEnabled(p,p.assets.find(a=>a.id==='mode'),target),true);
    assert.equal(stateEnabled(p,p.assets.find(a=>a.id===expected),target),true);
    assert.equal(['first','second','third'].filter(id=>stateEnabled(p,p.assets.find(a=>a.id===id),target)).length,1);
  }
});

test('Toggle skips non-exclusive or single-state groups and rejects use outside Use Switch State',()=>{
  const {p,l}=fixture();p.assets.push(a('on','lever',{kind:'state',parentId:'usable',enabled:true}),a('off','lever',{kind:'state',parentId:'usable',enabled:false}));
  const toggle=b('toggle','useEffect',{usableAssetIds:['usable'],useTarget:'used',action:'switchState',stateKey:'on',stateEnabled:true,stateToggle:true});p.assets[3].behaviours=[toggle];
  assert.equal(useObject(p,[],[],availableUses(p,l)[0]).log[0].count,0);assert.equal(p.levels[0].instances[1].stateOverrides,undefined);
  p.assets[1].exclusiveStates=true;p.assets=p.assets.filter(a=>a.id!=='off');assert.equal(useObject(p,[],[],availableUses(p,l)[0]).log[0].count,0);
  for(const invalid of [{...toggle,stateToggle:'true'},{...toggle,action:'graveyard'},{...toggle,type:'applyEffect',eligibleAssetIds:null}])assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:'effect',behaviours:[invalid]}}),/Toggle/);
});

test('Exclude Self exempts only the emitting placement from its own movement and effect blockers',()=>{
  const {p,l}=fixture();p.assets[3].icon='self';
  const block=b('block','blockNode',{blockAssetIds:null,blockScope:'movementAndEffects',excludeSelf:true});p.assets[3].behaviours=[block];
  assert.equal(blockedNodes(p,l,'actor','movement','actor1').size,0);
  assert.ok(blockedNodes(p,l,'actor','movement','another-actor').has('1,2'));
  assert.ok(blockedNodes(p,l,'usable','movement','lever1').has('1,2'));
  const effect=p.assets[3],owner=l.instances[0];assert.deepEqual(effectOverlay(p,p.assets[0],effect,owner,l).cells,[[1,2]]);
  block.excludeSelf=false;assert.deepEqual(effectOverlay(p,p.assets[0],effect,owner,l).cells,[]);
  block.excludeSelf=true;l.instances.push(i('actor2','actor',1));
  assert.ok(blockedNodes(p,l,'actor','movement','actor1').has('1,2'),'another copy still blocks the owner');
  assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:'effect',behaviours:[{...block,excludeSelf:'yes'}]}}),/Exclude Self/);
});

test('Exclude Self permits movement and teleport within the owner’s own blocking area, but other objects remain blocked',()=>{
  const {p,l}=fixture();p.assets[3].behaviours=[b('block','blockNode',{blockAssetIds:null,blockScope:'movement',excludeSelf:true})];
  const selfMove=applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'actor1',x:3}});assert.doesNotThrow(()=>checkMovement(p,selfMove));
  const otherMove=applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'lever1',x:3}});assert.throws(()=>checkMovement(p,otherMove),/Block Node/);
  p.assets[0].behaviours=[b('teleport','teleport',{teleportTarget:'self',destination:{type:'position',x:3,y:2}})];assert.equal(resolveTurn(p).project.levels[0].instances[0].x,3);
});

test('finite Flush reach counts continuous cells from each seed, includes stacks, and stops branches at the limit',()=>{
  const {p,l}=fixture();p.assets[3].range=1;p.assets[3].behaviours=[b('flush','applyEffect',{action:'flush',eligibleAssetIds:['usable'],flushReach:2})];
  l.instances.push(i('next','usable',3),i('stack','usable',3),i('far','usable',4),i('branch','usable',2,3),i('branch-far','usable',2,4),i('gap','usable',7));
  let run=resolveTurn(p);assert.deepEqual(run.graveyard.flatMap(s=>s.items.map(i=>i.id)).sort(),['branch','lever1','next','stack']);
  p.assets[3].behaviours[0].flushReach=1;run=resolveTurn(p);assert.deepEqual(run.graveyard[0].items.map(i=>i.id),['lever1']);
  p.assets[3].behaviours[0].flushReach=null;run=resolveTurn(p);assert.equal(run.graveyard[0].count,6);assert.ok(run.project.levels[0].instances.some(i=>i.id==='gap'));
  delete p.assets[3].behaviours[0].flushReach;assert.deepEqual(resolveTurn(p).graveyard,run.graveyard);
  for(const flushReach of [0,-1,1.5,769,'infinite'])assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:'effect',behaviours:[{...p.assets[3].behaviours[0],flushReach}]}}),/Flush reach/);
});

test('Use Flush shares the finite reach rule and separately caught seeds retain their own reach',()=>{
  const {p,l}=fixture();p.assets[3].behaviours=[b('flush','useEffect',{action:'flush',usableAssetIds:['usable'],useTarget:'used',flushReach:2})];
  l.instances.push(i('next','usable',3),i('far','usable',4));
  const run=useObject(p,[],[],availableUses(p,l).find(choice=>choice.usedId==='lever1'));assert.deepEqual(run.graveyard[0].items.map(i=>i.id).sort(),['lever1','next']);
  p.assets[3].range=3;p.assets[3].behaviours=[b('flush','applyEffect',{action:'flush',eligibleAssetIds:['usable'],flushReach:1})];
  assert.deepEqual(resolveTurn(p).graveyard[0].items.map(i=>i.id).sort(),['far','lever1','next']);
});
