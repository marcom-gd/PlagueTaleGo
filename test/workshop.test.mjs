import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { newProject, applyAction, validateProject, descendants, uid } from '../public/model.js';
import { createWorkshopServer } from '../server.mjs';

const token = (id=uid(),parentId=null) => ({id,name:'Torch',icon:'torch',rule:'Carry it.',tags:['Pickable'],color:'#edc47c',range:2,parentId});
test('IDs work on plain HTTP classroom pages without crypto.randomUUID',()=>{
  const original=globalThis.crypto.randomUUID;
  try{globalThis.crypto.randomUUID=undefined;const a=uid(),b=uid();assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.notEqual(a,b);}
  finally{globalThis.crypto.randomUUID=original;}
});
test('nesting retains descendants and rejects indirect cycles without mutating input',()=>{
  let p=newProject();const a=token(),b=token(uid(),a.id),c=token(uid(),b.id);
  for(const t of [a,b,c])p=applyAction(p,{type:'asset.add',data:t});
  assert.equal(descendants(p,a.id).length,2);
  assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:a.id,parentId:c.id}}),/themselves/);
  assert.equal(p.assets[0].parentId,null);
  const detached=applyAction(p,{type:'asset.update',data:{id:b.id,parentId:null}});
  assert.equal(descendants(detached,a.id).length,0);assert.equal(descendants(detached,b.id).length,1);
});
test('deleting a definition removes descendants and placements across levels',()=>{
  let p=newProject();const a=token(),b=token(uid(),a.id);
  p.assets=[a,b];p.levels.push({...p.levels[0],id:uid(),instances:[]});
  for(const l of p.levels)l.instances.push({id:uid(),assetId:b.id,x:3,y:3,rotation:90,note:''});
  const result=applyAction(p,{type:'asset.delete',data:{id:a.id}});
  assert.equal(result.assets.length,0);assert.ok(result.levels.every(l=>l.instances.length===0));assert.equal(p.assets.length,2);
});
test('import rejects cycles, duplicate IDs, out-of-bounds pieces, unsafe colors and broken references',()=>{
  const p=newProject(),a=token();p.assets=[a];
  p.levels[0].instances=[{id:uid(),assetId:a.id,x:2,y:2,rotation:270,note:''}];
  assert.equal(validateProject(p),p);
  for(const change of [
    x=>x.assets[0].parentId=a.id,
    x=>x.levels[0].instances[0].id=a.id,
    x=>x.levels[0].instances[0].x=100,
    x=>x.assets[0].color='red; background:url(x)',
    x=>x.assets[0].icon='__proto__',
    x=>x.levels[0].instances[0].assetId='missing'
  ]){const bad=structuredClone(p);change(bad);assert.throws(()=>validateProject(bad));}
});
test('server merges actions, streams updates, deduplicates retries, rejects stale replacement and persists restarts',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'plague-go-test-'));
  let server=await createWorkshopServer({dataDir});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let base=`http://127.0.0.1:${server.address().port}/api/rooms/class-a`;
  const stop=async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  let stream;
  try{
    const initial=await(await fetch(base)).json();assert.equal(initial.project.assets.length,0);
    const controller=new AbortController();stream=controller;
    const events=await fetch(base+'/events',{signal:controller.signal});const reader=events.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value),/"revision":0/);
    const a=token(),b=token();
    const post=async(action,actionId=uid(),expectedRevision=0)=>{const res=await fetch(base+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,actionId,expectedRevision})});return {status:res.status,data:await res.json()};};
    const actionId=uid();
    const results=await Promise.all([post({type:'asset.add',data:a},actionId),post({type:'asset.add',data:b})]);
    assert.ok(results.every(r=>r.status===200));
    let state=await(await fetch(base)).json();assert.equal(state.project.assets.length,2);assert.equal(state.revision,2);
    assert.equal((await(await fetch(base.replace('class-a','CLASS-A'))).json()).revision,2);
    const streamed=new TextDecoder().decode((await reader.read()).value);assert.match(streamed,/actionId/);
    assert.equal((await post({type:'asset.add',data:a},actionId)).status,200);
    state=await(await fetch(base)).json();assert.equal(state.revision,2);
    assert.equal((await post({type:'project.replace',data:initial.project},uid(),0)).status,409);
    assert.equal((await post({type:'asset.update',data:{id:a.id,parentId:a.id}})).status,400);
    const cross=await fetch(base+'/actions',{method:'POST',headers:{Origin:'https://another-site.example','Content-Type':'application/json'},body:'{}'});assert.equal(cross.status,403);
    controller.abort();await stop();
    server=await createWorkshopServer({dataDir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    base=`http://127.0.0.1:${server.address().port}/api/rooms/class-a`;
    const restored=await(await fetch(base)).json();assert.equal(restored.project.assets.length,2);assert.equal(restored.revision,2);
    const fresh=await(await fetch(base.replace('class-a','class-b'))).json();assert.equal(fresh.project.assets.length,0);
  }finally{stream?.abort();await stop();await rm(dataDir,{recursive:true,force:true});}
});
