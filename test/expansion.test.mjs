import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,validateProject,applyAction,linkKey} from '../public/model.js';
import {resolveTurn,availableUses,useObject} from '../public/behaviours.js';

const asset=(id,extra={})=>({id,name:id,icon:'rat',kind:'token',parentId:null,color:'#b8cf96',tags:[],rule:'',range:4,...extra});
function fixture(triggered=false){
  const p=newProject(),l=p.levels[0];l.tiles={};l.nodes=['1,2','2,2','3,2','4,2','5,2'];
  const expand={id:'spread',type:'expand',enabled:true,allowStacking:false};
  p.assets=[asset('rat'),asset('area',{icon:'area',parentId:'rat',behaviours:[triggered?{id:'use',type:'useEffect',enabled:true,usableAssetIds:['rat'],useTarget:'used',trigger:expand}:expand]})];
  l.instances=[{id:'owner',assetId:'rat',x:1,y:2,rotation:0}];
  if(triggered){
    p.assets.push(asset('operator'));p.assets[1].parentId='operator';
    l.instances.push({id:'operator-piece',assetId:'operator',x:1,y:1,rotation:0});
  }
  return {p,l,expand};
}
function copies(p,triggered=false){
  const run=triggered?useObject(p,[],[],availableUses(p,p.levels[0])[0]):resolveTurn(p);
  return run.project.levels[0].instances.filter(i=>i.assetId==='rat'&&i.id!=='owner').map(i=>`${i.x},${i.y}`);
}

for(const triggered of [false,true])test(`${triggered?'Use-triggered':'Automatic'} expansion stops at broken links, gaps and disconnected diagonal nodes`,()=>{
  const {p,l}=fixture(triggered);
  l.blockedLinks=[linkKey('2,2','3,2')];
  assert.deepEqual(copies(p,triggered),['2,2']);
  l.blockedLinks=[];l.nodes=l.nodes.filter(key=>key!=='3,2');
  assert.deepEqual(copies(p,triggered),['2,2']);
  l.nodes=['1,2','2,3'];assert.deepEqual(copies(p,triggered),[]);
  l.nodes=['2,2','3,2'];assert.deepEqual(copies(p,triggered),[]);
});

test('expansion can follow a connected detour inside its area, but cannot route outside it',()=>{
  const {p,l}=fixture();l.blockedLinks=[linkKey('2,2','3,2')];
  l.nodes.push('2,3','3,3');
  assert.ok(copies(p).includes('5,2'));
  p.assets[1].icon='cross';assert.deepEqual(copies(p),['2,2']);
  p.assets[1].icon='sight';p.assets[1].rotation=90;
  assert.deepEqual(copies(p),['2,2']); // Directional areas exclude the origin itself.
});

for(const triggered of [false,true])test(`${triggered?'Use-triggered':'Automatic'} expansion defaults to avoiding stairs, and can opt into connected stairs`,()=>{
  const {p,l,expand}=fixture(triggered);
  l.tiles={'1,2':'floor','2,2':'floor','3,2':'stairs','4,2':'floor-elevated','5,2':'floor-elevated'};
  for(const option of [undefined,true]){
    if(option===undefined)delete expand.doNotExpandAcrossStairs;else expand.doNotExpandAcrossStairs=option;
    assert.deepEqual(copies(p,triggered),['2,2']);
  }
  expand.doNotExpandAcrossStairs=false;
  assert.deepEqual(copies(p,triggered),['2,2','3,2','4,2','5,2']);
  l.blockedLinks=[linkKey('2,2','3,2')];assert.deepEqual(copies(p,triggered),['2,2']);
  l.blockedLinks=[];l.tiles['3,2']='floor';assert.deepEqual(copies(p,triggered),['2,2','3,2']);
});

test('expansion from stairs requires the option off, even when stacking is enabled',()=>{
  const {p,l,expand}=fixture();l.tiles={'1,2':'stairs','2,2':'floor','3,2':'floor','4,2':'floor','5,2':'floor'};
  expand.allowStacking=true;assert.deepEqual(copies(p),[]);
  expand.doNotExpandAcrossStairs=false;assert.deepEqual(copies(p),['1,2','2,2','3,2','4,2','5,2']);
});

test('bare nodes cannot bypass a floor transition even when a different stair opens the effect line',()=>{
  const {p,l,expand}=fixture();
  // The straight effect ray crosses the stair at 2,2, but the actual node route
  // goes around it via bare nodes. That route must retain the Ground height.
  l.tiles={'1,2':'floor','2,2':'stairs','3,2':'floor-elevated'};
  l.nodes=['1,2','1,3','2,3','3,3','3,2'];expand.doNotExpandAcrossStairs=false;
  assert.ok(!copies(p).includes('3,2'));
});

test('expansion stairs settings survive saving and validate for direct, reusable and Use behaviours',()=>{
  for(const triggered of [false,true])for(const option of [undefined,true,false]){
    const {p,expand}=fixture(triggered);
    if(option!==undefined)expand.doNotExpandAcrossStairs=option;
    const loaded=validateProject(JSON.parse(JSON.stringify(p)));
    assert.deepEqual(loaded,p);
    assert.deepEqual(copies(loaded,triggered),copies(p,triggered));
    for(const invalid of [null,0,'false']){
      expand.doNotExpandAcrossStairs=invalid;assert.throws(()=>validateProject(p),/expansion stairs option/);
    }
  }
  const {p,expand}=fixture();expand.doNotExpandAcrossStairs=false;
  let saved=applyAction(p,{type:'behaviour.save',data:{id:'shared',name:'Shared Expand',rule:'',behaviour:{...expand,id:'shared-spread'}}});
  assert.equal(saved.behaviourLibrary.find(b=>b.id==='shared').behaviour.doNotExpandAcrossStairs,false);
  saved=applyAction(saved,{type:'behaviour.attach',data:{id:'area',definitionId:'shared',usageId:'shared-use'}});
  assert.equal(saved.assets[1].behaviours.find(b=>b.id==='shared-use').doNotExpandAcrossStairs,false);
  assert.doesNotThrow(()=>validateProject(JSON.parse(JSON.stringify(saved))));
});
