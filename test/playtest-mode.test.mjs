import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, applyAction, validateProject, clone } from '../public/model.js';
import { canMoveInPlaytest, checkPlaytestMovement } from '../public/playtest-mode.js';
import { collectItems, releaseItem, createPlaytestState } from '../public/player-inventory.js';
import { createSequence, nextTurn } from '../public/turn-sequence.js';
import { copyHierarchy, copyLevel } from '../public/editing.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createWorkshopServer } from '../server.mjs';
import { uid, paintLevelTiles } from '../public/model.js';

function fixture() {
  const p = newProject(), l = p.levels[0];
  p.assets = ['Amicia', 'Guard'].map((name, n) => ({id:name, name, icon:n?'guard':'girl', rule:'', tags:[], color:'#b8cf96', range:1, parentId:null}));
  l.instances = p.assets.map((a,n) => ({id:`piece-${n}`, assetId:a.id, x:2+n*3, y:2, rotation:0}));
  l.nodes = ['2,2','3,2','4,2','5,2','6,2','2,3','3,3','5,3'];
  return {p,l};
}
const enable = p => applyAction(p, {type:'asset.update', data:{id:'Amicia', canBeMovedInUserTest:true}});

test('legacy and new objects default off; opt-in persists through saving and copies', () => {
  let {p,l} = fixture();
  assert.equal(canMoveInPlaytest(p,l.instances[0],'userTest'),false);
  assert.equal(canMoveInPlaytest(p,l.instances[0],'sandbox'),true);
  p = enable(p);
  assert.equal(canMoveInPlaytest(validateProject(JSON.parse(JSON.stringify(p))),l.instances[0],'userTest'),true);
  assert.equal(canMoveInPlaytest(p,l.instances[1],'userTest'),false);
  assert.equal(copyHierarchy(p,'Amicia')[0].canBeMovedInUserTest,true);
  assert.equal(canMoveInPlaytest(p,copyLevel(l).instances[0],'userTest'),true);
  assert.throws(() => applyAction(p,{type:'asset.update',data:{id:'Guard',canBeMovedInUserTest:'true'}}),/user test movement/);
});

test('single moves and rotations respect mode; notes and state inspection remain available', () => {
  const {p:input,l} = fixture(), p = enable(input), original = clone(p);
  for (const data of [{x:3},{y:3},{rotation:90},{direction:90}]) {
    const blocked = applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'piece-1',...data}});
    assert.throws(() => checkPlaytestMovement(p,blocked,'userTest'),/Guard cannot be moved/);
    assert.doesNotThrow(() => checkPlaytestMovement(p,blocked,'sandbox'));
    const allowed = applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'piece-0',...data}});
    assert.doesNotThrow(() => checkPlaytestMovement(p,allowed,'userTest'));
  }
  const note = applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'piece-1',note:'Observed'}});
  assert.doesNotThrow(() => checkPlaytestMovement(p,note,'userTest'));
  assert.deepEqual(p,original);
});

test('User Test allows only one connected node step; Sandbox allows distant and off-node moves', () => {
  const {p:input,l} = fixture(), p = enable(input), original = clone(p);
  for (const [position,allowed] of [
    [{x:3,y:2},true],
    [{x:2,y:3},true],
    [{x:4,y:2},false],
    [{x:3,y:3},false],
    [{x:1,y:2},false]
  ]) {
    const next = applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'piece-0',...position}});
    if (allowed) assert.doesNotThrow(() => checkPlaytestMovement(p,next,'userTest'));
    else assert.throws(() => checkPlaytestMovement(p,next,'userTest'),/adjacent connected node/);
    assert.doesNotThrow(() => checkPlaytestMovement(p,next,'sandbox'));
  }
  const unchanged = applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'piece-0',x:2,y:2}});
  assert.doesNotThrow(() => checkPlaytestMovement(p,unchanged,'userTest'));
  assert.deepEqual(p,original);
});

test('User Test respects removed links, floor connections, and the starting node', () => {
  const {p:input,l} = fixture(), p = enable(input);
  const move = () => applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'piece-0',x:3,y:2}});
  p.levels[0].blockedLinks = ['2,2|3,2'];
  assert.throws(() => checkPlaytestMovement(p,move(),'userTest'),/adjacent connected node/);
  p.levels[0].blockedLinks = [];
  p.levels[0].tiles['3,2'] = 'floor-elevated';
  assert.throws(() => checkPlaytestMovement(p,move(),'userTest'),/adjacent connected node/);
  p.levels[0].tiles['3,2'] = 'stairs';
  assert.doesNotThrow(() => checkPlaytestMovement(p,move(),'userTest'));
  p.levels[0].nodes = p.levels[0].nodes.filter(key=>key!=='2,2');
  assert.throws(() => checkPlaytestMovement(p,move(),'userTest'),/adjacent connected node/);
});

test('User Test checks every group member before accepting a move', () => {
  const {p:input,l} = fixture(), p = enable(input);
  p.assets[1].canBeMovedInUserTest = true;
  const move = dx => applyAction(p,{type:'instance.batch',data:{levelId:l.id,updates:l.instances.map(i=>({id:i.id,x:i.x+dx}))}});
  assert.doesNotThrow(() => checkPlaytestMovement(p,move(1),'userTest'));
  assert.throws(() => checkPlaytestMovement(p,move(2),'userTest'),/adjacent connected node/);
  p.levels[0].blockedLinks = ['5,2|6,2'];
  assert.throws(() => checkPlaytestMovement(p,move(1),'userTest'),/adjacent connected node/);
  assert.deepEqual(p.levels[0].instances.map(i=>i.x),[2,5]);
});

test('mixed group moves fail atomically and Sandbox restores unrestricted movement', () => {
  const {p:input,l} = fixture(), p = enable(input);
  const moved = applyAction(p,{type:'instance.batch',data:{levelId:l.id,updates:l.instances.map(i=>({id:i.id,y:i.y+1}))}});
  assert.throws(() => checkPlaytestMovement(p,moved,'userTest'),/Guard/);
  assert.doesNotThrow(() => checkPlaytestMovement(p,moved,'sandbox'));
  assert.deepEqual(p.levels[0].instances.map(i=>i.y),[2,2]);
});

test('inventory, graveyard, removal and new placements cannot move unmarked objects', () => {
  const {p:input,l} = fixture(), p = enable(input);
  for (const [id,allowed] of [['piece-0',true],['piece-1',false]]) {
    const collected = collectItems(p,[],l.id,{type:'instance',id,levelId:l.id});
    const dropped = releaseItem(collected.project,collected.inventory,l.id,collected.inventory[0].id,{x:4,y:4});
    for (const [before,after] of [[p,collected.project],[collected.project,dropped.project]]) {
      if (allowed) assert.doesNotThrow(() => checkPlaytestMovement(before,after,'userTest'));
      else assert.throws(() => checkPlaytestMovement(before,after,'userTest'),/Guard/);
      assert.doesNotThrow(() => checkPlaytestMovement(before,after,'sandbox'));
    }
  }
  const added = applyAction(p,{type:'instance.add',data:{levelId:l.id,instance:{...l.instances[1],id:'copy',x:7}}});
  assert.throws(() => checkPlaytestMovement(p,added,'userTest'),/Guard/);
});

test('automated turns still move unmarked guards and reset preserves original permissions', () => {
  const {p:input,l} = fixture(), p = enable(input);
  p.assets[1].behaviours=[{id:'walk',type:'moveTo',enabled:true,steps:1,target:'current',patrolId:null}];
  p.levels[0].nodes=['5,2','6,2','7,2'];
  p.levels[0].instances[1].moveTarget={type:'position',x:7,y:2};
  const initial=createPlaytestState(p,l.id), sequence=createSequence(initial);
  const next=nextTurn(sequence,initial), guard=next.frames[1].project.levels[0].instances[1];
  assert.equal(guard.x,6);
  assert.equal(canMoveInPlaytest(next.frames[1].project,guard,'userTest'),false);
  assert.equal(next.frames[0].project.levels[0].instances[1].x,5);
  assert.equal(next.frames[0].project.assets[0].canBeMovedInUserTest,true);
  assert.equal(p.levels[0].instances[1].x,5);
});

test('the example enables Amicia while keeping the other objects off', async () => {
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const builder=source.slice(source.indexOf('function example() {'),source.indexOf('function loadExample() {'));
  const p=Function('newProject','uid','paintLevelTiles','validateProject',`${builder}; return example();`)(newProject,uid,paintLevelTiles,validateProject);
  const amicia=p.levels[0].instances.find(i=>p.assets.find(a=>a.id===i.assetId)?.name==='Amicia');
  assert.equal(canMoveInPlaytest(p,amicia,'userTest'),true);
  assert.equal(p.assets.filter(a=>a.canBeMovedInUserTest).length,1);
});

test('HTTP definition updates save the permission and retain it across server restarts', async t => {
  const dir=await mkdtemp(path.join(tmpdir(),'playtest-mode-'));
  let server;
  t.after(async()=>{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await rm(dir,{recursive:true,force:true});});
  const start=async()=>{server=await createWorkshopServer({dataDir:dir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}/api/rooms/movement`;};
  let url=await start(), room=await(await fetch(url)).json();
  const send=async action=>{const response=await fetch(url+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,actionId:uid(),expectedRevision:room.revision})});assert.equal(response.status,200);room=await response.json();};
  await send({type:'project.replace',data:fixture().p});
  await send({type:'asset.update',data:{id:'Amicia',canBeMovedInUserTest:true}});
  assert.equal(room.project.assets[0].canBeMovedInUserTest,true);
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;
  url=await start();room=await(await fetch(url)).json();
  assert.equal(room.project.assets[0].canBeMovedInUserTest,true);
  await send({type:'asset.update',data:{id:'Amicia',canBeMovedInUserTest:false}});
  assert.equal(canMoveInPlaytest(room.project,room.project.levels[0].instances[0],'userTest'),false);
});
