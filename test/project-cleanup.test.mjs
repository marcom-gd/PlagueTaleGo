import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {newProject,blankLevel,applyAction,validateProject} from '../public/model.js';
import {reviewProjectCleanup} from '../public/project-cleanup.js';
import {createWorkshopServer} from '../server.mjs';

const asset=(id,extra={})=>({id,name:id,kind:'token',icon:'guard',rule:'',tags:[],range:1,color:'#b8cf96',parentId:null,...extra});
const tag=id=>({id,name:id,rule:'',color:'#b8cf96'});
const piece=(id,assetId,extra={})=>({id,assetId,x:2,y:2,rotation:0,...extra});
const ids=items=>items.map(item=>item.id);
function fixture(){
  let p=newProject();
  p.tags=[tag('living'),tag('overlap-tag'),tag('target-tag'),tag('unused-tag')];
  p.assets=[asset('guard',{tags:['living'],behaviours:[{id:'spawn',type:'spawn',enabled:false,spawnAssetId:'rat',spawnCount:1}]}),
    asset('sleeping',{kind:'state',enabled:false,parentId:'guard'}),asset('carried',{parentId:'sleeping'}),
    asset('rat'),asset('inventory'),asset('hidden-object'),asset('unused',{tags:['unused-tag']}),
    asset('unused-state',{kind:'state',parentId:'unused',enabled:false}),
    asset('light',{icon:'area',overlapAssetIds:['overlap-object'],overlapTagIds:['overlap-tag'],behaviours:[
      {id:'use',type:'useEffect',enabled:false,usableAssetIds:[],useTarget:'tags',targetTagIds:['target-tag'],trigger:{id:'nested-spawn',type:'spawn',enabled:true,spawnAssetId:'trigger-object',spawnCount:1}}
    ]}),asset('overlap-object'),asset('trigger-object'),asset('unused-parameter',{icon:'area'})];
  p=applyAction(p,{type:'parameter.attach',data:{id:'light',parentId:'sleeping',usageId:'light-use'}});
  p=applyAction(p,{type:'parameter.attach',data:{id:'light',parentId:'unused',usageId:'unused-light-use'}});
  for(const id of ['used-block','unused-block'])p=applyAction(p,{type:'behaviour.save',data:{id,name:id,rule:'',behaviour:{id:`${id}-source`,type:'moveAway',enabled:false,steps:1}}});
  p=applyAction(p,{type:'behaviour.attach',data:{id:'guard',definitionId:'used-block',usageId:'flee'}});
  p.behaviourOrder=['flee','spawn','use'];
  p.levels=[blankLevel('first'),{...blankLevel('hidden'),hideFromPlaytest:true}];
  p.levels[0].instances=[piece('g','guard',{locked:true,stateOverrides:{sleeping:false}})];
  p.levels[0].startingInventory=[{assetId:'inventory',count:0}];
  p.levels[0].postIts=[{id:'note',text:'unused-parameter',x:1,y:1,color:'#b8cf96'}];
  p.levels[1].instances=[piece('h','hidden-object',{location:'graveyard'})];
  return validateProject(p);
}

test('cleanup keeps transitive rules, disabled hierarchies, shared parameters, hidden levels and inventory',()=>{
  const p=fixture(),before=structuredClone(p),{project,removed,total}=reviewProjectCleanup(p);
  assert.deepEqual(ids(removed.assets),['unused','unused-state','unused-parameter','unused-light-use']);
  assert.deepEqual(ids(removed.tags),['unused-tag']);
  assert.deepEqual(ids(removed.behaviourLibrary),['unused-block']);
  assert.equal(total,6);
  assert.deepEqual(project.levels,p.levels);
  assert.deepEqual(project.behaviourOrder,p.behaviourOrder);
  assert.deepEqual(project.assets,p.assets.filter(a=>!ids(removed.assets).includes(a.id)));
  assert.deepEqual(project.behaviourLibrary,[p.behaviourLibrary[0]]);
  assert.deepEqual(p,before);
  assert.deepEqual(applyAction(p,{type:'project.replace',data:project}),project);
  assert.deepEqual(applyAction(project,{type:'project.replace',data:before}),before);
  assert.equal(reviewProjectCleanup(project).total,0);
});

test('a directly placed child keeps its entire hierarchy and siblings',()=>{
  const p=fixture();p.levels[0].instances=[piece('child','carried')];
  const {project}=reviewProjectCleanup(p);
  assert.ok(project.assets.some(a=>a.id==='guard'));
  assert.ok(project.assets.some(a=>a.id==='sleeping'));
  assert.ok(project.assets.some(a=>a.id==='light-use'));
  assert.ok(project.assets.some(a=>a.id==='rat'));
  assert.deepEqual(project.levels,p.levels);
});

test('unreachable cycles and their dependencies are removed; stale resolution order is pruned',()=>{
  const p=newProject();
  p.assets=[asset('a',{behaviours:[{id:'a-spawn',type:'spawn',enabled:true,spawnAssetId:'b',spawnCount:1}]}),
    asset('b',{behaviours:[{id:'b-spawn',type:'spawn',enabled:true,spawnAssetId:'a',spawnCount:1}]})];
  p.behaviourOrder=['a-spawn','b-spawn'];
  const {project,total}=reviewProjectCleanup(p);
  assert.equal(total,2);assert.deepEqual(project.assets,[]);assert.deepEqual(project.behaviourOrder,[]);
});

test('all explicit behaviour reference types and tag selectors preserve definitions',()=>{
  const p=newProject(),references={spawnAssetId:'spawned',throwAssetId:'thrown',targetAssetId:'win-target',stateKey:'state',
    eligibleAssetIds:['eligible'],usableAssetIds:['usable'],blockAssetIds:['blocked'],throwTargetAssetIds:['throw-target'],hitAssetIds:['hit'],distractAssetIds:['distracted'],
    eligibleTagIds:['eligible-tag'],usableTagIds:['usable-tag'],blockTagIds:['block-tag'],targetTagIds:['target-tag']};
  const assetIds=['spawned','thrown','win-target','eligible','usable','blocked','throw-target','hit','distracted'];
  p.assets=[asset('owner',{icon:'area',behaviours:[{id:'rule',type:'useEffect',enabled:true,usableAssetIds:[],useTarget:'used',action:'switchState',stateEnabled:true,...references}]}),
    ...assetIds.map(id=>asset(id)),asset('state-parent'),asset('state',{kind:'state',enabled:false,parentId:'state-parent'}),asset('unused')];
  p.tags=['eligible-tag','usable-tag','block-tag','target-tag'].map(tag);
  p.levels[0].instances=[piece('owner-piece','owner')];
  const {removed}=reviewProjectCleanup(p);
  assert.deepEqual(ids(removed.assets),['unused']);assert.deepEqual(removed.tags,[]);
});

test('empty and already clean projects preserve optional fields and project content',()=>{
  const p=newProject();
  assert.deepEqual(reviewProjectCleanup(p),{project:p,removed:{assets:[],tags:[],behaviourLibrary:[]},total:0});
  p.cardDraws=[{id:'draw',deckId:'experiments',cardId:'card',title:'Keep this',task:'Try something',reflection:''}];
  p.assets=[asset('only')];p.levels[0].instances=[piece('piece','only')];
  const review=reviewProjectCleanup(p);
  assert.equal(review.total,0);assert.deepEqual(review.project,p);
});

test('reviewed cleanup saves through HTTP, rejects concurrent edits and survives restart',async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'workshop-cleanup-'));let server;
  const start=async()=>{server=await createWorkshopServer({dataDir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}/api/rooms/cleanup`;};
  const stop=async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;};
  try{
    let url=await start(),revision=(await(await fetch(url)).json()).revision;
    const send=async(action,expectedRevision=revision)=>{
      const response=await fetch(url+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,actionId:crypto.randomUUID(),expectedRevision})});
      const result=await response.json();if(response.ok)revision=result.revision;return {response,result};
    };
    assert.equal((await send({type:'project.replace',data:fixture()})).response.status,200);
    const reviewedRevision=revision,review=reviewProjectCleanup(fixture());
    assert.equal((await send({type:'asset.add',data:asset('new-object')})).response.status,200);
    assert.equal((await send({type:'project.replace',data:review.project},reviewedRevision)).response.status,409);
    const latest=(await(await fetch(url)).json()).project,next=reviewProjectCleanup(latest).project;
    assert.equal((await send({type:'project.replace',data:next})).response.status,200);
    await stop();url=await start();assert.deepEqual((await(await fetch(url)).json()).project,next);
  }finally{if(server)await stop();await rm(dataDir,{recursive:true,force:true});}
});
