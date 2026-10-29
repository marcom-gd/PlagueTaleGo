import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {newProject,validateProject,applyAction,uid} from '../public/model.js';
import {validateDeck,deckIds} from '../public/cards-catalog.js';
import {createWorkshopServer} from '../server.mjs';

test('post-its persist independently of tokens, merge property edits, and validate bounds and content',()=>{
  const source=newProject(),levelId=source.levels[0].id,note={id:uid(),text:'Tester missed the exit.\nTry a clearer sign.',color:'#f6dfa0',x:4,y:3};
  let p=applyAction(source,{type:'postIt.add',data:{levelId,note}});
  assert.deepEqual(source.levels[0].postIts,[]);
  p=applyAction(p,{type:'postIt.update',data:{levelId,id:note.id,x:6}});
  p=applyAction(p,{type:'postIt.update',data:{levelId,id:note.id,text:'Changed observation'}});
  assert.equal(p.levels[0].postIts[0].x,6);
  assert.equal(validateProject(JSON.parse(JSON.stringify(p))).levels[0].postIts[0].text,'Changed observation');
  for(const change of [{x:-1},{y:11},{text:' '},{text:5},{color:'red;position:absolute'},{id:'missing',text:'x'}])assert.throws(()=>applyAction(p,{type:'postIt.update',data:{levelId,id:note.id,...change}}));
  assert.throws(()=>applyAction(p,{type:'level.update',data:{levelId,width:4}}),/inside the level/);
  assert.equal(applyAction(p,{type:'postIt.delete',data:{levelId,id:note.id}}).levels[0].postIts.length,0);
});

test('older projects gain empty note/history collections without mutating the source',()=>{
  const source=newProject();delete source.cardDraws;delete source.levels[0].postIts;
  const restored=validateProject(source);
  assert.deepEqual(restored.cardDraws,[]);assert.deepEqual(restored.levels[0].postIts,[]);
  assert.equal(source.cardDraws,undefined);assert.equal(source.levels[0].postIts,undefined);
});

test('floating annotations accept fractional positions beyond the grid and survive resize and visibility updates',()=>{
  let p=newProject();const levelId=p.levels[0].id;
  const note={id:uid(),space:'canvas',kind:'arrow',text:'Arrow',color:'#edc47c',x:733.25,y:-32.5,dx:-220.5,dy:90};
  p=applyAction(p,{type:'postIt.add',data:{levelId,note}});
  p=applyAction(p,{type:'level.update',data:{levelId,width:14}});
  p=applyAction(p,{type:'postIt.update',data:{levelId,id:note.id,hidden:true,x:801.75}});
  assert.equal(p.levels[0].postIts[0].x,801.75);assert.equal(p.levels[0].postIts[0].hidden,true);
  assert.throws(()=>applyAction(p,{type:'postIt.update',data:{levelId,id:note.id,x:Infinity}}));
});

test('repository inventories contain valid prompts and reject duplicate IDs and invalid card fields',async()=>{
  for(const id of deckIds){
    const deck=JSON.parse(await readFile(new URL(`../cards/${id}.json`,import.meta.url),'utf8'));
    assert.equal(validateDeck(deck,id),deck);assert.ok(deck.cards.length>=12);
    for(const edit of [d=>d.cards.push(d.cards[0]),d=>d.cards[0].id='../other',d=>d.cards[0].task=' ',d=>d.cards[0].reflection=4]){const bad=structuredClone(deck);edit(bad);assert.throws(()=>validateDeck(bad,id));}
  }
});

test('draw history roundtrips snapshots, rejects repeats, and resets only the chosen deck',()=>{
  let p=newProject();
  const draw=deckId=>({id:uid(),deckId,cardId:'one',title:'Original title',task:'Original task',reflection:'Why?'});
  const first=draw('experiments');
  p=applyAction(p,{type:'card.record',data:{draw:first}});
  assert.throws(()=>applyAction(p,{type:'card.record',data:{draw:{...first,id:uid()}}}),/repeated/);
  p=applyAction(p,{type:'card.record',data:{draw:draw('challenges')}});
  p=validateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(p.cardDraws[0].task,'Original task');
  assert.equal(applyAction(p,{type:'card.reset',data:{deckId:'experiments'}}).cardDraws[0].deckId,'challenges');
});

test('server draws without replacement under concurrency, persists history, and safely edits repository catalogs',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'workshop-notes-cards-')),dataDir=path.join(root,'data'),cardsDir=path.join(root,'cards');
  await mkdir(cardsDir);
  const catalog=id=>({id,name:'Test '+id,description:'Test prompts',cards:Array.from({length:3},(_,n)=>({id:'card-'+n,title:'Card '+n,task:'Test task '+n,reflection:'What changed?'}))});
  for(const id of deckIds)await writeFile(path.join(cardsDir,id+'.json'),JSON.stringify(catalog(id)));
  let server=await createWorkshopServer({dataDir,cardsDir});
  const start=async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;};
  const stop=async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  let base=await start();
  const action=async(type,data={},actionId=uid(),room='a')=>{
    const response=await fetch(`${base}/api/rooms/${room}/actions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:{type,data},actionId})});
    return {status:response.status,...await response.json()};
  };
  try{
    const draws=await Promise.all(Array.from({length:4},()=>action('card.draw',{deckId:'experiments'})));
    assert.equal(draws.filter(d=>d.status===200).length,3);assert.equal(draws.filter(d=>d.status===400).length,1);
    const room=await (await fetch(base+'/api/rooms/a')).json();
    assert.equal(new Set(room.project.cardDraws.map(d=>d.cardId)).size,3);assert.equal(room.project.assets.length,0);
    const note={id:uid(),text:'Observation from a playtest',color:'#bfddce',x:2,y:2};
    assert.equal((await action('postIt.add',{levelId:room.project.levels[0].id,note})).status,200);
    const first=room.project.cardDraws[0];
    assert.equal((await action('card.draw',{deckId:'experiments'},first.id)).status,200);
    assert.equal((await action('card.record',{draw:{...first,id:uid()}})).status,400);
    assert.equal((await action('card.draw',{deckId:'challenges'})).status,200);
    assert.equal((await action('card.draw',{deckId:'experiments'},uid(),'other-room')).status,200);
    const claim={levelId:room.project.levels[0].id,draw:{id:uid(),deckId:'challenges',cardId:'card-0',title:'Fake',task:'Fake',reflection:''},note:{id:uid(),space:'canvas',kind:'card',text:'A floating card',color:'#edc47c',x:950.25,y:65.5}};
    const isolated=await (await fetch(base+'/api/rooms/claim-room')).json();claim.levelId=isolated.project.levels[0].id;
    const claimed=await action('card.claim',claim,uid(),'claim-room');assert.equal(claimed.status,200);assert.equal(claimed.project.cardDraws[0].title,'Card 0');assert.equal(claimed.project.levels[0].postIts[0].x,950.25);
    assert.equal((await action('card.claim',{...claim,draw:{...claim.draw,id:uid()},note:{...claim.note,id:uid()}},uid(),'claim-room')).status,400);
    const inventory=await (await fetch(base+'/api/decks')).json();assert.equal(inventory.canEdit,true);
    const original=inventory.decks[0],edited=structuredClone(original);edited.cards[0].title='Edited for future draws';
    const save=body=>fetch(base+'/api/decks/experiments',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await save({deck:edited,original})).status,200);
    assert.equal((await save({deck:edited,original})).status,409);
    assert.equal(JSON.parse(await readFile(path.join(cardsDir,'experiments.json'),'utf8')).cards[0].title,'Edited for future draws');
    const evil=await fetch(base+'/api/decks/experiments',{method:'PUT',headers:{Origin:'https://other.example'},body:JSON.stringify({deck:edited,original:edited})});assert.equal(evil.status,403);
    await stop();server=await createWorkshopServer({dataDir,cardsDir});base=await start();
    const restored=await (await fetch(base+'/api/rooms/a')).json();assert.equal(restored.project.cardDraws.length,4);assert.equal(restored.project.levels[0].postIts[0].text,note.text);
    assert.ok(restored.project.cardDraws.filter(d=>d.deckId==='experiments').every(d=>d.title.startsWith('Card ')));
    const reset=await action('card.reset',{deckId:'experiments'});assert.equal(reset.project.cardDraws.length,1);
    assert.equal((await action('card.draw',{deckId:'experiments'})).status,200);
    await stop();server=await createWorkshopServer({dataDir,cardsDir,online:{password:'test-session-password'}});base=await start();
    const headers={Authorization:'Basic '+Buffer.from('workshop:test-session-password').toString('base64')};
    assert.equal((await (await fetch(base+'/api/decks',{headers})).json()).canEdit,false);
    assert.equal((await fetch(base+'/api/decks/experiments',{method:'PUT',headers,body:JSON.stringify({deck:edited,original:edited})})).status,403);
  }finally{await stop();await rm(root,{recursive:true,force:true});}
});
