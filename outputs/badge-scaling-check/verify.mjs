import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'file:///C:/Users/m.maresca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {createWorkshopServer} from '../../server.mjs';
import {newProject,validateProject} from '../../public/model.js';
import {carriedBadges} from '../../public/carried-ui.js';
const output=path.resolve('outputs/badge-scaling-check');await mkdir(output,{recursive:true});
const dataDir=await mkdtemp(path.join(tmpdir(),'badge-scaling-'));
const project=newProject(),level=project.levels[0];level.width=18;level.height=12;
const asset=(id,icon,extra={})=>({id,name:id,icon,color:'#edc47c',rule:'',range:1,tags:[],parentId:null,...extra});
project.assets=[asset('guard','guard'),asset('lantern','lantern',{parentId:'guard'}),asset('key','key',{parentId:'guard'}),asset('coin','key')];
level.instances=[{id:'guard-one',assetId:'guard',x:3,y:3,rotation:0}];
await writeFile(path.join(dataDir,'badges.json'),JSON.stringify({project:validateProject(project),revision:0}));
const server=await createWorkshopServer({dataDir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?room=badges`);
  await page.locator('#welcome-nickname').fill('Badge scaling QA');await page.locator('.welcome-join').click();
  await page.waitForFunction(()=>document.querySelectorAll('.nested-object-badge').length===2);
  const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.1,`${actual} != ${expected}`);
  const measure=()=>page.evaluate(()=>{
    const board=document.querySelector('.board'),piece=document.querySelector('.piece'),badges=[...board.querySelectorAll('.carried-object-badge')],cell=parseFloat(board.style.getPropertyValue('--cell'));
    const rect=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}};
    return {cell,piece:rect(piece),badges:badges.map(e=>({...rect(e),svg:rect(e.querySelector('svg')),pointerEvents:getComputedStyle(e).pointerEvents})),counter:board.querySelector('.lifetime-count')?rect(board.querySelector('.lifetime-count')):null};
  });
  for(const viewport of [{width:1366,height:768},{width:1280,height:720},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);await page.locator('#zoom-fit').dispatchEvent('click');
    const m=await measure(),unit=Math.min(1,m.cell/48);close(m.badges[0].width,30*unit);close(m.badges[0].height,30*unit);close(m.badges[1].x-m.badges[0].x,32*unit);
    assert.ok(m.badges[0].width<m.piece.width);assert.ok(m.badges[0].svg.width>0);assert.equal(m.badges[0].pointerEvents,'none');
    console.log(JSON.stringify({viewport,cell:m.cell,badge:m.badges[0].width,piece:m.piece.width}));
    if(viewport.width===1366)await page.screenshot({path:path.join(output,'laptop-edit.png')});
  }
  await page.setViewportSize({width:1366,height:768});await page.locator('#zoom-fit').dispatchEvent('click');await page.locator('#play-mode').click();
  const m=await measure();close(m.badges[0].width,30*Math.min(1,m.cell/48));await page.locator('[data-instance="guard-one"]').click();
  assert.ok(await page.locator('[data-instance="guard-one"]').evaluate(e=>e.classList.contains('selected')));
  await page.screenshot({path:path.join(output,'laptop-playtest.png')});
  // Exercise shared carried-inventory spacing and countdown styling at every zoom boundary.
  const inventory=[{id:'held',assetId:'coin',count:1,items:[{id:'held',assetId:'coin',carriedBy:{levelId:level.id,instanceId:'guard-one'},lifetimeProgress:[{remaining:1,total:3}]}]}];
  const html=carriedBadges(project,level,inventory,()=>'<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',s=>s);
  await page.locator('.board').evaluate((e,html)=>e.insertAdjacentHTML('beforeend',html),html);
  for(const cell of [14.4,24,48,96]){
    await page.locator('.board').evaluate((e,cell)=>e.style.setProperty('--cell',`${cell}px`),cell);
    const m=await measure(),unit=Math.min(1,cell/48);close(m.badges[0].width,30*unit);close(m.badges[2].x-m.badges[0].x,64*unit);close(m.counter.width,18*unit);close(m.counter.height,18*unit);
  }
  assert.deepEqual(errors,[]);console.log('Browser checks passed: laptop/desktop Fit, Edit/Playtest, selectable owner, badge row, countdown and zoom limits.');
}finally{
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  const resolved=path.resolve(dataDir);if(!resolved.startsWith(path.resolve(tmpdir())+path.sep))throw Error('Unexpected temporary path');await rm(resolved,{recursive:true,force:true});
}
