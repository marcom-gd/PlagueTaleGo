import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {newProject,blankLevel,applyAction,validateProject} from '../public/model.js';
import {copyLevel} from '../public/editing.js';
import {exportLevels,buildLevelImport} from '../public/level-transfer.js';
import {userTestStore} from '../user-test-store.mjs';

const profile={nickname:'Tester',avatar:'rat',color:'#3975b9'};
const feedback={experience:4,difficulty:3,personalChallenge:5,emotions:['proud'],noFriction:true,friction:'',thoughts:'',mode:'userTest',completion:'manual'};
function fixture(){
  const p=newProject();p.levels=['hidden-first','first','hidden-middle','second','hidden-last'].map(id=>({...blankLevel(id,id),...(id.startsWith('hidden')?{hideFromPlaytest:true}:{})}));return p;
}
test('the visibility flag defaults off, validates booleans and persists through settings, undo, copies and transfers',()=>{
  const p=newProject(),id=p.levels[0].id;assert.notEqual(p.levels[0].hideFromPlaytest,true);
  const hidden=applyAction(p,{type:'level.update',data:{levelId:id,hideFromPlaytest:true}});
  assert.equal(hidden.levels[0].hideFromPlaytest,true);assert.equal(p.levels[0].hideFromPlaytest,undefined);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(hidden))),hidden);
  assert.deepEqual(applyAction(hidden,{type:'project.replace',data:p}),p);
  assert.equal(copyLevel(hidden.levels[0]).hideFromPlaytest,true);
  const file=exportLevels(hidden,[id]),imported=buildLevelImport(newProject(),file,{levelChoices:{[id]:{mode:'copy'}}});
  assert.equal(imported.project.levels.at(-1).hideFromPlaytest,true);
  const shown=applyAction(hidden,{type:'level.update',data:{levelId:id,hideFromPlaytest:false}});assert.equal(shown.levels[0].hideFromPlaytest,false);
  for(const value of ['true',1,null])assert.throws(()=>applyAction(p,{type:'level.update',data:{levelId:id,hideFromPlaytest:value}}),/hide from playtest/i);
});
test('User Test snapshots skip hidden levels in saved order and feedback progresses only through visible levels',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'hidden-levels-'));
  try{
    const project=fixture(),before=structuredClone(project),id=randomUUID();let store=userTestStore(directory);
    const input={room:'crew',id,project,revision:4,command:'start',body:{}};
    const session=await store(input);assert.deepEqual(session.project.levels.map(l=>l.id),['first','second']);assert.deepEqual(project,before);
    assert.doesNotThrow(()=>validateProject(session.project));
    await assert.rejects(store({...input,command:'feedback',body:{levelId:'hidden-first',submissionId:randomUUID(),profile,feedback}}),/current level/);
    let saved;
    for(const [n,levelId] of ['first','second'].entries()){
      saved=await store({...input,command:'feedback',body:{levelId,submissionId:randomUUID(),profile,feedback}});
      assert.equal(saved.results.at(-1).levelNumber,n+1);
    }
    assert.deepEqual(saved.results.map(r=>r.levelId),['first','second']);assert.equal(saved.results.length,saved.project.levels.length);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory,'crew',id+'.json'),'utf8')),saved);
    store=userTestStore(directory);project.levels.forEach(l=>l.hideFromPlaytest=true);
    assert.deepEqual(await store(input),saved); // An ongoing tester keeps the starting snapshot.
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('an all-hidden project cannot start a User Test and recovers once a level is visible',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'hidden-levels-empty-'));
  try{
    const project=fixture();project.levels.forEach(l=>l.hideFromPlaytest=true);
    const store=userTestStore(directory),input={room:'crew',id:randomUUID(),project,revision:0,command:'start',body:{}};
    await assert.rejects(store(input),/no levels are available/i);
    await assert.rejects(readFile(path.join(directory,'crew',input.id+'.json')),/ENOENT/);
    project.levels[3].hideFromPlaytest=false;
    const started=await store(input);assert.deepEqual(started.project.levels.map(l=>l.id),['second']);
  }finally{await rm(directory,{recursive:true,force:true});}
});
