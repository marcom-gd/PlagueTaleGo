import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {newProject} from '../public/model.js';
import {behaviourNames} from '../public/behaviour-schema.js';
import {serverSupportsEditor} from '../public/server-compatibility.js';
import {createWorkshopServer} from '../server.mjs';

test('the editor identifies legacy servers and servers missing a newly added behaviour',()=>{
  assert.equal(serverSupportsEditor({}),false);
  assert.equal(serverSupportsEditor({behaviourTypes:['expand','useEffect']}),false);
  assert.equal(serverSupportsEditor({behaviourTypes:Object.keys(behaviourNames)}),true);
  assert.equal(serverSupportsEditor({behaviourTypes:[...Object.keys(behaviourNames),'future-behaviour']}),true);
});

test('HTTP saves Pick Up on a nested Area of Effect, including a reusable parameter, and retains it after restart',async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'workshop-pickup-save-'));let server;
  const start=async()=>{server=await createWorkshopServer({dataDir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;};
  const stop=async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;};
  try{
    let base=await start(),url=base+'/api/rooms/pickup-check',revision=(await(await fetch(url)).json()).revision;
    assert.equal(serverSupportsEditor(await(await fetch(base+'/api/config')).json()),true);
    const send=async action=>{const response=await fetch(url+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,actionId:crypto.randomUUID(),expectedRevision:revision})});const result=await response.json();assert.equal(response.status,200,result.error);revision=result.revision;return result.project;};
    const p=newProject(),asset=(id,name,icon,parentId=null)=>({id,name,icon,parentId,rule:'',tags:[],color:'#edc47c',range:1});
    p.assets=[asset('stick','Stick','torch'),asset('area','Area of Effect','area','stick'),asset('actor','Actor','girl')];
    await send({type:'project.replace',data:p});
    const behaviour={id:'pickup',type:'pickUp',enabled:true,pickupTarget:'owner',usableMode:'selected',usableAssetIds:['actor'],usableTagIds:[]};
    let saved=await send({type:'behaviour.configure',data:{id:'area',behaviours:[behaviour],ids:['pickup']}});
    assert.deepEqual(saved.assets.find(a=>a.id==='area').behaviours,[behaviour]);
    saved=await send({type:'parameter.attach',data:{id:'area',parentId:'stick',usageId:'area-use',originalUsageId:'original-area'}});
    const usage=saved.assets.find(a=>a.parameterId==='area'&&a.parentId==='stick');assert.ok(usage);
    saved=await send({type:'behaviour.configure',data:{id:usage.id,behaviours:[{...behaviour,usableMode:'any',usableAssetIds:null}],ids:['pickup']}});
    assert.equal(saved.assets.find(a=>a.id===usage.id).behaviours[0].usableMode,'any');
    await stop();base=await start();url=base+'/api/rooms/pickup-check';assert.deepEqual((await(await fetch(url)).json()).project,saved);
  }finally{if(server)await stop();await rm(dataDir,{recursive:true,force:true});}
});
