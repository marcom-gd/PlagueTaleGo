import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,applyAction,validateProject,parameterLayers,parameterLayer,parameterOverlay,floorBlocks} from '../public/model.js';
import {copyHierarchy,copyLevel} from '../public/editing.js';
import {resolveTurn,availableUses,useObject} from '../public/behaviours.js';
import {blockedNodes,effectOverlay} from '../public/behaviour-areas.js';

const token=id=>({id,name:id,icon:'torch',rule:'',tags:[],color:'#b8cf96',range:4,parentId:null});
function fixture(icon='area'){
  const p=newProject(),l=p.levels[0];
  const root=token('torch'),effect={...token('effect'),icon,width:5,rotation:90,parentId:'torch',overlapThreshold:1,overlapColor:'#ff0000'};
  p.assets=[root,effect,token('target')];
  l.tiles={'2,3':'floor','3,3':'floor','4,3':'floor-elevated','5,3':'floor-elevated'};
  l.instances=[{id:'owner',assetId:'torch',x:2,y:3,rotation:0},{id:'other',assetId:'target',x:5,y:3,rotation:0}];
  return {p,l,root,effect,owner:l.instances[0]};
}
const covers=(overlay,x,y)=>overlay.cells.some(([cx,cy])=>cx===x&&cy===y);

test('parameter layers default to Other and shared edits survive save/load, attachments, and hierarchy copies',()=>{
  let {p}=fixture();
  assert.equal(parameterLayer(p.assets[1]),'Other');
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  p=applyAction(p,{type:'parameter.attach',data:{id:'effect',parentId:'target',usageId:'target-effect',originalUsageId:'torch-effect'}});
  for(const layer of parameterLayers){
    p=applyAction(p,{type:'asset.update',data:{id:'target-effect',parameterLayer:layer}});
    p=validateProject(JSON.parse(JSON.stringify(p)));
    for(const id of ['effect','torch-effect','target-effect'])assert.equal(parameterLayer(p.assets.find(a=>a.id===id)),layer);
    const copies=copyHierarchy(p,'torch');
    assert.equal(copies.find(a=>a.parameterId==='effect').parameterLayer,layer);
    assert.equal(copyLevel(p.levels[0]).instances.length,2);
  }
  for(const layer of [null,'', 'light','Invalid',1,[]])assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:'effect',parameterLayer:layer}}),/parameter layer/);
  const divergent=structuredClone(p);divergent.assets.find(a=>a.id==='torch-effect').parameterLayer='Light';
  assert.throws(()=>validateProject(divergent),/reusable parameter reference/);
});

test('every pair of floor heights occludes in both directions, with stairs allowing the ray to cross',()=>{
  const floors=['floor-elevated','floor','floor-underground'];
  for(const from of floors)for(const to of floors){
    const tiles={'0,0':from,'1,0':from,'2,0':to,'3,0':to};
    assert.equal(floorBlocks(tiles,0,0,3,0),from!==to);
    assert.equal(floorBlocks(tiles,3,0,0,0),from!==to);
    tiles['1,0']='stairs';
    assert.equal(floorBlocks(tiles,0,0,3,0),false);
    assert.equal(floorBlocks(tiles,3,0,0,0),false);
    assert.equal(floorBlocks(tiles,1,0,3,0),false);
    assert.equal(floorBlocks(tiles,3,0,1,0),false);
  }
});

test('rays cannot skip floor boundaries through gaps, corner contact, or off-axis stairs',()=>{
  assert.ok(floorBlocks({'0,0':'floor','2,0':'floor-elevated','3,0':'floor'},0,0,3,0));
  for(const gap of [undefined,'node','wall'])assert.ok(floorBlocks({'0,0':'floor-elevated','1,0':gap,'2,0':'floor'},0,0,2,0));
  assert.ok(floorBlocks({'0,0':'floor','1,0':'floor-elevated','0,1':'stairs','1,1':'floor'},0,0,2,2));
  assert.ok(floorBlocks({'0,0':'floor','1,0':'floor','0,1':'floor','1,1':'floor-elevated'},0,0,2,2));
  assert.equal(floorBlocks({'0,0':'floor','1,0':'stairs','0,1':'stairs','1,1':'floor-elevated'},0,0,1,1),false);
  assert.equal(floorBlocks({'0,0':'floor','1,0':'stairs','2,0':'floor-elevated','3,0':'stairs','4,0':'floor-underground'},0,0,4,0),false);
  assert.ok(floorBlocks({'0,0':'floor','1,0':'stairs','2,0':'floor-elevated','3,0':'floor-underground'},0,0,3,0));
  assert.equal(floorBlocks({},0,0,3,3),false);
});

test('all parameter shapes clip at floor changes, regardless of wall setting, and stairs restore overlap colors',()=>{
  for(const icon of ['area','sight','cone','rectangle','cross'])for(const walls of [false,true]){
    const {p,l,root,effect,owner}=fixture(icon);effect.occludedByWalls=walls;
    let overlay=parameterOverlay(p,root,effect,owner,l);
    assert.ok(covers(overlay,3,3));assert.ok(!covers(overlay,4,3));assert.ok(!covers(overlay,5,3));
    assert.equal(overlay.count,0);assert.equal(overlay.color,effect.color);
    l.tiles['3,3']='stairs';overlay=effectOverlay(p,root,effect,owner,l);
    assert.ok(covers(overlay,5,3));assert.equal(overlay.count,1);assert.equal(overlay.color,'#ff0000');
    l.tiles['4,3']='wall';overlay=parameterOverlay(p,root,effect,owner,l);
    assert.equal(covers(overlay,5,3),!walls);
  }
  const {p,l,root,effect,owner}=fixture('self');l.tiles['2,3']='floor-underground';
  assert.deepEqual(parameterOverlay(p,root,effect,owner,l).cells,[[2,3]]);
});

test('Apply Effect, linked effects, Use, Block Node, and expansion respect floor occlusion',()=>{
  for(const linked of [false,true]){
    const {p,l,effect}=fixture();
    effect.behaviours=[{id:'remove',type:'applyEffect',enabled:true,action:'graveyard',...(linked?{eligibleMode:'linked',eligibleAssetIds:null}:{eligibleAssetIds:['target']})}];
    l.objectLinks=[{id:'link',name:'Link',rule:'',color:'#b8cf96',instanceIds:['owner','other']}];
    assert.equal(resolveTurn(p).graveyard.length,0);
    l.tiles['3,3']='stairs';assert.equal(resolveTurn(p).graveyard[0].items[0].id,'other');
  }
  const {p,l,effect}=fixture();
  effect.behaviours=[{id:'use',type:'useEffect',enabled:true,usableAssetIds:['target'],useTarget:'used',action:'graveyard'}];
  assert.equal(availableUses(p,l).length,0);
  l.tiles['3,3']='stairs';assert.equal(availableUses(p,l).length,1);
  l.tiles['3,3']='floor';l.nodes=['3,3','4,3','5,3'];
  effect.behaviours=[{id:'block',type:'blockNode',enabled:true,blockMode:'any',blockAssetIds:null,blockScope:'movementAndEffects'}];
  assert.deepEqual([...blockedNodes(p,l,'target')],['3,3']);
  l.tiles['3,3']='stairs';assert.deepEqual([...blockedNodes(p,l,'target')],['3,3','4,3','5,3']);
  effect.behaviours=[{id:'expand',type:'expand',enabled:true,allowStacking:false}];
  l.tiles['3,3']='floor';assert.equal(resolveTurn(p).project.levels[0].instances.length,3);
  l.tiles['3,3']='stairs';assert.equal(resolveTurn(p).project.levels[0].instances.length,5);
});

test('Use cannot send linked or tagged effects across a floor boundary without stairs',()=>{
  for(const mode of ['linked','tags']){
    const {p,l,effect}=fixture();
    p.tags=[{id:'recipient',name:'Recipient',rule:'',color:'#b8cf96'}];p.assets.find(a=>a.id==='target').tags=['recipient'];
    p.assets.push(token('lever'));l.instances.push({id:'lever-piece',assetId:'lever',x:3,y:3,rotation:0});
    l.objectLinks=[{id:'link',name:'Link',rule:'',color:'#b8cf96',instanceIds:['lever-piece','other']}];
    effect.behaviours=[{id:'use',type:'useEffect',enabled:true,usableAssetIds:['lever'],useTarget:mode,targetTagIds:['recipient'],action:'graveyard'}];
    assert.equal(useObject(p,[],[],availableUses(p,l)[0]).graveyard.length,0);
    l.tiles['4,3']='stairs';assert.equal(useObject(p,[],[],availableUses(p,l)[0]).graveyard[0].items[0].id,'other');
  }
});
