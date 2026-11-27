// Optional browser QA: node tools/verify-spotlight-distraction.mjs <path-to-playwright/index.mjs>
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createWorkshopServer} from '../server.mjs';
import {newProject,validateProject} from '../public/model.js';

const {chromium}=await import(process.argv[2]?pathToFileURL(path.resolve(process.argv[2])).href:'playwright');
const dataDir=await mkdtemp(path.join(tmpdir(),'spotlight-browser-')),output=path.resolve('outputs/spotlight-distraction-check');await mkdir(output,{recursive:true});
const a=(id,icon,extra={})=>({id,name:id,kind:'token',icon,rule:'',tags:[],range:4,color:'#b8cf96',parentId:null,...extra});
const p=newProject(),l=p.levels[0];l.width=12;l.height=10;l.tiles={};l.nodes=[];
for(let y=0;y<10;y++)for(let x=0;x<12;x++)l.nodes.push(`${x},${y}`);
p.assets=[a('spotlight','lantern',{exclusiveStates:true}),a('old','lantern',{kind:'state',parentId:'spotlight',enabled:true}),a('new','lantern',{kind:'state',parentId:'spotlight',enabled:false}),a('old-beam','rectangle',{parentId:'old',width:3}),a('new-beam','rectangle',{parentId:'new',width:3,rotation:90}),a('awareness','area',{parentId:'spotlight',range:5}),a('guard','guard'),a('player','girl'),a('switch-range','area',{parentId:'player',behaviours:[{id:'use-switch',type:'useEffect',enabled:true,usableMode:'selected',usableAssetIds:['spotlight'],useTarget:'used',action:'switchState',stateKey:'new',stateEnabled:true}]})];
l.instances=[{id:'lamp',assetId:'spotlight',x:4,y:5,rotation:0},{id:'entering',assetId:'guard',x:7,y:5,rotation:0},{id:'both',assetId:'guard',x:5,y:4,rotation:0},{id:'player1',assetId:'player',x:3,y:5,rotation:0}];
await writeFile(path.join(dataDir,'spotlight.json'),JSON.stringify({project:validateProject(p),revision:0}));
const server=await createWorkshopServer({dataDir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,errors=[];let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  const saved=()=>page.waitForFunction(()=>document.querySelector('#save-state').textContent==='All changes saved');
  const state=async()=>(await(await fetch(base+'/api/rooms/spotlight')).json()).project;
  const join=async()=>{await page.locator('#welcome-nickname').fill('Spotlight checker');await page.locator('.welcome-join').click();await saved();};
  await page.goto(base+'/?room=spotlight');await join();
  await page.locator('[data-asset="spotlight"]').first().click();await page.locator('[data-inspect-child="awareness"]').first().click();await page.locator('#edit-behaviours').click();
  await page.locator('#add-behaviour').click();await page.locator('[data-b="type"]').selectOption('distraction');
  await page.locator('[data-b="distractionTrigger"]').selectOption('stateChange');
  await page.locator('[name="distraction-beam"][value="old-beam"]').check();await page.locator('[name="distraction-beam"][value="new-beam"]').check();await page.locator('[name="distraction-target"][value="guard"]').check();
  await page.locator('[data-b="approachDelay"]').fill('1');await page.locator('[data-b="returnDelay"]').fill('2');
  // Rerendering through either trigger keeps the configured selections and waits.
  await page.locator('[data-b="distractionTrigger"]').selectOption('impact');await page.locator('[data-b="distractionTrigger"]').selectOption('stateChange');
  assert.equal(await page.locator('[name="distraction-beam"][value="new-beam"]').isChecked(),true);
  assert.equal(await page.locator('[name="distraction-target"][value="guard"]').isChecked(),true);
  await page.locator('[data-b="approachDelay"]').fill('0');await page.locator('#behaviour-form').screenshot({path:path.join(output,'state-change-editor.png')});
  await page.locator('#behaviour-form button[type="submit"]').click();await saved();
  const b=(await state()).assets.find(a=>a.id==='awareness').behaviours[0];assert.equal(b.distractionTrigger,'stateChange');assert.deepEqual(b.beamParameterIds,['old-beam','new-beam']);assert.equal(b.returnDelay,2);
  await page.reload();await join();await page.locator('#play-mode').click();
  await page.locator('[data-use-object="lamp"]').click();
  await page.locator('#next-turn').click();
  assert.match(await page.locator('[data-instance="entering"]').getAttribute('style'),/--x:6(?:;|\b)/);
  assert.match(await page.locator('[data-instance="both"]').getAttribute('style'),/--x:5(?:;|\b)/);
  await page.screenshot({path:path.join(output,'newly-caught-guard.png'),fullPage:true});
  await page.locator('#clear-turns').click();await page.locator('[data-instance="lamp"]').click();
  await page.locator('[data-toggle-state="new"][data-state-instance="lamp"]').click();await page.locator('#next-turn').click();
  assert.match(await page.locator('[data-instance="entering"]').getAttribute('style'),/--x:6(?:;|\b)/);
  assert.match(await page.locator('[data-instance="both"]').getAttribute('style'),/--x:5(?:;|\b)/);
  assert.equal((await state()).levels[0].instances.find(i=>i.id==='lamp').stateOverrides,undefined);assert.deepEqual(errors,[]);
  console.log('Spotlight browser checks passed: trigger switching, beam/guard selection, delays, save/reload, Use and inspector state switches, newly caught guard movement, and inside-both guard staying calm.');
}finally{
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  const resolved=path.resolve(dataDir);if(!resolved.startsWith(path.resolve(tmpdir())+path.sep))throw Error('Unexpected temporary directory');await rm(resolved,{recursive:true,force:true});
}
