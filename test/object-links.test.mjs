import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,applyAction,validateProject,uid} from '../public/model.js';

function fixture() {
  const p=newProject(),l=p.levels[0];
  const a={id:uid(),name:'Cat',icon:'cat',variant:'sitting',rule:'',tags:[],color:'#edc47c',range:2,parentId:null};
  p.assets.push(a);
  for(let x=3;x<6;x++)l.instances.push({id:uid(),assetId:a.id,x,y:4,rotation:0,note:''});
  const link={id:uid(),name:'Companions',rule:'Stay together.',color:'#5d91b5',instanceIds:l.instances.map(i=>i.id)};
  return {p,l,link};
}
test('named multi-object links edit, follow moved instances, roundtrip, and delete independently',()=>{
  let {p,l,link}=fixture();
  const original=structuredClone(p);
  const action=(type,data)=>p=applyAction(p,{type,data:{levelId:l.id,...data}});
  action('objectLink.add',{link});assert.deepEqual(original.levels[0].objectLinks,[]);
  action('instance.update',{id:link.instanceIds[0],x:9,y:8});
  assert.deepEqual(p.levels[0].objectLinks[0].instanceIds,link.instanceIds);
  action('objectLink.update',{id:link.id,name:'Protects',rule:'Protect the cat.',color:'#aa6655'});
  assert.equal(validateProject(JSON.parse(JSON.stringify(p))).levels[0].objectLinks[0].name,'Protects');
  action('objectLink.delete',{id:link.id});assert.equal(p.levels[0].objectLinks.length,0);assert.equal(p.levels[0].instances.length,3);
});
test('removing members prunes links, and deleting definitions cleans every affected level',()=>{
  let {p,l,link}=fixture();p=applyAction(p,{type:'objectLink.add',data:{levelId:l.id,link}});
  p=applyAction(p,{type:'instance.delete',data:{levelId:l.id,id:link.instanceIds[0]}});
  assert.deepEqual(p.levels[0].objectLinks[0].instanceIds,link.instanceIds.slice(1));
  p=applyAction(p,{type:'instance.delete',data:{levelId:l.id,id:link.instanceIds[1]}});assert.deepEqual(p.levels[0].objectLinks,[]);
  ({p,l,link}=fixture());p=applyAction(p,{type:'objectLink.add',data:{levelId:l.id,link}});
  p=applyAction(p,{type:'asset.delete',data:{id:p.assets[0].id}});assert.deepEqual(p.levels[0].objectLinks,[]);
});
test('link validation rejects bad colors, duplicates, missing or cross-level members and invalid metadata',()=>{
  const {p,l,link}=fixture();
  for(const changes of [{color:'red'},{name:' '},{rule:4},{instanceIds:[link.instanceIds[0]]},{instanceIds:[link.instanceIds[0],link.instanceIds[0]]},{instanceIds:[link.instanceIds[0],'missing']},{id:l.id}])assert.throws(()=>applyAction(p,{type:'objectLink.add',data:{levelId:l.id,link:{...link,...changes}}}));
  assert.throws(()=>applyAction(p,{type:'objectLink.update',data:{levelId:l.id,id:'missing',name:'gone'}}));
  const other=structuredClone(l);other.id=uid();other.instances=other.instances.map(i=>({...i,id:uid()}));p.levels.push(other);
  assert.throws(()=>applyAction(p,{type:'objectLink.add',data:{levelId:l.id,link:{...link,instanceIds:[l.instances[0].id,other.instances[0].id]}}}));
});
test('existing v3 projects gain empty links without mutating the imported source',()=>{
  const {p}=fixture();delete p.levels[0].objectLinks;
  const restored=validateProject(p);assert.deepEqual(restored.levels[0].objectLinks,[]);assert.equal(p.levels[0].objectLinks,undefined);
});
