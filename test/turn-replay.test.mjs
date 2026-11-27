import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, clone } from '../public/model.js';
import { createSequence, nextTurn, previousTurn, eventTurn, hasRecordedNextTurn } from '../public/turn-sequence.js';

const initial=()=>{const project=newProject();return {project,inventory:[],graveyard:[],levelId:project.levels[0].id};};
const replay=(sequence,state)=>nextTurn(sequence,state,undefined,{recordedOnly:true});

test('recorded-only navigation refuses new turns without mutating the sequence',()=>{
  const state=initial(),sequence=createSequence(state),before=clone(sequence);
  assert.equal(hasRecordedNextTurn(sequence,state),false);
  assert.throws(()=>replay(sequence,state),/only replay recorded turns/);
  assert.deepEqual(sequence,before);
  assert.equal(nextTurn(sequence,state).cursor,1,'Sandbox can still create turns');
});

test('actions record turns that can be rewound and replayed without recording another turn',()=>{
  const state=initial(),after=clone(state);
  after.project.levels[0].name='An action happened';
  const recorded=eventTurn(createSequence(state),state,after);
  const past=previousTurn(recorded,recorded.frames[1]);
  assert.equal(hasRecordedNextTurn(past,past.frames[0]),true);
  const played=replay(past,past.frames[0]);
  assert.equal(played.cursor,1);
  assert.deepEqual(played.frames,recorded.frames);
  assert.equal(hasRecordedNextTurn(played,played.frames[1]),false);
  assert.throws(()=>replay(played,played.frames[1]),/only replay recorded turns/);
});

test('changing a past state invalidates its recorded future instead of creating a fresh turn',()=>{
  const state=initial(),recorded=nextTurn(createSequence(state),state);
  const past=previousTurn(recorded,recorded.frames[1]),before=clone(past);
  for(const key of ['project','inventory','graveyard','levelId','outcome']){
    const changed=clone(past.frames[0]);
    if(key==='project')changed.project.levels[0].name='A different action';
    else if(key==='levelId')changed.levelId='different-level';
    else if(key==='outcome')changed.outcome={type:'gameOver',levelId:state.levelId};
    else changed[key]=[{id:'changed'}];
    assert.equal(hasRecordedNextTurn(past,changed),false,key);
    assert.throws(()=>replay(past,changed),/only replay recorded turns/);
    assert.deepEqual(past,before);
  }
});
