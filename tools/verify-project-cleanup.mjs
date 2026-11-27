// Optional browser QA: node tools/verify-project-cleanup.mjs <path-to-playwright/index.mjs>
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createWorkshopServer} from '../server.mjs';
import {newProject,validateProject} from '../public/model.js';

const {chromium}=await import(process.argv[2]?pathToFileURL(path.resolve(process.argv[2])).href:'playwright');
const dataDir=await mkdtemp(path.join(tmpdir(),'cleanup-browser-'));
const output=path.resolve('outputs/project-cleanup-check');await mkdir(output,{recursive:true});
const asset=(id,extra={})=>({id,name:id,kind:'token',icon:'guard',rule:'',tags:[],range:1,color:'#b8cf96',parentId:null,...extra});
const original=newProject();
original.assets=[asset('guard'),asset('unused-object'),asset('unused-state',{kind:'state',enabled:false,parentId:'unused-object'}),asset('unused-parameter',{icon:'area'})];
original.tags=[{id:'unused-tag',name:'Unused tag',rule:'',color:'#b8cf96'}];
original.levels[0].instances=[{id:'guard-piece',assetId:'guard',x:2,y:2,rotation:0}];
await writeFile(path.join(dataDir,'cleanup.json'),JSON.stringify({project:validateProject(original),revision:0}));
const server=await createWorkshopServer({dataDir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,url=base+'/api/rooms/cleanup';
let browser;const errors=[];
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/?room=cleanup');
  await page.locator('#welcome-nickname').fill('Cleanup checker');await page.locator('.welcome-join').click();
  const saved=()=>page.waitForFunction(()=>document.querySelector('#save-state').textContent==='All changes saved');
  const state=async()=>(await(await fetch(url)).json()).project;
  const openReview=async()=>{await page.locator('#files-btn').click();await page.locator('#cleanup-project').click();};
  await saved();await openReview();
  assert.match(await page.locator('#dialog').textContent(),/4 unused library items/);
  assert.match(await page.locator('.cleanup-list').textContent(),/unused-object/);
  await page.screenshot({path:path.join(output,'review-desktop.png'),fullPage:true});
  await page.locator('#dialog .modal-footer [data-close]').click();assert.deepEqual(await state(),original);

  await openReview();await page.locator('#confirm-cleanup').click();await saved();
  let p=await state();assert.deepEqual(p.assets.map(a=>a.id),['guard']);assert.deepEqual(p.tags,[]);assert.deepEqual(p.levels,original.levels);
  await page.locator('#undo').click();await saved();assert.deepEqual(await state(),original);
  await page.locator('#redo').click();await saved();assert.deepEqual((await state()).assets.map(a=>a.id),['guard']);
  await openReview();assert.match(await page.locator('#dialog').textContent(),/Nothing to remove/);assert.equal(await page.locator('#confirm-cleanup').count(),0);
  await page.locator('#dialog .modal-footer [data-close]').click();
  await page.locator('#undo').click();await saved();

  await openReview();
  const remote=await(await fetch(url)).json();
  const response=await fetch(url+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:{type:'instance.add',data:{levelId:original.levels[0].id,instance:{id:'remote-piece',assetId:'unused-object',x:3,y:2,rotation:0}}},actionId:crypto.randomUUID(),expectedRevision:remote.revision})});
  assert.equal(response.status,200);
  await page.locator('[data-instance="remote-piece"]').waitFor();
  await page.locator('#confirm-cleanup').click();
  assert.match(await page.locator('#dialog').textContent(),/2 unused library items/);
  assert.ok((await state()).assets.some(a=>a.id==='unused-object'));
  await page.locator('#confirm-cleanup').click();await saved();
  assert.deepEqual((await state()).assets.map(a=>a.id),['guard','unused-object','unused-state']);

  await page.locator('#play-mode').click();await page.locator('#files-btn').click();assert.equal(await page.locator('#cleanup-project').isDisabled(),true);
  await page.locator('#dialog [data-close]').first().click();await page.locator('#edit-mode').click();
  await page.reload();await saved(); // Check persistence with a fresh page.
  await page.locator('#welcome-nickname').fill('Cleanup checker');await page.locator('.welcome-join').click();
  assert.deepEqual((await state()).assets.map(a=>a.id),['guard','unused-object','unused-state']);

  const latest=await(await fetch(url)).json();
  const large=structuredClone(original);
  large.assets.push(...Array.from({length:35},(_,i)=>asset(`unused-${i}`,{name:`Unused object ${i} with a long descriptive name`})));
  await fetch(url+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:{type:'project.replace',data:large},actionId:crypto.randomUUID(),expectedRevision:latest.revision})});
  await page.waitForFunction(()=>document.querySelector('#asset-count').textContent==='40');
  await page.setViewportSize({width:420,height:820});await page.locator('#theme-toggle').click();await openReview();
  await page.screenshot({path:path.join(output,'review-mobile-dark.png'),fullPage:true});
  assert.equal(await page.locator('#dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  assert.equal(await page.locator('.cleanup-list').evaluate(el=>el.scrollHeight>el.clientHeight),true);
  await page.locator('#confirm-cleanup').click();await saved();assert.deepEqual((await state()).assets.map(a=>a.id),['guard']);
  assert.deepEqual(errors,[]);
  console.log('Cleanup browser checks passed: review, cancel, remove, undo/redo, empty state, collaboration, playtest, persistence and mobile.');
}finally{
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dataDir,{recursive:true,force:true});
}
