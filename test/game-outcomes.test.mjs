import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,blankLevel,clone,validateProject,applyAction} from '../public/model.js';
import {gameOutcome} from '../public/game-outcomes.js';
import {resolveTurn} from '../public/behaviours.js';
import {createSequence,eventTurn,nextTurn,previousTurn,validateSequence} from '../public/turn-sequence.js';
import {copyHierarchy} from '../public/editing.js';

const asset=(id,name,extra={})=>({id,name,icon:'guard',kind:'token',rule:'',tags:[],range:1,color:'#b8cf96',parentId:null,...extra});
const placed=(id,assetId,x)=>({id,assetId,x,y:2,rotation:0,note:''});
function fixture(){
  const project=newProject(),level=project.levels[0];
  project.assets=[asset('hero','Amicia',{exclusiveStates:true}),asset('alive','Alive',{kind:'state',parentId:'hero',enabled:true}),asset('dead','Dead',{kind:'state',parentId:'hero',enabled:false}),asset('exit','Exit',{behaviours:[{id:'finish',type:'levelComplete',enabled:true,targetAssetId:'hero'}]})];
  level.instances=[placed('amicia','hero',2),placed('goal','exit',4)];
  level.nodes=['2,2','3,2','4,2','5,2'];
  return {project,level};
}
const state=project=>({project,inventory:[],graveyard:[],levelId:project.levels[0].id});

test('Amicia death is detected from active Dead states or the graveyard, respecting state overrides and level origins',()=>{
  const {project,level}=fixture();
  assert.equal(gameOutcome(project),null);
  level.instances[0].stateOverrides={dead:true};
  assert.equal(gameOutcome(project).type,'gameOver');
  level.instances[0].stateOverrides={dead:false};
  const graveyard=[{items:[{...level.instances[0],sourceLevelId:level.id}]}];
  assert.equal(gameOutcome(project,graveyard).type,'gameOver');
  graveyard[0].items[0].sourceLevelId='another-level';
  assert.equal(gameOutcome(project,graveyard),null);
});

test('Game Over is state gated, can end a renamed hero’s game, and works as a reusable block',()=>{
  let {project,level}=fixture();project.assets[0].name='Player';
  project=applyAction(project,{type:'behaviour.save',data:{id:'lose-block',name:'Lose',rule:'',behaviour:{id:'lose-template',type:'gameOver',enabled:true}}});
  project=applyAction(project,{type:'behaviour.attach',data:{id:'dead',definitionId:'lose-block',usageId:'lose'}});
  level=project.levels[0];
  assert.equal(gameOutcome(project),null);
  level.instances[0].stateOverrides={dead:true};
  assert.equal(gameOutcome(project).type,'gameOver');
  project.assets.find(a=>a.id==='dead').behaviours[0].enabled=false;
  assert.equal(gameOutcome(project),null);
});

test('Level Complete requires a separate active matching placement at the owner cell and ignores other levels',()=>{
  const {project,level}=fixture(),hero=level.instances[0];
  hero.x=4;
  assert.equal(gameOutcome(project).type,'levelComplete');
  project.assets[3].behaviours[0].targetAssetId='exit';
  assert.equal(gameOutcome(project),null);
  project.assets[3].behaviours[0].targetAssetId='hero';
  hero.removedAssetIds=['hero'];
  assert.equal(gameOutcome(project),null);
  delete hero.removedAssetIds;
  project.levels.push(blankLevel('other','Other'));
  project.levels[1].instances=clone(level.instances);hero.x=2;
  assert.equal(gameOutcome(project,[],level.id),null);
  assert.equal(gameOutcome(project,[],'other').type,'levelComplete');
  project.assets[3].behaviours[0].enabled=false;
  assert.equal(gameOutcome(project,[],'other'),null);
});

test('death wins over completion and remains recorded if a later behaviour removes the dead owner',()=>{
  const {project,level}=fixture();level.instances[0].x=4;
  project.assets[2].behaviours=[{id:'bury',type:'addToTray',enabled:true,tray:'graveyard'}];
  level.instances[0].stateOverrides={dead:true};
  assert.equal(gameOutcome(project).type,'gameOver');
  const result=resolveTurn(project);
  assert.equal(result.outcome.type,'gameOver');
  assert.ok(!result.project.levels[0].instances.some(i=>i.id==='amicia'));
  assert.equal(result.graveyard[0].items[0].sourceLevelId,level.id);
});

test('turn resolution latches an activated Game Over before removal even when its configured order is later',()=>{
  const {project,level}=fixture();project.assets[0].name='Player';
  project.assets.push(asset('killer','Killer'),asset('area','Touch',{icon:'self',parentId:'killer',behaviours:[{id:'kill',type:'applyEffect',enabled:true,action:'switchState',eligibleAssetIds:['hero'],stateKey:'dead',stateEnabled:true}]}));
  project.assets[2].behaviours=[{id:'bury',type:'addToTray',enabled:true,tray:'graveyard'},{id:'lose',type:'gameOver',enabled:true}];
  project.behaviourOrder=['kill','bury','lose'];level.instances.push(placed('rat','killer',2));
  const result=resolveTurn(project);
  assert.equal(result.outcome.type,'gameOver');
  assert.ok(!result.project.levels[0].instances.some(i=>i.id==='amicia'));
});

test('manual terminal events preserve the starting layout, skip later movement, and survive sequence export, Previous and replay',()=>{
  const {project}=fixture(),before=state(project),sequence=createSequence(before),after=clone(before);
  after.project.levels[0].instances[0].x=4;
  after.project.assets[0].behaviours=[{id:'walk',type:'moveTo',enabled:true,steps:1,target:'current',patrolId:null}];
  after.project.levels[0].instances[0].moveTarget={type:'position',x:5,y:2};
  const completed=eventTurn(sequence,before,after);
  assert.equal(completed.frames[1].outcome.type,'levelComplete');
  assert.equal(completed.frames[1].project.levels[0].instances[0].x,4);
  assert.equal(completed.frames[0].project.levels[0].instances[0].x,2);
  const loaded=validateSequence(JSON.parse(JSON.stringify(completed)));
  assert.throws(()=>nextTurn(loaded,loaded.frames[1]),/Clear Sequence/);
  const previous=previousTurn(loaded,loaded.frames[1]);
  assert.equal(previous.cursor,0);
  assert.equal(previous.frames[0].outcome,undefined);
  assert.equal(nextTurn(previous,previous.frames[0]).frames[1].outcome.type,'levelComplete');
  const invalid=clone(loaded);invalid.frames[1].outcome.type='unknown';
  assert.throws(()=>validateSequence(invalid),/Invalid turn outcome/);
});

test('hidden-level deaths do not end the visible level while global turns continue resolving',()=>{
  const {project,level}=fixture(),other=blankLevel('other','Other');project.levels.push(other);
  other.instances=[{...placed('other-amicia','hero',2),stateOverrides:{dead:true}}];
  project.assets[2].behaviours=[{id:'bury',type:'addToTray',enabled:true,tray:'graveyard'}];
  const result=resolveTurn(project,[],[],undefined,level.id);
  assert.equal(result.outcome,undefined);
  assert.equal(gameOutcome(result.project,result.graveyard,level.id),null);
});

test('completion configuration validates and independent hierarchy copies remap internal object choices',()=>{
  const {project}=fixture();project.assets[0].parentId='exit';
  const copies=copyHierarchy(project,'exit'),copiedHero=copies.find(a=>a.name==='Amicia');
  assert.equal(copies[0].behaviours[0].targetAssetId,copiedHero.id);
  project.assets[3].behaviours[0].targetAssetId='';
  assert.throws(()=>validateProject(project),/Choose the object/);
});
