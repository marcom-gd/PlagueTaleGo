import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject, blankLevel, validateProject, applyAction} from '../public/model.js';

function fixture() {
  const p = newProject();
  p.levels = ['first', 'second', 'third', 'fourth'].map(id => blankLevel(id, id));
  p.levels[1].tiles = {'2,2':'stairs'};
  p.levels[1].nodes = ['2,2'];
  p.levels[1].postIts = [{id:'note', text:'Keep this note', color:'#f6dfa0', space:'canvas', x:20, y:30}];
  return validateProject(p);
}
const ids = p => p.levels.map(l => l.id);
const move = (p, levelId, beforeId) => applyAction(p, {type:'level.move', data:{levelId, beforeId}});

test('levels move to the beginning, middle, and end without changing contents or input', () => {
  const original = fixture(), before = structuredClone(original);
  let p = move(original, 'third', 'first');
  assert.deepEqual(ids(p), ['third', 'first', 'second', 'fourth']);
  p = move(p, 'third', 'fourth');
  assert.deepEqual(ids(p), ['first', 'second', 'third', 'fourth']);
  p = move(p, 'second', null);
  assert.deepEqual(ids(p), ['first', 'third', 'fourth', 'second']);
  assert.deepEqual(p.levels.at(-1), original.levels[1]);
  assert.deepEqual(original, before);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
  const undone = applyAction(p, {type:'project.replace', data:original});
  assert.deepEqual(undone, original);
  assert.deepEqual(applyAction(undone, {type:'project.replace', data:p}), p);
});

test('unchanged positions and a single level are harmless; stale moves fail atomically', () => {
  const p = fixture(), before = structuredClone(p);
  assert.deepEqual(move(p, 'second', 'second'), p);
  assert.deepEqual(move(p, 'second', 'third'), p);
  assert.deepEqual(move(p, 'fourth', null), p);
  const single = newProject();
  assert.deepEqual(move(single, single.levels[0].id, null), single);
  for (const [id, beforeId] of [['missing','first'], ['first','missing'], ['first',undefined]]) {
    assert.throws(() => move(p, id, beforeId), /level no longer exists/i);
  }
  assert.deepEqual(p, before);
});

test('relative moves preserve concurrent additions and unrelated edits', () => {
  let p = fixture();
  p = applyAction(p, {type:'level.add', data:blankLevel('new', 'New level')});
  p = applyAction(p, {type:'level.update', data:{levelId:'second', name:'Renamed'}});
  p = move(p, 'fourth', 'second');
  assert.deepEqual(ids(p), ['first', 'fourth', 'second', 'third', 'new']);
  assert.equal(p.levels[2].name, 'Renamed');
});

test('HTTP level moves save, undo, redo, and survive server restarts', async () => {
  const {createWorkshopServer} = await import('../server.mjs');
  const {mkdtemp, rm} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const dataDir = await mkdtemp(join(tmpdir(), 'workshop-level-tabs-'));
  let server;
  const start = async () => {
    server = await createWorkshopServer({dataDir});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}/api/rooms/test`;
  };
  const stop = async () => {server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); server = null;};
  try {
    let url = await start(), revision = (await (await fetch(url)).json()).revision;
    const post = async (type, data, status = 200) => {
      const response = await fetch(url + '/actions', {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:{type, data}, actionId:crypto.randomUUID(), expectedRevision:revision})});
      const result = await response.json();
      assert.equal(response.status, status, JSON.stringify(result));
      if (response.ok) revision = result.revision;
      return result.project;
    };
    const original = await post('project.replace', fixture());
    const moved = await post('level.move', {levelId:'second', beforeId:null});
    assert.deepEqual(ids(moved), ['first', 'third', 'fourth', 'second']);
    assert.deepEqual(await post('project.replace', original), original);
    assert.deepEqual(await post('project.replace', moved), moved);
    await post('level.move', {levelId:'second', beforeId:'missing'}, 400);
    await stop(); url = await start();
    const restored = (await (await fetch(url)).json()).project;
    assert.deepEqual(restored, moved);
  } finally {
    if (server) await stop();
    await rm(dataDir, {recursive:true, force:true});
  }
});
