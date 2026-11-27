import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newProject,clone,applyAction,appearance,validateProject} from '../public/model.js';
import {carriedBadges,nestedBadges} from '../public/carried-ui.js';

const asset=(id,extra={})=>({id,name:id,icon:'key',color:'#edc47c',rule:'',range:1,tags:[],parentId:null,...extra});
const esc=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function fixture(){
  const project=newProject(),level=project.levels[0];
  project.assets=[asset('guard',{icon:'guard'}),
    asset('alive',{kind:'state',parentId:'guard',enabled:true}),
    asset('carrying',{kind:'state',parentId:'alive',enabled:true}),
    asset('lantern',{parentId:'carrying',icon:'lantern'}),
    asset('lit',{kind:'state',parentId:'lantern',enabled:true,icon:'lantern',variant:'on'}),
    asset('light',{parentId:'lit',icon:'area'}),
    asset('pouch',{parentId:'guard'}),asset('coin',{parentId:'pouch'}),asset('parcel')];
  level.instances=[{id:'first',assetId:'guard',x:2,y:3,rotation:0},
    {id:'second',assetId:'guard',x:5,y:3,rotation:0,stateOverrides:{carrying:false}}];
  return {project,level};
}
const art=a=>`<svg data-art="${a.id}"></svg>`;
const badges=f=>nestedBadges(f.project,f.level,art,esc);

test('nested objects get carried-style icons per placement, excluding state folders and parameters',()=>{
  const f=fixture(),before=clone(f),html=badges(f);
  assert.equal((html.match(/nested-object-badge/g)||[]).length,5);
  assert.equal((html.match(/data-nested-object="lantern"/g)||[]).length,1);
  assert.match(html,/data-nested-object="coin"/);
  for(const id of ['alive','carrying','lit','light'])assert.ok(!html.includes(`data-nested-object="${id}"`));
  assert.match(html,/--x:2;--y:3;--badge-index:0/);
  assert.match(html,/--x:5;--y:3;--badge-index:1/);
  assert.ok(!html.includes('data-drop-carried'));
  assert.deepEqual(f,before);
});

test('nested icons follow ancestor states, removals, movement and detached placements',()=>{
  const f=fixture(),owner=f.level.instances[0];
  owner.stateOverrides={alive:false};assert.ok(!badges(f).includes('data-nested-object="lantern"'));
  delete owner.stateOverrides;owner.removedAssetIds=['lantern'];assert.ok(!badges(f).includes('data-nested-object="lantern"'));
  owner.removedAssetIds=['pouch'];assert.ok(!badges(f).includes('--x:2;--y:3;--badge-index:1'));
  delete owner.removedAssetIds;owner.x=7;owner.y=6;assert.match(badges(f),/--x:7;--y:6/);
  f.project.assets.find(a=>a.id==='carrying').enabled=false;
  f.level.instances=[{...owner,assetId:'lantern',detached:true}];
  f.project.assets.push(asset('charm',{parentId:'lantern'}));
  assert.match(badges(f),/data-nested-object="charm"/);
  delete f.level.instances[0].detached;assert.equal(badges(f),'');
});

test('nested artwork uses the parent placement state overrides and escapes accessible names',()=>{
  const f=fixture(),owner=f.level.instances[0],seen=[];
  f.project.assets.find(a=>a.id==='lit').name='Lit <lamp> "on"';
  const html=nestedBadges(f.project,f.level,(a,i)=>{seen.push([a.id,i]);return art(a);},esc);
  assert.equal(seen.find(([id])=>id==='lantern')[1],owner);
  assert.match(html,/aria-label="Contains Lit &lt;lamp> &quot;on&quot;"/);
  owner.stateOverrides={lit:false};assert.match(badges(f),/aria-label="Contains lantern"/);
});

test('inventory badges share the row after nested objects and retain drop and countdown controls',()=>{
  const f=fixture(),inventory=[{id:'stack',assetId:'parcel',count:1,items:[{
    id:'held',assetId:'parcel',carriedBy:{levelId:f.level.id,instanceId:'first'},
    lifetimeProgress:[{remaining:1,total:3}]
  }]}];
  let html=carriedBadges(f.project,f.level,inventory,art,esc);
  assert.match(html,/data-drop-carried="held"/);assert.match(html,/--badge-index:3/);
  assert.match(html,/last-turn/);assert.match(html,/1 of 3 turns remaining/);
  f.level.instances[0].stateOverrides={carrying:false};
  html=carriedBadges(f.project,f.level,inventory,art,esc);assert.match(html,/--badge-index:2/);
});

test('Class B guard has one Lantern badge that switches between Lit and Break state artwork',async()=>{
  let project=validateProject(JSON.parse(await readFile(new URL('../Saved Projects/plague-tale-go-class-b.json',import.meta.url),'utf8')));
  const lantern=project.assets.find(a=>a.id==='d3d0f003-85af-439a-b2ad-c3e7728123c9');
  const states=project.assets.filter(a=>a.parentId===lantern.id&&a.icon==='lantern');
  assert.equal(lantern.exclusiveStates,true);
  assert.deepEqual(states.map(a=>[a.name,a.kind,a.enabled]),[['Lanterne-Break','state',false],['Lanterne-Lit','state',true]]);
  const broken=states.find(a=>a.name==='Lanterne-Break'),lit=states.find(a=>a.name==='Lanterne-Lit');
  const level=project.levels.find(l=>l.instances.some(i=>i.assetId==='6c6a4cb6-f785-4354-933e-f326cb5b1519'));
  const guard=clone(level.instances.find(i=>i.assetId==='6c6a4cb6-f785-4354-933e-f326cb5b1519'));
  guard.stateOverrides={...guard.stateOverrides,'1ff814f6-7ea8-48a3-a48e-ad6ba9d4c296':true,'0ac3f910-27bd-4e8d-ba4a-eaeac224df6e':true};
  const isolated={...level,instances:[guard]};project.levels=[isolated];
  const stateArt=(a,i)=>`<svg data-variant="${appearance(project,a,i).variant}"></svg>`;
  const render=()=>nestedBadges(project,project.levels[0],stateArt,esc);
  for(const [state,variant] of [[lit,'on'],[broken,'off'],[lit,'on']]){
    project=applyAction(project,{type:'instance.state',data:{levelId:level.id,id:guard.id,stateId:state.id,enabled:true}});
    const html=render();
    assert.equal((html.match(/nested-object-badge/g)||[]).length,1);
    assert.match(html,new RegExp(`data-nested-object="${lantern.id}"`));
    assert.match(html,new RegExp(`data-variant="${variant}"`));
    for(const state of states)assert.ok(!html.includes(`data-nested-object="${state.id}"`));
  }
});
