import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'file:///C:/Users/mares/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {createWorkshopServer} from '../../server.mjs';
import {newProject,validateProject} from '../../public/model.js';

const dataDir=await mkdtemp(path.join(tmpdir(),'nested-badges-'));
const project=JSON.parse(await readFile(new URL('../../Saved Projects/plague-tale-go-class-b.json',import.meta.url),'utf8')),level=newProject().levels[0];
const lantern='d3d0f003-85af-439a-b2ad-c3e7728123c9',broken='03a840a2-c2cc-4e43-965c-6ac142a56297',lit='1b494765-a373-4e18-ae1a-15d93c824355',carrying='0ac3f910-27bd-4e8d-ba4a-eaeac224df6e';
project.levels=[level];
level.instances=['guard-one','guard-two'].map((id,n)=>({id,assetId:'6c6a4cb6-f785-4354-933e-f326cb5b1519',x:2+n*3,y:3,rotation:0,stateOverrides:{'1ff814f6-7ea8-48a3-a48e-ad6ba9d4c296':true,[carrying]:true}}));
await writeFile(path.join(dataDir,'nested.json'),JSON.stringify({project:validateProject(project),revision:0}));
const server=await createWorkshopServer({dataDir});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?room=nested`);
  await page.locator('#welcome-nickname').fill('Nested badge checker');await page.locator('.welcome-join').click();
  await page.waitForFunction(()=>document.querySelectorAll('.nested-object-badge').length===2);
  assert.equal(await page.locator('[data-nested-object="light"]').count(),0);
  const badge=page.locator(`[data-nested-object="${lantern}"]`).first();
  const geometry=await badge.evaluate(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,pointerEvents:getComputedStyle(e).pointerEvents,svgWidth:e.querySelector('svg').getBoundingClientRect().width}));
  assert.deepEqual(geometry,{width:30,height:30,pointerEvents:'none',svgWidth:22});
  await page.screenshot({path:'outputs/nested-badges-check/edit.png',fullPage:true});
  await page.locator('#play-mode').click();
  assert.equal(await page.locator('.nested-object-badge').count(),2);
  await page.locator('[data-instance="guard-one"]').click();
  const litArt=await badge.locator('svg').evaluate(e=>e.outerHTML);
  await page.locator(`[data-toggle-state="${broken}"][data-state-instance="guard-one"]`).click();
  assert.equal(await page.locator('.nested-object-badge').count(),2);
  assert.equal(await page.locator(`[data-nested-object="${broken}"],[data-nested-object="${lit}"]`).count(),0);
  assert.notEqual(await badge.locator('svg').evaluate(e=>e.outerHTML),litArt);
  assert.equal(await page.locator(`[data-toggle-state="${lit}"][data-state-instance="guard-one"]`).getAttribute('aria-checked'),'false');
  await page.screenshot({path:'outputs/nested-badges-check/broken-state.png',fullPage:true});
  await page.locator(`[data-toggle-state="${lit}"][data-state-instance="guard-one"]`).click();
  assert.equal(await badge.locator('svg').evaluate(e=>e.outerHTML),litArt);
  await page.locator(`[data-toggle-state="${carrying}"][data-state-instance="guard-one"]`).click();
  assert.equal(await page.locator('.nested-object-badge').count(),1);
  assert.match(await page.locator('.nested-object-badge').getAttribute('style'),/--x:5;/);
  await page.locator(`[data-toggle-state="${carrying}"][data-state-instance="guard-one"]`).click();
  assert.equal(await page.locator('.nested-object-badge').count(),2);
  // Moving the selected guard moves its nested badge on the same render.
  await page.locator('[data-instance="guard-one"]').click();await page.keyboard.press('ArrowRight');
  const movedStyle=await page.locator('[data-instance="guard-one"]').getAttribute('style');
  assert.match(movedStyle,/--x:3;/);
  assert.match(await page.locator('.nested-object-badge').first().getAttribute('style'),/--x:3;/);
  await page.screenshot({path:'outputs/nested-badges-check/playtest.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed: Edit and Playtest badges, rendered dimensions, state isolation, reactivation, movement, and no browser errors.');
}finally{
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  const resolved=path.resolve(dataDir);if(!resolved.startsWith(path.resolve(tmpdir())+path.sep))throw Error('Unexpected temporary path');
  await rm(resolved,{recursive:true,force:true});
}
