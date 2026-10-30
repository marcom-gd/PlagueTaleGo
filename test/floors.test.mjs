import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, applyAction, validateProject, floorVariants, hasNode, nodesConnected, nodeCells } from '../public/model.js';
import { copyLevel } from '../public/editing.js';
import { inventoryData } from '../inventory-export.mjs';
import { collectItems, releaseItem } from '../public/player-inventory.js';

test('floor variants paint, replace, erase and survive saved project and level copies', () => {
  let project = newProject();
  const levelId = project.levels[0].id;
  assert.equal(project.levels[0].tiles['2,2'], 'floor');
  for (const {tile} of floorVariants) {
    project = applyAction(project, {type:'tile.paint', data:{levelId, cells:['0,0','1,0'], tile}});
    assert.equal(project.levels[0].tiles['0,0'], tile);
    assert.equal(project.levels[0].tiles['1,0'], tile);
    const loaded = validateProject(JSON.parse(JSON.stringify(project)));
    assert.equal(loaded.levels[0].tiles['0,0'], tile);
    assert.equal(copyLevel(loaded.levels[0]).tiles['1,0'], tile);
  }
  const before = structuredClone(project);
  project = applyAction(project, {type:'tile.paint', data:{levelId, cells:['0,0'], tile:'empty'}});
  assert.equal(project.levels[0].tiles['0,0'], undefined);
  assert.equal(before.levels[0].tiles['0,0'], 'floor-underground');
  assert.throws(() => applyAction(project, {type:'tile.paint', data:{levelId, cells:['0,0'], tile:'floor-invalid'}}), /Invalid level tile/);
});

test('inventory floor totals include all three floor types and preserve their source values', () => {
  const project = newProject();
  project.levels[0].tiles = {'0,0':'floor-elevated', '1,0':'floor', '2,0':'floor-underground', '3,0':'wall', '0,1':'node'};
  const data = inventoryData(project);
  assert.deepEqual(data.levels[0].slice(5,9), [1,3,1,5]);
  assert.deepEqual(data.project.levels[0].tiles, project.levels[0].tiles);
});

test('nodes overlay every floor type, connect across heights and survive repaint, save and copy', () => {
  let project=newProject();const levelId=project.levels[0].id;
  const paint=(cells,tile)=>project=applyAction(project,{type:'tile.paint',data:{levelId,cells,tile}});
  floorVariants.forEach(({tile},x)=>paint([`${x},0`],tile));
  paint(['0,0','1,0','2,0'],'node');
  let level=project.levels[0];
  assert.deepEqual(floorVariants.map((_,x)=>level.tiles[`${x},0`]),floorVariants.map(v=>v.tile));
  assert.deepEqual(nodeCells(level),['0,0','1,0','2,0']);
  assert.ok(nodesConnected(level,'0,0','1,0'));assert.ok(nodesConnected(level,'1,0','2,0'));
  project=applyAction(project,{type:'link.update',data:{levelId,from:'0,0',to:'1,0',connected:false}});
  paint(['1,0'],'floor-underground');
  assert.ok(hasNode(project.levels[0],'1,0'));assert.equal(nodesConnected(project.levels[0],'0,0','1,0'),false);
  const loaded=validateProject(JSON.parse(JSON.stringify(project))),copy=copyLevel(loaded.levels[0]);
  assert.deepEqual(copy.nodes,loaded.levels[0].nodes);assert.deepEqual(copy.tiles,loaded.levels[0].tiles);
  assert.deepEqual(inventoryData(project).levels[0].slice(5,9),[3,59,0,59]);
  paint(['1,0'],'wall');level=project.levels[0];
  assert.equal(hasNode(level,'1,0'),false);assert.deepEqual(level.blockedLinks,[]);
  paint(['0,0'],'empty');assert.equal(hasNode(project.levels[0],'0,0'),false);assert.equal(project.levels[0].tiles['0,0'],undefined);
});

test('standalone and legacy nodes keep working; adding floors preserves the node and links', () => {
  let project=newProject();const level=project.levels[0],levelId=level.id;
  level.tiles['0,0']='node';level.tiles['1,0']='node';level.blockedLinks=['0,0|1,0'];
  project=applyAction(project,{type:'tile.paint',data:{levelId,cells:['0,0'],tile:'floor-elevated'}});
  assert.equal(project.levels[0].tiles['0,0'],'floor-elevated');assert.ok(hasNode(project.levels[0],'0,0'));
  assert.deepEqual(project.levels[0].blockedLinks,['0,0|1,0']);
  project=applyAction(project,{type:'tile.paint',data:{levelId,cells:['2,0'],tile:'node'}});
  assert.ok(hasNode(project.levels[0],'2,0'));assert.ok(nodesConnected(project.levels[0],'1,0','2,0'));
  for(const nodes of [['0,0','0,0'],['99,0'],['bad'],[null]]){
    const bad=structuredClone(project);bad.levels[0].nodes=nodes;assert.throws(()=>validateProject(bad),/Invalid level nodes/);
  }
});

test('Snap to Nodes accepts inventory placements on layered floors', () => {
  let project=newProject();const levelId=project.levels[0].id;
  project=applyAction(project,{type:'tile.paint',data:{levelId,cells:['3,3'],tile:'floor-underground'}});
  project=applyAction(project,{type:'tile.paint',data:{levelId,cells:['3,3'],tile:'node'}});
  project=applyAction(project,{type:'asset.add',data:{id:'token',name:'Token',icon:'torch',rule:'',tags:[],color:'#edc47c',range:2,parentId:null}});
  const collected=collectItems(project,[],levelId,{type:'asset',id:'token'});
  const result=releaseItem(collected.project,collected.inventory,levelId,collected.inventory[0].id,{x:3,y:3},true);
  assert.equal(result.project.levels[0].instances[0].x,3);
  assert.equal(result.project.levels[0].tiles['3,3'],'floor-underground');
});
