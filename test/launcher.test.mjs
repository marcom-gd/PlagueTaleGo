import test from 'node:test';
import assert from 'node:assert/strict';
import {behaviourNames} from '../public/behaviour-schema.js';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLauncher } from '../launcher.mjs';
import { createSharing } from '../tunnel.mjs';

async function eventually(read, accept) {
  for (let i = 0; i < 100; i++) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('The session did not reach the expected state.');
}

function rawStatus(url, headers) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
  });
}

test('one launcher shares one room store while keeping host controls and credentials private', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'workshop-launcher-'));
  let target, attempts = 0, stops = 0, disconnected;
  const launcher = await createLauncher({ port: 0, dataDir, connect: async options => {
    target = options.target; disconnected = options.onExit; attempts++;
    return { url: `https://session-${attempts}.trycloudflare.com`, stop: () => { stops++; } };
  } });
  const base = new URL(launcher.url).origin;
  const status = async () => (await fetch(base + '/api/launcher')).json();
  const command = endpoint => fetch(base + '/api/launcher/' + endpoint, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' });
  try {
    assert.equal((await fetch(launcher.url)).status, 200);
    for (const asset of ['/welcome.js', '/welcome.css']) assert.equal((await fetch(base + asset)).status, 200);
    assert.equal((await status()).state, 'local');
    assert.equal((await (await fetch(base + '/api/options')).json()).canManageBackups, true);
    assert.deepEqual(await (await fetch(base + '/api/config')).json(), { urls: [], localOnly: true, hostControls: true, behaviourTypes: Object.keys(behaviourNames), levelTransferVersion: 1 });
    assert.equal(await rawStatus(base + '/api/launcher', { Host: 'attacker.example' }), 403);
    assert.equal((await fetch(base + '/api/launcher', { headers: { Origin: 'https://attacker.example' } })).status, 403);
    assert.equal((await fetch(base + '/api/launcher/online', { method: 'POST' })).status, 403);
    assert.equal((await fetch(base + '/api/launcher/online', { method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal(attempts, 0);

    assert.equal((await command('online')).status, 200);
    const session = await eventually(status, value => value.state === 'online');
    assert.equal(session.username, 'workshop');
    assert.match(session.password, /^[a-f0-9]{24}$/);
    await command('online');
    assert.equal(attempts, 1, 'starting again does not create another tunnel');
    const auth = { Authorization: `Basic ${Buffer.from(`workshop:${session.password}`).toString('base64')}` };
    assert.equal((await fetch(target + '/')).status, 401);
    assert.equal((await fetch(target + '/', { headers: { Authorization: 'Basic incorrect' } })).status, 401);
    assert.equal((await fetch(target + '/', { headers: auth })).status, 200);
    for (const route of ['/welcome', '/welcome.html', '/welcome.js', '/welcome.css', '/api/launcher', '/api/launcher/identity']) {
      const response = await fetch(target + route, { headers: { ...auth, Host: new URL(base).host, 'X-Workshop-Public': '' } });
      assert.equal(response.status, 403, `${route} must stay private even with a forged local Host`);
      assert.equal(await rawStatus(target + route, { ...auth, Host: new URL(base).host, 'X-Workshop-Public': '' }), 403);
      assert.ok(!(await response.text()).includes(session.password));
    }
    assert.equal((await fetch(target + '/api/launcher/stop', { method: 'POST', headers: { ...auth, Origin: target, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.deepEqual(await (await fetch(target + '/api/config', { headers: auth })).json(), { urls: [session.publicUrl], localOnly: false, hostControls: false, transport: 'poll', behaviourTypes: Object.keys(behaviourNames), levelTransferVersion: 1 });
    assert.deepEqual(await (await fetch(base + '/api/config')).json(), { urls: [session.publicUrl], localOnly: false, hostControls: true, behaviourTypes: Object.keys(behaviourNames), levelTransferVersion: 1 });
    assert.equal((await (await fetch(target + '/api/options', { headers: auth })).json()).canManageBackups, false);
    assert.equal((await (await fetch(target + '/api/decks', { headers: auth })).json()).canEdit, false);
    assert.equal((await fetch(target + '/api/decks/design-experiments', { method: 'PUT', headers: auth, body: '{}' })).status, 403);
    assert.equal((await fetch(target + '/api/rooms/class-a/save', { method: 'POST', headers: auth })).status, 403);
    const publicOptions = await fetch(target + '/api/options', { method: 'PUT', headers: { ...auth, Origin: target }, body: JSON.stringify({ saveFolder: 'another-folder' }) });
    assert.equal(publicOptions.status, 403);

    const roomPath = '/api/rooms/class-a';
    const initial = await (await fetch(base + roomPath)).json();
    const project = structuredClone(initial.project); project.levels[0].name = 'Shared launcher room';
    const update = await fetch(target + roomPath + '/actions', { method: 'POST', headers: { ...auth, Origin: target, 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId: 'gateway-edit', expectedRevision: initial.revision, action: { type: 'project.replace', data: project } }) });
    assert.equal(update.status, 200);
    assert.equal((await (await fetch(base + roomPath)).json()).project.levels[0].name, 'Shared launcher room');

    const repeat = await createLauncher({ port: Number(new URL(base).port), dataDir });
    assert.equal(repeat.reused, true);
    assert.equal(repeat.url, launcher.url);
    await repeat.stop();
    assert.equal((await status()).state, 'online', 'reusing does not close the existing session');

    await command('stop');
    assert.equal(stops, 1);
    assert.equal((await status()).password, '');
    assert.equal((await fetch(target + '/', { headers: auth })).status, 401);
    assert.equal((await (await fetch(base + roomPath)).json()).project.levels[0].name, 'Shared launcher room');
    await command('online');
    const restarted = await eventually(status, value => value.state === 'online');
    assert.notEqual(restarted.password, session.password);
    assert.notEqual(restarted.publicUrl, session.publicUrl);
    assert.equal((await fetch(target + '/', { headers: auth })).status, 401);
    disconnected('Test connection lost.');
    assert.equal((await status()).state, 'error');
    assert.equal((await status()).password, '');
    assert.equal((await status()).publicUrl, '');
  } finally { await launcher.stop(); await rm(dataDir, { recursive: true, force: true }); }
});

test('an unrelated service is left running and the launcher chooses another port', async () => {
  const occupied = http.createServer((req, res) => { res.writeHead(404); res.end('Other app'); });
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  const port = occupied.address().port;
  const dataDir = await mkdtemp(path.join(tmpdir(), 'workshop-launcher-port-'));
  let launcher;
  try {
    launcher = await createLauncher({ port, dataDir });
    assert.equal(Number(new URL(launcher.url).port), port + 1);
    assert.equal(launcher.reused, false);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'Other app');
    await new Promise(resolve => occupied.close(resolve));
    const repeat = await createLauncher({ port, dataDir });
    assert.equal(repeat.reused, true, 'reopen the existing fallback launcher even after the original port becomes free');
    assert.equal(repeat.url, launcher.url);
  } finally {
    await launcher?.stop();
    await new Promise(resolve => occupied.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('online setup can be cancelled and retried without keeping old credentials or stale callbacks', async () => {
  const attempts = [];
  const sharing = createSharing({ target: 'http://127.0.0.1:1234', connect: options => new Promise((resolve, reject) => {
    attempts.push({ ...options, resolve, reject });
    options.signal.addEventListener('abort', () => reject(Error('Cancelled')), { once: true });
  }) });
  sharing.start('first-password');
  sharing.start('duplicate');
  assert.equal(attempts.length, 1);
  assert.equal(sharing.snapshot().state, 'starting');
  await sharing.stop();
  assert.equal(attempts[0].signal.aborted, true);
  assert.equal(sharing.snapshot().password, '');
  sharing.start('retry-password');
  attempts[0].onExit('An obsolete exit callback');
  assert.equal(sharing.snapshot().state, 'starting');
  attempts[1].reject(Error('No internet connection'));
  await eventually(() => sharing.snapshot(), value => value.state === 'error');
  assert.equal(sharing.snapshot().message, 'No internet connection');
  assert.equal(sharing.snapshot().password, '');
  sharing.start('third-password');
  let stopped = false;
  attempts[2].resolve({ url: 'https://retry.trycloudflare.com', stop: () => { stopped = true; } });
  await eventually(() => sharing.snapshot(), value => value.state === 'online');
  assert.equal(sharing.snapshot().password, 'third-password');
  await sharing.stop();
  assert.equal(stopped, true);
  assert.equal(sharing.snapshot().state, 'local');
});
