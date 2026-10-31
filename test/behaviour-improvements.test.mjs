import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,validateProject,applyAction,parameterOverlay,stateEnabled} from '../public/model.js';
import {resolveTurn,availableUses,useObject} from '../public/behaviours.js';
import {blockedNodes} from '../public/behaviour-areas.js';
import {matchesTags} from '../public/object-selection.js';
import {copyHierarchy,copyLevel} from '../public/editing.js';

const asset=(id,extra={})=>({id,name:id,icon:'guard',kind:'token',parentId:null,color:'#b8cf96',tags:[],rule:'',range:3,...extra});
const behaviour=(type,extra={})=>({id:'behaviour',enabled:true,type,...extra});
function fixture(){
  const p=newProject(),l=p.levels[0];l.width=12;l.height=8;l.nodes=Array.from({length:11},(_,x)=>`${x},2`);
  p.tags=[{id:'chosen',name:'Chosen',rule:'',color:'#abcdef'}];
  p.assets=[asset('actor'),asset('lever',{icon:'lever',exclusiveStates:true}),asset('area',{icon:'area',parentId:'actor'}),asset('on',{kind:'state',parentId:'lever',enabled:false,tags:['chosen']}),asset('off',{kind:'state',parentId:'lever',enabled:true}),asset('goal',{tags:['chosen']})];
  l.instances=[{id:'actor1',assetId:'actor',x:1,y:2,rotation:0},{id:'lever1',assetId:'lever',x:2,y:2,rotation:0},{id:'goal1',assetId:'goal',x:8,y:2,rotation:0}];
  return {p,l,effect:p.assets[2]};
}
const effectAction=extra=>behaviour('applyEffect',{eligibleMode:'selected',eligibleAssetIds:['lever'],action:'switchState',stateKey:'on',stateEnabled:true,stateToggle:true,...extra});
const use=trigger=>behaviour('useEffect',{usableAssetIds:['lever'],useTarget:'used',trigger});

test('Apply Effect toggles exclusive states every turn and keeps defaults and other copies intact',()=>{
  let {p,l,effect}=fixture();l.instances.push({...l.instances[1],id:'other',x:10});effect.behaviours=[effectAction()];
  for(const expected of [true,false,true]){
    p=resolveTurn(p).project;const level=p.levels[0];
    assert.equal(stateEnabled(p,p.assets.find(a=>a.id==='on'),level.instances[1]),expected);
    assert.equal(stateEnabled(p,p.assets.find(a=>a.id==='on'),level.instances[3]),false);
    assert.equal(p.assets.find(a=>a.id==='on').enabled,false);
  }
});

test('Use triggers movement once on the clicked object and saves through project and level copies',()=>{
  const {p,l,effect}=fixture();effect.behaviours=[use(behaviour('moveTo',{id:'trigger',steps:2,target:'current',patrolId:null}))];
  l.instances[1].moveTarget={type:'tags',tagIds:['chosen']};
  assert.equal(resolveTurn(p).project.levels[0].instances[1].x,2);
  const run=useObject(p,[],[],availableUses(p,l)[0]);
  assert.equal(run.project.levels[0].instances[1].x,4);assert.ok(run.events.some(e=>e.type==='moved'&&e.instanceId==='lever1'));
  assert.equal(p.levels[0].instances[1].x,2);assert.doesNotThrow(()=>validateProject(JSON.parse(JSON.stringify(run.project))));
  const copied=copyLevel(l,(()=>{let n=0;return ()=>'copy'+n++;})());assert.deepEqual(copied.instances[1].moveTarget,{type:'tags',tagIds:['chosen']});
});

test('Use supports every active trigger and preserves linked-target effects',()=>{
  for(const trigger of [effectAction({id:'trigger',eligibleMode:'any',eligibleAssetIds:null}),behaviour('moveAway',{id:'trigger',steps:1}),behaviour('teleport',{id:'trigger',teleportTarget:'self',targetInstanceId:null,destination:{type:'position',x:5,y:2}}),behaviour('expand',{id:'trigger',allowStacking:false})]){
    const {p,l,effect}=fixture();effect.behaviours=[use(trigger)];l.instances[1].moveTarget={type:'position',x:0,y:2};
    const run=useObject(p,[],[],availableUses(p,l)[0]);assert.ok(run.log[0].count>0,trigger.type);
  }
  const {p,l,effect}=fixture();l.objectLinks=[{id:'link',name:'Link',rule:'',color:'#abcdef',instanceIds:['lever1','goal1']}];
  effect.behaviours=[{...use(behaviour('applyEffect',{id:'trigger',action:'graveyard',eligibleMode:'any',eligibleAssetIds:null})),useTarget:'linked'}];
  assert.equal(useObject(p,[],[],availableUses(p,l)[0]).graveyard[0].assetId,'goal');
});

test('Tag matching follows active state overrides, matches any chosen tag, and empty/deleted tags match nothing',()=>{
  let {p,l,effect}=fixture();assert.equal(matchesTags(p,l.instances[1],['chosen']),false);
  effect.behaviours=[behaviour('useEffect',{usableMode:'tags',usableAssetIds:null,usableTagIds:['chosen'],useTarget:'used',action:'graveyard'})];
  assert.equal(availableUses(p,l).length,0);
  p=applyAction(p,{type:'instance.state',data:{levelId:l.id,id:'lever1',stateId:'on',enabled:true}});l=p.levels[0];
  assert.equal(availableUses(p,l).length,1);assert.equal(matchesTags(p,l.instances[1],['missing','chosen']),true);
  for(const tags of [[],['missing']]){p.assets[2].behaviours[0].usableTagIds=tags;assert.equal(availableUses(p,l).length,0);}
  p=applyAction(p,{type:'tag.delete',data:{id:'chosen'}});assert.equal(matchesTags(p,p.levels[0].instances[1],['chosen']),false);
});

test('Tags select effect recipients, blockers, overlap counts, and Use targets',()=>{
  let {p,l,effect}=fixture();l.instances[2].x=3;
  effect.behaviours=[effectAction({action:'graveyard',stateToggle:false,eligibleMode:'tags',eligibleAssetIds:null,eligibleTagIds:['chosen']})];
  assert.deepEqual(resolveTurn(p).graveyard[0].items.map(i=>i.id),['goal1']);
  effect.behaviours=[behaviour('blockNode',{blockMode:'tags',blockAssetIds:null,blockTagIds:['chosen'],blockScope:'movement'})];
  assert.ok(blockedNodes(p,l,'goal','movement','goal1').has('3,2'));assert.equal(blockedNodes(p,l,'lever','movement','lever1').size,0);
  effect.overlapTagIds=['chosen'];effect.overlapThreshold=1;assert.equal(parameterOverlay(p,p.assets[0],effect,l.instances[0],l).count,1);
  effect.behaviours=[{...use(effectAction({id:'trigger',action:'graveyard',stateToggle:false})),useTarget:'tags',targetTagIds:['chosen']}];
  assert.deepEqual(useObject(p,[],[],availableUses(p,l)[0]).graveyard[0].items.map(i=>i.id),['goal1']);
});

test('Tag destinations are dynamic, exclude self, break distance ties in saved order, and missing tags do nothing',()=>{
  const {p,l}=fixture();p.assets[0].behaviours=[behaviour('moveTo',{steps:1,target:'current',patrolId:null})];
  l.instances[0].moveTarget={type:'tags',tagIds:['chosen']};l.instances=l.instances.filter(i=>i.id!=='lever1');
  assert.equal(resolveTurn(p).project.levels[0].instances[0].x,2);
  p.assets[0].behaviours=[behaviour('teleport',{teleportTarget:'self',destination:{type:'tags',tagIds:['chosen']}})];
  assert.equal(resolveTurn(p).project.levels[0].instances[0].x,8);
  l.instances[0].x=5;l.instances.push({id:'goal2',assetId:'goal',x:2,y:2,rotation:0});
  assert.equal(resolveTurn(p).project.levels[0].instances[0].x,8);
  p.assets[0].behaviours[0].destination.tagIds=[];assert.equal(resolveTurn(p).project.levels[0].instances[0].x,5);
});

test('Teleport can target every tagged placement, and hierarchy copies remap nested Use state references',()=>{
  const {p,l,effect}=fixture();l.instances.push({id:'goal2',assetId:'goal',x:9,y:2,rotation:0});
  p.assets[0].behaviours=[behaviour('teleport',{teleportTarget:'tags',targetTagIds:['chosen'],destination:{type:'position',x:6,y:2}})];
  assert.deepEqual(resolveTurn(p).project.levels[0].instances.filter(i=>i.assetId==='goal').map(i=>i.x),[6,6]);
  effect.parentId='lever';effect.behaviours=[use(effectAction({id:'trigger'}))];
  let n=0;const copy=copyHierarchy(p,'lever',()=>`copy${n++}`);assert.equal(copy.find(a=>a.icon==='area').behaviours[0].trigger.stateKey,copy.find(a=>a.name==='on').id);
});

test('Validation rejects malformed tag selectors, passive Use triggers, and recursive Use triggers',()=>{
  for(const invalid of [use(behaviour('blockNode',{blockAssetIds:null,blockScope:'movement'})),use(behaviour('useEffect',{usableAssetIds:null,useTarget:'used',action:'graveyard'})),use({...effectAction(),trigger:{}}),behaviour('teleport',{teleportTarget:'tags',targetTagIds:null,destination:{type:'position',x:0,y:0}}),effectAction({eligibleMode:'tags',eligibleTagIds:['chosen','chosen']})]){
    const {p,effect}=fixture();effect.behaviours=[invalid];assert.throws(()=>validateProject(p));
  }
});

test('Overlap tags persist through editing, synchronize parameter uses, and can be cleared',()=>{
  let {p,l}=fixture();l.instances[1].x=3;l.instances[2].x=3;
  p=applyAction(p,{type:'asset.update',data:{id:'area',overlapTagIds:['chosen'],overlapThreshold:1}});
  assert.deepEqual(p.assets[2].overlapTagIds,['chosen']);
  assert.equal(parameterOverlay(p,p.assets[0],p.assets[2],p.levels[0].instances[0],p.levels[0]).count,1);
  p=applyAction(p,{type:'parameter.attach',data:{id:'area',parentId:'goal',usageId:'other-area',originalUsageId:'actor-area'}});
  assert.deepEqual(p.assets.find(a=>a.id==='other-area').overlapTagIds,['chosen']);
  p=applyAction(p,{type:'asset.update',data:{id:'area',overlapTagIds:null}});
  assert.equal(p.assets.find(a=>a.id==='other-area').overlapTagIds,null);
  assert.equal(parameterOverlay(p,p.assets[0],p.assets.find(a=>a.id==='area'),p.levels[0].instances[0],p.levels[0]).count,2);
});
