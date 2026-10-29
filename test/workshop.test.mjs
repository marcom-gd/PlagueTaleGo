import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { newProject, applyAction, validateProject, descendants, uid, nodesConnected, linkKey, activeDescendants, assetIsActive, appearance } from '../public/model.js';
import { createWorkshopServer } from '../server.mjs';
import { sprite, iconVariants, defaultVariant } from '../public/icons.js';

const token = (id=uid(),parentId=null) => ({id,name:'Torch',icon:'torch',rule:'Carry it.',tags:[],color:'#edc47c',range:2,parentId});
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

test('connections are undirected, can be erased and restored, and clean up when a node is removed',()=>{
  let p=newProject();const levelId=p.levels[0].id;
  p=applyAction(p,{type:'tile.paint',data:{levelId,cells:['3,3','4,3','4,4'],tile:'node'}});
  const update=(from,to,connected)=>p=applyAction(p,{type:'link.update',data:{levelId,from,to,connected}});
  assert.ok(nodesConnected(p.levels[0],'3,3','4,3'));
  assert.ok(nodesConnected(p.levels[0],'4,3','3,3'));
  update('4,3','3,3',false);update('3,3','4,3',false);
  assert.deepEqual(p.levels[0].blockedLinks,[linkKey('3,3','4,3')]);
  assert.equal(nodesConnected(p.levels[0],'3,3','4,3'),false);
  assert.equal(nodesConnected(p.levels[0],'4,3','3,3'),false);
  assert.ok(nodesConnected(p.levels[0],'4,3','4,4'));
  assert.throws(()=>update('3,3','4,4',true),/adjacent/);
  assert.throws(()=>update('3,3','2,3',true),/adjacent/);
  update('3,3','4,3',true);assert.ok(nodesConnected(p.levels[0],'4,3','3,3'));
  update('3,3','4,3',false);
  const roundtrip=validateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(nodesConnected(roundtrip.levels[0],'3,3','4,3'),false);
  p=applyAction(p,{type:'tile.paint',data:{levelId,cells:['4,3'],tile:'floor'}});
  assert.deepEqual(p.levels[0].blockedLinks,[]);
  p=applyAction(p,{type:'tile.paint',data:{levelId,cells:['4,3'],tile:'node'}});
  assert.ok(nodesConnected(p.levels[0],'3,3','4,3'));
});

test('tags are shared definitions, survive nesting and export, and detach everywhere on deletion',()=>{
  let p=newProject();const t={id:uid(),name:'Pickable',rule:'Can be carried.',color:'#edc47c'};
  p=applyAction(p,{type:'tag.add',data:t});
  const a={...token(),tags:[t.id]},b={...token(uid(),a.id),tags:[t.id]};
  for(const data of [a,b])p=applyAction(p,{type:'asset.add',data});
  p=applyAction(p,{type:'tag.update',data:{id:t.id,name:'Carryable',rule:'Carry one at a time.',color:'#8fb8c2'}});
  assert.equal(p.tags[0].name,'Carryable');
  assert.deepEqual(descendants(p,a.id)[0].tags,[t.id]);
  assert.equal(validateProject(JSON.parse(JSON.stringify(p))).tags[0].rule,'Carry one at a time.');
  assert.throws(()=>applyAction(p,{type:'tag.add',data:{...t,id:uid(),name:' carryable '}}),/already exists/);
  assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:a.id,tags:['missing']}}),/token properties/);
  assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:a.id,tags:[t.id,t.id]}}),/token properties/);
  assert.throws(()=>applyAction(p,{type:'tag.update',data:{id:t.id,color:'unsafe'}}),/tag properties/);
  const after=applyAction(p,{type:'tag.delete',data:{id:t.id}});
  assert.equal(after.tags.length,0);assert.ok(after.assets.every(a=>a.tags.length===0));
  assert.equal(p.tags.length,1);
});

test('legacy projects migrate label tags once, reuse IDs, and preserve tiles, notes and nested parameters',()=>{
  const p=newProject(),a={...token(),tags:['Pickable','Light source']},b={...token(uid(),a.id),icon:'area',tags:['pickable']};
  p.version=1;delete p.tags;delete p.levels[0].blockedLinks;p.assets=[a,b];
  p.levels[0].instances=[{id:uid(),assetId:a.id,x:3,y:3,rotation:90,note:'Keep me'}];
  const migrated=validateProject(p);
  assert.equal(migrated.version,3);assert.equal(migrated.tags.length,2);
  assert.equal(migrated.assets[0].tags[0],migrated.assets[1].tags[0]);
  assert.deepEqual(migrated,validateProject(p));assert.equal(p.version,1);
  assert.equal(migrated.assets[1].parentId,a.id);assert.equal(migrated.levels[0].instances[0].note,'Keep me');
  assert.deepEqual(migrated.levels[0].tiles,p.levels[0].tiles);
  assert.deepEqual(migrated.levels[0].blockedLinks,[]);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(migrated))),migrated);
});

test('states gate entire branches, combine independently, and choose the last enabled state icon',()=>{
  let p=newProject();const root={...token(),variant:'on'};
  const on={...token(uid(),root.id),kind:'state',name:'Lit',enabled:true,variant:'on'};
  const off={...token(uid(),root.id),kind:'state',name:'Unlit',enabled:false,variant:'off'};
  const area={...token(uid(),on.id),icon:'area',variant:'default'};
  const child=token(uid(),on.id),nested={...token(uid(),on.id),kind:'state',enabled:true};
  const grandchild=token(uid(),nested.id),t={id:uid(),name:'Light',rule:'Rats avoid it.',color:'#edc47c'};
  p.tags=[t];on.tags=[t.id];p.assets=[root,on,area,child,nested,grandchild,off];validateProject(p);
  assert.ok(activeDescendants(p,root.id).some(a=>a.id===area.id));
  assert.equal(appearance(p,root).id,nested.id);
  p=applyAction(p,{type:'asset.update',data:{id:on.id,enabled:false}});
  for(const a of [on,area,child,nested,grandchild])assert.equal(assetIsActive(p,a.id),false);
  assert.deepEqual(activeDescendants(p,root.id),[]);assert.equal(appearance(p,root).variant,'on');
  p=applyAction(p,{type:'asset.update',data:{id:off.id,enabled:true}});
  assert.equal(appearance(p,root).variant,'off');
  p=applyAction(p,{type:'asset.update',data:{id:on.id,enabled:true}});
  assert.equal(appearance(p,root).id,off.id);assert.ok(assetIsActive(p,grandchild.id));
  assert.deepEqual(p.assets.find(a=>a.id===on.id).tags,[t.id]);
  const roundtrip=validateProject(JSON.parse(JSON.stringify(p)));assert.equal(appearance(roundtrip,root).variant,'off');
  p=applyAction(p,{type:'asset.delete',data:{id:on.id}});
  assert.ok(!p.assets.some(a=>[on.id,area.id,child.id,nested.id,grandchild.id].includes(a.id)));
  assert.ok(p.assets.some(a=>a.id===off.id));
});

test('state validation prevents orphan folders, cycles, standalone placements and invalid icon variants',()=>{
  const p=newProject(),root=token(),state={...token(uid(),root.id),kind:'state',enabled:false,variant:'off'};
  p.assets=[root,state];validateProject(p);
  for(const data of [{parentId:null},{enabled:'false'},{parentId:state.id},{variant:'dead'},{kind:'unknown'}])assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:state.id,...data}}));
  assert.throws(()=>applyAction(p,{type:'instance.add',data:{levelId:p.levels[0].id,instance:{id:uid(),assetId:state.id,x:2,y:2,rotation:0}}}),/cannot be placed/);
  const changed=applyAction(p,{type:'asset.update',data:{id:state.id,icon:'guard'}});
  assert.equal(changed.assets[1].variant,'alive');
});

test('version 2 migration keeps tags, broken links and placements and supplies default icon variants',()=>{
  const p=newProject(),root=token(),t={id:uid(),name:'Pickable',rule:'Carry it.',color:'#edc47c'};
  p.version=2;p.tags=[t];p.assets=[{...root,tags:[t.id]}];
  p.levels[0].tiles['3,3']='node';p.levels[0].tiles['4,3']='node';p.levels[0].blockedLinks=[linkKey('3,3','4,3')];
  const result=validateProject(p);assert.equal(result.version,3);assert.equal(p.version,2);
  assert.deepEqual(result.tags,p.tags);assert.deepEqual(result.levels,p.levels);assert.deepEqual(result.assets[0].tags,[t.id]);
  assert.equal(result.assets[0].variant,'on');assert.equal(result.assets[0].kind,'token');
});

test('each selectable icon variant has distinct SVG artwork and preserves default artwork',()=>{
  for(const [icon,variants] of Object.entries(iconVariants)) {
    assert.equal(sprite(icon),sprite(icon,'#9fb99a',defaultVariant(icon)));
    const art=Object.keys(variants).map(v=>sprite(icon,'#9fb99a',v));
    assert.equal(new Set(art).size,art.length,icon+' variants must look different');
    art.forEach(svg=>{
      assert.ok(svg.startsWith('<svg')&&svg.endsWith('</svg>'));
      assert.ok(svg.includes('viewBox="0 0 32 32"'),icon+' uses a 32px canvas');
      assert.ok(svg.includes('<rect'),icon+' has visible artwork');
    });
  }
});

test('expanded icon variants survive project validation and export',()=>{
  const p=newProject();
  for(const icon of ['cat','sling','dog','crow','lantern','chest','barrel','crate','rope','ladder','trap','bell','square','triangle','hexagon','circle','diamond']) {
    for(const variant of Object.keys(iconVariants[icon]))p.assets.push({...token(),icon,variant});
  }
  const restored=validateProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(restored.assets,p.assets);
});
test('server merges actions, streams updates, deduplicates retries, rejects stale replacement and persists restarts',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'plague-go-test-'));
  const legacy=newProject();legacy.version=1;delete legacy.tags;delete legacy.levels[0].blockedLinks;
  legacy.assets=[{...token(),tags:['Pickable']}];
  await writeFile(path.join(dataDir,'legacy.json'),JSON.stringify({project:legacy,revision:19}));
  let server=await createWorkshopServer({dataDir});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let base=`http://127.0.0.1:${server.address().port}/api/rooms/class-a`;
  const stop=async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  let stream;
  try{
    const oldRoom=await(await fetch(base.replace('class-a','legacy'))).json();
    assert.equal(oldRoom.revision,19);assert.equal(oldRoom.project.version,3);
    assert.equal(oldRoom.project.tags[0].name,'Pickable');assert.equal(oldRoom.project.assets[0].tags[0],oldRoom.project.tags[0].id);
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
    const t={id:uid(),name:'Shared tag',rule:'A reusable rule.',color:'#8fb8c2'},levelId=state.project.levels[0].id;
    assert.equal((await post({type:'tag.add',data:t})).status,200);
    assert.equal((await post({type:'asset.update',data:{id:a.id,tags:[t.id]}})).status,200);
    assert.equal((await post({type:'tile.paint',data:{levelId,cells:['3,3','4,3'],tile:'node'}})).status,200);
    assert.equal((await post({type:'link.update',data:{levelId,from:'4,3',to:'3,3',connected:false}})).status,200);
    const stateFolder={...token(uid(),a.id),kind:'state',name:'Unlit',enabled:true,variant:'off'};
    assert.equal((await post({type:'asset.add',data:stateFolder})).status,200);
    assert.equal((await post({type:'asset.update',data:{id:stateFolder.id,enabled:false}})).status,200);
    controller.abort();await stop();
    server=await createWorkshopServer({dataDir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    base=`http://127.0.0.1:${server.address().port}/api/rooms/class-a`;
    const restored=await(await fetch(base)).json();assert.equal(restored.project.assets.length,3);assert.equal(restored.revision,8);
    assert.deepEqual(restored.project.tags,[t]);assert.deepEqual(restored.project.assets.find(x=>x.id===a.id).tags,[t.id]);
    assert.equal(nodesConnected(restored.project.levels[0],'3,3','4,3'),false);
    assert.equal(restored.project.assets.find(x=>x.id===stateFolder.id).enabled,false);
    assert.equal(restored.project.assets.find(x=>x.id===stateFolder.id).variant,'off');
    const fresh=await(await fetch(base.replace('class-a','class-b'))).json();assert.equal(fresh.project.assets.length,0);
  }finally{stream?.abort();await stop();await rm(dataDir,{recursive:true,force:true});}
});
