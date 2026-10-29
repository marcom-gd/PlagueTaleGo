import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,applyAction,validateProject,facingDirection,parameterOverlay} from '../public/model.js';

function fixture(){
  const p=newProject(),l=p.levels[0];
  const a={id:'token',name:'Guard',icon:'guard',rule:'',tags:[],color:'#b8cf96',range:2,rotation:0};
  const i={id:'piece',assetId:a.id,x:4,y:4,rotation:0};
  p.assets.push(a);l.instances.push(i);return {p,l,a,i};
}
test('optional facing inherits the definition and placement overrides leave icon rotation untouched',()=>{
  let {p,l,a,i}=fixture();
  assert.equal(facingDirection(a,i),null);
  p=applyAction(p,{type:'asset.update',data:{id:a.id,direction:90}});
  assert.equal(facingDirection(p.assets[0],p.levels[0].instances[0]),90);
  p=applyAction(p,{type:'instance.update',data:{levelId:l.id,id:i.id,direction:180}});
  assert.equal(facingDirection(p.assets[0],p.levels[0].instances[0]),180);
  assert.equal(p.assets[0].rotation,0);assert.equal(p.levels[0].instances[0].rotation,0);
  assert.equal(validateProject(JSON.parse(JSON.stringify(p))).levels[0].instances[0].direction,180);
  assert.equal(facingDirection({...a,direction:90},{...i,direction:null}),null);
});
test('facing turns directional parameters while legacy placements keep their existing orientation',()=>{
  const {p,l,a,i}=fixture(),effect={...a,icon:'sight',followTokenFacing:true};
  assert.deepEqual(parameterOverlay(p,a,effect,i,l).cells,[[4,2],[4,3]]);
  const cells=parameterOverlay(p,a,effect,{...i,direction:90},l).cells;
  assert.deepEqual(cells,[[5,4],[6,4]]);
  assert.equal(i.rotation,0);
});
test('invalid facing values are rejected for definitions and placements',()=>{
  const {p,l,a,i}=fixture();
  for(const direction of [-90,45,360,'up',false]){
    assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:a.id,direction}}));
    assert.throws(()=>applyAction(p,{type:'instance.update',data:{levelId:l.id,id:i.id,direction}}));
  }
});

test('auto-facing follows movement on each axis, preserves facing for stationary edits, and is opt-in',()=>{
  let {p,l,a,i}=fixture();
  const move=data=>{p=applyAction(p,{type:'instance.update',data:{levelId:l.id,id:i.id,...data}});return p.levels[0].instances[0];};
  assert.equal(move({x:5}).direction,undefined);
  p=applyAction(p,{type:'asset.update',data:{id:a.id,autoFacing:true}});
  for(const [data,direction] of [[{x:6},90],[{y:5},180],[{x:5},270],[{y:4},0],[{x:7,y:5},90],[{x:8,y:8},180],[{x:7,y:7},270]]){
    const moved=move(data);assert.equal(moved.direction,direction);assert.equal(moved.rotation,0);
  }
  assert.equal(move({note:'Stationary'}).direction,270);
  assert.equal(move({x:7,y:7}).direction,270);
  assert.equal(move({x:8,direction:0}).direction,0);
  p=applyAction(p,{type:'asset.update',data:{id:a.id,autoFacing:false}});
  assert.equal(move({y:8}).direction,0);
});
test('parameters follow facing only when enabled, including inside nested states',()=>{
  const {p,l,a,i}=fixture();
  const state={...a,id:'state',kind:'state',enabled:true,parentId:a.id};
  const effect={...a,id:'effect',icon:'sight',parentId:state.id,rotation:90};
  p.assets.push(state,effect);
  const placed={...i,direction:90};
  assert.deepEqual(parameterOverlay(p,a,effect,placed,l).cells,[[5,4],[6,4]]);
  effect.followTokenFacing=true;
  assert.deepEqual(parameterOverlay(p,a,effect,placed,l).cells,[[4,5],[4,6]]);
  effect.followTokenFacing=false;
  assert.deepEqual(parameterOverlay(p,a,effect,placed,l).cells,[[5,4],[6,4]]);
});
test('facing options persist through updates and export and reject non-boolean values',()=>{
  let {p,a}=fixture();
  p=applyAction(p,{type:'asset.update',data:{id:a.id,autoFacing:true,followTokenFacing:true}});
  const saved=validateProject(JSON.parse(JSON.stringify(p))).assets[0];
  assert.equal(saved.autoFacing,true);assert.equal(saved.followTokenFacing,true);
  for(const key of ['autoFacing','followTokenFacing'])for(const value of ['true',1,null]){
    assert.throws(()=>applyAction(p,{type:'asset.update',data:{id:a.id,[key]:value}}));
  }
});
