import test from 'node:test';
import assert from 'node:assert/strict';
import {effectContains, effectRotation, newProject, applyAction, validateProject} from '../public/model.js';
const effect=(icon,extra={})=>({id:icon,name:icon,icon,range:4,width:5,rotation:0,rule:'',tags:[],color:'#b8cf96',parentId:null,...extra});
test('directional effects have exact lengths and rotate through all four directions',()=>{
  for(const icon of ['sight','cone','rectangle'])for(const rotation of [0,90,180,270]){
    const a=effect(icon); const turn=(x,y)=>rotation===0?[x,y]:rotation===90?[-y,x]:rotation===180?[-x,-y]:[y,-x];
    for(let y=-5;y<=5;y++)for(let x=-5;x<=5;x++)assert.equal(effectContains(a,...turn(x,y),rotation),effectContains(a,x,y));
    assert.equal(effectContains(a,0,0,rotation),false);
  }
  assert.ok(effectContains(effect('sight'),0,-4));assert.ok(!effectContains(effect('sight'),0,-5));assert.ok(!effectContains(effect('sight'),1,-2));
});
test('cone reaches configured far width and rectangle keeps exact odd and even widths',()=>{
  const row=(a,y)=>Array.from({length:25},(_,x)=>x-12).filter(x=>effectContains(a,x,-y));
  assert.deepEqual(row(effect('cone'),4),[-2,-1,0,1,2]);
  assert.ok(row(effect('cone'),1).length<row(effect('cone'),4).length);
  for(const width of [1,2,5,12])for(let y=1;y<=4;y++)assert.equal(row(effect('rectangle',{width}),y).length,width);
  assert.ok(effectContains(effect('area'),0,0));assert.ok(!effectContains(effect('area'),3,2));
});

test('cross includes its center and four one-cell-wide arms with exact range at every rotation',()=>{
  for(let range=1;range<=12;range++)for(const rotation of [0,90,180,270]){
    const a=effect('cross',{range});let count=0;
    for(let y=-13;y<=13;y++)for(let x=-13;x<=13;x++){
      const expected=(x===0&&Math.abs(y)<=range)||(y===0&&Math.abs(x)<=range);
      assert.equal(effectContains(a,x,y,rotation),expected,`${x},${y}, range ${range}, rotation ${rotation}`);
      if(expected)count++;
    }
    assert.equal(count,4*range+1);
  }
});
test('shared definition rotation persists, composes once with nested effects and leaves placement rotation independent',()=>{
  let p=newProject(); const root=effect('torch',{rotation:90}), child=effect('cone',{rotation:270,parentId:root.id});p.assets=[root,child];
  p.levels[0].instances=[{id:'placed',assetId:root.id,x:2,y:2,rotation:90}];
  assert.equal(effectRotation(p,root,child,90),90);
  assert.equal(effectRotation(p,child,child,90),0);
  p=applyAction(p,{type:'asset.update',data:{id:child.id,rotation:0,width:6}});
  assert.equal(effectRotation(p,p.assets[0],p.assets[1],90),180);
  assert.equal(p.levels[0].instances[0].rotation,90);
  assert.equal(validateProject(JSON.parse(JSON.stringify(p))).assets[1].width,6);
  for(const data of [{rotation:45},{width:0},{width:13},{width:2.5}])assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:child.id,...data}}));
  const legacy=effect('sight');delete legacy.width;delete legacy.rotation;p.assets=[legacy];p.levels[0].instances=[];
  assert.equal(effectRotation(validateProject(p),legacy,legacy,270),270);
});
test('cones stay mirror symmetric at every depth, width, length and direction, including saved even widths',()=>{
  for(let width=1;width<=12;width++)for(let range=1;range<=12;range++){
    const a=effect('cone',{width,range});
    for(const rotation of [0,90,180,270])for(let depth=1;depth<=range;depth++)for(let side=-6;side<=6;side++){
      const point=s=>rotation===0?[s,-depth]:rotation===90?[depth,s]:rotation===180?[-s,depth]:[-depth,-s];
      assert.equal(effectContains(a,...point(side),rotation),effectContains(a,...point(-side),rotation));
    }
    const far=Array.from({length:25},(_,x)=>x-12).filter(x=>effectContains(a,x,-range));
    assert.equal(far.length,width%2?width:width-1);
  }
});
import {parameterOverlay, wallBlocks} from '../public/model.js';
test('walls occlude all parameter shapes and block diagonal corner leaks',()=>{
  for(const icon of ['area','sight','cone','rectangle','cross']){
    const p=newProject(),a=effect(icon,{occludedByWalls:true,range:4,width:5});p.assets=[a];
    const l=p.levels[0],i={id:'owner',assetId:a.id,x:5,y:5,rotation:0};l.instances=[i];l.tiles={'5,3':'wall'};
    let result=parameterOverlay(p,a,a,i,l);
    assert.ok(!result.cells.some(([x,y])=>x===5&&y<=3));
    assert.ok(result.cells.some(([x,y])=>x===5&&y===4));
    a.occludedByWalls=false;result=parameterOverlay(p,a,a,i,l);
    assert.ok(result.cells.some(([x,y])=>x===5&&y===2));
  }
  assert.ok(wallBlocks({'1,0':'wall'},0,0,2,2));
  assert.ok(wallBlocks({'0,1':'wall'},0,0,2,2));
  assert.equal(wallBlocks({},0,0,2,2),false);
  assert.equal(wallBlocks({'0,1':'wall'},0,0,2,0),false);
});
test('overlap color counts visible placed objects, excludes owner and markers, and updates as objects move',()=>{
  const p=newProject(),root=effect('torch'),a=effect('area',{parentId:root.id,overlapThreshold:2,overlapColor:'#ff0000',occludedByWalls:true});
  p.assets=[root,a,effect('guard'),effect('sight')];const l=p.levels[0];l.tiles={};
  const owner={id:'owner',assetId:root.id,x:5,y:5,rotation:0};
  l.instances=[owner,{id:'one',assetId:'guard',x:5,y:4,rotation:0},{id:'two',assetId:'guard',x:5,y:4,rotation:0},{id:'marker',assetId:'sight',x:5,y:4,rotation:0}];
  let result=parameterOverlay(p,root,a,owner,l);assert.equal(result.count,2);assert.equal(result.color,'#ff0000');
  l.instances[2].x=13;result=parameterOverlay(p,root,a,owner,l);assert.equal(result.count,1);assert.equal(result.color,a.color);
  l.tiles={'5,4':'wall'};assert.equal(parameterOverlay(p,root,a,owner,l).count,0);
  a.overlapThreshold=0;a.occludedByWalls=false;assert.equal(parameterOverlay(p,root,a,owner,l).color,a.color);
});
test('parameter behavior settings persist and reject invalid input',()=>{
  let p=newProject();p.assets=[effect('cone')];
  const data={id:'cone',occludedByWalls:true,overlapThreshold:3,overlapColor:'#ff0000'};
  p=applyAction(p,{type:'asset.update',data});const saved=validateProject(JSON.parse(JSON.stringify(p))).assets[0];
  for(const key of Object.keys(data))assert.equal(saved[key],data[key]);
  for(const invalid of [{occludedByWalls:1},{overlapThreshold:-1},{overlapThreshold:1.5},{overlapThreshold:1001},{overlapColor:'red'}])assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:'cone',...invalid}}));
});
test('overlap rules filter library objects, clear to any, and safely prune deleted selections',()=>{
  let p=newProject();const root=effect('torch'),a=effect('area',{parentId:root.id,overlapThreshold:1,overlapColor:'#ff0000',overlapAssetIds:['guard']});
  p.assets=[root,a,effect('guard'),effect('rock')];const l=p.levels[0];l.tiles={};
  const owner={id:'owner',assetId:root.id,x:5,y:5,rotation:0};l.instances=[owner,{id:'one',assetId:'rock',x:5,y:4,rotation:0}];
  assert.equal(parameterOverlay(p,root,a,owner,l).count,0);
  l.instances.push({id:'two',assetId:'guard',x:5,y:4,rotation:0});assert.equal(parameterOverlay(p,root,a,owner,l).count,1);
  p=applyAction(p,{type:'asset.update',data:{id:a.id,overlapAssetIds:null}});
  assert.equal(parameterOverlay(p,root,p.assets[1],owner,p.levels[0]).count,2);
  p=applyAction(p,{type:'asset.update',data:{id:a.id,overlapAssetIds:['guard']}});
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))).assets[1].overlapAssetIds,['guard']);
  for(const overlapAssetIds of [['missing'],['guard','guard'],['area'],'guard'])assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:a.id,overlapAssetIds}}));
  const removed=applyAction(p,{type:'asset.delete',data:{id:'guard'}});assert.deepEqual(removed.assets[1].overlapAssetIds,[]);
  assert.equal(parameterOverlay(removed,root,removed.assets[1],owner,removed.levels[0]).count,0);
  const converted=applyAction(p,{type:'asset.update',data:{id:'guard',icon:'cone'}});assert.deepEqual(converted.assets[1].overlapAssetIds,[]);
});
