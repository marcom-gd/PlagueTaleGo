import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,clone,applyAction} from '../public/model.js';
import {resolveTurn} from '../public/behaviours.js';
import {blockedNodes,checkMovement} from '../public/behaviour-areas.js';
import {syncLifetimes} from '../public/lifetimes.js';
import {createSequence,nextTurn,validateSequence} from '../public/turn-sequence.js';

const asset=(id,extra={})=>({id,name:id,icon:'key',color:'#edc47c',rule:'',range:1,tags:[],parentId:null,...extra});
function fixture(){
  const project=newProject(),level=project.levels[0];
  project.assets=[asset('actor',{icon:'guard'}),asset('item'),asset('active',{kind:'state',enabled:true,parentId:'item'}),
    asset('area',{icon:'area',parentId:'active',occludedByWalls:true,behaviours:[{id:'remove',type:'applyEffect',enabled:true,action:'graveyard',eligibleMode:'selected',eligibleAssetIds:['hazard']}]}),asset('hazard',{icon:'rat'})];
  level.instances=[{id:'carrier',assetId:'actor',x:3,y:3,rotation:0},
    {id:'near',assetId:'hazard',x:4,y:3,rotation:0,note:'Preserve this identity'},
    {id:'old-location',assetId:'hazard',x:1,y:1,rotation:0},{id:'far',assetId:'hazard',x:7,y:3,rotation:0}];
  level.nodes=[];for(let y=1;y<8;y++)for(let x=1;x<9;x++)level.nodes.push(`${x},${y}`);
  const inventory=[{id:'held-stack',assetId:'item',count:1,items:[{id:'held',assetId:'item',x:1,y:1,rotation:0,stateOverrides:{active:true},carriedBy:{levelId:level.id,instanceId:'carrier'}}]}];
  return {project,inventory,graveyard:[],levelId:level.id};
}
const run=s=>resolveTurn(s.project,s.inventory,s.graveyard,undefined,s.levelId);
const removed=s=>s.graveyard.flatMap(stack=>stack.items.map(i=>i.id));

test('automatic carried Apply Effect uses the carrier position, preserves removed pieces, and records its result',()=>{
  const state=fixture(),before=clone(state),next=run(state);
  assert.deepEqual(removed(next),['near']);assert.equal(next.graveyard[0].items[0].note,'Preserve this identity');
  assert.deepEqual(next.project.levels[0].instances.map(i=>i.id),['carrier','old-location','far']);
  assert.equal(next.inventory[0].items[0].id,'held');assert.equal(next.log.find(row=>row.type==='applyEffect').count,1);assert.deepEqual(state,before);
});

test('carried sources follow a carrier moved earlier in the same turn and obey saved behaviour order',()=>{
  const state=fixture();state.project.assets[0].behaviours=[{id:'walk',type:'moveTo',enabled:true,target:'current',steps:1,patrolId:null}];
  state.project.levels[0].instances[0].moveTarget={type:'position',x:3,y:4};state.project.levels[0].instances.push({id:'new-location',assetId:'hazard',x:3,y:5,rotation:0});
  state.project.behaviourOrder=['walk','remove'];const next=run(state);
  assert.equal(next.project.levels[0].instances[0].y,4);assert.deepEqual(removed(next),['new-location']);
  assert.equal(next.inventory[0].items[0].x,1);
});

test('inactive states, walls and floor heights suppress automatic carried effects',()=>{
  for(const change of [s=>{s.inventory[0].items[0].stateOverrides.active=false;},s=>{s.project.levels[0].tiles['4,3']='wall';},s=>{s.project.levels[0].tiles['4,3']='floor-elevated';}]){
    const state=fixture();change(state);state.project.levels[0].nodes=state.project.levels[0].nodes.filter(key=>state.project.levels[0].tiles[key]!=='wall');assert.deepEqual(removed(run(state)),[]);
  }
});

test('passive carried Block Node affects manual and automatic movement and follows state and carrier position',()=>{
  const state=fixture(),param=state.project.assets.find(a=>a.id==='area');param.behaviours=[{id:'block',type:'blockNode',enabled:true,blockMode:'selected',blockAssetIds:['hazard'],blockScope:'movementAndEffects',excludeSelf:true}];
  const enemy=state.project.levels[0].instances.find(i=>i.id==='near');enemy.x=5;enemy.moveTarget={type:'position',x:4,y:3};
  state.project.assets.find(a=>a.id==='hazard').behaviours=[{id:'approach',type:'moveTo',enabled:true,target:'current',steps:2,patrolId:null}];
  assert.equal(blockedNodes(state.project,state.project.levels[0],'hazard','movement','near',state.inventory).has('4,3'),true);
  const moved=applyAction(state.project,{type:'instance.update',data:{levelId:state.levelId,id:'near',x:4,y:3}});
  assert.throws(()=>checkMovement(state.project,moved,state.inventory),/Block Node/);
  assert.equal(run(state).project.levels[0].instances.find(i=>i.id==='near').x,5);
  assert.equal(resolveTurn(state.project).project.levels[0].instances.find(i=>i.id==='near').x,4);
  state.project.levels[0].instances[0].x=2;
  assert.equal(blockedNodes(state.project,state.project.levels[0],'hazard','movement','near',state.inventory).has('4,3'),false);
  state.inventory[0].items[0].stateOverrides.active=false;assert.equal(blockedNodes(state.project,state.project.levels[0],'hazard','movement','near',state.inventory).size,0);
});

test('a carried blocker with Exclude Self also excludes its carrier, without creating a second occupied piece',()=>{
  const state=fixture();state.project.assets[3].behaviours=[{id:'block-all',type:'blockNode',enabled:true,blockAssetIds:null,blockScope:'movementAndEffects',excludeSelf:true}];
  assert.equal(blockedNodes(state.project,state.project.levels[0],'actor','movement','carrier',state.inventory).size,0);
  assert.equal(blockedNodes(state.project,state.project.levels[0],'hazard','movement','near',state.inventory).has('3,3'),true);
  const next=run(state);assert.equal(next.project.levels[0].instances.filter(i=>i.x===3&&i.y===3).length,1);
});

test('carried Wait persists on the stored item and only delays that item’s automatic effects',()=>{
  const state=fixture();state.project.assets[2].behaviours=[{id:'wait',type:'wait',enabled:true,turns:1}];state.project.behaviourOrder=['wait','remove'];
  let sequence=createSequence(state);sequence=nextTurn(sequence,state);assert.deepEqual(removed(sequence.frames[1]),[]);assert.equal(sequence.frames[1].inventory[0].items[0].waitProgress[0].remaining,0);
  assert.deepEqual(validateSequence(JSON.parse(JSON.stringify(sequence))),sequence);
  sequence=nextTurn(sequence,sequence.frames[1]);assert.deepEqual(removed(sequence.frames[2]),['near']);
});

test('a carried source acts on its final lifetime turn, then its automatic and passive effects disappear',()=>{
  const state=fixture();state.project.assets[2].behaviours=[{id:'expiry',type:'lifetime',enabled:true,turns:1}];syncLifetimes(state.project,state.inventory);
  const next=run(state);assert.deepEqual(removed(next),['near']);assert.equal(next.inventory.length,0);
  next.project.levels[0].instances.push({id:'later',assetId:'hazard',x:4,y:3,rotation:0});
  const later=run({...state,...next});assert.equal(later.project.levels[0].instances.some(i=>i.id==='later'),true);
});

test('removing a carrier earlier in the turn suppresses its queued carried effects',()=>{
  const state=fixture();state.project.assets.push(asset('remover'),asset('removal-area',{icon:'area',parentId:'remover',behaviours:[{id:'remove-carrier',type:'applyEffect',enabled:true,action:'graveyard',eligibleMode:'selected',eligibleAssetIds:['actor']}]}));
  state.project.levels[0].instances.push({id:'eraser',assetId:'remover',x:3,y:2,rotation:0});state.project.behaviourOrder=['remove-carrier','remove'];
  const next=run(state);assert.deepEqual(removed(next),['carrier']);assert.equal(next.inventory[0].items[0].carriedBy,undefined);assert.equal(next.project.levels[0].instances.some(i=>i.id==='near'),true);
});

test('carried Add to Graveyard transfers the real stored object and cancels its later actions',()=>{
  const state=fixture();state.project.assets[2].behaviours=[{id:'retire',type:'addToTray',enabled:true,tray:'graveyard'}];state.project.behaviourOrder=['retire','remove'];
  const next=run(state);assert.deepEqual(removed(next),['held']);assert.equal(next.inventory.length,0);assert.equal(next.graveyard[0].items[0].carriedBy,undefined);assert.equal(next.graveyard[0].items[0].x,3);
  assert.equal(next.project.levels[0].instances.some(i=>i.id==='near'),true);
  assert.doesNotThrow(()=>validateSequence(createSequence({...next,levelId:state.levelId})));
});

test('Set Move Target from a carried source lets other objects follow that moving source',()=>{
  const state=fixture();state.project.levels[0].instances=state.project.levels[0].instances.filter(i=>['carrier','far'].includes(i.id));
  state.project.assets[3].range=4;state.project.assets[3].behaviours=[{id:'signal',type:'applyEffect',enabled:true,action:'setMoveTarget',eligibleMode:'selected',eligibleAssetIds:['hazard'],moveTarget:{type:'self'}}];
  state.project.assets[4].behaviours=[{id:'follow',type:'moveTo',enabled:true,target:'current',steps:2,patrolId:null}];state.project.behaviourOrder=['signal','follow'];
  const next=run(state),follower=next.project.levels[0].instances.find(i=>i.id==='far');
  assert.deepEqual(follower.moveTarget,{type:'object',id:'held'});assert.equal(follower.x,5);assert.equal(follower.y,3);
});
