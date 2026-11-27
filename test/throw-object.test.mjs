import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,validateProject,applyAction} from '../public/model.js';
import {availableThrows,throwPreview,throwObject,throwLine} from '../public/throw-object.js';
import {resolveTurn,eventsAdvanceTurn} from '../public/behaviours.js';
import {copyHierarchy} from '../public/editing.js';
import {createSequence,eventTurn,previousTurn,validateSequence} from '../public/turn-sequence.js';

const asset=(id,icon,extra={})=>({id,name:id,icon,kind:'token',parentId:null,color:'#b8cf96',tags:[],rule:'',range:3,...extra});
function fixture(requireInventory=false){
  const p=newProject(),l=p.levels[0];l.width=10;l.height=8;l.tiles={};l.nodes=Array.from({length:9},(_,x)=>`${x},3`);
  p.assets=[asset('player','girl'),asset('stone','rock'),asset('range','area',{parentId:'player',behaviours:[{id:'throw',type:'throwObject',enabled:true,throwAssetId:'stone',requireInventory}]})];
  l.instances=[{id:'actor',assetId:'player',x:2,y:3,rotation:0}];
  const inventory=[{id:'stones',assetId:'stone',count:2,items:[{id:'one',assetId:'stone',x:0,y:0,rotation:90,note:'kept'},{id:'two',assetId:'stone',x:0,y:0,rotation:0}]}];
  return {p,l,inventory,choice:availableThrows(p,l,inventory)[0]};
}

test('Throw Object is parameter-only, validates settings, and never runs automatically',()=>{
  const {p,l}=fixture();validateProject(p);
  assert.equal(availableThrows(p,l).length,1);
  assert.deepEqual(resolveTurn(p).project.levels[0].instances,l.instances);
  const invalid=structuredClone(p);invalid.assets[0].behaviours=invalid.assets[2].behaviours;invalid.assets[2].behaviours=[];
  assert.throws(()=>validateProject(invalid),/Area behaviours/);
  for(const settings of [{throwAssetId:''},{requireInventory:'yes'}]){
    const invalid=structuredClone(p);Object.assign(invalid.assets[2].behaviours[0],settings);assert.throws(()=>validateProject(invalid),/Throw Object/);
  }
});

test('straight preview highlights intervening nodes, rejects outside-area and non-node destinations, and ignores walking links',()=>{
  const {p,l,choice}=fixture();l.blockedLinks=['2,3|3,3'];
  const valid=throwPreview(p,[],choice,{x:5,y:3});
  assert.equal(valid.valid,true);assert.deepEqual(valid.path.map(c=>[c.x,c.y]),[[2,3],[3,3],[4,3],[5,3]]);
  assert.ok(valid.path.every(c=>c.node&&c.legal));
  const illegal=throwPreview(p,[],choice,{x:7,y:3});assert.equal(illegal.valid,false);
  assert.deepEqual(illegal.path.filter(c=>!c.legal).map(c=>c.x),[6,7]);
  assert.equal(throwPreview(p,[],choice,{x:3,y:4}).valid,false);
  assert.equal(throwPreview(p,[],choice,{x:-1,y:3}).valid,false);
  assert.deepEqual(throwLine({x:0,y:0},{x:2,y:2}),[{x:0,y:0},{x:1,y:1},{x:2,y:2}]);
  assert.throws(()=>throwObject(p,[],[],choice,{x:7,y:3}),/inside the parameter/);
  assert.equal(l.instances.length,1);
});

test('unrestricted throws create default copies, allow occupied nodes, and leave the source and inventory untouched',()=>{
  const {p,l,inventory,choice}=fixture(),before=JSON.stringify({p,inventory});
  const run=throwObject(p,inventory,[],choice,{x:2,y:3},()=> 'new-stone');
  assert.equal(run.project.levels[0].instances.length,2);assert.equal(run.instanceId,'new-stone');
  assert.deepEqual(run.project.levels[0].instances[1],{id:'new-stone',assetId:'stone',x:2,y:3,rotation:0,note:''});
  assert.deepEqual(run.inventory,inventory);assert.deepEqual(run.events,[{type:'use',levelId:l.id,instanceId:'actor'}]);
  assert.equal(JSON.stringify({p,inventory}),before);
});

test('inventory throws consume one finite item, preserve its properties, remove empty stacks, and keep infinite supplies',()=>{
  const {p,l,inventory,choice}=fixture(true);
  assert.equal(availableThrows(p,l,[])[0].available,false);
  assert.equal(throwPreview(p,[],choice,{x:4,y:3}).valid,false);
  assert.throws(()=>throwObject(p,[],[],choice,{x:4,y:3}),/inventory/);
  const run=throwObject(p,inventory,[],choice,{x:4,y:3});
  assert.equal(run.inventory[0].count,1);assert.equal(run.inventory[0].items[0].id,'two');
  assert.equal(run.project.levels[0].instances[1].rotation,90);assert.equal(run.project.levels[0].instances[1].note,'kept');
  assert.equal(run.events[1].type,'inventoryDropped');
  const last=throwObject(run.project,run.inventory,[],choice,{x:5,y:3});assert.deepEqual(last.inventory,[]);
  const infinite=[{...inventory[0],count:0,items:[inventory[0].items[0]]}];
  const first=throwObject(p,infinite,[],choice,{x:4,y:3},()=> 'infinite-1');
  const second=throwObject(first.project,first.inventory,[],choice,{x:5,y:3},()=> 'infinite-2');
  assert.deepEqual(second.inventory,infinite);assert.equal(second.project.levels[0].instances.at(-1).id,'infinite-2');
});

test('invalid attempts consume nothing and stale, disabled, inactive, deleted-object and moved-owner throws are rechecked',()=>{
  const {p,l,inventory,choice}=fixture(true),snapshot=JSON.stringify({p,inventory});
  assert.throws(()=>throwObject(p,inventory,[],choice,{x:8,y:3}),/inside the parameter/);
  assert.equal(JSON.stringify({p,inventory}),snapshot);
  p.assets[2].behaviours[0].enabled=false;assert.equal(availableThrows(p,l,inventory).length,0);
  assert.throws(()=>throwObject(p,inventory,[],choice,{x:4,y:3}),/no longer/);
  p.assets[2].behaviours[0].enabled=true;
  p.assets.push(asset('ready','girl',{kind:'state',parentId:'player',enabled:false}));p.assets[2].parentId='ready';
  assert.equal(availableThrows(p,l,inventory).length,0);
  p.assets.at(-1).enabled=true;l.instances[0].x=8;
  assert.equal(throwPreview(p,inventory,choice,{x:4,y:3}).valid,false);
  p.assets=p.assets.filter(a=>a.id!=='stone');assert.equal(availableThrows(p,l,inventory).length,0);
});

test('directional parameters and wall occlusion constrain throws using the same area as their parent',()=>{
  const {p,l,choice}=fixture();p.assets[2].icon='line';
  l.nodes.push('2,2','2,1','2,0');
  assert.equal(throwPreview(p,[],choice,{x:2,y:0}).valid,true);
  assert.equal(throwPreview(p,[],choice,{x:4,y:3}).valid,false);
  p.assets[2].occludedByWalls=true;l.tiles['2,2']='wall';l.nodes=l.nodes.filter(k=>k!=='2,2');
  assert.equal(throwPreview(p,[],choice,{x:2,y:0}).valid,false);
});

test('throws participate in event turns and restore inventory and placements through turn history and export',()=>{
  const {p,l,inventory,choice}=fixture(true);
  p.assets[0].behaviours=[{id:'advance',type:'advanceOnEvent',enabled:true,events:['use']}];
  const before={project:p,inventory,graveyard:[],levelId:l.id},run=throwObject(p,inventory,[],choice,{x:4,y:3});
  assert.equal(eventsAdvanceTurn(p,run.project,run.events),true);
  const sequence=eventTurn(createSequence(before),before,{...run,levelId:l.id},run.log);
  assert.equal(validateSequence(sequence).cursor,1);
  const previous=previousTurn(sequence,sequence.frames[1]).frames[0];
  assert.deepEqual(previous.inventory,inventory);assert.deepEqual(previous.project.levels[0].instances,l.instances);
});

test('reusable Throw Object blocks synchronize their settings and hierarchy copies remap selected internal objects',()=>{
  const {p}=fixture();p.assets[1].parentId='player';
  const copies=copyHierarchy(p,'player');
  assert.equal(copies.find(a=>a.icon==='area').behaviours[0].throwAssetId,copies.find(a=>a.icon==='rock').id);
  const definition={id:'shared-throw',name:'Throw stone',rule:'',behaviour:{id:'shared-logic',type:'throwObject',enabled:true,throwAssetId:'stone',requireInventory:false}};
  let next=applyAction(p,{type:'behaviour.save',data:definition});
  next=applyAction(next,{type:'behaviour.attach',data:{id:'range',definitionId:definition.id,usageId:'shared-use'}});
  next=applyAction(next,{type:'behaviour.save',data:{...definition,behaviour:{...definition.behaviour,requireInventory:true}}});
  assert.equal(next.assets.find(a=>a.id==='range').behaviours.find(b=>b.id==='shared-use').requireInventory,true);
});
