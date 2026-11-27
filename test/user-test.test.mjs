import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { newProject, blankLevel } from '../public/model.js';
import { validateTestFeedback } from '../public/user-test-schema.js';
import { userTestStore } from '../user-test-store.mjs';
import { createWorkshopServer } from '../server.mjs';
import { createLauncher } from '../launcher.mjs';
import { createPresence } from '../presence.mjs';

const profile = { nickname: 'Curious Rat', avatar: 'rat', color: '#3975b9' };
const feedback = { experience: 4, difficulty: 3, personalChallenge: 6, emotions: ['eureka', 'proud'], noFriction: false,
  friction: 'The exit was unclear.', thoughts: '', mode: 'userTest', usedSandbox: false, completion: 'automatic', turns: 8, elapsedSeconds: 72 };
const fixture = () => { const project = newProject(); project.levels.push(blankLevel('second', 'Next adventure')); return project; };

test('feedback requires every answer except extra thoughts and accepts an explicit no-friction answer', () => {
  assert.equal(validateTestFeedback(feedback).personalChallenge, 6);
  for (const invalid of [{ experience: 0 }, { experience: 1.5 }, { difficulty: 6 }, { personalChallenge: null },
    { emotions: [] }, { emotions: ['unknown'] }, { emotions: ['proud', 'proud'] }, { friction: '   ' },
    { thoughts: 'x'.repeat(8001) }, { mode: 'editor' }]) assert.throws(() => validateTestFeedback({ ...feedback, ...invalid }));
  assert.equal(validateTestFeedback({ ...feedback, noFriction: true, friction: '' }).friction, '');
});

test('disk progress enforces order, isolates testers, keeps the starting project, and survives restarts and retries', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'user-test-store-'));
  const project = fixture(), id = randomUUID();
  const input = { room: 'crew', id, project, revision: 7, command: 'start', body: {} };
  let store = userTestStore(directory);
  try {
    const start = await store(input);
    assert.equal(start.sourceRevision, 7);
    const body = { levelId: 'second', submissionId: randomUUID(), profile, feedback };
    await assert.rejects(store({ ...input, command: 'feedback', body }), /current level/);
    body.levelId = project.levels[0].id;
    const [saved, retry] = await Promise.all([store({ ...input, command: 'feedback', body }), store({ ...input, command: 'feedback', body })]);
    assert.equal(saved.results.length, 1); assert.deepEqual(retry, saved);
    assert.equal(saved.results[0].profile.nickname, profile.nickname);
    store = userTestStore(directory);
    project.levels.reverse();
    const resumed = await store(input);
    assert.equal(resumed.results.length, 1);
    assert.equal(resumed.project.levels[1].id, 'second');
    assert.equal((await store({ ...input, id: randomUUID() })).results.length, 0);
    await assert.rejects(store({ ...input, command: 'feedback', body: { ...body, submissionId: randomUUID() } }), /current level/);
    const final = await store({ ...input, command: 'feedback', body: { ...body, levelId: 'second', submissionId: randomUUID() } });
    assert.equal(final.results.length, 2);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'crew', id + '.json'), 'utf8')), final);
    await assert.rejects(store({ ...input, id: '../escape' }), /resume key/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a disk write failure leaves the current level uncompleted and can be retried', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'user-test-failure-'));
  const project = fixture(), id = randomUUID(), store = userTestStore(directory);
  const input = { room: 'crew', id, project, revision: 0, command: 'start', body: {} };
  try {
    await store(input);
    const temporary = path.join(directory, 'crew', id + '.json.tmp');
    await mkdir(temporary);
    const save = { ...input, command: 'feedback', body: { levelId: project.levels[0].id, submissionId: randomUUID(), profile, feedback } };
    await assert.rejects(store(save));
    assert.equal((await store(input)).results.length, 0);
    await rm(temporary, { recursive: true });
    assert.equal((await store(save)).results.length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('User Test HTTP routes save to disk, reject incomplete or out-of-order feedback, and block shared edits', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'user-test-http-'));
  const project = fixture();
  await writeFile(path.join(dataDir, 'crew.json'), JSON.stringify({ project, revision: 2 }));
  const server = await createWorkshopServer({ dataDir, userTest: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`, id = randomUUID();
  const post = (route, body, origin = base) => fetch(base + route, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const route = `/api/rooms/crew/user-test/${id}`;
  try {
    assert.equal((await (await fetch(base + '/api/config')).json()).userTest, true);
    assert.equal((await post(route + '/start', {}, 'https://elsewhere.example')).status, 403);
    assert.equal((await post(route + '/start', {})).status, 200);
    for (const target of ['/api/rooms/crew/actions', '/api/rooms/crew/save', '/api/rooms/crew/workshop', '/api/decks/x']) assert.equal((await post(target, {})).status, 403);
    const body = { levelId: project.levels[0].id, submissionId: randomUUID(), profile, feedback };
    assert.equal((await post(route + '/feedback', { ...body, feedback: { ...feedback, emotions: [] } })).status, 400);
    assert.equal((await post(route + '/feedback', { ...body, levelId: 'second' })).status, 400);
    assert.equal((await post(route + '/feedback', body)).status, 200);
    assert.equal((await (await post(route + '/start', {})).json()).results.length, 1);
    const member = await (await post('/api/rooms/crew/presence', { ...profile, id: 'tester-presence-123', levelId: 'second', play: true, cursor: { x: .5, y: .5, levelId: 'second' } })).json();
    assert.equal(member.participants[0].cursor, null);
    assert.equal(member.participants[0].levelId, 'second');
    const disk = JSON.parse(await readFile(path.join(dataDir, 'User Test Feedback', 'crew', id + '.json'), 'utf8'));
    assert.equal(disk.results[0].friction, feedback.friction);
    assert.equal((await (await fetch(base + '/api/rooms/crew')).json()).revision, 2);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dataDir, { recursive: true, force: true }); }
});

test('reactions expire without heartbeats restarting their animation, and level presence works without a cursor', () => {
  let time = 0;
  const store = createPresence({ now: () => time });
  const person = { ...profile, id: 'tester-presence-123', levelId: 'second', play: true, cursor: null, reaction: { emotion: 'eureka', eventId: randomUUID() } };
  const member = store.update(person).participants[0];
  assert.equal(member.reaction.expiresAt, 3500);
  time = 2000;
  assert.equal(store.update(person).participants[0].reaction.expiresAt, 3500);
  assert.throws(() => store.update({ ...person, reaction: { ...person.reaction, emotion: '<script>' } }));
  assert.equal(store.update({ ...person, levelId: 'third', reaction: null }).participants[0].levelId, 'third');
});

test('the dedicated launcher stays separate from the editor and reopens only its own mode', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'user-test-launcher-'));
  const workshop = await createLauncher({ port: 0, dataDir });
  let tester, gateway;
  try {
    tester = await createLauncher({ port: Number(new URL(workshop.url).port), dataDir, userTest: true, connect: async ({ target }) => {
      gateway = target;
      return { url: 'https://user-test.example', stop: () => {} };
    } });
    assert.notEqual(tester.url, workshop.url);
    const base = new URL(tester.url).origin;
    assert.equal((await (await fetch(base + '/api/config')).json()).userTest, true);
    assert.equal((await (await fetch(base + '/api/launcher')).json()).userTest, true);
    await fetch(base + '/api/launcher/online', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' });
    let sharing;
    for (let attempt = 0; attempt < 20; attempt++) {
      sharing = await (await fetch(base + '/api/launcher')).json();
      if (sharing.state === 'online') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(sharing.state, 'online');
    const headers = { Authorization: `Basic ${Buffer.from(`workshop:${sharing.password}`).toString('base64')}` };
    const publicConfig = await (await fetch(gateway + '/api/config', { headers })).json();
    assert.equal(publicConfig.userTest, true); assert.equal(publicConfig.transport, 'poll'); assert.equal(publicConfig.hostControls, false);
    assert.equal((await fetch(gateway + `/api/rooms/crew/user-test/${randomUUID()}/start`, { method: 'POST', headers: { ...headers, Origin: gateway, 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
    const reopened = await createLauncher({ port: Number(new URL(workshop.url).port), dataDir, userTest: true });
    assert.equal(reopened.reused, true); assert.equal(reopened.url, tester.url);
    await reopened.stop();
  } finally { await tester?.stop(); await workshop.stop(); await rm(dataDir, { recursive: true, force: true }); }
});
