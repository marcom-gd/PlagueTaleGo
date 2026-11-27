// Optional browser QA: node tools/verify-entity-effects.mjs <path-to-playwright/index.mjs>
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createWorkshopServer} from '../server.mjs';
import {newProject,validateProject} from '../public/model.js';

const {chromium}=await import(process.argv[2]?pathToFileURL(path.resolve(process.argv[2])).href:'playwright');
const dataDir=await mkdtemp(path.join(tmpdir(),'entity-effects-')),output=path.resolve('outputs/entity-effects-check');await mkdir(output,{recursive:true});
const a=(id,icon,extra={})=>({id,name:id,kind:'token',icon,rule:'',tags:[],range:1,color:'#b8cf96',parentId:null,...extra});
const b=(id,type,extra={})=>({id,type,enabled:true,...extra});
const i=(id,assetId,x,y)=>({id,assetId,x,y,rotation:0});
const p=newProject(),l=p.levels[0];l.width=12;l.height=8;l.nodes=Array.from({length:11},(_,x)=>`${x},3`);l.tiles={};
p.assets=[a('rats','rat'),a('spread','area',{parentId:'rats',behaviours:[b('expand','expand',{allowStacking:false})]}),
  a('collect','key',{behaviours:[b('inventory','addToTray',{tray:'inventory'})]}),
  a('retire','guard',{behaviours:[b('graveyard','addToTray',{tray:'graveyard'})]}),a('manual','lantern'),
  a('operator','girl',{behaviours:[b('advance','advanceOnEvent',{events:['use']})]}),a('use-area','area',{parentId:'operator',behaviours:[b('use','useEffect',{usableAssetIds:['manual'],useTarget:'used',trigger:b('bury','addToTray',{tray:'graveyard'})})]})];
l.instances=[i('origin','rats',6,3),i('collect1','collect',8,4),i('retire1','retire',8,5),i('manual1','manual',4,5),i('actor','operator',5,5)];
await writeFile(path.join(dataDir,'effects.json'),JSON.stringify({project:validateProject(p),revision:0}));
const server=await createWorkshopServer({dataDir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,errors=[];let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'no-preference'});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?room=effects');await page.locator('#welcome-nickname').fill('Effects checker');await page.locator('.welcome-join').click();
  await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='All changes saved');await page.locator('#play-mode').click();
  // Inspect paused animations before they can finish; this also makes screenshots repeatable.
  const pauseFlights=()=>page.evaluate(()=>{
    const flights=[...document.querySelectorAll('.entity-flight')];
    flights.forEach(el=>el.getAnimations().forEach(a=>{a.pause();a.currentTime=220;}));
    return flights.map(el=>({type:el.dataset.effect,left:parseFloat(el.style.left),top:parseFloat(el.style.top),frames:el.getAnimations()[0].effect.getKeyframes()}));
  });
  const finish=async()=>{await page.evaluate(()=>document.querySelectorAll('.entity-flight').forEach(el=>el.getAnimations().forEach(a=>a.finish())));await page.waitForFunction(()=>!document.querySelector('.entity-flight'));};
  await page.locator('#next-turn').click();
  const flights=await pauseFlights();assert.equal(flights.filter(f=>f.type==='expand').length,2);assert.equal(flights.filter(f=>f.type==='tray').length,2);
  assert.equal(await page.locator('.piece.entity-arriving').count(),2);
  const origin=await page.locator('[data-instance="origin"]').boundingBox();
  assert.ok(flights.filter(f=>f.type==='expand').every(f=>Math.abs(f.left+origin.width*.4-origin.x-origin.width/2)<5));
  assert.ok(flights.filter(f=>f.type==='tray').every(f=>/scale\(0.24\)/.test(f.frames.at(-1).transform)));
  await page.screenshot({path:path.join(output,'01-expand-and-transfers.png')});await finish();
  assert.equal(await page.locator('.entity-arriving').count(),0);assert.equal(await page.locator('[data-instance="collect1"],[data-instance="retire1"]').count(),0);
  assert.equal(await page.locator('[data-inventory-item="collect1"]').count(),1);assert.equal(await page.locator('[data-graveyard-item="retire1"]').count(),1);
  await page.locator('#previous-turn').click();assert.equal(await page.locator('.entity-flight').count(),0);assert.equal(await page.locator('[data-instance="collect1"]').count(),1);
  await page.locator('#next-turn').click();assert.equal((await pauseFlights()).length,4);await finish();
  // Use-driven transfers animate as well as automatic behaviours.
  await page.locator('[data-use-object="manual1"]').click();
  const useFlights=await pauseFlights();assert.equal(useFlights.filter(f=>f.type==='tray').length,1);assert.equal(useFlights.filter(f=>f.type==='expand').length,2);await finish();
  await page.locator('#previous-turn').click();await page.locator('#next-turn').click();assert.equal((await pauseFlights()).length,3);await finish();
  await page.locator('#clear-turns').click();
  const source=await page.locator('[data-instance="manual1"]').boundingBox(),destination=await page.locator('#inventory-toggle').boundingBox();
  await page.mouse.move(source.x+source.width/2,source.y+source.height/2);await page.mouse.down();await page.mouse.move(destination.x+destination.width/2,destination.y+destination.height/2,{steps:12});await page.mouse.up();
  assert.equal((await pauseFlights()).filter(f=>f.type==='tray').length,1);await finish();
  // Pointer dragging briefly suppresses follow-up clicks in the application.
  await page.waitForTimeout(220);
  await page.locator('#clear-turns').click();await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#next-turn').click();
  assert.equal(await page.locator('.entity-flight,.entity-arriving').count(),0);assert.equal(await page.locator('[data-instance="collect1"]').count(),0);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#previous-turn').click();await page.locator('#next-turn').click();await pauseFlights();await page.locator('#clear-turns').click();
  assert.equal(await page.locator('.entity-flight,.entity-arriving').count(),0);assert.deepEqual(errors,[]);
  console.log('Entity effects browser checks passed: origin paths, tray flights, cleanup, forward replay, rewind, Use, manual collection, reduced motion and reset.');
}finally{
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  const resolved=path.resolve(dataDir);if(!resolved.startsWith(path.resolve(tmpdir())+path.sep))throw Error('Unexpected temporary directory');await rm(resolved,{recursive:true,force:true});
}
