import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,validateProject,applyAction,clone} from '../public/model.js';
import {availableThrows,throwObject,throwPreview} from '../public/throw-object.js';
import {resolveTurn} from '../public/behaviours.js';
import {copyHierarchy,copyLevel} from '../public/editing.js';
import {createSequence,nextTurn,previousTurn,validateSequence} from '../public/turn-sequence.js';
import {createWorkshopServer} from '../server.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const a=(id,icon,extra={})=>({id,name:id,icon,kind:'token',parentId:null,color:'#b8cf96',tags:[],rule:'',range:5,...extra});
const i=(id,assetId,x,y=3,extra={})=>({id,assetId,x,y,rotation:0,...extra});
function fixture(){
  const p=newProject(),l=p.levels[0];l.width=12;l.height=9;l.tiles={};l.nodes=[];
  for(let y=1;y<8;y++)for(let x=1;x<11;x++)l.nodes.push(`${x},${y}`);
  const throwing={id:'throw',type:'throwObject',enabled:true,throwAssetId:'stone',requireInventory:true,destroyOnHit:true,throwTargetAssetIds:['pot']};
  const distraction={id:'distract',type:'distraction',enabled:true,hitAssetIds:['stone'],distractAssetIds:['guard'],steps:1,returnToStart:true};
  p.assets=[a('player','girl'),a('stone','rock'),a('pot','barrel'),a('guard','guard'),a('throw-range','area',{parentId:'player',range:10,behaviours:[throwing]}),a('attraction','area',{parentId:'pot',behaviours:[distraction]})];
  l.instances=[i('player1','player',1),i('pot1','pot',4),i('guard1','guard',8)];
  const inventory=[{id:'stones',assetId:'stone',count:2,items:[i('stone1','stone',0,0),i('stone2','stone',0,0)]}];
  return {p,l,inventory,throwing,distraction,choice:availableThrows(p,l,inventory)[0]};
}
const hit=f=>throwObject(f.p,f.inventory,[],f.choice,{x:4,y:3});
const guard=p=>p.levels[0].instances.find(i=>i.id==='guard1');

test('throw hover previews the actual Distraction area and eligible objects without changing the project',()=>{
  const f=fixture();f.l.instances.push(i('locked','guard',6,4,{locked:true}),i('far','guard',10,7),i('near','guard',6,5));
  const before=JSON.stringify(f),preview=throwPreview(f.p,f.inventory,f.choice,{x:4,y:3});
  assert.equal(preview.valid,true);assert.equal(preview.distractions.length,1);
  const reaction=preview.distractions[0];assert.equal(reaction.sourceId,'pot1');assert.equal(reaction.assignedId,'attraction');
  assert.ok(reaction.cells.some(([x,y])=>x===8&&y===3));assert.deepEqual(reaction.targetIds,['guard1','near']);
  const run=hit(f);assert.deepEqual(run.project.levels[0].instances.filter(i=>i.distraction).map(i=>i.id),reaction.targetIds);
  assert.equal(JSON.stringify(f),before);
  f.distraction.hitAssetIds=[];assert.deepEqual(throwPreview(f.p,f.inventory,f.choice,{x:4,y:3}).distractions,[]);
  f.distraction.hitAssetIds=['stone'];f.distraction.enabled=false;assert.deepEqual(throwPreview(f.p,f.inventory,f.choice,{x:4,y:3}).distractions,[]);
});

test('hover previews obey impact location, throw restrictions, walls and inactive Distraction states',()=>{
  const f=fixture();assert.deepEqual(throwPreview(f.p,f.inventory,f.choice,{x:5,y:3}).distractions,[]);
  f.throwing.throwTargetAssetIds=null;assert.deepEqual(throwPreview(f.p,f.inventory,f.choice,{x:5,y:3}).distractions,[]);
  f.p.assets[5].occludedByWalls=true;f.l.tiles['6,3']='wall';f.l.nodes=f.l.nodes.filter(k=>k!=='6,3');
  assert.deepEqual(throwPreview(f.p,f.inventory,f.choice,{x:4,y:3}).distractions[0].targetIds,[]);
  f.p.assets.push(a('silent','barrel',{kind:'state',parentId:'pot',enabled:false}));f.p.assets[5].parentId='silent';
  assert.deepEqual(throwPreview(f.p,f.inventory,f.choice,{x:4,y:3}).distractions,[]);
});

test('a projectile with passive blockers does not change the recipients predicted before its impact',()=>{
  const f=fixture();f.p.assets.push(a('stone-blocker','self',{parentId:'stone',behaviours:[{id:'stone-block',type:'blockNode',enabled:true,blockAssetIds:['pot'],blockScope:'movementAndEffects'}]}));
  const preview=throwPreview(f.p,f.inventory,f.choice,{x:4,y:3});assert.deepEqual(preview.distractions[0].targetIds,['guard1']);
  assert.ok(guard(hit(f).project).distraction);
});

test('approach and return delays skip exactly the configured full turns and pause normal movement',()=>{
  const f=fixture();f.distraction.approachDelay=2;f.distraction.returnDelay=3;
  f.p.assets[3].behaviours=[{id:'walk',type:'moveTo',enabled:true,steps:1,target:'current',patrolId:null}];guard(f.p).moveTarget={type:'position',x:10,y:3};
  let p=hit(f).project;
  for(const [x,remaining] of [[8,1],[8,0]]){const run=resolveTurn(p);p=run.project;assert.equal(guard(p).x,x);assert.equal(guard(p).distraction.approachWait,remaining);assert.equal(run.log.find(e=>e.type==='distraction').count,0);}
  for(const x of [7,6,5]){p=resolveTurn(p).project;assert.equal(guard(p).x,x);}
  assert.equal(guard(p).distraction.phase,'return');assert.equal(guard(p).distraction.returnWait,3);
  for(const remaining of [2,1,0]){p=resolveTurn(p).project;assert.equal(guard(p).x,5);assert.equal(guard(p).distraction.returnWait,remaining);}
  for(const x of [6,7,8]){p=resolveTurn(p).project;assert.equal(guard(p).x,x);}
  assert.equal(guard(p).distraction,undefined);p=resolveTurn(p).project;assert.equal(guard(p).x,9);
});

test('wait counters survive sequence export and Previous turn, while repeat impacts restart delays without replacing the origin',()=>{
  const f=fixture();f.distraction.approachDelay=2;f.distraction.returnDelay=2;
  const run=hit(f),state={...run,levelId:f.l.id};let sequence=nextTurn(createSequence(state),state);
  sequence=validateSequence(JSON.parse(JSON.stringify(sequence)));assert.equal(guard(sequence.frames[1].project).distraction.approachWait,1);
  const previous=previousTurn(sequence,sequence.frames[1]);assert.equal(guard(previous.frames[0].project).distraction.approachWait,2);
  let p=sequence.frames[1].project;guard(p).x=7;
  p=throwObject(p,run.inventory,[],f.choice,{x:4,y:3}).project;
  assert.equal(guard(p).distraction.approachWait,2);assert.deepEqual(guard(p).distraction.origin,{x:8,y:3});
  guard(p).distraction.phase='return';guard(p).distraction.returnWait=2;
  const returning={project:p,inventory:[],graveyard:[],levelId:f.l.id};const restored=validateSequence(JSON.parse(JSON.stringify(createSequence(returning))));
  assert.equal(guard(nextTurn(restored,restored.frames[0]).frames[1].project).distraction.returnWait,1);
});

test('return waits are ignored without Return, and losing the source cancels the waits and sends the object home',()=>{
  const f=fixture();f.distraction.returnDelay=5;f.distraction.returnToStart=false;
  let p=hit(f).project;for(let n=0;n<3;n++)p=resolveTurn(p).project;
  assert.equal(guard(p).x,5);assert.equal(guard(p).distraction,undefined);
  f.distraction.returnToStart=true;f.distraction.approachDelay=5;p=hit(f).project;p.levels[0].instances=p.levels[0].instances.filter(i=>i.id!=='pot1');
  p=resolveTurn(p).project;assert.equal(guard(p).x,8);assert.equal(guard(p).distraction,undefined);
});

test('returning objects restore original facing, including inherited facing and an explicit lack of facing',()=>{
  for(const direction of [0,90,180,270,null,undefined]){
    const f=fixture();f.p.assets[3].autoFacing=true;f.p.assets[3].direction=180;
    if(direction!==undefined)guard(f.p).direction=direction;
    let p=hit(f).project;
    const originFacing=direction===undefined?180:direction;
    assert.equal(guard(p).distraction.originFacing,originFacing);
    p=resolveTurn(p).project;assert.equal(guard(p).direction,270);
    for(let n=0;n<5;n++)p=resolveTurn(p).project;
    assert.equal(guard(p).distraction,undefined);
    if(direction===undefined)assert.equal(Object.hasOwn(guard(p),'direction'),false);
    else assert.equal(guard(p).direction,direction);
  }
});

test('repeat distractions and exported snapshots keep the first facing, which is restored only on completing the return',()=>{
  const f=fixture();f.p.assets[3].autoFacing=true;guard(f.p).direction=0;f.distraction.returnDelay=1;
  let p=resolveTurn(hit(f).project).project;assert.equal(guard(p).direction,270);
  p=hit({...f,p}).project;assert.equal(guard(p).distraction.originFacing,0);
  const state={project:p,inventory:[],graveyard:[],levelId:f.l.id};p=validateSequence(JSON.parse(JSON.stringify(createSequence(state)))).frames[0].project;
  for(let n=0;n<3;n++)p=resolveTurn(p).project;
  assert.equal(guard(p).direction,270);assert.ok(guard(p).distraction);
  for(let n=0;n<3;n++)p=resolveTurn(p).project;
  assert.equal(guard(p).distraction,undefined);assert.equal(guard(p).direction,0);
});

test('delay settings and runtime counters reject invalid values and accept older projects without wait or facing fields',()=>{
  const f=fixture();
  for(const key of ['approachDelay','returnDelay'])for(const value of [-1,101,1.5,'1',null]){const p=clone(f.p);p.assets[5].behaviours[0][key]=value;assert.throws(()=>validateProject(p),/Distraction delays/);}
  for(const key of ['approachWait','returnWait']){const p=hit(f).project;guard(p).distraction[key]=-1;assert.throws(()=>validateProject(p),/wait progress/);}
  for(const [key,value] of [['originFacing',45],['originFacingInherited','yes']]){const p=hit(f).project;guard(p).distraction[key]=value;assert.throws(()=>validateProject(p),/distraction facing/);}
  const p=hit(f).project;for(const key of ['approachWait','returnWait','originFacing','originFacingInherited'])delete guard(p).distraction[key];validateProject(p);
  assert.equal(guard(resolveTurn(p).project).x,7);
});

test('Pot-only throws reject empty, wrong, inactive and out-of-range targets without consuming inventory',()=>{
  const f=fixture(),before=JSON.stringify(f);
  assert.equal(throwPreview(f.p,f.inventory,f.choice,{x:4,y:3}).valid,true);
  for(const destination of [{x:5,y:3},{x:8,y:3},{x:0,y:0}])assert.throws(()=>throwObject(f.p,f.inventory,[],f.choice,destination),/allowed target|parameter area/);
  assert.equal(JSON.stringify(f),before);
  f.throwing.throwTargetAssetIds=[];assert.equal(throwPreview(f.p,f.inventory,f.choice,{x:4,y:3}).valid,false);
  f.throwing.throwTargetAssetIds=['pot'];f.p.assets[2].enabled=false;
  // Root tokens use state branches for activity, rather than their enabled flag.
  f.p.assets.push(a('inactive','barrel',{kind:'state',parentId:'player',enabled:false}));f.p.assets[2].parentId='inactive';
  assert.equal(throwPreview(f.p,f.inventory,f.choice,{x:4,y:3}).valid,false);
});

test('a hit consumes the Stone immediately, keeps the Pot, and activates only matching nearby unlocked Guards',()=>{
  const f=fixture();f.l.instances.push(i('far','guard',10,7),i('locked','guard',6,4,{locked:true}),i('wrong','player',5,4),i('near','guard',6,5));
  const before=JSON.stringify(f.p),run=hit(f);
  assert.equal(run.destroyed,true);assert.equal(run.instanceId,null);assert.equal(run.inventory[0].count,1);
  assert.ok(!run.project.levels[0].instances.some(i=>i.assetId==='stone'));assert.ok(run.project.levels[0].instances.some(i=>i.id==='pot1'));
  assert.deepEqual(guard(run.project).distraction.origin,{x:8,y:3});
  assert.ok(run.project.levels[0].instances.find(i=>i.id==='near').distraction);
  for(const id of ['far','locked','wrong'])assert.equal(run.project.levels[0].instances.find(i=>i.id===id).distraction,undefined);
  assert.equal(run.log.find(e=>e.type==='distraction').count,2);assert.equal(JSON.stringify(f.p),before);
});

test('destroy-on-hit is optional, never destroys a missed projectile, and target restriction is optional',()=>{
  let f=fixture();f.throwing.destroyOnHit=false;let run=hit(f);assert.equal(run.destroyed,false);assert.equal(run.instanceId,'stone1');assert.ok(guard(run.project).distraction);
  f=fixture();f.throwing.throwTargetAssetIds=null;run=throwObject(f.p,f.inventory,[],f.choice,{x:5,y:3});assert.equal(run.destroyed,false);assert.equal(guard(run.project).distraction,undefined);
  delete f.throwing.destroyOnHit;delete f.throwing.throwTargetAssetIds;validateProject(f.p);
  assert.equal(throwPreview(f.p,f.inventory,f.choice,{x:5,y:3}).valid,true);
});

test('Guards approach then return on later turns, preserve their normal targets, and resume movement only after returning',()=>{
  const f=fixture();f.p.assets[3].behaviours=[{id:'walk',type:'moveTo',enabled:true,steps:1,target:'current',patrolId:null}];
  guard(f.p).moveTarget={type:'position',x:10,y:3};guard(f.p).patrolProgress={walk:'end'};
  let p=hit(f).project;assert.equal(guard(p).x,8);
  for(const x of [7,6,5]){p=resolveTurn(p).project;assert.equal(guard(p).x,x);}
  assert.equal(guard(p).distraction.phase,'return');
  for(const x of [6,7,8]){p=resolveTurn(p).project;assert.equal(guard(p).x,x);}
  assert.equal(guard(p).distraction,undefined);assert.deepEqual(guard(p).moveTarget,{type:'position',x:10,y:3});assert.deepEqual(guard(p).patrolProgress,{walk:'end'});
  p=resolveTurn(p).project;assert.equal(guard(p).x,9);
});

test('several Guards retain independent origins and complete their round trips',()=>{
  const f=fixture();f.l.instances.push(i('guard2','guard',4,7));
  let p=hit(f).project;
  assert.deepEqual(p.levels[0].instances.find(i=>i.id==='guard2').distraction.origin,{x:4,y:7});
  for(let n=0;n<8;n++)p=resolveTurn(p).project;
  assert.equal(guard(p).x,8);assert.equal(guard(p).distraction,undefined);
  assert.equal(p.levels[0].instances.find(i=>i.id==='guard2').y,7);assert.equal(p.levels[0].instances.find(i=>i.id==='guard2').distraction,undefined);
});

test('repeated impacts redirect a distracted Guard without replacing its first return position',()=>{
  const f=fixture();let p=resolveTurn(hit(f).project).project;
  p.levels[0].instances.find(i=>i.id==='pot1').x=5;
  const run=throwObject(p,f.inventory,[],f.choice,{x:5,y:3});
  assert.deepEqual(guard(run.project).distraction.origin,{x:8,y:3});assert.deepEqual(guard(run.project).distraction.destination,{x:5,y:3});
});

test('disabled behaviours, inactive branches, wrong projectiles, empty selections and wall occlusion suppress the reaction',()=>{
  for(const modify of [f=>f.distraction.enabled=false,f=>f.distraction.hitAssetIds=[],f=>f.distraction.hitAssetIds=['player'],f=>f.distraction.distractAssetIds=[],f=>{f.p.assets[5].occludedByWalls=true;f.l.tiles['6,3']='wall';f.l.nodes=f.l.nodes.filter(k=>k!=='6,3');},f=>{f.p.assets.push(a('silent','barrel',{kind:'state',parentId:'pot',enabled:false}));f.p.assets[5].parentId='silent';}]){
    const f=fixture();modify(f);assert.equal(guard(hit(f).project).distraction,undefined);
  }
});

test('Distraction uses connected free nodes, respects blockers and locks, and waits for an occupied return position',()=>{
  const f=fixture();let p=hit(f).project;
  p.assets.push(a('barrier','self',{parentId:'player',behaviours:[{id:'block','type':'blockNode',enabled:true,blockAssetIds:['guard'],blockScope:'movement'}]}));
  p.levels[0].instances.push(i('blocking','player',7));
  p=resolveTurn(p).project;assert.notEqual(`${guard(p).x},${guard(p).y}`,'7,3');
  guard(p).locked=true;const before={x:guard(p).x,y:guard(p).y};p=resolveTurn(p).project;assert.deepEqual({x:guard(p).x,y:guard(p).y},before);
  delete guard(p).locked;guard(p).distraction.phase='return';p.levels[0].instances.push(i('occupied-origin','pot',8));
  p=resolveTurn(p).project;assert.ok(guard(p).distraction);assert.notEqual(`${guard(p).x},${guard(p).y}`,'8,3');
});

test('missing receivers send Guards home, while disabling Return leaves them at the destination',()=>{
  const f=fixture();let p=resolveTurn(hit(f).project).project;p.levels[0].instances=p.levels[0].instances.filter(i=>i.id!=='pot1');
  p=resolveTurn(p).project;assert.equal(guard(p).x,8);assert.equal(guard(p).distraction,undefined);
  f.distraction.returnToStart=false;p=hit(f).project;
  for(let n=0;n<4;n++)p=resolveTurn(p).project;
  assert.equal(guard(p).x,5);assert.equal(guard(p).distraction,undefined);
});

test('snapshots, Previous turn and copied levels preserve pending approaches and returns',()=>{
  const f=fixture(),run=hit(f),state={project:run.project,inventory:run.inventory,graveyard:[],levelId:f.l.id};
  let sequence=nextTurn(createSequence(state),state);sequence=validateSequence(JSON.parse(JSON.stringify(sequence)));
  assert.equal(guard(sequence.frames[1].project).x,7);
  const previous=previousTurn(sequence,sequence.frames[1]);assert.equal(guard(previous.frames[previous.cursor].project).x,8);
  const copied=copyLevel(run.project.levels[0]);const copiedGuard=copied.instances.find(i=>i.assetId==='guard'),copiedPot=copied.instances.find(i=>i.assetId==='pot');
  assert.equal(copiedGuard.distraction.sourceId,copiedPot.id);
  const restored=clone(run.project);restored.levels=[copied];validateProject(restored);
});

test('validation rejects malformed progress and settings, copies remap object filters and reusable blocks remain compatible',()=>{
  const f=fixture();validateProject(f.p);
  for(const value of [{destroyOnHit:'yes'},{throwTargetAssetIds:['pot','pot']}]){const p=clone(f.p);Object.assign(p.assets[4].behaviours[0],value);assert.throws(()=>validateProject(p),/Throw Object/);}
  const p=hit(f).project;guard(p).distraction.origin.x=-1;assert.throws(()=>validateProject(p),/distraction progress/);
  f.p.assets[1].parentId='player';f.p.assets[2].parentId='player';f.p.assets[3].parentId='player';
  const copied=copyHierarchy(f.p,'player'),pot=copied.find(a=>a.name==='pot'),stone=copied.find(a=>a.name==='stone'),g=copied.find(a=>a.name==='guard');
  assert.deepEqual(copied.find(a=>a.name==='throw-range').behaviours[0].throwTargetAssetIds,[pot.id]);
  assert.deepEqual(copied.find(a=>a.name==='attraction').behaviours[0].hitAssetIds,[stone.id]);assert.deepEqual(copied.find(a=>a.name==='attraction').behaviours[0].distractAssetIds,[g.id]);
  const definition={id:'shared',name:'Attract guards',rule:'',behaviour:{...f.distraction,id:'definition'}};
  let next=applyAction(f.p,{type:'behaviour.save',data:definition});next=applyAction(next,{type:'behaviour.attach',data:{id:'attraction',definitionId:'shared',usageId:'shared-use'}});
  assert.throws(()=>applyAction(next,{type:'behaviour.attach',data:{id:'guard',definitionId:'shared',usageId:'bad-use'}}),/Area behaviours/);
});

test('HTTP configuration of Throw impact options and Distraction survives a server restart',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'distraction-test-'));let server;
  t.after(async()=>{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await rm(dir,{recursive:true,force:true});});
  const start=async()=>{server=await createWorkshopServer({dataDir:dir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}/api/rooms/test`;};
  let url=await start(),room=await(await fetch(url)).json();const f=fixture();
  const send=async action=>{const response=await fetch(url+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,actionId:crypto.randomUUID(),expectedRevision:room.revision})});assert.equal(response.status,200,await response.clone().text());room=await response.json();};
  await send({type:'project.replace',data:f.p});
  await send({type:'behaviour.configure',data:{id:'attraction',behaviours:[{...f.distraction,steps:2,approachDelay:2,returnDelay:3}],ids:['throw','distract']}});
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;url=await start();room=await(await fetch(url)).json();
  assert.equal(room.project.assets[4].behaviours[0].destroyOnHit,true);assert.deepEqual(room.project.assets[4].behaviours[0].throwTargetAssetIds,['pot']);assert.equal(room.project.assets[5].behaviours[0].steps,2);
  assert.equal(room.project.assets[5].behaviours[0].approachDelay,2);assert.equal(room.project.assets[5].behaviours[0].returnDelay,3);
});
