// Optional browser QA: node tools/verify-level-transfer.mjs <path-to-playwright/index.mjs>
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createWorkshopServer} from '../server.mjs';
import {newProject,blankLevel,validateProject} from '../public/model.js';
import {exportLevels} from '../public/level-transfer.js';

const {chromium}=await import(process.argv[2]?pathToFileURL(path.resolve(process.argv[2])).href:'playwright');
const dataDir=await mkdtemp(path.join(tmpdir(),'level-transfer-browser-'));
const output=path.resolve('outputs/level-transfer-check');await mkdir(output,{recursive:true});
const asset=(id,extra={})=>({id,name:id,kind:'token',icon:'guard',rule:'',tags:[],range:1,color:'#b8cf96',parentId:null,...extra});
const piece=(id,assetId,x=2)=>({id,assetId,x,y:2,rotation:0});
const source=newProject();source.title='Source project';
source.assets=[asset('guard',{rule:'Incoming guard rules',behaviours:[{id:'spawn',type:'spawn',enabled:true,spawnAssetId:'rat',spawnCount:1}]}),asset('rat')];
source.levels=[blankLevel('courtyard','Courtyard'),blankLevel('roof','Roof')];
source.levels[0].instances=[piece('guard-piece','guard'),piece('rat-piece','rat',3)];
source.levels[0].startingInventory=[{assetId:'rat',count:2}];
source.levels[1].instances=[piece('roof-rat','rat')];
const file=exportLevels(source,source.levels.map(l=>l.id));
const target=structuredClone(source);target.title='Keep this project';target.assets=[asset('guard',{rule:'Current guard rules',behaviours:structuredClone(source.assets[0].behaviours)})];
target.levels=[blankLevel('courtyard','Courtyard'),blankLevel('untouched','Untouched')];target.levels[0].instances=[piece('original','guard')];
const original=validateProject(target);
await writeFile(path.join(dataDir,'transfer.json'),JSON.stringify({project:original,revision:0}));
const server=await createWorkshopServer({dataDir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;const errors=[];
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?room=transfer');
  await page.locator('#welcome-nickname').fill('Level checker');await page.locator('.welcome-join').click();
  const saved=()=>page.waitForFunction(()=>document.querySelector('#save-state').textContent==='All changes saved');
  await saved();
  const state=async()=>{const response=await fetch(base+'/api/rooms/transfer');return (await response.json()).project;};
  const openFile=async()=>{
    await page.locator('#files-btn').click();
    await page.locator('#import-level-file').setInputFiles({name:'test.levels.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
    await page.locator('#level-import-selection').waitFor({state:'visible'});
  };
  const review=async()=>{await openFile();await page.locator('#level-import-selection button[type="submit"]').click();await page.locator('#level-import-review').waitFor({state:'visible'});};

  await page.locator('#files-btn').click();await page.locator('#export-levels').click();
  assert.equal(await page.locator('[name="transfer-level"]:checked').count(),1);
  await page.locator('[data-select-all]').click();
  const downloading=page.waitForEvent('download');await page.locator('#level-export-form button[type="submit"]').click();
  const download=await downloading;assert.ok(download.suggestedFilename().endsWith('.levels.json'));
  const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(exported.levels.length,2);assert.equal(exported.title,undefined);

  await openFile();await page.locator('[data-select-none]').click();await page.locator('#level-import-selection button[type="submit"]').click();
  assert.match(await page.locator('#level-transfer-error').textContent(),/select at least one/i);
  await page.locator('[data-select-all]').click();await page.locator('#level-import-selection button[type="submit"]').click();
  assert.equal(await page.locator('[name="transfer-definition"]').count(),2);
  await page.locator('[data-select-none]').click();assert.equal(await page.locator('[name="transfer-definition"]:checked').count(),0);
  assert.match(await page.locator('#level-import-summary').textContent(),/Omitted: 2 placed piece/);
  await page.locator('[data-select-all]').click();assert.equal(await page.locator('[name="transfer-definition"]:checked').count(),2);
  assert.equal(await page.locator('#transfer-order').isChecked(),true);
  await page.locator('.transfer-definition details').first().locator('summary').click();
  assert.match(await page.locator('.transfer-definition details').first().textContent(),/Incoming guard rules/);
  assert.match(await page.locator('.transfer-definition details').first().textContent(),/Current guard rules/);
  await page.locator('#level-import-review button[type="submit"]').click();
  assert.equal((await state()).levels.length,2); // A required name choice blocks submission.
  await page.locator('[name="transfer-conflict"]').selectOption('copy');
  await page.locator('[name="transfer-definition"][value="rat"]').uncheck();
  assert.match(await page.locator('#level-import-summary').textContent(),/Omitted: 2 placed piece/);
  await page.screenshot({path:path.join(output,'import-review.png'),fullPage:true});
  await page.locator('#level-import-review button[type="submit"]').click();await saved();
  let project=await state();assert.equal(project.title,original.title);assert.equal(project.levels.length,4);
  assert.deepEqual(project.levels.slice(0,2),original.levels);assert.equal(project.levels[2].name,'Courtyard copy');assert.equal(project.levels[3].name,'Roof');
  assert.equal(project.levels[2].instances.length,1);assert.equal(project.levels[3].instances.length,0);
  assert.equal(project.assets[0].rule,'Current guard rules');assert.equal(project.assets.at(-1).rule,'Incoming guard rules');
  await page.locator('#undo').click();await saved();assert.deepEqual(await state(),original);
  await page.locator('#redo').click();await saved();assert.equal((await state()).levels.length,4);
  await page.locator('#undo').click();await saved();

  await review();await page.locator('[name="transfer-conflict"]').selectOption('replace:courtyard');
  await page.locator('#level-import-review button[type="submit"]').click();await saved();
  project=await state();assert.equal(project.levels.length,3);assert.equal(project.levels[0].id,'courtyard');assert.equal(project.levels[0].instances.length,2);
  assert.deepEqual(project.levels[1],original.levels[1]);
  await page.locator('#undo').click();await saved();

  // A collaborator changing the design during review must trigger a fresh review.
  await review();await page.locator('[name="transfer-conflict"]').selectOption('copy');
  const remote=await(await fetch(base+'/api/rooms/transfer')).json();
  await fetch(base+'/api/rooms/transfer/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:{type:'level.update',data:{levelId:'untouched',name:'Collaborator edit'}},actionId:crypto.randomUUID(),expectedRevision:remote.revision})});
  await page.waitForFunction(()=>document.querySelector('#level-tabs').textContent.includes('Collaborator edit'));
  await page.locator('#level-import-review button[type="submit"]').click();
  assert.match(await page.locator('#level-transfer-error').textContent(),/project changed/i);
  assert.equal((await state()).levels.length,2);
  await page.locator('#dialog [data-close]').first().click();

  // The same flow fits a narrow viewport and dark theme.
  await page.setViewportSize({width:420,height:820});await page.locator('#theme-toggle').click();
  await review();
  await page.screenshot({path:path.join(output,'import-mobile-dark.png'),fullPage:true});
  const overflow=await page.locator('#dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(overflow,false);
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed: export/download, level selection, definition review, omission summary, required name choices, copy, replace, undo/redo, concurrent edits, and narrow dark layout.');
}finally{
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dataDir,{recursive:true,force:true});
}
