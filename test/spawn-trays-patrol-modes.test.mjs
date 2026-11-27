import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,applyAction,validateProject,stateEnabled} from '../public/model.js';
import {resolveTurn,availableUses,useObject,eventsAdvanceTurn} from '../public/behaviours.js';
import {copyHierarchy,copyLevel} from '../public/editing.js';
import {createSequence,nextTurn,previousTurn,validateSequence} from '../public/turn-sequence.js';

const asset=(id,extra={})=>({id,name:id,icon:'guard',kind:'token',rule:'',tags:[],range:1,color:'#b8cf96',parentId:null,...extra});
const placed=(id,assetId,x=2,y=2)=>({id,assetId,x,y,rotation:0,note:''});
const behaviour=(id,type,extra={})=>({id,type,enabled:true,...extra});
const spawn=extra=>behaviour('spawn','spawn',{spawnAssetId:'rat',spawnCount:1,...extra});
function fixture(){
  const p=newProject(),l=p.levels[0];l.width=12;l.height=8;l.tiles={};l.nodes=Array.from({length:8},(_,x)=>`${x},2`);
  p.assets=[asset('guard'),asset('rat',{icon:'rat'})];l.instances=[placed('g','guard')];return {p,l};
}
const stored=tray=>tray.flatMap(s=>s.items);

test('death switches state, flushes the original rats, spawns a fresh rat and retires the guard in the same turn',()=>{
  const {p,l}=fixture();p.assets[0].exclusiveStates=true;
  p.assets.push(asset('alive',{kind:'state',parentId:'guard',enabled:true}),asset('dead',{kind:'state',parentId:'guard',enabled:false,behaviours:[spawn(),behaviour('retire','addToTray',{tray:'graveyard'})]}),
    asset('dead-self',{icon:'self',parentId:'dead',behaviours:[behaviour('flush','applyEffect',{eligibleAssetIds:['rat'],action:'flush'})]}),
    asset('rat-self',{icon:'self',parentId:'rat',behaviours:[behaviour('kill','applyEffect',{eligibleAssetIds:['guard'],action:'switchState',stateKey:'dead',stateEnabled:true})]}));
  l.instances.push(placed('r1','rat'),placed('r2','rat',3));
  p.behaviourOrder=['kill','flush','spawn','retire'];const before=structuredClone(p);
  const state={project:p,inventory:[],graveyard:[],levelId:l.id};let seq=nextTurn(createSequence(state),state,()=> 'new-rat');
  const result=seq.frames[1];assert.deepEqual(p,before);
  assert.deepEqual(result.project.levels[0].instances,[placed('new-rat','rat')].map(i=>({...i,locked:false})));
  assert.deepEqual(stored(result.graveyard).map(i=>i.id),['r1','r2','g']);
  const guard=stored(result.graveyard).find(i=>i.id==='g');assert.equal(stateEnabled(result.project,result.project.assets.find(a=>a.id==='dead'),guard),true);
  assert.equal(result.log.filter(b=>b.type==='spawn').length,1);assert.equal(result.log.some(b=>b.instanceId==='new-rat'),false);
  assert.deepEqual(validateSequence(JSON.parse(JSON.stringify(seq))),seq);
  seq=previousTurn(seq,result);assert.deepEqual(seq.frames[seq.cursor].project,p);
  p.behaviourOrder=['kill','spawn','flush','retire'];assert.equal(resolveTurn(p,[],[],()=> 'new-rat').project.levels[0].instances.length,0);
  p.behaviourOrder=['kill','retire','flush','spawn'];assert.equal(resolveTurn(p).log.some(b=>b.type==='spawn'),false);
});

test('Spawn uses definition defaults, stacks at the parent, waits to act, and skips missing or non-object definitions',()=>{
  const {p,l}=fixture();p.assets[0].behaviours=[spawn({spawnCount:2})];
  p.assets[1].behaviours=[behaviour('walk','moveTo',{target:'patrolEnd',patrolId:'route',steps:1})];
  p.assets.push(asset('sleeping',{kind:'state',parentId:'rat',enabled:true}));
  l.patrols=[{id:'route',name:'Route',color:'#abcdef',hidden:false,nodes:['2,2','3,2']}];
  l.instances[0].stateOverrides={};l.instances[0].moveTarget={type:'position',x:6,y:2};
  let n=0;const run=resolveTurn(p,[],[],()=>`rat-${++n}`),rats=run.project.levels[0].instances.filter(i=>i.assetId==='rat');
  assert.equal(rats.length,2);assert.ok(rats.every(i=>i.x===2&&i.y===2&&i.stateOverrides===undefined&&i.moveTarget===undefined));
  assert.ok(rats.every(i=>stateEnabled(run.project,run.project.assets.find(a=>a.id==='sleeping'),i)));assert.equal(run.log.length,1);
  for(const spawnAssetId of ['missing','sleeping']){p.assets[0].behaviours=[spawn({spawnAssetId})];assert.equal(resolveTurn(p).project.levels[0].instances.length,1);}
});

test('Spawn overflow preserves the whole input and turn history',()=>{
  const {p,l}=fixture();p.assets[0].behaviours=[spawn({spawnCount:2})];
  for(let n=1;n<999;n++)l.instances.push(placed(`filler-${n}`,'rat'));
  const state={project:p,inventory:[],graveyard:[],levelId:l.id},seq=createSequence(state),before=structuredClone(seq);
  assert.throws(()=>nextTurn(seq,state),/1,000/);assert.deepEqual(seq,before);assert.deepEqual(p,before.frames[0].project);
});

test('self transfers preserve placement state, stack in both trays, prune links, and cancel later actions',()=>{
  for(const tray of ['inventory','graveyard']){
    const {p,l}=fixture();p.assets[0].behaviours=[behaviour('store','addToTray',{tray}),spawn()];
    l.instances.push(placed('r','rat'));l.objectLinks=[{id:'link',name:'Link',rule:'',color:'#abcdef',instanceIds:['g','r']}];
    l.instances[0].moveTarget={type:'object',id:'r'};l.instances[0].locked=true;
    const previous=[{id:'old-stack',assetId:'guard',count:1,items:[placed('old','guard')]}];
    const result=resolveTurn(p,tray==='inventory'?previous:[],tray==='graveyard'?previous:[]);
    assert.deepEqual(result.project.levels[0].instances.map(i=>i.id),['r']);assert.equal(result.project.levels[0].objectLinks.length,0);
    assert.equal(result[tray][0].count,2);assert.deepEqual(result[tray][0].items[1],{...l.instances[0],sourceLevelId:l.id});assert.equal(previous[0].count,1);assert.equal(result.log.length,1);
  }
});

test('Apply Effect can collect eligible objects into an infinite inventory stack without changing its count',()=>{
  const {p,l}=fixture();p.assets.push(asset('reach',{icon:'area',parentId:'guard',behaviours:[behaviour('collect','applyEffect',{action:'inventory',eligibleAssetIds:['rat']})]}));
  l.instances.push(placed('r','rat',3));
  const inventory=[{id:'infinite',assetId:'rat',count:0,items:[placed('stored','rat')]}];
  const result=resolveTurn(p,inventory);assert.equal(result.inventory[0].count,0);assert.equal(result.inventory[0].items.length,2);assert.equal(inventory[0].items.length,1);assert.equal(result.graveyard.length,0);
});

test('Use can trigger Spawn and tray transfers on the clicked target, with inventory events and no input mutation',()=>{
  for(const trigger of [spawn(),behaviour('store','addToTray',{tray:'inventory'}),behaviour('bury','addToTray',{tray:'graveyard'})]){
    const {p,l}=fixture();l.instances.push(placed('r','rat',3));
    p.assets[1].behaviours=[behaviour('event','advanceOnEvent',{events:['inventoryAdded']})];
    p.assets.push(asset('reach',{icon:'area',parentId:'guard',behaviours:[behaviour('use','useEffect',{usableAssetIds:['rat'],useTarget:'used',trigger})]}));
    const before=structuredClone(p),result=useObject(p,[],[],availableUses(p,l)[0]);assert.deepEqual(p,before);
    if(trigger.type==='spawn')assert.deepEqual(result.project.levels[0].instances.filter(i=>!['g','r'].includes(i.id)).map(i=>[i.assetId,i.x,i.y]),[['rat',3,2]]);
    else {assert.deepEqual(stored(result[trigger.tray]).map(i=>i.id),['r']);assert.equal(eventsAdvanceTurn(p,result.project,result.events),trigger.tray==='inventory');}
  }
});

function patrolFixture(target='patrolStart',patrolMode='loop'){
  const {p,l}=fixture();l.instances[0].x=0;l.nodes=['0,2','1,2','1,3','0,3'];
  l.patrols=[{id:'route',name:'Route',color:'#abcdef',hidden:false,nodes:[...l.nodes]}];
  p.assets[0].behaviours=[behaviour('walk','moveTo',{steps:1,target,patrolId:'route',...(patrolMode?{patrolMode}:{})})];
  if(target==='patrolEnd')l.instances[0].y=3;return {p,l};
}
test('Loop wraps connected endpoints in both directions; legacy and explicit Ping-pong reverse',()=>{
  for(const [target,expected] of [['patrolStart',[[1,2],[1,3],[0,3],[0,2],[1,2]]],['patrolEnd',[[1,3],[1,2],[0,2],[0,3],[1,3]]]]){
    let {p}=patrolFixture(target);for(const position of expected){p=resolveTurn(p).project;assert.deepEqual([p.levels[0].instances[0].x,p.levels[0].instances[0].y],position);}
  }
  for(const mode of [undefined,'pingPong']){let {p}=patrolFixture('patrolStart',mode??null);for(let n=0;n<4;n++)p=resolveTurn(p).project;assert.deepEqual([p.levels[0].instances[0].x,p.levels[0].instances[0].y],[1,3]);}
});

test('Loop return paths persist over turns and copied levels, and respect blocked connections and occupancy',()=>{
  let {p,l}=patrolFixture();l.patrols[0].nodes=['0,2','1,2','1,3'];
  for(let n=0;n<3;n++)p=resolveTurn(p).project;
  assert.equal(p.levels[0].instances[0].patrolProgress.walk,'loopStart');
  const next=resolveTurn(p).project;assert.deepEqual([next.levels[0].instances[0].x,next.levels[0].instances[0].y],[0,2]);
  const copy=copyLevel(p.levels[0]);p.levels.push(copy);assert.deepEqual(resolveTurn(p).project.levels.map(l=>[l.instances[0].x,l.instances[0].y]),[[0,2],[0,2]]);
  ({p,l}=patrolFixture());l.instances[0].y=3;l.instances[0].patrolProgress={walk:'end'};l.blockedLinks=['0,2|0,3'];
  // The closed edge is blocked, so return via the remaining connected route.
  let run=resolveTurn(p);assert.deepEqual([run.project.levels[0].instances[0].x,run.project.levels[0].instances[0].y],[1,3]);
  l.instances.push(placed('block','rat',1,3));run=resolveTurn(p);assert.equal(run.log[0].count,0);
});
test('closed patrols complete the painted circuit in either direction and respect the closing connection',()=>{
  for(const [target,steps] of [['patrolStart',[[1,2],[1,3],[0,3],[0,2],[1,2]]],['patrolEnd',[[0,3],[1,3],[1,2],[0,2],[0,3]]]]){
    let {p,l}=patrolFixture(target);
    l.instances[0].y=2;
    l.patrols[0].nodes.push('0,2');
    for(const position of steps){
      p=resolveTurn(p).project;
      assert.deepEqual([p.levels[0].instances[0].x,p.levels[0].instances[0].y],position);
    }
  }
  let {p,l}=patrolFixture();
  l.patrols[0].nodes.push('0,2');l.blockedLinks=['0,2|0,3'];p.assets[0].behaviours[0].steps=5;
  p=resolveTurn(p).project;
  assert.deepEqual([p.levels[0].instances[0].x,p.levels[0].instances[0].y],[0,3]);
  p.levels[0].blockedLinks=[];p.assets[0].behaviours[0].steps=2;
  p=resolveTurn(p).project;
  assert.deepEqual([p.levels[0].instances[0].x,p.levels[0].instances[0].y],[1,2]);
  ({p,l}=patrolFixture('patrolEnd'));
  l.patrols[0].nodes.push('0,2');l.nodes.push('2,3');l.instances[0].x=2;
  for(const position of [[1,3],[1,2],[0,2],[0,3]]){
    p=resolveTurn(p).project;
    assert.deepEqual([p.levels[0].instances[0].x,p.levels[0].instances[0].y],position);
  }
});

test('new settings validate, save as reusable blocks, and remap internal Spawn references in hierarchy copies',()=>{
  let {p}=fixture();p.assets[1].parentId='guard';p.assets[0].behaviours=[spawn()];
  const copy=copyHierarchy(p,'guard');assert.equal(copy[0].behaviours[0].spawnAssetId,copy.find(a=>a.name==='rat').id);
  p=applyAction(p,{type:'behaviour.save',data:{id:'spawn-block',name:'Spawn Rat',rule:'',behaviour:spawn({id:'shared-spawn'})}});
  p=applyAction(p,{type:'behaviour.attach',data:{definitionId:'spawn-block',id:'guard',usageId:'attached'}});
  assert.doesNotThrow(()=>validateProject(JSON.parse(JSON.stringify(p))));
  for(const invalid of [spawn({spawnCount:0}),spawn({spawnCount:101}),spawn({spawnCount:1.5}),spawn({spawnAssetId:''}),behaviour('bad','addToTray',{tray:'void'}),behaviour('bad','moveTo',{steps:1,target:'patrolStart',patrolId:null,patrolMode:'teleport'})]){
    const {p}=fixture();p.assets[0].behaviours=[invalid];assert.throws(()=>validateProject(p));
  }
});
