import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { workshopSteps, initialWorkshop, validateWorkshop, workshopRemaining, updateWorkshop } from '../public/workshop-programme.js';
import { createWorkshopServer } from '../server.mjs';

test('programme has two 90-minute blocks and valid progress without changing old projects', () => {
  const pause = workshopSteps.findIndex(step => step.id === 'break');
  assert.equal(workshopSteps.slice(0, pause).reduce((n, step) => n + step.minutes, 0), 90);
  assert.equal(workshopSteps.slice(pause + 1).reduce((n, step) => n + step.minutes, 0), 90);
  assert.equal(new Set(workshopSteps.map(step => step.id)).size, workshopSteps.length);
  assert.deepEqual(validateWorkshop(initialWorkshop()), initialWorkshop());
  for (const state of [null, { ...initialWorkshop(), stepId: 'missing' }, { ...initialWorkshop(), remainingMs: -1 }, { ...initialWorkshop(), endsAt: 'later' }]) assert.throws(() => validateWorkshop(state));
});

test('timer uses elapsed time, pauses, resumes, expires without advancing, and can restart', () => {
  const initial = initialWorkshop(), duration = initial.remainingMs;
  const running = updateWorkshop(initial, 'timer.start', 1000);
  assert.equal(running.endsAt, 1000 + duration);
  assert.equal(workshopRemaining(running, 12000), duration - 11000);
  const paused = updateWorkshop(running, 'timer.pause', 12000);
  assert.equal(paused.endsAt, null);
  assert.equal(workshopRemaining(paused, 90000), duration - 11000);
  const resumed = updateWorkshop(paused, 'timer.start', 90000);
  assert.equal(workshopRemaining(resumed, 91000), duration - 12000);
  assert.equal(workshopRemaining(resumed, resumed.endsAt + 5000), 0);
  assert.equal(resumed.stepId, initial.stepId);
  const restarted = updateWorkshop(resumed, 'timer.start', resumed.endsAt + 5000);
  assert.equal(restarted.remainingMs, duration);
  const reset = updateWorkshop(running, 'timer.reset', 5000);
  assert.equal(reset.endsAt, null);
  assert.equal(reset.remainingMs, duration);
  assert.equal(initial.endsAt, null);
  assert.throws(() => updateWorkshop(initial, 'timer.wish'), /Unknown workshop/);
});

test('previous and next load the allocated time without starting it or wrapping around', () => {
  const first = initialWorkshop();
  assert.throws(() => updateWorkshop(first, 'step.previous'), /no more steps/);
  const next = updateWorkshop(updateWorkshop(first, 'timer.start', 1000), 'step.next', 2000);
  assert.equal(next.stepId, workshopSteps[1].id);
  assert.equal(next.remainingMs, workshopSteps[1].minutes * 60000);
  assert.equal(next.endsAt, null);
  assert.equal(updateWorkshop(next, 'step.previous').stepId, first.stepId);
  let last = first;
  for (let n = 1; n < workshopSteps.length; n++) last = updateWorkshop(last, 'step.next');
  assert.throws(() => updateWorkshop(last, 'step.next'), /no more steps/);
});

test('shared progress reaches SSE and polling clients, survives edits and restart, and rejects stale controls', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'workshop-progress-'));
  let server, base;
  const controllers = [];
  const start = async () => { server = await createWorkshopServer({ dataDir }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; };
  const stop = async () => { controllers.splice(0).forEach(controller => controller.abort()); server?.closeAllConnections(); if (server?.listening) await new Promise(resolve => server.close(resolve)); };
  const get = async (room = 'class', suffix = '') => (await fetch(`${base}/api/rooms/${room}${suffix}`)).json();
  const post = async (command, expectedRevision, room = 'class') => {
    const response = await fetch(`${base}/api/rooms/${room}/workshop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command, expectedRevision }) });
    return { status: response.status, ...await response.json() };
  };
  try {
    await start();
    const original = await get();
    const controller = new AbortController(); controllers.push(controller);
    const events = await fetch(`${base}/api/rooms/class/events`, { signal: controller.signal });
    const reader = events.body.getReader(), decoder = new TextDecoder();
    let eventBuffer = '';
    const nextEvent = async predicate => {
      while (true) {
        let boundary;
        while ((boundary = eventBuffer.indexOf('\n\n')) >= 0) {
          const event = eventBuffer.slice(0, boundary); eventBuffer = eventBuffer.slice(boundary + 2);
          if (event.startsWith('data: ')) { const value = JSON.parse(event.slice(6)); if (predicate(value)) return value; }
        }
        const chunk = await reader.read();
        if (chunk.done) throw Error('Event stream ended before workshop update.');
        eventBuffer += decoder.decode(chunk.value, { stream: true });
      }
    };
    assert.deepEqual((await nextEvent(data => !!data.workshop)).workshop, original.workshop);
    const started = await post('timer.start', 0);
    assert.equal(started.status, 200);
    assert.ok(started.workshop.endsAt <= started.serverNow + original.workshop.remainingMs);
    assert.ok(started.workshop.endsAt > started.serverNow + original.workshop.remainingMs - 2000);
    assert.deepEqual((await nextEvent(data => data.workshop?.revision === 1)).workshop, started.workshop);
    const polled = await get('class', `?since=${original.revision}`);
    assert.equal(polled.project, undefined);
    assert.deepEqual(polled.workshop, started.workshop);
    assert.equal(polled.revision, original.revision);

    const races = await Promise.all([post('step.next', 1), post('step.next', 1)]);
    assert.deepEqual(races.map(value => value.status).sort(), [200, 409]);
    assert.equal((await get()).workshop.stepId, workshopSteps[1].id);
    const step = (await get()).workshop;
    const edit = await fetch(`${base}/api/rooms/class/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId: 'edit-after-step', action: { type: 'project.replace', data: original.project }, expectedRevision: original.revision }) });
    assert.equal(edit.status, 200);
    assert.deepEqual((await get()).workshop, step);
    assert.deepEqual((await get('another')).workshop, initialWorkshop());

    const forbidden = await fetch(`${base}/api/rooms/class/workshop`, { method: 'POST', headers: { Origin: 'https://elsewhere.example' }, body: '{}' });
    assert.equal(forbidden.status, 403);
    assert.equal((await post('not-a-command', step.revision)).status, 400);
    await stop();
    const saved = JSON.parse(await readFile(path.join(dataDir, 'class.json'), 'utf8'));
    assert.deepEqual(saved.workshop, step);
    assert.deepEqual(JSON.parse(await readFile(path.join(dataDir, 'class.workshop.json'), 'utf8')), step);
    // A project save can contain an older embedded timer; the small independent
    // progress file must remain authoritative when the server restarts.
    await writeFile(path.join(dataDir, 'class.json'), JSON.stringify({ ...saved, workshop: initialWorkshop() }));
    // An old room gains a default agenda without losing its saved project.
    await writeFile(path.join(dataDir, 'legacy.json'), JSON.stringify({ project: original.project, revision: 7 }));
    await start();
    assert.deepEqual((await get()).workshop, step);
    const legacy = await get('legacy');
    assert.equal(legacy.revision, 7);
    assert.deepEqual(legacy.workshop, initialWorkshop());
    assert.deepEqual(legacy.project, original.project);
  } finally { await stop(); await rm(dataDir, { recursive: true, force: true }); }
});
