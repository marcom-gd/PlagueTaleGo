import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,applyAction,validateProject,stateEnabled,appearance,activeDescendants,uid} from '../public/model.js';
import {copyHierarchy,copyLevel} from '../public/editing.js';
function fixture(){
  const p=newProject(),l=p.levels[0];
  const token=(id,parentId=null)=>({id,name:id,icon:'torch',variant:'on',kind:'token',rule:'',tags:[],color:'#edc47c',range:2,parentId});
  p.assets=[{...token('torch'),exclusiveStates:true},{...token('lit','torch'),kind:'state',enabled:true},{...token('unlit','torch'),kind:'state',enabled:false,variant:'off'},{...token('light','lit'),icon:'area',variant:'default'}];
  // Parameters use the icon's actual default variant when supplied.
  delete p.assets[3].variant;
  l.instances=[{id:'one',assetId:'torch',x:4,y:4,rotation:0},{id:'two',assetId:'torch',x:6,y:4,rotation:0}];
  return {p,l};
}
test('placement states independently change appearance and nested effects, persist, and reset to defaults',()=>{
  let {p,l}=fixture();p=applyAction(p,{type:'instance.state',data:{levelId:l.id,id:'one',stateId:'unlit',enabled:true}});
  const [one,two]=p.levels[0].instances;
  assert.equal(appearance(p,p.assets[0],one).variant,'off');assert.equal(appearance(p,p.assets[0],two).variant,'on');
  assert.equal(activeDescendants(p,'torch',one).some(a=>a.id==='light'),false);assert.equal(activeDescendants(p,'torch',two).some(a=>a.id==='light'),true);
  assert.equal(p.assets.find(a=>a.id==='lit').enabled,true);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  p=applyAction(p,{type:'instance.resetStates',data:{levelId:l.id,id:'one'}});assert.equal(appearance(p,p.assets[0],p.levels[0].instances[0]).variant,'on');
});
test('exclusive groups enforce one effective state for defaults and overrides, while optional combination remains available',()=>{
  let {p,l}=fixture();p=applyAction(p,{type:'asset.update',data:{id:'unlit',enabled:true}});assert.equal(p.assets[1].enabled,false);
  p=applyAction(p,{type:'instance.state',data:{levelId:l.id,id:'one',stateId:'lit',enabled:true}});
  assert.equal(stateEnabled(p,p.assets[2],p.levels[0].instances[0]),false);
  p=applyAction(p,{type:'asset.update',data:{id:'torch',exclusiveStates:false}});
  p=applyAction(p,{type:'instance.state',data:{levelId:l.id,id:'one',stateId:'unlit',enabled:true}});
  assert.equal(activeDescendants(p,'torch',p.levels[0].instances[0]).filter(a=>a.kind==='state').length,2);
  assert.throws(()=>applyAction(p,{type:'instance.state',data:{levelId:l.id,id:'one',stateId:'light',enabled:true}}));
});
test('state overrides are pruned after deleting or reparenting their states',()=>{
  let {p,l}=fixture();p=applyAction(p,{type:'instance.state',data:{levelId:l.id,id:'one',stateId:'unlit',enabled:true}});
  p=applyAction(p,{type:'asset.delete',data:{id:'unlit'}});assert.equal('unlit' in p.levels[0].instances[0].stateOverrides,false);
  assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:'lit',parentId:'unlit'}}));
  p.assets.push({...p.assets[0],id:'other',name:'Other'});
  p=applyAction(p,{type:'asset.update',data:{id:'lit',parentId:'other'}});assert.equal('lit' in p.levels[0].instances[0].stateOverrides,false);
});
test('group movement is atomic and scenery locks prevent moves, rotations, deletions and definition removal',()=>{
  let {p,l}=fixture();const original=structuredClone(p);
  assert.throws(()=>applyAction(p,{type:'instance.batch',data:{levelId:l.id,updates:[{id:'one',x:7},{id:'two',x:100}]}}));assert.deepEqual(p,original);
  p=applyAction(p,{type:'instance.batch',data:{levelId:l.id,updates:[{id:'one',locked:true},{id:'two',locked:true}]}});
  for(const action of [{type:'instance.update',data:{levelId:l.id,id:'one',x:5}},{type:'instance.update',data:{levelId:l.id,id:'one',rotation:90}},{type:'instance.delete',data:{levelId:l.id,id:'one'}},{type:'asset.delete',data:{id:'torch'}}])assert.throws(()=>applyAction(p,action),/Unlock/);
  p=applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'one',locked:false}});p=applyAction(p,{type:'instance.update',data:{levelId:l.id,id:'one',x:5}});assert.equal(p.levels[0].instances[0].x,5);
});
test('hierarchy and level copies remap internal references and keep independent deep contents',()=>{
  const {p,l}=fixture();p.assets[3].overlapAssetIds=['torch'];
  const assets=copyHierarchy(p,'torch');assert.equal(assets.length,4);assert.equal(assets[1].parentId,assets[0].id);assert.equal(assets.find(a=>a.icon==='area').overlapAssetIds[0],assets[0].id);
  const next=applyAction(p,{type:'asset.addMany',data:{assets}});assert.equal(next.assets.length,8);
  l.objectLinks=[{id:uid(),name:'Pair',rule:'',color:'#edc47c',instanceIds:['one','two']}];l.postIts=[{id:uid(),space:'canvas',text:'Note',color:'#edc47c',x:13.5,y:15}];
  const copied=copyLevel(l);assert.notEqual(copied.id,l.id);assert.deepEqual(copied.objectLinks[0].instanceIds,copied.instances.map(i=>i.id));assert.notEqual(copied.postIts[0].id,l.postIts[0].id);
  assert.equal(applyAction(p,{type:'level.add',data:copied}).levels.length,2);copied.postIts[0].text='changed';assert.equal(l.postIts[0].text,'Note');
});
