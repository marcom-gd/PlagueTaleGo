import test from 'node:test';
import assert from 'node:assert/strict';
import { workshopControls } from '../public/workshop-controls.js';
import { initialWorkshop, updateWorkshop } from '../public/workshop-programme.js';

test('slow saves never block step changes or start/pause clicks; queued intents save in order', async () => {
  let visible, clock = 1000, server = initialWorkshop();
  const requests = [], errors = [];
  const controls = workshopControls({ now: () => clock, changed: value => { visible = value; }, error: value => errors.push(value),
    send: (command, revision) => new Promise(resolve => requests.push({ command, revision, resolve })) });
  controls.receive({ workshop: server });
  controls.command('step.next');
  assert.equal(visible.stepId, 'demo');
  controls.command('timer.start');
  assert.equal(visible.endsAt, 601000);
  clock += 3000;
  controls.command('timer.pause');
  assert.equal(visible.endsAt, null);
  assert.equal(visible.remainingMs, 597000);
  assert.equal(requests.length, 1);
  for (let n = 0; n < 3; n++) {
    const request = requests[n];
    assert.equal(request.revision, n);
    server = updateWorkshop(server, request.command, n === 2 ? clock : 1000);
    controls.receive({ workshop: server }); // SSE may beat the POST response.
    assert.equal(visible.endsAt, null);
    request.resolve({ workshop: server });
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.deepEqual(visible, server);
  assert.deepEqual(errors, []);
});

test('rejected optimistic edits roll back to the shared state and discard dependent clicks', async () => {
  let visible, reject;
  const errors = [];
  const controls = workshopControls({ now: () => 1000, changed: value => { visible = value; }, error: value => errors.push(value),
    send: () => new Promise((resolve, fail) => { reject = fail; }) });
  controls.receive({ workshop: initialWorkshop() });
  controls.command('step.next'); controls.command('timer.start');
  const remote = updateWorkshop(initialWorkshop(), 'timer.start', 2000);
  reject(Object.assign(Error('Updated elsewhere'), { data: { workshop: remote } }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(visible, remote);
  assert.deepEqual(errors, ['Updated elsewhere']);
});
