import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,applyAction,validateProject,activeDescendants,parameterOverlay,effectContains,isParameter} from '../public/model.js';
import {resolveTurn} from '../public/behaviours.js';
import {copyHierarchy} from '../public/editing.js';
import {inventoryData} from '../inventory-export.mjs';

const token=(id,parentId=null)=>({id,name:id,kind:'token',icon:'torch',rule:'',tags:[],color:'#b8cf96',range:2,parentId});
const parameter=(id,parentId=null)=>({...token(id,parentId),icon:'area',followTokenFacing:true,occludedByWalls:true,overlapThreshold:1,overlapColor:'#edc47c'});
function fixture(){const p=newProject();p.levels[0].width=14;p.levels[0].height=11;p.assets=[token('torch'),token('guard'),parameter('light')];return p;}
const attach=(p,id,parentId,usageId)=>applyAction(p,{type:'parameter.attach',data:{id,parentId,usageId,originalUsageId:usageId+'-original'}});

test('Self covers exactly the occupied cell regardless of range, facing, rotation or walls and counts only overlapping objects',()=>{
  for(const range of [1,5,12])for(const rotation of [0,90,180,270])for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)assert.equal(effectContains({icon:'self',range},x,y,rotation),x===0&&y===0);
  let p=fixture();p=applyAction(p,{type:'asset.update',data:{id:'light',icon:'self'}});p=attach(p,'light','torch','torch-self');
  const l=p.levels[0],owner={id:'owner',assetId:'torch',x:6,y:5,rotation:90,direction:180};
  l.instances=[owner,{id:'overlap',assetId:'guard',x:6,y:5,rotation:0},{id:'nearby',assetId:'guard',x:7,y:5,rotation:0},{id:'marker',assetId:'light',x:6,y:5,rotation:0}];
  l.tiles['6,5']='wall';
  const effect=p.assets.find(a=>a.id==='torch-self');assert.equal(isParameter(effect),true);
  let overlay=parameterOverlay(p,p.assets[0],effect,owner,l);
  assert.deepEqual(overlay.cells,[[6,5]]);assert.equal(overlay.count,1);assert.equal(overlay.color,'#edc47c');
  l.instances.find(i=>i.id==='overlap').x=5;overlay=parameterOverlay(p,p.assets[0],effect,owner,l);assert.equal(overlay.count,0);assert.equal(overlay.color,effect.color);
  assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:'light',overlapAssetIds:['light']}}));
});

test('Self remains a reusable parameter through export, state gating and turn behaviour resolution',()=>{
  let p=fixture();p=applyAction(p,{type:'asset.update',data:{id:'light',icon:'self',behaviours:[{id:'collect-overlap',type:'applyEffect',enabled:true,action:'graveyard',eligibleAssetIds:['guard']}]}});
  p.assets.push({...token('lit','torch'),kind:'state',enabled:true});p=attach(p,'light','lit','torch-self');
  const l=p.levels[0];l.instances=[{id:'owner',assetId:'torch',x:6,y:5,rotation:0},{id:'overlap',assetId:'guard',x:6,y:5,rotation:0},{id:'nearby',assetId:'guard',x:7,y:5,rotation:0}];
  p=validateProject(JSON.parse(JSON.stringify(p)));
  const exported=inventoryData(p),atom=exported.atoms.find(row=>row[0]==='torch-self');
  assert.equal(atom[1],'Parameter');assert.equal(atom[6],'self');assert.equal(atom[8],0);
  assert.ok(exported.recipes.get('GE:torch').parameters.includes('occupied cell'));
  const run=resolveTurn(p);assert.deepEqual(run.graveyard.flatMap(s=>s.items.map(i=>i.id)),['overlap']);
  assert.ok(run.project.levels[0].instances.some(i=>i.id==='nearby'));
  p=applyAction(p,{type:'instance.state',data:{levelId:l.id,id:'owner',stateId:'lit',enabled:false}});assert.equal(resolveTurn(p).graveyard.length,0);
});

test('reusable parameters attach to several tokens and edits through any use update every property and overlay',()=>{
  let p=attach(fixture(),'light','torch','torch-light');p=attach(p,'light','guard','guard-light');
  assert.equal(p.assets.find(a=>a.id==='light').parentId,null);
  p=applyAction(p,{type:'asset.update',data:{id:'guard-light',name:'Shared glow',range:5,color:'#8fb8c2',rotation:90,followTokenFacing:false,occludedByWalls:false,overlapThreshold:0}});
  for(const id of ['light','torch-light','guard-light']){
    const a=p.assets.find(a=>a.id===id);assert.equal(a.name,'Shared glow');assert.equal(a.range,5);assert.equal(a.rotation,90);assert.equal(a.followTokenFacing,false);
  }
  const l=p.levels[0],owner=p.assets.find(a=>a.id==='torch'),effect=activeDescendants(p,'torch')[0];
  assert.equal(parameterOverlay(p,owner,effect,{x:6,y:5,rotation:0},l).cells.length,61);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  const data=inventoryData(p);assert.ok(data.atoms.some(row=>row[0]==='torch-light'&&row[8]===5));
});

test('cross parameters support shared edits, persistence, overlays, and inventory export',()=>{
  let p=fixture();
  p=applyAction(p,{type:'asset.update',data:{id:'light',icon:'cross',variant:'default',occludedByWalls:false,overlapThreshold:0}});
  p=attach(p,'light','torch','torch-cross');p=attach(p,'light','guard','guard-cross');
  p=applyAction(p,{type:'asset.update',data:{id:'guard-cross',range:3}});
  p=validateProject(JSON.parse(JSON.stringify(p)));
  const root=p.assets.find(a=>a.id==='torch'),effect=activeDescendants(p,'torch')[0];
  assert.equal(parameterOverlay(p,root,effect,{x:6,y:5,rotation:90},p.levels[0]).cells.length,13);
  for(const id of ['light','torch-cross','guard-cross']){
    const row=inventoryData(p).atoms.find(row=>row[0]===id);
    assert.equal(row[1],'Parameter');assert.equal(row[6],'cross');assert.equal(row[8],3);
  }
  assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:'light',overlapAssetIds:['guard-cross']}}));
  assert.throws(()=>applyAction(p,{type:'asset.add',data:{...token('state','light'),kind:'state',enabled:true}}));
});

test('first reuse preserves legacy nesting, descendants, placements, and disabled state behavior',()=>{
  let p=fixture();p.assets.find(a=>a.id==='light').parentId='torch';p.assets.push({...token('off','torch'),kind:'state',enabled:false},parameter('shadow','off'),token('child','light'));
  p.levels[0].instances.push({id:'placed-light',assetId:'light',x:4,y:4,rotation:0});
  const original=structuredClone(p);p=attach(p,'light','guard','guard-light');
  assert.deepEqual(original.assets.find(a=>a.id==='light').parentId,'torch');
  assert.equal(p.assets.find(a=>a.id==='light').parentId,null);
  assert.equal(p.assets.find(a=>a.id==='guard-light-original').parentId,'torch');
  assert.equal(p.assets.find(a=>a.id==='child').parentId,'guard-light-original');
  assert.equal(p.levels[0].instances[0].assetId,'light');
  p=attach(p,'shadow','guard','guard-shadow');
  assert.equal(activeDescendants(p,'torch').some(a=>a.parameterId==='shadow'),false);
  assert.equal(activeDescendants(p,'guard').some(a=>a.parameterId==='shadow'),true);
});

test('composing saves attachments atomically, canonicalizes parameter editor nesting, and prevents duplicates',()=>{
  let p=fixture();const draft=parameter('new-light','torch');
  p=applyAction(p,{type:'asset.compose',data:{asset:draft,usageId:'new-use',originalUsageId:'original-use'}});
  assert.equal(p.assets.find(a=>a.id==='new-light').parentId,null);assert.equal(p.assets.find(a=>a.id==='new-use').parameterId,'new-light');
  p=applyAction(p,{type:'asset.compose',data:{asset:{...p.assets.find(a=>a.id==='new-light'),range:4,parentId:'guard'},usageId:'another-use',originalUsageId:'unused'}});
  assert.equal(p.assets.find(a=>a.id==='new-use').range,4);assert.equal(p.assets.find(a=>a.id==='another-use').parentId,'guard');
  const again=attach(p,'new-use','guard','duplicate');assert.equal(again.assets.length,p.assets.length);
  const before=structuredClone(p);
  assert.throws(()=>applyAction(p,{type:'asset.compose',data:{asset:{...token('new-token'),name:'Pending'},attachments:[{id:'missing',usageId:'bad'}]}}));assert.deepEqual(p,before);
  assert.throws(()=>attach(p,'light','light','cycle'));
});

test('detaching and deleting owners preserve definitions; deleting a definition cleans every use and placement',()=>{
  let p=attach(fixture(),'light','torch','torch-light');p=attach(p,'light','guard','guard-light');
  p=applyAction(p,{type:'asset.compose',data:{asset:p.assets.find(a=>a.id==='torch'),removals:['torch-light']}});
  assert.ok(p.assets.some(a=>a.id==='light'));assert.ok(p.assets.some(a=>a.id==='guard-light'));
  p=applyAction(p,{type:'asset.delete',data:{id:'guard'}});assert.ok(p.assets.some(a=>a.id==='light'));
  p=attach(p,'light','torch','reattached');p.levels[0].instances.push({id:'placed-use',assetId:'reattached',x:4,y:4,rotation:0});
  p=applyAction(p,{type:'asset.delete',data:{id:'light'}});assert.equal(p.assets.length,1);assert.equal(p.levels[0].instances.length,0);
});

test('hierarchy copies retain shared parameter references and invalid or divergent imports are rejected',()=>{
  let p=attach(fixture(),'light','torch','torch-light');
  const copies=copyHierarchy(p,'torch');p=applyAction(p,{type:'asset.addMany',data:{assets:copies}});
  assert.equal(copies[1].parameterId,'light');p=applyAction(p,{type:'asset.update',data:{id:'light',range:7}});assert.equal(p.assets.find(a=>a.id===copies[1].id).range,7);
  for(const changes of [{parameterId:'missing'},{parameterId:'torch'},{range:1},{parentId:null}]){
    const bad=structuredClone(p);Object.assign(bad.assets.find(a=>a.id==='torch-light'),changes);assert.throws(()=>validateProject(bad));
  }
});
