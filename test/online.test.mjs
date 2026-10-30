import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createWorkshopServer } from '../server.mjs';

test('online sessions protect assets and APIs, share the tunnel URL, and sync revisions through polling', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'workshop-online-'));
  const online = { password: 'session-test-password', publicUrl: 'https://example.trycloudflare.com' };
  const server = await createWorkshopServer({ dataDir, online });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Basic ${Buffer.from(`workshop:${online.password}`).toString('base64')}` };
  try {
    for (const route of ['/', '/app.js', '/api/config', '/api/rooms/class-a', '/api/rooms/class-a/events', '/api/rooms/class-a/actions', '/api/rooms/class-a/presence', '/api/rooms/class-a/workshop']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 401);
      assert.match(response.headers.get('www-authenticate'), /^Basic/);
    }
    assert.equal((await fetch(base, { headers: { Authorization: 'Basic wrong' } })).status, 401);
    const config = await (await fetch(base + '/api/config', { headers })).json();
    assert.deepEqual(config, { urls: [online.publicUrl], transport: 'poll' });
    const backupOptions = await (await fetch(base + '/api/options', { headers })).json();
    assert.equal(backupOptions.canManageBackups, false);
    const optionsUpdate = await fetch(base + '/api/options', { method: 'PUT', headers, body: JSON.stringify({ autosave: false, loadLatest: false }) });
    assert.equal(optionsUpdate.status, 200);
    const changedOptions = await optionsUpdate.json();
    assert.equal(changedOptions.autosave, false);
    assert.equal(changedOptions.loadLatest, false);
    assert.equal(changedOptions.saveFolder, backupOptions.saveFolder);
    assert.equal((await fetch(base + '/api/options', { method: 'PUT', headers, body: JSON.stringify({ autosave: true, loadLatest: true, saveFolder: 'another-folder' }) })).status, 403);
    assert.equal((await fetch(base + '/api/rooms/class-a/save', { method: 'POST', headers })).status, 403);
    assert.equal((await fetch(base, { headers })).status, 200);
    const roomUrl = base + '/api/rooms/class-a';
    const initial = await (await fetch(roomUrl + '?since=-1', { headers })).json();
    assert.ok(initial.project);
    const unchanged = await (await fetch(roomUrl + '?since=0', { headers })).json();
    assert.equal(unchanged.revision, 0);
    assert.equal(unchanged.project, undefined);
    assert.deepEqual(unchanged.workshop, initial.workshop);
    const project = structuredClone(initial.project);
    project.levels[0].name = 'Online edit';
    const response = await fetch(roomUrl + '/actions', { method: 'POST', headers: { ...headers, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId: 'online-test', expectedRevision: 0, action: { type: 'project.replace', data: project } }) });
    assert.equal(response.status, 200);
    const updated = await (await fetch(roomUrl + '?since=0', { headers })).json();
    assert.equal(updated.revision, 1);
    assert.equal(updated.project.levels[0].name, 'Online edit');
    const settled = await (await fetch(roomUrl + '?since=1', { headers })).json();
    assert.equal(settled.revision, 1);
    assert.equal(settled.project, undefined);
    const startTimer = await fetch(roomUrl + '/workshop', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'timer.start', expectedRevision: 0 }) });
    assert.equal(startTimer.status, 200);
    const ticking = await (await fetch(roomUrl + '?since=1', { headers })).json();
    assert.equal(ticking.project, undefined);
    assert.equal(ticking.workshop.revision, 1);
    assert.ok(ticking.workshop.endsAt > ticking.serverNow);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
});
