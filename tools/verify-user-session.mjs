// Optional browser QA: node tools/verify-user-session.mjs <path-to-playwright/index.mjs>
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createWorkshopServer } from '../server.mjs';
import { newProject, blankLevel, validateProject } from '../public/model.js';

const { chromium } = await import(process.argv[2] ? pathToFileURL(path.resolve(process.argv[2])).href : 'playwright');
const dataDir = await mkdtemp(path.join(tmpdir(), 'user-test-browser-'));
const output = path.resolve('outputs/user-test-check');
await mkdir(output, { recursive: true });
const project = newProject();
project.assets = [
  { id: 'hero', name: 'Amicia', icon: 'amicia', kind: 'token', rule: '', tags: [], range: 1, color: '#b8cf96', parentId: null, canBeMovedInUserTest: true },
  { id: 'exit', name: 'Exit', icon: 'torch', kind: 'token', rule: '', tags: [], range: 1, color: '#edc47c', parentId: null,
    behaviours: [{ id: 'finish', type: 'levelComplete', enabled: true, targetAssetId: 'hero' }] }
];
project.assets[0].icon = 'guard';
project.levels = ['The first little step', 'A second helping', 'The victory picnic'].map((name, n) => {
  const level = blankLevel(`level-${n + 1}`, name);
  level.width = 8; level.height = 6;
  level.nodes = ['1,2', '2,2', '3,2'];
  level.tiles = { '1,2': 'floor', '2,2': 'floor', '3,2': 'floor' };
  level.instances = [{ id: `hero-${n + 1}`, assetId: 'hero', x: 1, y: 2, rotation: 0, note: '' }];
  if (n < 2) level.instances.push({ id: `exit-${n + 1}`, assetId: 'exit', x: 3, y: 2, rotation: 0, note: '' });
  return level;
});
const hiddenLevel=id=>({...blankLevel(id,`Hidden ${id}`),hideFromPlaytest:true});
project.levels=[hiddenLevel('intro'),project.levels[0],hiddenLevel('middle'),project.levels[1],project.levels[2],hiddenLevel('outro')];
await writeFile(path.join(dataDir, 'crew.json'), JSON.stringify({ project: validateProject(project), revision: 0 }));
await writeFile(path.join(dataDir,'hidden.json'),JSON.stringify({project:{...project,levels:[hiddenLevel('all-hidden')]},revision:0}));
const server = await createWorkshopServer({ dataDir, userTest: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  // Existing workshop preferences must not override User Test defaults.
  localStorage.setItem('workshop-projector-panels', JSON.stringify({inventory:false,parameters:false}));
  localStorage.setItem('workshop-parameter-layers', JSON.stringify(['Range']));
});
const observerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), observer = await observerContext.newPage();
for (const tab of [page, observer]) tab.on('pageerror', error => errors.push(error.message));
const visible = async (selector, tab = page) => tab.locator(selector).first().waitFor({ state: 'visible' });
async function join(tab, nickname, complete = false) {
  await visible('#welcome-dialog[open]', tab);
  await tab.locator('#welcome-nickname').fill(nickname);
  await tab.locator('.welcome-join').click();
  await visible(complete ? '#level-tabs .completed' : '#level-tabs .current', tab);
}
async function win(n) {
  await page.locator(`[data-instance="hero-${n}"]`).click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await celebrate(n === 1);
}
async function celebrate(screenshot = false) {
  await visible('#game-outcome');
  assert.equal(await page.locator('#game-outcome-title').textContent(), 'Level Complete');
  assert.equal(await page.locator('.test-feedback-dialog[open]').count(), 0);
  if(screenshot)await page.screenshot({path:path.join(output,'02-level-complete.png')});
  await page.locator('#next-level').click();
  await visible('.test-feedback-dialog[open]');
  assert.equal(await page.locator('#game-outcome').isVisible(), false);
}
async function answer({ friction = true } = {}) {
  await page.locator('.test-rating-choice:has(input[name=experience][value="5"])').click();
  await page.locator('.test-rating-choice:has(input[name=difficulty][value="3"])').click();
  await page.locator('#test-personal-challenge').focus();
  await page.keyboard.press('End');
  await page.locator('.test-emotions label:has(input[value=eureka])').click();
  if (friction) await page.locator('#test-friction').fill('I wanted a clearer hint about the exit.');
  else await page.locator('input[name=noFriction]').check();
}
try {
  await page.goto(base + '/?room=crew');
  await join(page, 'Brave Rat');
  await visible('.editor-heading #theme-toggle');
  await page.getByRole('button', {name:'Switch to dark mode',exact:true}).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.getByRole('button', {name:'Switch to light mode',exact:true}).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.getByRole('button', {name:'Switch to dark mode',exact:true}).click();
  assert.equal(await page.locator('#level-tabs [data-level]').count(),3);
  assert.equal(await page.locator('[data-level="intro"],[data-level="middle"],[data-level="outro"]').count(),0);
  assert.equal(await page.locator('#level-title').textContent(),'The first little step');
  assert.equal(await page.locator('#playtest-mode').inputValue(), 'userTest');
  assert.equal(await page.locator('#edit-mode').isVisible(), false);
  assert.equal(await page.locator('[data-exit-projector]').isVisible(), false);
  assert.equal(await page.locator('#level-tabs button:disabled').count(), 2);
  assert.equal(await page.locator('#live-cursors').isVisible(), false);
  assert.equal(await page.locator('#player-inventory').isVisible(), true);
  assert.equal(await page.locator('#tools').isVisible(), true);
  assert.equal(await page.locator('[data-projector-panel=inventory]').isChecked(), true);
  assert.equal(await page.locator('[data-projector-panel=parameters]').isChecked(), true);
  assert.equal(await page.locator('[data-parameter-layer=Light]').isChecked(), true);
  assert.equal(await page.locator('[data-parameter-layer=Vision]').isChecked(), true);
  assert.equal(await page.locator('[data-parameter-layer=Range]').isChecked(), false);
  assert.equal(await page.locator('[data-parameter-layer=Other]').isChecked(), false);
  assert.equal(await page.locator('#toggle-patrols').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#dialog[open]').count(), 0);
  await observer.goto(base + '/?room=crew');
  await join(observer, 'Friendly Duck');
  await page.locator('#level-tabs .current .level-player').nth(1).waitFor();
  await page.screenshot({ path: path.join(output, '01-board.png') });
  await win(1);
  await page.screenshot({ path: path.join(output, '03-feedback-welcome.png') });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.test-feedback-dialog').getAttribute('open'), '');
  await page.locator('.test-submit').click();
  assert.equal(await page.locator('#level-tabs .current').getAttribute('data-level'), 'level-1');
  await answer();
  await visible('.level-reaction', observer);
  await observer.waitForFunction(() => [...document.querySelectorAll('.level-reaction')].some(el => Number(getComputedStyle(el).opacity) > .7));
  console.log('Reaction visible:', await observer.locator('.level-reaction').first().evaluate(el => ({text:el.textContent, opacity:getComputedStyle(el).opacity, rect:el.getBoundingClientRect().toJSON()})));
  await observer.screenshot({ path: path.join(output, '02-reaction.png') });
  await page.screenshot({ path: path.join(output, '03-feedback.png') });
  await page.route('**/user-test/*/feedback', route => route.abort());
  await page.locator('.test-submit').click();
  await visible('.test-feedback-error');
  assert.equal(await page.locator('#level-tabs .current').getAttribute('data-level'), 'level-1');
  await page.unroute('**/user-test/*/feedback');
  await page.reload();
  await join(page, 'Brave Rat');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await visible('.test-feedback-dialog[open]');
  assert.equal(await page.locator('#test-friction').inputValue(), 'I wanted a clearer hint about the exit.');
  await page.locator('.test-submit').click();
  await visible('[data-level="level-2"].current');
  assert.equal(await page.locator('[data-level="level-1"]').isDisabled(), true);
  assert.equal(await page.locator('[data-level="level-3"]').isDisabled(), true);
  await visible('[data-level="level-2"] .level-player', observer);
  await page.locator('#playtest-mode').selectOption('sandbox');
  await page.locator('#playtest-mode').selectOption('userTest');
  await page.screenshot({ path: path.join(output, '04-progress.png') });
  await win(2); await answer({ friction: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, '05-mobile-feedback.png') });
  assert.equal(await page.locator('.test-feedback').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await page.locator('.test-submit').click();
  await visible('[data-level="level-3"].current');
  assert.equal(await page.locator('#theme-toggle').isVisible(),true);
  assert.equal(await page.locator('.editor-heading').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  await page.locator('#test-manual-finish').click();
  await celebrate();
  await answer({ friction: false });
  await page.locator('.test-submit').click();
  await visible('.test-thanks');
  await page.screenshot({ path: path.join(output, '06-thanks.png') });
  const files = await readdir(path.join(dataDir, 'User Test Feedback', 'crew'));
  const sessions = await Promise.all(files.map(file => readFile(path.join(dataDir, 'User Test Feedback', 'crew', file), 'utf8').then(JSON.parse)));
  const saved = sessions.find(s => s.results.length === 3);
  assert.ok(saved); assert.equal(saved.results[1].usedSandbox, true); assert.equal(saved.results[2].completion, 'manual');
  await page.reload(); await join(page, 'Brave Rat', true); await visible('.test-thanks');
  assert.equal(await page.locator('#level-tabs .completed').count(), 3);
  // A normal workshop still opens in Edit and retains its projector toggle.
  const workshopServer = await createWorkshopServer({ dataDir });
  await new Promise(resolve => workshopServer.listen(0, '127.0.0.1', resolve));
  try {
    const normal = await context.newPage();
    normal.on('pageerror', error => errors.push(error.message));
    await normal.goto(`http://127.0.0.1:${workshopServer.address().port}/?room=crew`);
    await visible('#welcome-dialog[open]', normal);
    await normal.locator('#welcome-nickname').fill('Workshop Designer');
    await normal.locator('.welcome-join').click();
    await visible('#edit-mode.active', normal);
    assert.equal(await normal.locator('#level-tabs [data-level]').count(),6);
    await normal.locator('#level-settings').click();
    assert.equal(await normal.locator('#level-hide-playtest').isChecked(),true);
    await normal.screenshot({path:path.join(output,'07-level-visibility.png')});
    await normal.locator('#level-hide-playtest').uncheck();
    await normal.locator('#level-form button[type=submit]').click();
    await normal.waitForFunction(()=>document.querySelector('#save-state').textContent==='All changes saved');
    const editorBase=`http://127.0.0.1:${workshopServer.address().port}`;
    assert.equal((await(await fetch(editorBase+'/api/rooms/crew')).json()).project.levels[0].hideFromPlaytest,false);
    await normal.locator('[data-level="level-1"]').click();
    await normal.locator('#level-settings').click();
    assert.equal(await normal.locator('#level-hide-playtest').isChecked(),false);
    await normal.locator('#level-hide-playtest').check();
    await normal.locator('#duplicate-level').click();
    await normal.waitForFunction(()=>document.querySelector('#save-state').textContent==='All changes saved');
    const copied=(await(await fetch(editorBase+'/api/rooms/crew')).json()).project;
    assert.equal(copied.levels.at(-1).hideFromPlaytest,true);
    assert.equal(copied.levels.find(l=>l.id==='level-1').hideFromPlaytest,undefined);
    await normal.locator('#play-mode').click();
    await visible('#play-banner', normal);
    assert.equal(await normal.locator('#playtest-mode').inputValue(), 'sandbox');
    assert.equal(await normal.locator('#level-tabs [data-level]').count(),7);
    await normal.locator('#playtest-mode').selectOption('userTest');
    assert.equal(await normal.locator('#level-tabs [data-level]').count(),7);
    await normal.locator('#edit-mode').click();
    await visible('#edit-mode.active', normal);
    await normal.close();
  } finally { workshopServer.closeAllConnections(); await new Promise(resolve => workshopServer.close(resolve)); }
  const empty=await context.newPage();empty.on('pageerror',error=>errors.push(error.message));
  await empty.goto(base+'/?room=hidden');
  await visible('#welcome-dialog[open]',empty);await empty.locator('#welcome-nickname').fill('No-level tester');await empty.locator('.welcome-join').click();
  await empty.waitForFunction(()=>document.querySelector('.test-loading p')?.textContent.includes('No levels are available'));
  assert.equal(await empty.locator('#level-tabs [data-level]').count(),0);
  assert.equal(await empty.locator('#level-title').textContent(),'No levels available');
  await empty.close();
  assert.deepEqual(errors, []);
  console.log('Browser QA passed: hidden levels, settings save/default/copy, all-hidden message, automatic and manual completion, validation, progression, two-tester presence, reactions, save failure, refresh recovery, Sandbox, mobile layout, final save.');
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
}
