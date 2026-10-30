import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { newProject, clone, validateProject } from '../public/model.js';
import { createWorkshopServer } from '../server.mjs';
import { inventoryData, inventorySheets, exportInventory } from '../inventory-export.mjs';

function fixture() {
  const p = newProject(); p.title = 'Inventory test';
  p.tags = [{ id: 'fire', name: 'Light source', rule: '=This is literal text', color: '#e0b253' }, { id: 'danger', name: 'Threat', rule: '', color: '#bb5c5c' }];
  const atom = (id, parentId = null, extra = {}) => ({ id, name: id, icon: 'torch', rule: '', tags: [], color: '#edc47c', range: 2, parentId, kind: 'token', ...extra });
  p.assets = [atom('torch', null, { exclusiveStates: true }), atom('lit', 'torch', { kind: 'state', enabled: true, tags: ['fire'] }), atom('radius', 'lit', { icon: 'area', range: 3, width: 2 }), atom('unlit', 'torch', { kind: 'state', enabled: false }), atom('rat', null, { icon: 'rat', tags: ['danger'] }), atom('unused')];
  p.levels[0].id = 'L1'; p.levels[0].tiles = { '0,0': 'node', '1,0': 'node', '1,1': 'node', '2,0': 'wall', '2,1': 'floor' }; p.levels[0].blockedLinks = ['0,0|1,0'];
  p.levels[0].instances = [{ id: 'p1', assetId: 'torch', x: 0, y: 0, rotation: 0 }, { id: 'p2', assetId: 'rat', x: 1, y: 0, rotation: 90 }, { id: 'p3', assetId: 'torch', x: 1, y: 1, rotation: 0, stateOverrides: { lit: false, unlit: true } }];
  p.levels[0].objectLinks = [{ id: 'link1', name: 'Light and rats', rule: 'Carry light past rats', color: '#aabbcc', instanceIds: ['p1', 'p2', 'p3'] }];
  p.levels[0].postIts = [{ id: 'n1', text: 'A real observation', x: 1, y: 1, color: '#aabbcc' }];
  p.levels.push({ ...clone(p.levels[0]), id: 'L2', name: 'Second level', instances: [{ id: 'p4', assetId: 'torch', x: 2, y: 1, rotation: 180, stateOverrides: { lit: false, unlit: true } }], objectLinks: [], postIts: [] });
  return validateProject(p);
}
function unpack(buffer) {
  const files = new Map(); let at = 0;
  while (buffer.readUInt32LE(at) === 0x04034b50) {
    const size = buffer.readUInt32LE(at + 18), nameSize = buffer.readUInt16LE(at + 26), extra = buffer.readUInt16LE(at + 28), start = at + 30 + nameSize + extra;
    files.set(buffer.subarray(at + 30, at + 30 + nameSize).toString(), inflateRawSync(buffer.subarray(start, start + size)).toString()); at = start + size;
  }
  assert.equal(buffer.readUInt32LE(at), 0x02014b50);
  return files;
}
const value = cell => cell?.value ?? cell;

test('inventory captures all atoms, disabled branches, per-instance recipes, and first introductions without mutation', () => {
  const p = fixture(), before = JSON.stringify(p), d = inventoryData(p);
  assert.equal(JSON.stringify(p), before);
  assert.equal(d.atoms.length, p.assets.length); assert.equal(d.placements.length, 4);
  assert.ok(d.elements.some(e => e[0] === 'GE:unused'));
  const on = d.placements.find(x => x[0] === 'p1')[2], off = d.placements.find(x => x[0] === 'p3')[2];
  assert.notEqual(on, off); assert.equal(d.placements.find(x => x[0] === 'p4')[2], off);
  assert.match(d.recipes.get(on).parameters, /3 cells × 2 wide/); assert.equal(d.recipes.get(off).parameters, '');
  assert.equal(d.recipes.get(on).tags, 'Light source'); assert.equal(d.recipes.get(off).tags, '');
  assert.match(d.recipes.get(off).states, /lit off, unlit on/);
  assert.equal(d.parts.find(p => p[1] === off && p[2] === 'radius')[4], 'No');
  assert.equal(d.introductions.filter(i => i[1] === off).length, 1); assert.equal(d.introductions.find(i => i[1] === off)[0], 'L1');
  const renamed = clone(p); renamed.assets[1].name = 'Burning';
  assert.equal(inventoryData(renamed).placements.find(x => x[0] === 'p3')[2], off);
});

test('geometry, challenge candidates, unknown scores and the full source snapshot are honest', () => {
  const p = fixture(), d = inventoryData(p, { room: 'qa', revision: 8, snapshotKind: 'playtest-current', exportedAt: '2026-10-29T12:00:00.000Z' });
  assert.deepEqual(d.levels[0].slice(3, 14), [14, 11, 3, 1, 1, 5, 1, 1, 154, 3, 1]);
  assert.equal(d.challenges.length, 1); assert.equal(d.members.length, 3); assert.equal(d.challenges[0][4], ''); assert.equal(d.challenges[0][7], '');
  assert.ok(d.atoms.every(a => a[12] === '')); assert.equal(d.levels[0][14], 'Incomplete');
  const { sheets } = inventorySheets(d), info = sheets.find(s => s.name === 'Export Info');
  const chunks = info.rows.slice(5).filter(r => r[0].startsWith('Project JSON ')).map(r => r[1]).join('');
  assert.deepEqual(JSON.parse(chunks), p); assert.equal(d.source.snapshotKind, 'playtest-current');
});

test('dynamic capacities include all placements, introductions beyond six slots, and more than three levels', () => {
  const p = fixture(); p.levels[0].instances.push(...Array.from({ length: 42 }, (_, n) => ({ id: `extra-${n}`, assetId: 'rat', x: 0, y: 0, rotation: 0 })));
  for (let n = 0; n < 7; n++) { p.assets.push({ ...p.assets[4], id: `new-${n}`, name: `New ${n}` }); p.levels[0].instances.push({ id: `new-p-${n}`, assetId: `new-${n}`, x: 0, y: 0, rotation: 0 }); }
  p.levels.push(...Array.from({ length: 3 }, (_, n) => ({ ...clone(p.levels[1]), id: `level-${n}`, name: `Level ${n}`, instances: [] })));
  const d = inventoryData(p), { sheets } = inventorySheets(d);
  assert.equal(sheets.filter(s => /^Level \d+$/.test(s.name)).length, 5);
  const level = sheets.find(s => s.name === 'Level 01');
  const listed = level.rows.slice(28).map(r => value(r[0])).filter(v => p.levels[0].instances.some(i => i.id === v));
  assert.equal(listed.length, p.levels[0].instances.length);
  const intros = d.introductions.filter(i => i[0] === 'L1'); assert.ok(intros.length > 6);
  assert.equal(sheets.find(s => s.name === 'Introductions').rows.slice(5).filter(r => value(r[0]) === 'L1').length, intros.length);
  assert.ok(value(sheets.find(s => s.name === 'Game Progression').rows[5][13]).includes('GE:new-6'));
});

test('XLSX has native styles, bounded formulas and hyperlinks; user text cannot become formulas', () => {
  const p = fixture(); p.assets[0].name = '=HYPERLINK("https://example.invalid","test")'; p.tags[0].name = '+literal'; p.levels[0].name = '<&> "Level"';
  const { sheets } = inventorySheets(inventoryData(p));
  const files = unpack(exportInventory(p));
  assert.match(files.get('xl/workbook.xml'), /fullCalcOnLoad="1"/); assert.match(files.get('xl/workbook.xml'), /definedName name="ElementIDs"/);
  assert.match(files.get('xl/styles.xml'), /style="dotted"/);
  sheets.forEach((s, i) => {
    const xml = files.get(`xl/worksheets/sheet${i + 1}.xml`);
    assert.match(xml, /<tabColor rgb=/); assert.match(xml, /state="frozen"/);
    for (const row of s.rows) for (const c of row) if (c?.formula) {
      assert.ok(c.formula.length <= 8192);
      // Ignore quoted formula strings, then verify generated parentheses.
      const code = c.formula.replace(/"(?:[^"]|"")*"/g, ''); let depth = 0;
      for (const ch of code) { if (ch === '(') depth++; if (ch === ')') depth--; assert.ok(depth >= 0, c.formula); }
      assert.equal(depth, 0, c.formula); assert.doesNotMatch(c.formula, /#REF!/);
    }
  });
  const atomsXml = files.get(`xl/worksheets/sheet${sheets.findIndex(s => s.name === 'Atoms') + 1}.xml`);
  assert.match(atomsXml, /t="inlineStr"><is><t xml:space="preserve">=HYPERLINK/);
  assert.doesNotMatch(atomsXml, /<f[^>]*>=?HYPERLINK/);
  const recipeXml = files.get(`xl/worksheets/sheet${sheets.findIndex(s => s.name === 'Gameplay Elements') + 1}.xml`);
  assert.match(recipeXml, /HYPERLINK/); assert.match(recipeXml, /t="array"/); assert.match(recipeXml, /<v>Incomplete<\/v>/);
});

test('inventory route exports saved and private snapshots without changing the room; rejects stale or invalid requests', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'workshop-inventory-')), server = await createWorkshopServer({ dataDir });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`, url = `${base}/api/rooms/qa`;
    await fetch(url);
    const replace = await fetch(`${url}/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId: 'seed', expectedRevision: 0, action: { type: 'project.replace', data: fixture() } }) });
    assert.equal(replace.status, 200);
    const post = body => fetch(`${url}/inventory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const before = await (await fetch(url)).json();
    const response = await post({ snapshotKind: 'edit-design', revision: 1 });
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /spreadsheetml/); assert.match(response.headers.get('content-disposition'), /\.xlsx/);
    assert.ok(unpack(Buffer.from(await response.arrayBuffer())).has('xl/workbook.xml'));
    const privateCopy = clone(before.project); privateCopy.levels[0].instances[0].x = 7;
    for (const snapshotKind of ['playtest-start', 'playtest-current']) {
      const privateResponse = await post({ snapshotKind, revision: 1, project: privateCopy }); assert.equal(privateResponse.status, 200);
      const xml = [...unpack(Buffer.from(await privateResponse.arrayBuffer())).values()].join('');
      assert.ok(xml.includes(snapshotKind)); assert.ok(xml.includes('&quot;x&quot;:7'));
    }
    const after = await (await fetch(url)).json();
    assert.deepEqual(after.project, before.project); assert.equal(after.revision, before.revision); assert.deepEqual(after.workshop, before.workshop);
    assert.equal((await post({ snapshotKind: 'edit-design', revision: 0 })).status, 409);
    assert.equal((await post({ snapshotKind: 'wrong', revision: 1 })).status, 400);
    assert.equal((await post({ snapshotKind: 'playtest-current', revision: 1, project: {} })).status, 400);
    assert.equal((await post({ snapshotKind: 'edit-design', revision: -1 })).status, 400);
    const origin = await fetch(`${url}/inventory`, { method: 'POST', headers: { Origin: 'https://example.invalid' }, body: '{}' }); assert.equal(origin.status, 403);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dataDir, { recursive: true, force: true }); }
});
