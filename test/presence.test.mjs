import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createPresence } from '../presence.mjs';
import { createWorkshopServer } from '../server.mjs';

const person = { id: 'participant-one-123', nickname: 'Little Rat', avatar: 'rat', color: '#3975b9', cursor: null };
test('presence heartbeats, expiry, validation, and explicit leave do not retain ghosts', () => {
  let time = 0;
  const store = createPresence({ now: () => time, ttl: 100 });
  assert.equal(store.update(person).participants.length, 1);
  const firstRevision = store.snapshot().revision;
  time = 90; store.update(person);
  assert.equal(store.snapshot().revision, firstRevision);
  time = 150; store.prune();
  assert.equal(store.snapshot().participants.length, 1);
  time = 200; store.prune();
  assert.equal(store.snapshot().participants.length, 0);
  for (const invalid of [{ nickname: ' ' }, { avatar: 'unknown' }, { color: 'red;display:none' }, { color: ['#3975b9'] }, { cursor: { x: Infinity, y: 0, levelId: 'one' } }, { cursor: { x: 2, y: 0, levelId: 'one' } }]) assert.throws(() => store.update({ ...person, ...invalid }));
  store.update({ ...person, cursor: { x: .2, y: .5, levelId: 'one' } });
  assert.equal(store.update({ id: person.id, leave: true }).participants.length, 0);
});

test('room presence long polling wakes on moves, isolates rooms, and leaves project saves untouched', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'workshop-presence-'));
  const server = await createWorkshopServer({ dataDir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const url = base + '/api/rooms/crew/presence';
  const post = (data, origin = base) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(data) });
  try {
    assert.equal((await post(person, 'https://other.example')).status, 403);
    assert.equal((await post({ ...person, nickname: '' })).status, 400);
    const joined = await (await post(person)).json();
    const waiting = fetch(`${url}?since=${joined.revision}`, { signal: AbortSignal.timeout(3000) });
    const moved = { ...person, cursor: { x: .2, y: .5, levelId: 'courtyard' } };
    await post(moved);
    const update = await (await waiting).json();
    assert.deepEqual(update.participants[0], moved);
    assert.deepEqual((await (await fetch(base + '/api/rooms/other/presence')).json()).participants, []);
    const project = await (await fetch(base + '/api/rooms/crew')).json();
    assert.equal(project.revision, 0);
    assert.deepEqual(await readdir(dataDir), []);
    const left = await (await post({ id: person.id, leave: true })).json();
    assert.deepEqual(left.participants, []);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
});
