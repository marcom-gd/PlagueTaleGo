import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,clone,validateProject,applyAction,assetIsActive} from '../public/model.js';
import {availableUses,useObject,resolveTurn,eventsAdvanceTurn} from '../public/behaviours.js';
import {carriedItems,interactionOwners,dropCarriedItem} from '../public/carried-items.js';
import {createPlaytestState,collectItems,adjustStack} from '../public/player-inventory.js';
import {createSequence,eventTurn,nextTurn,previousTurn,validateSequence} from '../public/turn-sequence.js';
import {countdown,syncLifetimes} from '../public/lifetimes.js';
import {carriedBadges} from '../public/carried-ui.js';
import {copyHierarchy} from '../public/editing.js';

const asset=(id,extra={})=>({id,name:id,icon:'key',color:'#edc47c',rule:'',range:1,tags:[],parentId:null,...extra});
const area=(id,parentId,behaviours)=>asset(id,{parentId,icon:'cross',occludedByWalls:true,behaviours});
const effect=(id,stateKey)=>({id,type:'applyEffect',enabled:true,action:'switchState',eligibleMode:'any',eligibleAssetIds:null,stateKey,stateEnabled:true});
const use=(id,objects,target,stateKey)=>({id,type:'useEffect',enabled:true,usableMode:'selected',usableAssetIds:objects,useTarget:target,trigger:effect(id+'-effect',stateKey)});
function fixture(){
  const project=newProject(),level=project.levels[0];
  project.assets=[asset('courier',{icon:'girl',behaviours:[{id:'turn-events',type:'advanceOnEvent',enabled:true,events:['use','moved','inventoryAdded','inventoryDropped']}]}),
    asset('parcel'),asset('charged',{kind:'state',parentId:'parcel',enabled:false,behaviours:[{id:'expire',type:'lifetime',enabled:true,turns:3}]}),
    area('pickup-area','parcel',[{id:'pickup',type:'pickUp',enabled:true,pickupTarget:'owner',usableMode:'selected',usableAssetIds:['courier']}]),
    asset('station',{icon:'crate'}),asset('powered',{kind:'state',parentId:'station',enabled:true,icon:'crate'}),
    area('station-area','powered',[use('charge',['courier'],'carried','charged')]),
    area('activation-area','charged',[use('activate',['receiver'],'used','open')]),
    asset('receiver',{icon:'chest',exclusiveStates:true}),asset('closed',{kind:'state',parentId:'receiver',enabled:true,icon:'chest',variant:'closed'}),asset('open',{kind:'state',parentId:'receiver',enabled:false,icon:'chest',variant:'open'})];
  level.instances=[{id:'p',assetId:'courier',x:2,y:2,rotation:0},{id:'item',assetId:'parcel',x:1,y:2,rotation:90,note:'Unique item'},
    {id:'source',assetId:'station',x:2,y:1,rotation:0},{id:'target',assetId:'receiver',x:3,y:2,rotation:0}];
  return createPlaytestState(validateProject(project),level.id);
}
const choices=s=>availableUses(s.project,s.project.levels[0],s.inventory);
const held=s=>carriedItems(s.inventory,s.levelId,'p')[0];
const applyUse=(s,id)=>useObject(s.project,s.inventory,s.graveyard,choices(s).find(c=>c.behaviourId===id));
function step(sequence,id){const before=sequence.frames[sequence.cursor],result=applyUse(before,id);assert.equal(eventsAdvanceTurn(before.project,result.project,result.events),true);return eventTurn(sequence,before,{...result,levelId:before.levelId},result.log);}

test('generic Pick Up + Use on carried objects + Lifetime compose without item names or icons',()=>{
  const initial=fixture(),before=clone(initial);let sequence=createSequence(initial);
  assert.deepEqual(choices(initial).map(c=>[c.triggerType,c.usedId,c.collectorId]),[['pickUp','item','p']]);
  sequence=step(sequence,'pickup');let state=sequence.frames[1];
  assert.equal(held(state).id,'item');assert.equal(held(state).rotation,90);assert.equal(held(state).note,'Unique item');assert.equal(countdown(held(state)),undefined);
  assert.equal(state.project.levels[0].instances.some(i=>i.id==='item'),false);
  sequence=step(sequence,'charge');state=sequence.frames[2];assert.equal(assetIsActive(state.project,'charged',held(state)),true);assert.equal(countdown(held(state)).remaining,3);
  sequence=step(sequence,'activate');state=sequence.frames[3];
  const target=state.project.levels[0].instances.find(i=>i.id==='target');assert.equal(assetIsActive(state.project,'open',target),true);assert.equal(assetIsActive(state.project,'closed',target),false);assert.equal(countdown(held(state)).remaining,2);
  sequence=nextTurn(sequence,state);assert.equal(countdown(held(sequence.frames[4])).remaining,1);
  sequence=nextTurn(sequence,sequence.frames[4]);assert.equal(held(sequence.frames[5]),undefined);assert.match(sequence.frames[5].log[0].message,/expired/);
  assert.deepEqual(validateSequence(JSON.parse(JSON.stringify(sequence))),sequence);assert.deepEqual(initial,before);
  sequence=previousTurn(sequence,sequence.frames[5]);assert.equal(countdown(held(sequence.frames[4])).remaining,1);
});

test('pickup may be on the item’s parameter or on the collector’s parameter and follows tag selectors',()=>{
  let state=fixture(),p=state.project;p.tags=[{id:'collector',name:'Collector',rule:'',color:'#edc47c'}];p.assets[0].tags=['collector'];
  const pickup=p.assets.find(a=>a.id==='pickup-area').behaviours[0];pickup.usableMode='tags';pickup.usableTagIds=['collector'];pickup.usableAssetIds=null;
  assert.equal(choices(state)[0].collectorId,'p');p.assets[0].tags=[];assert.deepEqual(choices(state),[]);
  state=fixture();const a=state.project.assets.find(a=>a.id==='pickup-area');a.parentId='courier';a.behaviours[0].pickupTarget='used';a.behaviours[0].usableAssetIds=['parcel'];
  const choice=choices(state)[0];assert.equal(choice.usedId,'item');assert.equal(choice.collectorId,'p');assert.equal(held({...state,...applyUse(state,'pickup')}).id,'item');
});

test('pickup rechecks range, states, scenery locks, walls, floors and effect blockers',()=>{
  const original=fixture(),before=clone(original),choice=choices(original)[0];
  for(const change of [s=>{s.project.levels[0].instances[0].x=7;},s=>{s.project.levels[0].instances[1].locked=true;},s=>{s.project.assets.find(a=>a.id==='pickup-area').behaviours[0].enabled=false;},s=>{s.project.levels[0].tiles['2,2']='wall';},s=>{s.project.levels[0].tiles['2,2']='floor-elevated';}]){
    const state=clone(original);change(state);assert.equal(choices(state).some(c=>c.triggerType==='pickUp'),false);assert.throws(()=>useObject(state.project,[],[],choice),/no longer usable/);
  }
  const state=clone(original);state.project.assets.push(area('block','courier',[{id:'block-effects',type:'blockNode',enabled:true,blockAssetIds:['parcel'],blockScope:'movementAndEffects'}]));state.project.levels[0].nodes=['2,2'];
  assert.equal(choices(state).some(c=>c.triggerType==='pickUp'),false);assert.deepEqual(original,before);
});

test('carried Use interactions follow the carrier and become unavailable when a state or source is inactive',()=>{
  let seq=step(createSequence(fixture()),'pickup');seq=step(seq,'charge');const state=clone(seq.frames[2]);
  assert.equal(choices(state).some(c=>c.behaviourId==='activate'),true);
  state.project.levels[0].instances.find(i=>i.id==='p').x=7;assert.equal(choices(state).some(c=>c.behaviourId==='activate'),false);
  const owners=interactionOwners(state.project,state.project.levels[0],state.inventory);assert.equal(owners.find(i=>i.id==='item').x,7);assert.equal(held(state).x,1);
  const inactive=clone(seq.frames[2]);held(inactive).stateOverrides.charged=false;assert.equal(choices(inactive).some(c=>c.behaviourId==='activate'),false);
  inactive.project.levels[0].instances.find(i=>i.id==='source').stateOverrides={powered:false};assert.equal(choices(inactive).some(c=>c.behaviourId==='charge'),false);
});

test('a repeated state switch does not refill a lifetime; disabling and reactivating starts a new lifetime',()=>{
  let seq=step(createSequence(fixture()),'pickup');seq=step(seq,'charge');seq=step(seq,'charge');assert.equal(countdown(held(seq.frames[3])).remaining,2);
  let state=clone(seq.frames[3]);state.project.assets.find(a=>a.id==='station-area').behaviours[0].trigger.stateEnabled=false;
  state={...state,...applyUse(state,'charge')};assert.equal(countdown(held(state)),undefined);
  state.project.assets.find(a=>a.id==='station-area').behaviours[0].trigger.stateEnabled=true;state={...state,...applyUse(state,'charge')};assert.equal(countdown(held(state)).remaining,3);
});

test('drop and re-pickup preserve identity and countdown without forced turns',()=>{
  let seq=step(createSequence(fixture()),'pickup');seq=step(seq,'charge');let state=seq.frames[2];
  const dropped=dropCarriedItem(state.project,state.inventory,[],state.levelId,'item');
  assert.equal(dropped.inventory.length,0);assert.equal(dropped.project.levels[0].instances.at(-1).carriedBy,undefined);assert.equal(countdown(dropped.project.levels[0].instances.at(-1)).remaining,3);
  seq=eventTurn(seq,state,{...dropped,levelId:state.levelId});state=seq.frames[3];assert.equal(countdown(state.project.levels[0].instances.at(-1)).remaining,2);
  seq=step(seq,'pickup');assert.equal(countdown(held(seq.frames[4])).remaining,1);
  state=fixture();state.project.assets[0].behaviours=[];const result=applyUse(state,'pickup');assert.equal(eventsAdvanceTurn(state.project,result.project,result.events),false);
});

test('finite pickups remain separate from infinite supplies and support several independent carried objects',()=>{
  let state=fixture(),result=collectItems(state.project,[],state.levelId,{type:'asset',id:'parcel'});result.inventory=adjustStack(result.inventory,result.inventory[0].id,-1);state={...state,...result};
  state={...state,...applyUse(state,'pickup')};assert.equal(state.inventory[0].count,0);assert.equal(state.inventory[0].items.length,1);assert.equal(held(state).id,'item');
  assert.throws(()=>adjustStack(state.inventory,state.inventory[1].id,1),/individual/);
  state.project.levels[0].instances.push({id:'second',assetId:'parcel',x:1,y:2,rotation:0});state={...state,...applyUse(state,'pickup')};
  assert.equal(carriedItems(state.inventory,state.levelId,'p').length,2);assert.equal(new Set(state.inventory.map(s=>s.id)).size,3);
  const html=carriedBadges(state.project,state.project.levels[0],state.inventory,()=>'<svg></svg>',s=>s);assert.equal((html.match(/data-drop-carried/g)||[]).length,2);
});

test('Lifetime works for any board or inventory object, starts at turn zero, ignores Wait and prunes links on expiry',()=>{
  const state=fixture();state.project.assets.find(a=>a.id==='parcel').behaviours=[{id:'wait',type:'wait',enabled:true,turns:10},{id:'temporary',type:'lifetime',enabled:true,turns:2}];
  state.project.levels[0].objectLinks=[{id:'pair',name:'Pair',rule:'',color:'#edc47c',instanceIds:['item','source']}];
  const initial=createPlaytestState(state.project,state.levelId);assert.equal(countdown(initial.project.levels[0].instances[1]).remaining,2);
  let next=resolveTurn(initial.project);assert.equal(countdown(next.project.levels[0].instances.find(i=>i.id==='item')).remaining,1);
  next=resolveTurn(next.project);assert.equal(next.project.levels[0].instances.some(i=>i.id==='item'),false);assert.deepEqual(next.project.levels[0].objectLinks,[]);
  const stored=collectItems(initial.project,[],state.levelId,{type:'instance',id:'item',levelId:state.levelId});next=resolveTurn(stored.project,stored.inventory);assert.equal(countdown(next.inventory[0].items[0]).remaining,1);next=resolveTurn(next.project,next.inventory);assert.equal(next.inventory.length,0);
});

test('carried-state targeting uses the ordinary effect system and skips incompatible states',()=>{
  let state=fixture();state={...state,...applyUse(state,'pickup')};
  state.project.assets.push(asset('other'));state.inventory.push({id:'other-stack',assetId:'other',count:1,items:[{id:'other-item',assetId:'other',x:0,y:0,rotation:0,carriedBy:{levelId:state.levelId,instanceId:'p'}}]});
  const result=applyUse(state,'charge');assert.equal(result.log[0].count,1);assert.equal(assetIsActive(result.project,'charged',result.inventory[0].items[0]),true);assert.equal(result.inventory[1].items[0].stateOverrides,undefined);
});

test('temporary objects perform their final turn actions before Lifetime expires, and new copies start fresh',()=>{
  const state=fixture();state.project.assets.find(a=>a.id==='parcel').behaviours=[{id:'emit',type:'spawn',enabled:true,spawnAssetId:'receiver',spawnCount:1},{id:'one-turn',type:'lifetime',enabled:true,turns:1}];
  const initial=createPlaytestState(state.project,state.levelId),next=resolveTurn(initial.project);
  assert.equal(next.project.levels[0].instances.some(i=>i.id==='item'),false);
  assert.equal(next.project.levels[0].instances.filter(i=>i.assetId==='receiver').length,2);
  assert.match(next.log.at(-1).message,/expired/);
});

test('generic behaviours validate, copy internal state references, expose countdowns and reject corrupt snapshots',()=>{
  const state=fixture();assert.throws(()=>applyAction(state.project,{type:'asset.update',data:{id:'parcel',behaviours:[state.project.assets.find(a=>a.id==='pickup-area').behaviours[0]]}}),/Area behaviours/);
  assert.throws(()=>applyAction(state.project,{type:'asset.update',data:{id:'charged',behaviours:[{id:'bad-clock',type:'lifetime',enabled:true,turns:0}]}}),/Lifetime/);
  const copy=copyHierarchy(state.project,'parcel');assert.equal(copy.find(a=>a.name==='charged').behaviours[0].turns,3);
  let seq=step(createSequence(state),'pickup');seq=step(seq,'charge');const active=seq.frames[2];
  const html=carriedBadges(active.project,active.project.levels[0],active.inventory,()=>'<svg></svg>',s=>s);assert.match(html,/3 of 3 turns remaining/);assert.match(html,/lifetime-count/);
  const corrupt=clone(seq);countdown(held(corrupt.frames[2])).remaining=-1;assert.throws(()=>validateSequence(corrupt),/lifetime progress/);
  const missing=clone(seq);held(missing.frames[2]).carriedBy.instanceId='missing';assert.throws(()=>validateSequence(missing),/carrier/);
});
