import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backupFilename, projectBackups } from '../project-backups.mjs';
import { newProject } from '../public/model.js';
import { textScale } from '../public/ui-preferences.js';
import { createWorkshopServer } from '../server.mjs';

test('backup filenames include local date, hours and minutes; text scaling stays in range', () => {
  assert.equal(backupFilename('qa', true, new Date(2026, 9, 30, 9, 5)), 'plague-tale-go-qa-autosave_301026_0905.json');
  assert.equal(backupFilename('qa'), 'plague-tale-go-qa.json');
  assert.throws(() => backupFilename('../escape'));
  assert.equal(textScale(100), 100);
  assert.equal(textScale(20), 50);
  assert.equal(textScale(300), 200);
  assert.equal(textScale('invalid'), 100);
});

test('backups preserve importable designs, keep successive autosaves, and remember folder and toggle', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'workshop-backups-'));
  const config = { defaultSaveFolder: path.join(directory, 'Saved Projects'), preferencesFile: path.join(directory, 'options.json') };
  try {
    const backups = await projectBackups(config), project = newProject();
    assert.equal(backups.snapshot().autosave, true);
    assert.equal(backups.snapshot().loadLatest, true);
    await backups.save('qa', project, true, new Date(2026, 9, 30, 9, 5));
    await backups.save('qa', project, true, new Date(2026, 9, 30, 9, 10));
    assert.equal((await readdir(config.defaultSaveFolder)).length, 2);
    assert.deepEqual(JSON.parse(await readFile(path.join(config.defaultSaveFolder, 'plague-tale-go-qa-autosave_301026_0905.json'))), project);
    const folder = path.join(directory, 'Custom saves');
    await backups.update({ autosave: false, saveFolder: folder });
    assert.equal(await backups.save('qa', project, true), undefined);
    assert.deepEqual(await readdir(folder), []);
    await backups.save('qa', project);
    assert.deepEqual(JSON.parse(await readFile(path.join(folder, 'plague-tale-go-qa.json'))), project);
    const restored = await projectBackups(config);
    assert.equal(restored.snapshot().autosave, false);
    assert.equal(restored.snapshot().saveFolder, folder);
    await assert.rejects(backups.update({ autosave: 'yes', saveFolder: folder }));
    await assert.rejects(backups.update({ autosave: true, saveFolder: '' }));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('startup loading selects the newest valid JSON project and respects the toggle', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'workshop-latest-'));
  const folder = path.join(directory, 'Saved Projects');
  try {
    const backups = await projectBackups({ defaultSaveFolder: folder, preferencesFile: path.join(directory, 'options.json') });
    assert.equal(await backups.latest(), null, 'a missing folder starts normally');
    await mkdir(folder);
    for (const [name, time] of [['older.json', 1000], ['newer-autosave.json', 2000], ['invalid.json', 3000]]) {
      const project = newProject(); project.levels[0].name = name;
      const filename = path.join(folder, name);
      await writeFile(filename, name === 'invalid.json' ? '{}' : JSON.stringify(project));
      await utimes(filename, time, time);
    }
    await writeFile(path.join(folder, 'unfinished.json.tmp'), 'unfinished backup');
    assert.equal((await backups.latest()).levels[0].name, 'newer-autosave.json');
    await backups.update({ autosave: true, loadLatest: false, saveFolder: folder });
    assert.equal(await backups.latest(), null);
    const restored = await projectBackups({ defaultSaveFolder: folder, preferencesFile: path.join(directory, 'options.json') });
    assert.equal(restored.snapshot().loadLatest, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('save folder settings travel with the project and unavailable custom paths fall back', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'workshop-portable-'));
  try {
    const original = path.join(directory, 'original'), moved = path.join(directory, 'moved');
    await mkdir(original); await mkdir(moved);
    const optionsFile = path.join(original, 'options.json');
    const backups = await projectBackups({ defaultSaveFolder: path.join(original, 'Saved Projects'), preferencesFile: optionsFile });
    await backups.update({ autosave: false, loadLatest: false, saveFolder: path.join(original, 'Saved Projects') });
    const stored = await readFile(optionsFile, 'utf8');
    assert.equal(JSON.parse(stored).saveFolder, 'Saved Projects');
    await writeFile(path.join(moved, 'options.json'), stored);
    const config = { defaultSaveFolder: path.join(moved, 'Saved Projects'), preferencesFile: path.join(moved, 'options.json') };
    const portable = await projectBackups(config);
    assert.equal(portable.snapshot().saveFolder, config.defaultSaveFolder);
    assert.equal(portable.snapshot().lastError, null);
    await writeFile(config.preferencesFile, JSON.stringify({ autosave: false, saveFolder: path.join(directory, 'missing-user', 'backups') }));
    const fallback = await projectBackups(config);
    assert.equal(fallback.snapshot().saveFolder, config.defaultSaveFolder);
    assert.match(fallback.snapshot().lastError, /unavailable/);
    assert.equal(fallback.snapshot().loadLatest, true, 'older settings default the new option to on');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('server autosaves loaded rooms, saves manually, and protects backup settings from other origins', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'workshop-backup-api-'));
  const saveDir = path.join(directory, 'Saved Projects');
  const server = await createWorkshopServer({ dataDir: path.join(directory, 'data'), saveDir, autosaveIntervalMs: 50 });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const options = await (await fetch(base + '/api/options')).json();
    assert.equal(options.autosave, true); assert.equal(options.canManageBackups, true);
    const initial = await (await fetch(base + '/api/rooms/qa')).json();
    let files = [];
    for (let attempt = 0; attempt < 100 && !files.some(name => name.includes('-autosave_')); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20));
      files = await readdir(saveDir).catch(() => []);
    }
    const autosave = files.find(name => /-autosave_\d{6}_\d{4}\.json$/.test(name));
    assert.ok(autosave, 'the scheduled autosave wrote a timestamped backup');
    assert.deepEqual(JSON.parse(await readFile(path.join(saveDir, autosave))), initial.project);
    const manual = await fetch(base + '/api/rooms/qa/save', { method: 'POST' });
    assert.equal(manual.status, 200);
    assert.equal((await manual.json()).filename, 'plague-tale-go-qa.json');
    const update = body => fetch(base + '/api/options', { method: 'PUT', body: JSON.stringify(body) });
    const folder = path.join(directory, 'Another folder');
    assert.equal((await update({ autosave: false, saveFolder: folder })).status, 200);
    assert.equal((await update({ autosave: true, saveFolder: '' })).status, 400);
    for (const route of ['/api/options', '/api/rooms/qa/save']) {
      const response = await fetch(base + route, { method: route.endsWith('options') ? 'PUT' : 'POST', headers: { Origin: 'https://other.example' }, body: '{}' });
      assert.equal(response.status, 403);
    }
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.deepEqual(await readdir(folder), []);
    const latest = newProject(); latest.levels[0].name = 'Latest saved design';
    await writeFile(path.join(folder, 'my-project.json'), JSON.stringify(latest));
    assert.equal((await update({ autosave: false, loadLatest: true, saveFolder: folder })).status, 200);
    const launched = await (await fetch(base + '/api/rooms/new-launch')).json();
    assert.equal(launched.project.levels[0].name, 'Latest saved design');
    latest.levels[0].name = 'A newer design';
    await writeFile(path.join(folder, 'my-project.json'), JSON.stringify(latest));
    const revisited = await (await fetch(base + '/api/rooms/new-launch')).json();
    assert.equal(revisited.project.levels[0].name, 'Latest saved design', 'existing rooms are preserved');
    assert.equal((await update({ autosave: false, loadLatest: false, saveFolder: folder })).status, 200);
    const empty = await (await fetch(base + '/api/rooms/no-startup-load')).json();
    assert.equal(empty.project.levels[0].name, newProject().levels[0].name);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});
