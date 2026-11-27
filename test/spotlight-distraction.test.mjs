import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,validateProject,clone,applyAction} from '../public/model.js';
import {setState} from '../public/state-effects.js';
import {availableUses,useObject,resolveTurn,resolveHitStates} from '../public/behaviours.js';
import {distractionReactions,distractAfterStateEdit} from '../public/distraction.js';
import {copyHierarchy} from '../public/editing.js';
import {exportLevels,buildLevelImport} from '../public/level-transfer.js';
import {createSequence,nextTurn,previousTurn,validateSequence} from '../public/turn-sequence.js';

const a=(id,icon,extra={})=>({id,name:id,icon,kind:'token',parentId:null,color:'#b8cf96',tags:[],rule:'',range:4,...extra});
const i=(id,assetId,x,y,extra={})=>({id,assetId,x,y,rotation:0,...extra});
function fixture(){
  const p=newProject(),l=p.levels[0];l.width=12;l.height=10;l.tiles={};l.nodes=[];
  for(let y=0;y<10;y++)for(let x=0;x<12;x++)l.nodes.push(`${x},${y}`);
  const b={id:'investigate',type:'distraction',enabled:true,distractionTrigger:'stateChange',beamParameterIds:['old-beam','new-beam'],hitAssetIds:null,distractAssetIds:['guard'],distractTarget:'area',steps:1,returnToStart:true};
  p.assets=[a('spotlight','lantern',{exclusiveStates:true}),a('old','lantern',{kind:'state',parentId:'spotlight',enabled:true}),a('new','lantern',{kind:'state',parentId:'spotlight',enabled:false}),
    a('old-beam','rectangle',{parentId:'old',width:3,rotation:0}),a('new-beam','rectangle',{parentId:'new',width:3,rotation:90}),a('awareness','area',{parentId:'spotlight',range:5,behaviours:[b]}),a('guard','guard',{autoFacing:true}),a('player','girl')];
  l.instances=[i('lamp','spotlight',4,5),i('entering','guard',7,5),i('leaving','guard',4,2),i('outside','guard',2,5),i('both','guard',5,4),i('far','guard',11,5),i('locked','guard',3,5,{locked:true}),i('wrong','player',3,4)];
  return {p,l,b,source:l.instances[0]};
}
const switchTo=(f,key='new')=>setState(f.p,f.source,{stateKey:key,stateEnabled:true});
const instance=(p,id)=>p.levels[0].instances.find(i=>i.id===id);

test('state switches catch guards newly inside, outside now, and outside both; inside both stays calm',()=>{
  const f=fixture();validateProject(f.p);switchTo(f);
  assert.deepEqual(f.l.instances.filter(i=>i.distraction).map(i=>i.id),['entering','leaving','outside']);
  for(const id of ['entering','leaving','outside'])assert.deepEqual(instance(f.p,id).distraction.destination,{x:4,y:5});
  assert.equal(instance(f.p,'both').distraction,undefined);
  validateProject(f.p);
});

test('no initial reaction, no reaction to a no-op switch, and each real switch compares fresh beams',()=>{
  const f=fixture();assert.equal(resolveTurn(f.p).project.levels[0].instances.some(i=>i.distraction),false);
  switchTo(f,'old');assert.equal(f.l.instances.some(i=>i.distraction),false);
  switchTo(f);instance(f.p,'entering').distraction.approachWait=7;
  switchTo(f);assert.equal(instance(f.p,'entering').distraction.approachWait,7);
  switchTo(f,'old');assert.equal(instance(f.p,'entering').distraction.approachWait,0);
  assert.equal(instance(f.p,'both').distraction,undefined);
});

test('disabled reactions, inactive branches, wrong types, locks, range and awareness walls suppress reactions',()=>{
  for(const modify of [f=>f.b.enabled=false,f=>f.b.distractAssetIds=[],f=>f.b.beamParameterIds=[],f=>f.p.assets[5].range=1,f=>{f.p.assets[5].occludedByWalls=true;f.l.tiles['6,5']='wall';},f=>{f.p.assets.push(a('inactive','lantern',{kind:'state',enabled:false,parentId:'spotlight'}));f.p.assets[5].parentId='inactive';}]){
    const f=fixture();modify(f);switchTo(f);assert.equal(instance(f.p,'entering').distraction,undefined);
  }
});

test('an unlit beam and beam wall occlusion count as outside, including light switched on over a guard',()=>{
  for(const modify of [f=>{f.p.assets[3].occludedByWalls=true;f.l.tiles['5,5']='wall';},f=>{f.p.assets[1].enabled=false;}]){
    const f=fixture();modify(f);switchTo(f);assert.ok(instance(f.p,'entering').distraction);
  }
  const f=fixture();switchTo(f);for(const target of f.l.instances)delete target.distraction;
  setState(f.p,f.source,{stateKey:'new',stateEnabled:false});assert.ok(instance(f.p,'both').distraction);
});

test('Use and thrown On Hit switch states immediately; an unchanged hit alone is not a distraction',()=>{
  for(const mode of ['use','hit']){
    const f=fixture(),reaction={id:'switch',enabled:true,type:'onHit',hitAssetIds:null,action:'switchState',stateKey:'new',stateEnabled:true};
    if(mode==='use'){
      f.p.assets.push(a('use','area',{parentId:'spotlight',behaviours:[{id:'use-switch',enabled:true,type:'useEffect',usableMode:'any',usableAssetIds:null,useTarget:'linked',action:'switchState',stateKey:'new',stateEnabled:true}]}));
      f.l.objectLinks=[{id:'linked',name:'link',rule:'',color:'#b8cf96',instanceIds:['wrong','lamp']}];
      const run=useObject(f.p,[],[],availableUses(f.p,f.l).find(c=>c.usedId==='wrong'));
      assert.ok(instance(run.project,'entering').distraction);assert.equal(instance(f.p,'entering').distraction,undefined);
    }else{
      f.p.assets[0].behaviours=[reaction];
      assert.deepEqual(distractionReactions(f.p,f.l,{assetId:'player'},[f.source]),[]);
      resolveHitStates(f.p,f.l,{assetId:'player'},[f.source]);assert.ok(instance(f.p,'entering').distraction);
    }
  }
});

test('a switch during turn resolution pauses later patrol movement and investigation begins next turn',()=>{
  const f=fixture();
  f.p.assets[0].behaviours=[{id:'switch',enabled:true,type:'applyEffect',action:'switchState',eligibleMode:'linked',eligibleAssetIds:null,stateKey:'new',stateEnabled:true}];
  f.p.assets.push(a('controller','lantern'),a('control-range','self',{parentId:'controller',behaviours:f.p.assets[0].behaviours}));delete f.p.assets[0].behaviours;
  f.l.instances.push(i('control','controller',4,6));f.l.objectLinks=[{id:'linked',name:'link',rule:'',color:'#b8cf96',instanceIds:['control','lamp']}];
  f.p.assets[6].behaviours=[{id:'patrol',enabled:true,type:'moveTo',steps:1,target:'current',patrolId:null}];
  instance(f.p,'entering').moveTarget={type:'position',x:10,y:5};f.p.behaviourOrder=['switch','patrol'];
  let run=resolveTurn(f.p);assert.equal(instance(run.project,'entering').x,7);assert.ok(instance(run.project,'entering').distraction);
  run=resolveTurn(run.project);assert.equal(instance(run.project,'entering').x,6);
});

test('investigation delays, origin, facing, return and saved turn history reuse ordinary Distraction',()=>{
  const f=fixture();f.l.instances=f.l.instances.filter(i=>['lamp','entering'].includes(i.id));f.b.approachDelay=1;f.b.returnDelay=1;instance(f.p,'entering').direction=90;
  switchTo(f);const state={project:f.p,inventory:[],graveyard:[],levelId:f.l.id};
  const sequence=validateSequence(JSON.parse(JSON.stringify(nextTurn(createSequence(state),state))));
  assert.equal(instance(sequence.frames[1].project,'entering').x,7);
  assert.equal(instance(previousTurn(sequence,sequence.frames[1]).frames[0].project,'entering').distraction.approachWait,1);
  let p=f.p;for(let n=0;n<6;n++)p=resolveTurn(p).project;
  assert.equal(instance(p,'entering').x,7);assert.equal(instance(p,'entering').direction,90);assert.equal(instance(p,'entering').distraction,undefined);
});

test('beam references support shared parameter definitions and copies remap local beam references',()=>{
  const f=fixture();let p=applyAction(f.p,{type:'parameter.attach',data:{id:'new-beam',parentId:'new',usageId:'beam-copy',originalUsageId:'new-beam-use'}});
  setState(p,instance(p,'lamp'),{stateKey:'new',stateEnabled:true});assert.ok(instance(p,'entering').distraction);assert.equal(instance(p,'both').distraction,undefined);
  const copies=copyHierarchy(f.p,'spotlight'),copyByName=name=>copies.find(a=>a.name===name);
  assert.deepEqual(copyByName('awareness').behaviours[0].beamParameterIds,[copyByName('old-beam').id,copyByName('new-beam').id]);
});

test('schema rejects invalid triggers, missing beams and self recipients while legacy impacts remain valid',()=>{
  const f=fixture();validateProject(f.p);
  for(const changes of [{distractionTrigger:'invalid'},{beamParameterIds:undefined},{beamParameterIds:null},{beamParameterIds:['a','a']},{distractTarget:'self'}]){
    const p=clone(f.p);Object.assign(p.assets[5].behaviours[0],changes);assert.throws(()=>validateProject(p),/Distraction/);
  }
  delete f.b.distractionTrigger;delete f.b.beamParameterIds;validateProject(f.p);
});

test('manual Playtest state edits and resetting states compare beams without changing the shared design',()=>{
  const f=fixture(),before=clone(f.p);
  const next=applyAction(f.p,{type:'instance.state',data:{levelId:f.l.id,id:'lamp',stateId:'new',enabled:true}});
  distractAfterStateEdit(f.p,next,f.l.id,'lamp');assert.ok(instance(next,'entering').distraction);assert.equal(instance(next,'both').distraction,undefined);assert.deepEqual(f.p,before);
  for(const target of next.levels[0].instances)delete target.distraction;
  const reset=applyAction(next,{type:'instance.resetStates',data:{levelId:f.l.id,id:'lamp'}});
  distractAfterStateEdit(next,reset,f.l.id,'lamp');assert.ok(instance(reset,'entering').distraction);assert.equal(instance(reset,'both').distraction,undefined);
});

test('export/import remaps beam definitions and preserves dependency selections',()=>{
  const f=fixture(),file=exportLevels(f.p,[f.l.id]),{project:p,levelIds}=buildLevelImport(newProject(),file,{levelChoices:{[f.l.id]:{mode:'copy'}}});
  const beam=name=>p.assets.find(a=>a.name===name).id,b=p.assets.find(a=>a.name==='awareness').behaviours[0];
  assert.deepEqual(b.beamParameterIds,[beam('old-beam'),beam('new-beam')]);
  const l=p.levels.find(l=>l.id===levelIds[0]),source=l.instances.find(i=>i.assetId===beam('spotlight'));
  setState(p,source,{stateKey:beam('new'),stateEnabled:true});assert.ok(l.instances.find(i=>i.x===7&&i.y===5).distraction);validateProject(p);
});
