// Optional browser QA: node tools/verify-lantern-impact.mjs <path-to-playwright/index.mjs>
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createWorkshopServer} from '../server.mjs';
import {newProject,validateProject} from '../public/model.js';

const {chromium}=await import(process.argv[2]?pathToFileURL(path.resolve(process.argv[2])).href:'playwright');
const dataDir=await mkdtemp(path.join(tmpdir(),'lantern-browser-')),output=path.resolve('outputs/lantern-impact-check');await mkdir(output,{recursive:true});
const a=(id,icon,extra={})=>({id,name:id,kind:'token',icon,rule:'',tags:[],range:8,color:'#b8cf96',parentId:null,...extra});
const p=newProject(),l=p.levels[0];l.width=12;l.height=8;l.nodes=Array.from({length:11},(_,x)=>`${x},3`);l.tiles={};
p.tags=[{id:'armed',name:'Armed',rule:'',color:'#b8cf96'}];
p.assets=[a('player','girl'),a('stone','rock'),a('guard','guard'),a('range','area',{parentId:'player',behaviours:[{id:'throw',type:'throwObject',enabled:true,throwAssetId:'stone',requireInventory:false,destroyOnHit:true,throwTargetAssetIds:['guard']}]}),a('carrying','guard',{name:'Carry Lantern',kind:'state',parentId:'guard',enabled:true,tags:['armed'],behaviours:[{id:'break',type:'onHit',enabled:true,hitAssetIds:['stone'],action:'switchState',stateKey:'carrying',stateEnabled:false}]}),a('lantern','lantern',{parentId:'carrying'})];
p.assets.push(a('lantern-noise','area',{parentId:'lantern',range:3}));
// Keep the narrow test corridor traversable after hitting its Pot.
p.assets.push(a('pot','barrel',{nonBlocking:true,behaviours:[{id:'break-pot',type:'onHit',enabled:true,hitAssetIds:['stone'],action:'switchState',stateKey:'broken',stateEnabled:true}]}),a('broken','barrel',{kind:'state',parentId:'pot',enabled:false}));
l.instances=[{id:'pot1',assetId:'pot',x:4,y:3,rotation:0},{id:'player1',assetId:'player',x:1,y:3,rotation:0},{id:'guard1',assetId:'guard',x:7,y:3,rotation:0},{id:'guard2',assetId:'guard',x:9,y:3,rotation:0,stateOverrides:{carrying:false}}];
await writeFile(path.join(dataDir,'lantern.json'),JSON.stringify({project:validateProject(p),revision:0}));
const server=await createWorkshopServer({dataDir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,errors=[];let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  const saved=()=>page.waitForFunction(()=>document.querySelector('#save-state').textContent==='All changes saved');
  const state=async()=>(await(await fetch(base+'/api/rooms/lantern')).json()).project;
  await page.goto(base+'/?room=lantern');await page.locator('#welcome-nickname').fill('Lantern checker');await page.locator('.welcome-join').click();await saved();
  await page.locator('[data-asset="player"]').first().click();await page.locator('[data-inspect-child="range"]').first().click();await page.locator('#edit-behaviours').click();
  // Legacy type filters open as an equivalent AND group and Cancel does not migrate saved data.
  assert.equal(await page.locator('[data-target-group]').count(),1);assert.equal(await page.locator('[name="condition-objects"][value="guard"]').isChecked(),true);
  await page.locator('#behaviour-form [data-close]').click();assert.equal((await state()).assets.find(a=>a.id==='range').behaviours[0].throwTargetGroups,undefined);
  await page.locator('#edit-behaviours').click();
  const group=page.locator('[data-target-group="0"]');
  await group.locator('[data-add-condition]').click();await group.locator('[data-b="conditionState"]').fill('Carry Lantern');
  await group.locator('[data-add-condition]').click();await group.locator('[data-target-condition="2"] [data-b="conditionType"]').selectOption('tags');await group.locator('[name="condition-tags"][value="armed"]').check();
  await group.locator('[data-b="targetGroupMode"]').selectOption('any');await group.locator('[data-b="targetGroupMode"]').selectOption('all');
  await group.locator('[data-add-condition]').click();await group.locator('[data-target-condition="3"] [data-b="conditionType"]').selectOption('objects');await group.locator('[data-target-condition="3"] [name="condition-objects"][value="guard"]').check();await group.locator('[data-target-condition="3"] [data-remove-condition]').click();
  assert.equal(await group.locator('[data-b="conditionState"]').inputValue(),'Carry Lantern');assert.equal(await group.locator('[name="condition-tags"][value="armed"]').isChecked(),true);
  await page.locator('[data-add-target-group]').click();await page.locator('[data-target-group="1"] [name="condition-objects"][value="pot"]').check();
  await page.locator('[data-add-target-group]').click();await page.locator('[data-target-group="2"] [data-remove-target-group]').click();
  await page.locator('[data-target-group="1"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'throw-conditions.png'),fullPage:true});
  await page.locator('#behaviour-form button[type="submit"]').click();await saved();
  assert.deepEqual((await state()).assets.find(a=>a.id==='range').behaviours[0].throwTargetGroups,[{mode:'all',conditions:[{type:'objects',assetIds:['guard']},{type:'state',stateKey:'Carry Lantern',enabled:true},{type:'tags',tagIds:['armed']}]},{mode:'all',conditions:[{type:'objects',assetIds:['pot']}]}]);
  await page.locator('[data-asset="guard"]').first().click();await page.locator('[data-inspect-child="carrying"]').first().click();await page.locator('#edit-behaviours').click();
  await page.locator('#add-behaviour').click();await page.locator('[data-behaviour]').last().locator('[data-b="type"]').selectOption('distraction');
  const distraction=page.locator('[data-behaviour]').last();
  assert.equal(await distraction.locator('[data-b="distractTarget"]').inputValue(),'self');assert.equal(await distraction.locator('[data-b="distractionDestination"]').inputValue(),'throwerPosition');
  await distraction.locator('[data-b="distractionHitMode"]').selectOption('selected');await distraction.locator('[name="distraction-hit"][value="stone"]').check();await distraction.locator('[data-b="returnToStart"]').uncheck();
  await distraction.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'guard-state-distraction.png'),fullPage:true});await page.locator('#behaviour-form button[type="submit"]').click();await saved();
  const b=(await state()).assets.find(a=>a.id==='carrying').behaviours.find(b=>b.type==='distraction');assert.equal(b.distractTarget,'self');assert.equal(b.destinationMode,'throwerPosition');assert.deepEqual(b.hitAssetIds,['stone']);
  await page.locator('[data-inspect-child="lantern-noise"]').first().click();await page.locator('#edit-behaviours').click();
  await page.locator('#add-behaviour').click();await page.locator('[data-b="type"]').selectOption('distraction');
  await page.locator('[data-b="distractionHitMode"]').selectOption('selected');await page.locator('[name="distraction-hit"][value="stone"]').check();await page.locator('[name="distraction-target"][value="guard"]').check();
  await page.locator('[data-b="distractionDestination"]').selectOption('hitPosition');await page.locator('[data-b="returnToStart"]').uncheck();
  await page.locator('[data-b="distractionDestination"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'fixed-impact-position.png'),fullPage:true});
  await page.locator('#behaviour-form button[type="submit"]').click();await saved();
  assert.equal((await state()).assets.find(a=>a.id==='lantern-noise').behaviours[0].destinationMode,'hitPosition');
  await page.reload();await page.locator('#welcome-nickname').fill('Lantern checker');await page.locator('.welcome-join').click();await saved();
  await page.locator('#play-mode').click();await page.locator('[data-throw-object="player1"]').click();
  const cell=async x=>page.locator(`.cell[data-x="${x}"][data-y="3"]`).boundingBox();
  const aim=async x=>{const r=await cell(x);await page.mouse.move(r.x+r.width/2,r.y+r.height/2);return r;};
  await aim(9);assert.match(await page.locator('#throw-tooltip').textContent(),/throw target group/);
  const pot=await aim(4);assert.match(await page.locator('#throw-tooltip').textContent(),/Left Click to throw/);await page.mouse.click(pot.x+pot.width/2,pot.y+pot.height/2);
  await page.locator('[data-instance="pot1"]').click();assert.equal(await page.locator('[data-toggle-state="broken"][data-state-instance="pot1"]').getAttribute('aria-checked'),'true');
  await page.locator('[data-throw-object="player1"]').click();
  const r=await aim(7);assert.match(await page.locator('#throw-tooltip').textContent(),/2 objects affected/);await page.screenshot({path:path.join(output,'impact-preview.png'),fullPage:true});await page.mouse.click(r.x+r.width/2,r.y+r.height/2);
  await page.locator('[data-instance="guard1"]').click();assert.equal(await page.locator('[data-toggle-state="carrying"][data-state-instance="guard1"]').getAttribute('aria-checked'),'false');
  await page.locator('#next-turn').click();assert.match(await page.locator('[data-instance="guard1"]').getAttribute('style'),/--x:6(?:;|\b)/);
  assert.match(await page.locator('[data-instance="guard2"]').getAttribute('style'),/--x:8(?:;|\b)/);
  await page.locator('#next-turn').click();assert.match(await page.locator('[data-instance="guard1"]').getAttribute('style'),/--x:5(?:;|\b)/);assert.match(await page.locator('[data-instance="guard2"]').getAttribute('style'),/--x:7(?:;|\b)/);
  await page.locator('#next-turn').click();assert.match(await page.locator('[data-instance="guard2"]').getAttribute('style'),/--x:7(?:;|\b)/);
  // Verify the shared design has not changed during private playtest.
  assert.equal((await state()).levels[0].instances.find(i=>i.id==='guard1').stateOverrides,undefined);assert.deepEqual(errors,[]);
  console.log('Lantern browser checks passed: AND/OR groups, independent Pot and Guard hits, row editing, legacy migration, state Distraction, save/reload, invalid targets, impact preview, lantern disabling, guard movement and fixed impact destinations for nearby guards.');
}finally{
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  const resolved=path.resolve(dataDir);if(!resolved.startsWith(path.resolve(tmpdir())+path.sep))throw Error('Unexpected temporary directory');await rm(resolved,{recursive:true,force:true});
}
