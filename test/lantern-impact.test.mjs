import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,validateProject,stateEnabled,clone,applyAction} from '../public/model.js';
import {availableThrows,throwPreview,throwObject} from '../public/throw-object.js';
import {resolveTurn} from '../public/behaviours.js';
import {copyHierarchy,copyLevel} from '../public/editing.js';
import {exportLevels,reviewLevelImport,buildLevelImport} from '../public/level-transfer.js';
import {createSequence,nextTurn,previousTurn,validateSequence} from '../public/turn-sequence.js';
import {throwTargetGroups} from '../public/object-selection.js';

const a=(id,icon,extra={})=>({id,name:id,icon,kind:'token',parentId:null,color:'#b8cf96',tags:[],rule:'',range:8,...extra});
const i=(id,assetId,x,extra={})=>({id,assetId,x,y:3,rotation:0,...extra});
function fixture(){
  const p=newProject(),l=p.levels[0];l.width=12;l.height=8;l.nodes=Array.from({length:11},(_,x)=>`${x},3`);l.tiles={};
  p.tags=[{id:'armed',name:'Armed',color:'#b8cf96',rule:''}];
  const throwing={id:'throw',type:'throwObject',enabled:true,throwAssetId:'stone',requireInventory:true,destroyOnHit:true,throwTargetAssetIds:['guard'],throwTargetConditions:[{type:'state',stateKey:'Carry Lantern',enabled:true},{type:'tags',tagIds:['armed']}]};
  const distract={id:'distract',type:'distraction',enabled:true,hitAssetIds:['stone'],distractAssetIds:[],distractTarget:'self',destinationMode:'throwerPosition',steps:1,returnToStart:false};
  const onHit={id:'break',type:'onHit',enabled:true,hitAssetIds:['stone'],action:'switchState',stateKey:'carrying',stateEnabled:false};
  p.assets=[a('player','girl'),a('stone','rock'),a('guard','guard'),a('range','area',{parentId:'player',behaviours:[throwing]}),a('carrying','guard',{name:'Carry Lantern',kind:'state',parentId:'guard',enabled:true,tags:['armed'],behaviours:[onHit,distract]}),a('lantern','lantern',{parentId:'carrying'})];
  l.instances=[i('player1','player',1),i('guard1','guard',7),i('guard2','guard',9,{stateOverrides:{carrying:false}})];
  const inventory=[{id:'stones',assetId:'stone',count:2,items:[i('stone1','stone',0),i('stone2','stone',0)]}];
  validateProject(p);return {p,l,throwing,distract,inventory};
}
const preview=(f,x=7)=>throwPreview(f.p,f.inventory,availableThrows(f.p,f.l,f.inventory)[0],{x,y:3});
const hit=f=>throwObject(f.p,f.inventory,[],availableThrows(f.p,f.l,f.inventory)[0],{x:7,y:3});
const guard=p=>p.levels[0].instances.find(i=>i.id==='guard1');
function withNearbyDistraction(f,settings={}){
  f.p.assets.push(a('lantern-noise','area',{parentId:'lantern',range:3,behaviours:[{id:'nearby-distract',type:'distraction',enabled:true,hitAssetIds:['stone'],distractAssetIds:['guard'],distractTarget:'area',destinationMode:'hitPosition',steps:1,returnToStart:false,...settings}]}));
  validateProject(f.p);return f;
}

test('a broken lantern sends its guard to the thrower and nearby guards to the fixed impact cell',()=>{
  const f=withNearbyDistraction(fixture()),nearby=p=>p.levels[0].instances.find(i=>i.id==='guard2'),reactions=preview(f).distractions;
  assert.deepEqual(reactions.map(r=>[r.targetIds,r.destination]),[[['guard1'],{x:1,y:3}],[['guard2'],{x:7,y:3}]]);
  let p=hit(f).project;assert.equal(nearby(p).distraction.fixedDestination,true);
  assert.equal(stateEnabled(p,p.assets[4],guard(p)),false);
  p=resolveTurn(p).project;assert.equal(guard(p).x,6);assert.equal(nearby(p).x,8);assert.deepEqual(nearby(p).distraction.destination,{x:7,y:3});
  p=resolveTurn(p).project;assert.equal(guard(p).x,5);assert.equal(nearby(p).x,7);assert.equal(nearby(p).distraction,undefined);
  p=resolveTurn(p).project;assert.equal(nearby(p).x,7);
});

test('fixed impact distractions preserve delays, return, facing and snapshots after the carrier disappears',()=>{
  const f=withNearbyDistraction(fixture(),{approachDelay:1,returnToStart:true,returnDelay:1}),nearby=p=>p.levels[0].instances.find(i=>i.id==='guard2');
  f.p.assets[2].autoFacing=true;nearby(f.p).direction=90;
  const run=hit(f),state={...run,levelId:f.l.id};let seq=nextTurn(createSequence(state),state);
  assert.equal(nearby(seq.frames[1].project).x,9);assert.equal(nearby(seq.frames[1].project).distraction.approachWait,0);
  seq=validateSequence(JSON.parse(JSON.stringify(seq)));assert.equal(nearby(previousTurn(seq,seq.frames[1]).frames[0].project).distraction.approachWait,1);
  let p=clone(seq.frames[1].project);p.levels[0].instances=p.levels[0].instances.filter(i=>i.id!=='guard1');
  p=resolveTurn(p).project;assert.equal(nearby(p).x,8);assert.deepEqual(nearby(p).distraction.destination,{x:7,y:3});
  p=resolveTurn(p).project;assert.equal(nearby(p).x,7);assert.equal(nearby(p).distraction.phase,'return');
  p=resolveTurn(p).project;assert.equal(nearby(p).x,7);
  p=resolveTurn(p).project;p=resolveTurn(p).project;assert.equal(nearby(p).x,9);assert.equal(nearby(p).direction,90);assert.equal(nearby(p).distraction,undefined);
});

test('throw filters combine type, active state and active tags on the same target and recheck stale choices',()=>{
  const f=fixture(),choice=availableThrows(f.p,f.l,f.inventory)[0];
  assert.equal(preview(f).valid,true);assert.equal(preview(f,9).valid,false);assert.equal(preview(f,5).valid,false);
  // A stacked object cannot supply a condition missing from the guard.
  f.l.instances[1].stateOverrides={carrying:false};f.p.assets.push(a('decoy','barrel'),a('decoy-state','barrel',{kind:'state',parentId:'decoy',name:'Carry Lantern',enabled:true,tags:['armed']}));f.l.instances.push(i('decoy1','decoy',7));
  assert.equal(preview(f).valid,false);const before=JSON.stringify(f.inventory);
  assert.throws(()=>throwObject(f.p,f.inventory,[],choice,{x:7,y:3}),/throw target group/);assert.equal(JSON.stringify(f.inventory),before);
  f.l.instances[1].stateOverrides.carrying=true;assert.equal(preview(f).valid,true);
  f.p.assets[4].tags=[];assert.equal(preview(f).valid,false);
});

test('condition rows support objects, disabled states, nested ancestor gating, missing states and exclusive siblings',()=>{
  const f=fixture();f.throwing.throwTargetAssetIds=null;f.throwing.throwTargetConditions=[{type:'objects',assetIds:['guard']},{type:'state',stateKey:'carrying',enabled:false}];
  assert.equal(preview(f).valid,false);assert.equal(preview(f,9).valid,true);
  f.throwing.throwTargetConditions[1].stateKey='missing';assert.equal(preview(f,9).valid,false);
  f.p.assets.push(a('alive','guard',{kind:'state',parentId:'guard',enabled:false}));f.p.assets[4].parentId='alive';
  f.throwing.throwTargetConditions[1]={type:'state',stateKey:'Carry Lantern',enabled:true};assert.equal(preview(f).valid,false);
  f.p.assets.at(-1).enabled=true;assert.equal(preview(f).valid,true);
  f.p.assets.at(-1).exclusiveStates=true;f.p.assets.push(a('empty','guard',{kind:'state',parentId:'alive',enabled:true}));assert.equal(preview(f).valid,false);
});

test('Stone disables only the struck lantern and starts self distraction before its state turns off',()=>{
  const f=fixture(),before=JSON.stringify(f),pview=preview(f);
  assert.deepEqual(pview.distractions[0].targetIds,['guard1']);assert.deepEqual(pview.distractions[0].destination,{x:1,y:3});
  const run=hit(f),g=guard(run.project);
  assert.equal(run.destroyed,true);assert.equal(run.inventory[0].count,1);
  assert.equal(stateEnabled(run.project,run.project.assets[4],g),false);
  assert.deepEqual(g.distraction.destination,{x:1,y:3});assert.equal(g.distraction.fixedDestination,true);
  assert.equal(run.log.find(e=>e.type==='distraction').count,1);
  assert.equal(JSON.stringify(f),before);
  assert.equal(preview({...f,p:run.project,l:run.project.levels[0],inventory:run.inventory}).valid,false);
  const next=resolveTurn(run.project,run.inventory,run.graveyard);assert.equal(guard(next.project).x,6);
});

test('thrower position is captured at impact and survives thrower movement or removal',()=>{
  for(const remove of [false,true]){
    const f=fixture();let p=hit(f).project;
    if(remove)p.levels[0].instances=p.levels[0].instances.filter(i=>i.id!=='player1');else p.levels[0].instances[0].x=10;
    for(let n=0;n<6;n++)p=resolveTurn(p).project;
    assert.equal(guard(p).x,1);assert.equal(guard(p).distraction,undefined);
  }
});

test('state-attached Distraction gates impacts, respects locks and projectile filters, and does not run each turn',()=>{
  for(const change of [f=>f.distract.enabled=false,f=>f.distract.hitAssetIds=[],f=>f.l.instances[1].locked=true]){
    const f=fixture();change(f);assert.deepEqual(preview(f).distractions[0]?.targetIds||[],[]);assert.equal(guard(hit(f).project).distraction,undefined);
  }
  const f=fixture();assert.equal(guard(resolveTurn(f.p).project).distraction,undefined);
  f.throwing.throwTargetConditions=[];f.l.instances[1].stateOverrides={carrying:false};assert.deepEqual(preview(f).distractions,[]);assert.equal(guard(hit(f).project).distraction,undefined);
});

test('self distraction retains delays, original facing, return and history even after Carry Lantern is disabled',()=>{
  const f=fixture();f.distract.returnToStart=true;f.distract.approachDelay=1;f.distract.returnDelay=1;f.p.assets[2].autoFacing=true;guard(f.p).direction=90;
  const run=hit(f),state={...run,levelId:f.l.id};let seq=createSequence(state);
  seq=nextTurn(seq,state);assert.equal(guard(seq.frames[1].project).x,7);assert.equal(guard(seq.frames[1].project).distraction.approachWait,0);
  const restored=validateSequence(JSON.parse(JSON.stringify(seq)));assert.equal(guard(previousTurn(restored,restored.frames[1]).frames[0].project).distraction.approachWait,1);
  let p=restored.frames[1].project;for(let n=0;n<12;n++)p=resolveTurn(p).project;
  assert.equal(guard(p).x,7);assert.equal(guard(p).direction,90);assert.equal(guard(p).distraction,undefined);
  const copied=copyLevel(run.project.levels[0]);assert.equal(copied.instances[1].distraction.sourceId,copied.instances[1].id);assert.equal(copied.instances[1].distraction.fixedDestination,true);
});

test('malformed conditions and distraction options are rejected, while legacy settings remain valid',()=>{
  for(const conditions of [null,{},Array(31).fill({type:'state',stateKey:'carrying',enabled:true}),[{type:'unknown'}],[{type:'state',stateKey:'',enabled:true}],[{type:'state',stateKey:'carrying',enabled:'yes'}],[{type:'objects',assetIds:null}],[{type:'tags',tagIds:['armed','armed']}]]){
    const f=fixture();f.throwing.throwTargetConditions=conditions;assert.throws(()=>validateProject(f.p));
  }
  for(const settings of [{distractTarget:'other'},{destinationMode:'other'},{distractTarget:'area'}]){const f=fixture();Object.assign(f.distract,settings);assert.throws(()=>validateProject(f.p));}
  const f=fixture();delete f.throwing.throwTargetConditions;validateProject(f.p);
  const run=hit(f);guard(run.project).distraction.fixedDestination='yes';assert.throws(()=>validateProject(run.project),/distraction destination/);
});

test('hierarchy copies remap conditions, and reusable blocks share their condition settings',()=>{
  const f=fixture();f.throwing.throwTargetConditions.push({type:'objects',assetIds:['guard']});f.throwing.throwTargetConditions[0].stateKey='carrying';f.p.assets[2].parentId='player';
  const copies=copyHierarchy(f.p,'player'),b=copies.find(a=>a.name==='range').behaviours[0];
  assert.equal(b.throwTargetConditions[0].stateKey,copies.find(a=>a.name==='Carry Lantern').id);assert.deepEqual(b.throwTargetConditions[2].assetIds,[copies.find(a=>a.name==='guard').id]);
  const block={id:'shared',name:'Throw Stone',rule:'',behaviour:{...clone(f.throwing),id:'shared-rule'}};
  let p=applyAction(f.p,{type:'behaviour.save',data:block});p=applyAction(p,{type:'behaviour.attach',data:{id:'range',definitionId:'shared',usageId:'shared-use'}});
  block.behaviour.throwTargetConditions=[{type:'state',stateKey:'carrying',enabled:false}];p=applyAction(p,{type:'behaviour.save',data:block});
  assert.deepEqual(p.assets[3].behaviours.find(b=>b.id==='shared-use').throwTargetConditions,block.behaviour.throwTargetConditions);
});

test('level exports retain and remap condition dependencies even without matching placements',()=>{
  const f=fixture();f.l.instances=[f.l.instances[0]];f.throwing.throwTargetAssetIds=null;f.throwing.throwTargetConditions=[{type:'objects',assetIds:['guard']},{type:'state',stateKey:'carrying',enabled:true},{type:'tags',tagIds:['armed']}];
  const file=exportLevels(f.p,[f.l.id]);assert.ok(file.assets.some(a=>a.id==='guard'));assert.ok(file.tags.some(t=>t.id==='armed'));
  const {project,levelIds}=buildLevelImport(newProject(),file,{levelChoices:{[f.l.id]:{mode:'copy'}}}),range=project.assets.find(a=>a.name==='range'),b=range.behaviours[0];
  assert.equal(b.throwTargetConditions[0].assetIds[0],project.assets.find(a=>a.name==='guard').id);
  assert.equal(b.throwTargetConditions[1].stateKey,project.assets.find(a=>a.name==='Carry Lantern').id);
  assert.equal(b.throwTargetConditions[2].tagIds[0],project.tags[0].id);assert.ok(project.levels.some(l=>l.id===levelIds[0]));
});

const potOrLanternGuard=()=>[
  {mode:'all',conditions:[{type:'objects',assetIds:['pot']}]},
  {mode:'all',conditions:[{type:'objects',assetIds:['guard']},{type:'state',stateKey:'carrying',enabled:true}]}
];
function groupedFixture(){
  const f=fixture();f.throwing.throwTargetGroups=potOrLanternGuard();
  f.p.assets.push(a('pot','barrel',{behaviours:[{id:'break-pot',type:'onHit',enabled:true,hitAssetIds:['stone'],action:'switchState',stateKey:'broken',stateEnabled:true}]}),a('broken','barrel',{kind:'state',parentId:'pot',enabled:false}));
  f.l.instances.push(i('pot1','pot',4));return f;
}

test('one Stone action accepts Pot OR (Guard AND Carry Lantern) with independent impact reactions',()=>{
  const f=groupedFixture();validateProject(f.p);
  assert.equal(preview(f,4).valid,true);assert.equal(preview(f,7).valid,true);assert.equal(preview(f,9).valid,false);assert.equal(preview(f,5).valid,false);
  const choice=availableThrows(f.p,f.l,f.inventory)[0],pot=throwObject(f.p,f.inventory,[],choice,{x:4,y:3});
  assert.equal(pot.inventory[0].count,1);assert.equal(stateEnabled(pot.project,pot.project.assets.find(a=>a.id==='broken'),pot.project.levels[0].instances.at(-1)),true);
  assert.equal(stateEnabled(pot.project,pot.project.assets[4],guard(pot.project)),true);assert.equal(guard(pot.project).distraction,undefined);
  const run=hit({...f,p:pot.project,l:pot.project.levels[0],inventory:pot.inventory});
  assert.equal(run.inventory.length,0);assert.equal(stateEnabled(run.project,run.project.assets[4],guard(run.project)),false);assert.equal(guard(run.project).distraction.fixedDestination,true);
});

test('group ANY supports independent conditions; empty groups and selections never match',()=>{
  const f=groupedFixture();f.throwing.throwTargetGroups=[{mode:'any',conditions:[{type:'objects',assetIds:['pot']},{type:'tags',tagIds:['armed']}]}];
  assert.equal(preview(f,4).valid,true);assert.equal(preview(f,7).valid,true);assert.equal(preview(f,9).valid,false);
  f.throwing.throwTargetGroups[0].mode='all';assert.equal(preview(f,4).valid,false);assert.equal(preview(f,7).valid,false);
  for(const groups of [[],[{mode:'all',conditions:[]}],[{mode:'any',conditions:[]}],[{mode:'any',conditions:[{type:'objects',assetIds:[]},{type:'tags',tagIds:[]}]}]]){
    f.throwing.throwTargetGroups=groups;assert.equal(preview(f,4).valid,false);assert.equal(preview(f,7).valid,false);
  }
  f.throwing.throwTargetGroups=null;assert.equal(preview(f,5).valid,true);
});

test('AND groups cannot borrow conditions from stacked objects and invalidated guards reject stale throws',()=>{
  const f=groupedFixture(),choice=availableThrows(f.p,f.l,f.inventory)[0];
  guard(f.p).stateOverrides={carrying:false};f.p.assets.push(a('decoy','barrel'),a('fake-lantern','barrel',{kind:'state',parentId:'decoy',name:'Carry Lantern',enabled:true}));f.l.instances.push(i('decoy1','decoy',7));
  assert.equal(preview(f,7).valid,false);assert.equal(preview(f,4).valid,true);
  assert.throws(()=>throwObject(f.p,f.inventory,[],choice,{x:7,y:3}),/throw target group/);assert.equal(f.inventory[0].count,2);
});

test('target groups validate their modes, structure and total size',()=>{
  for(const groups of [{},[{mode:'xor',conditions:[]}],[{mode:'all'}],[null],Array(31).fill({mode:'all',conditions:[]}),[{mode:'all',conditions:Array(30).fill({type:'objects',assetIds:['pot']})},{mode:'any',conditions:Array(21).fill({type:'objects',assetIds:['guard']})}]]){
    const f=groupedFixture();f.throwing.throwTargetGroups=groups;assert.throws(()=>validateProject(f.p));
  }
  const f=fixture();f.throwing.throwTargetConditions=Array(30).fill({type:'state',stateKey:'carrying',enabled:true});validateProject(f.p);
  f.throwing.throwTargetGroups=throwTargetGroups(f.throwing);validateProject(f.p);assert.equal(f.throwing.throwTargetGroups[0].conditions.length,31);
});

test('copying and exporting grouped throws preserve alternative groups and remap nested condition references',()=>{
  const f=groupedFixture();f.p.assets[2].parentId='player';
  const copies=copyHierarchy(f.p,'player'),b=copies.find(a=>a.name==='range').behaviours[0],conditions=b.throwTargetGroups[1].conditions;
  assert.equal(conditions[0].assetIds[0],copies.find(a=>a.name==='guard').id);assert.equal(conditions[1].stateKey,copies.find(a=>a.name==='Carry Lantern').id);
  f.l.instances=[f.l.instances[0]];const file=exportLevels(f.p,[f.l.id]);assert.ok(file.assets.some(a=>a.id==='pot'));
  const {project}=buildLevelImport(newProject(),file,{levelChoices:{[f.l.id]:{mode:'copy'}}}),imported=project.assets.find(a=>a.name==='range').behaviours[0];
  assert.equal(imported.throwTargetGroups[0].conditions[0].assetIds[0],project.assets.find(a=>a.name==='pot').id);
  assert.equal(imported.throwTargetGroups[1].conditions[1].stateKey,project.assets.find(a=>a.name==='Carry Lantern').id);
  // Omitting the Guard hierarchy must leave the alternative Pot branch usable.
  const separate=groupedFixture(),exported=exportLevels(separate.p,[separate.l.id]),target=newProject(),review=reviewLevelImport(target,exported);
  const partial=buildLevelImport(target,exported,{levelChoices:{[separate.l.id]:{mode:'copy'}},definitionIds:review.rows.filter(r=>r.id!=='guard').map(r=>r.id)});
  const level=partial.project.levels.find(l=>l.id===partial.levelIds[0]),rule=partial.project.assets.find(a=>a.name==='range').behaviours[0];
  const inventory=separate.inventory.map(s=>({...s,assetId:rule.throwAssetId,items:s.items.map(item=>({...item,assetId:rule.throwAssetId}))}));
  assert.equal(rule.enabled,true);assert.equal(availableThrows(partial.project,level,inventory).length,1);
  assert.equal(throwPreview(partial.project,inventory,availableThrows(partial.project,level,inventory)[0],{x:4,y:3}).valid,true);
});

test('grouped rules remain shared through reusable block edits and survive turn sequence export',()=>{
  const f=groupedFixture(),block={id:'group-block',name:'Stone targets',rule:'',behaviour:{...clone(f.throwing),id:'group-source'}};
  let p=applyAction(f.p,{type:'behaviour.save',data:block});p=applyAction(p,{type:'behaviour.attach',data:{id:'range',definitionId:block.id,usageId:'group-use'}});
  block.behaviour.throwTargetGroups[1].mode='any';p=applyAction(p,{type:'behaviour.save',data:block});
  assert.equal(p.assets[3].behaviours.find(b=>b.id==='group-use').throwTargetGroups[1].mode,'any');
  const state={project:f.p,inventory:f.inventory,graveyard:[],levelId:f.l.id},restored=validateSequence(JSON.parse(JSON.stringify(createSequence(state)))).frames[0];
  assert.equal(preview({...f,p:restored.project,l:restored.project.levels[0]},4).valid,true);
});
