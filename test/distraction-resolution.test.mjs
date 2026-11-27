import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,stateEnabled} from '../public/model.js';
import {availableThrows,throwObject} from '../public/throw-object.js';
import {resolveTurn} from '../public/behaviours.js';
import {createSequence,eventTurn,previousTurn,validateSequence} from '../public/turn-sequence.js';
import {copyLevel} from '../public/editing.js';
import {exportLevels,buildLevelImport} from '../public/level-transfer.js';

const a=(id,icon='guard',extra={})=>({id,name:id,icon,kind:'token',parentId:null,color:'#b8cf96',tags:[],rule:'',range:1,...extra});
const i=(id,assetId,x,extra={})=>({id,assetId,x,y:3,rotation:0,...extra});
const guard=p=>p.levels[0].instances.find(i=>i.id==='guard1');
function fixture({expand=false,remove=false}={}){
  const p=newProject(),l=p.levels[0];l.width=9;l.height=7;l.nodes=Array.from({length:8},(_,x)=>`${x},3`);l.tiles={};
  p.assets=[
    a('player','girl',{exclusiveStates:true}),
    a('player-alive','girl',{kind:'state',parentId:'player',enabled:true}),
    a('player-dead','girl',{kind:'state',parentId:'player',name:'Dead',enabled:false,behaviours:[{id:'lose',type:'gameOver',enabled:true}]}),
    a('stone','rock'),
    a('throw-range','area',{parentId:'player-alive',range:8,behaviours:[{id:'throw',type:'throwObject',enabled:true,throwAssetId:'stone',requireInventory:false,destroyOnHit:true}]}),
    a('guard','guard',{exclusiveStates:true,autoFacing:true}),
    a('guard-alive','guard',{kind:'state',parentId:'guard',enabled:true}),
    a('guard-dead','guard',{kind:'state',parentId:'guard',name:'Dead',enabled:false}),
    a('carrying','guard',{kind:'state',parentId:'guard-alive',enabled:true,behaviours:[
      {id:'break',type:'onHit',enabled:true,hitAssetIds:['stone'],action:'switchState',stateKey:'carrying',stateEnabled:false},
      {id:'distract',type:'distraction',enabled:true,hitAssetIds:['stone'],distractAssetIds:[],distractTarget:'self',destinationMode:'throwerPosition',steps:1,returnToStart:false}
    ]}),
    a('sight','cone',{parentId:'guard-alive',followTokenFacing:true,range:2,behaviours:[{id:'catch',type:'applyEffect',enabled:true,action:'switchState',eligibleAssetIds:['player'],stateKey:'player-dead',stateEnabled:true}]}),
    a('light','area',{parentId:'carrying',behaviours:[{id:'light-block',type:'blockNode',enabled:true,blockAssetIds:['rat'],blockScope:'movementAndEffects'}]}),
    a('rat','rat',{nonBlocking:true}),
    a('bite','self',{parentId:'rat',behaviours:[{id:'kill',type:'applyEffect',enabled:true,action:remove?'graveyard':'switchState',eligibleAssetIds:['guard'],stateKey:'guard-dead',stateEnabled:true}]})
  ];
  if(expand)p.assets.push(a('spread','cross',{parentId:'rat',behaviours:[{id:'expand',type:'expand',enabled:true,allowStacking:false}]}));
  p.behaviourOrder=['expand','kill','distract','catch','lose'];
  l.instances=[i('player1','player',2),i('guard1','guard',4,{direction:90}),i('rat1','rat',expand?5:4)];
  return {p,l};
}
const hit=f=>throwObject(f.p,[],[],availableThrows(f.p,f.l)[0],{x:4,y:3});
const isDead=(p,id)=>stateEnabled(p,p.assets.find(a=>a.id===`${id}-dead`),p.levels[0].instances.find(i=>i.assetId===id));

for(const expand of [false,true])for(const remove of [false,true])test(`rats ${expand?'expand into':'overlap'} the guard and ${remove?'remove':'kill'} him before distraction`,()=>{
  const f=fixture({expand,remove}),thrown=hit(f);
  assert.equal(stateEnabled(thrown.project,thrown.project.assets.find(a=>a.id==='carrying'),guard(thrown.project)),false);
  assert.equal(guard(thrown.project).direction,90);
  const run=resolveTurn(thrown.project),g=guard(run.project)||run.graveyard[0].items[0];
  assert.equal(g.x,4);assert.equal(g.direction,90);
  assert.equal(run.outcome,undefined);assert.equal(isDead(run.project,'player'),false);
  assert.ok(run.log.some(e=>e.assetName==='rat'&&e.type==='applyEffect'&&e.count===1));
  if(remove)assert.equal(guard(run.project),undefined);
  else{assert.equal(isDead(run.project,'guard'),true);assert.equal(g.distraction,undefined);}
  if(expand)assert.ok(run.project.levels[0].instances.some(i=>i.assetId==='rat'&&i.x===4));
});

test('distraction follows its configured rank, including after the lantern state was disabled',()=>{
  const f=fixture();f.p.behaviourOrder=['distract','catch','kill','lose'];
  const run=resolveTurn(hit(f).project);
  assert.equal(guard(run.project).x,3);assert.equal(guard(run.project).direction,270);
  assert.equal(run.outcome?.type,'gameOver');
  assert.ok(run.log.findIndex(e=>e.type==='distraction')<run.log.findIndex(e=>e.assetName==='guard'&&e.type==='applyEffect'));
});

test('a surviving guard still investigates once and saved history replays the rat kill without Game Over',()=>{
  const f=fixture({expand:true}),before={project:f.p,inventory:[],graveyard:[],levelId:f.l.id};
  const thrown=hit(f),sequence=validateSequence(JSON.parse(JSON.stringify(eventTurn(createSequence(before),before,{...thrown,levelId:f.l.id},thrown.log))));
  assert.equal(sequence.frames[1].outcome,undefined);assert.equal(isDead(sequence.frames[1].project,'guard'),true);
  assert.equal(guard(previousTurn(sequence,sequence.frames[1]).frames[0].project).direction,90);
  const survivor=hit(f);survivor.project.levels[0].instances=survivor.project.levels[0].instances.filter(i=>i.assetId!=='rat');
  const run=resolveTurn(survivor.project);
  assert.equal(guard(run.project).x,3);assert.equal(run.log.filter(e=>e.type==='distraction').length,1);
});

test('legacy distraction snapshots remain playable and dead guards cannot return on later turns',()=>{
  const f=fixture(),thrown=hit(f);delete guard(thrown.project).distraction.behaviourId;
  const run=resolveTurn(thrown.project);
  assert.equal(guard(run.project).x,4);assert.equal(guard(run.project).distraction,undefined);
  guard(run.project).distraction={...guard(thrown.project).distraction,phase:'return',origin:{x:6,y:3}};
  assert.equal(guard(resolveTurn(run.project).project).x,4);
});

test('distraction ordering references survive level copies and imports',()=>{
  const f=fixture(),p=hit(f).project,copied=copyLevel(p.levels[0]);
  assert.equal(copied.instances.find(i=>i.assetId==='guard').distraction.behaviourId,'distract');
  const file=exportLevels(p,[f.l.id]),imported=buildLevelImport(newProject(),file,{levelChoices:{[f.l.id]:{mode:'copy'}}}).project;
  const g=imported.levels.flatMap(l=>l.instances).find(i=>i.distraction);
  assert.ok(imported.assets.some(a=>a.behaviours?.some(b=>b.id===g.distraction.behaviourId)));
});
