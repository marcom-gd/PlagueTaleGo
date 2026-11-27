import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {mean,median,quantile,summary,paired,filteredRows} from './analytics.mjs';
const data=JSON.parse(fs.readFileSync(new URL('./dist/playtest-data.json',import.meta.url)));
test('all 121 responses and exact saved comments survive extraction, without resume credentials',()=>{
  const source=new URL('../../User%20Test%20Feedback/ga-playtest-2/',import.meta.url);
  const sessions=fs.readdirSync(source).filter(f=>f.endsWith('.json')).sort().map(f=>JSON.parse(fs.readFileSync(new URL(f,source))));
  assert.equal(data.responses.length,121);assert.equal(data.levels.length,15);assert.equal(data.players.length,9);
  for(let i=0;i<sessions.length;i++){
    const p=data.players[i];assert.equal(p.name,sessions[i].profile.nickname);
    const rs=data.responses.filter(r=>r.player===p.key);assert.equal(rs.length,sessions[i].results.length);
    sessions[i].results.forEach((original,j)=>{for(const field of ['friction','thoughts','turns','elapsedSeconds','emotions','experience','difficulty','personalChallenge','noFriction','mode','usedSandbox','completion','savedAt'])assert.deepEqual(rs[j][field],original[field]);});
    const serialized=JSON.stringify(data);assert.ok(!serialized.includes(sessions[i].id));for(const r of sessions[i].results)assert.ok(!serialized.includes(r.submissionId));
  }
});
test('summary statistics and missing values are handled honestly',()=>{
  assert.equal(mean([]),null);assert.equal(median([]),null);assert.equal(mean([null,10,20]),15);assert.equal(median([1,3,9,15]),6);assert.equal(quantile([0,10,20,30],.25),7.5);
  const s=summary(data.responses);assert.equal(s.sandbox,30);assert.equal(s.manual,0);assert.equal(s.elapsedSeconds.median,52);assert.equal(s.turns.max,63);assert.equal(s.emotions.bored,22);
  const blank=summary([]);assert.equal(blank.experience.min,null);assert.equal(blank.turns.mean,null);
});
test('paired comparison uses the same player on both matching levels and excludes unmatched families',()=>{
  const groups=[1,2,3,5,6,7].map(b=>paired(data,data.responses,b,'experience'));
  assert.ok(groups.every(g=>g.n===8));assert.equal(groups.flatMap(g=>g.pairs).length,48);assert.equal(mean(groups.flatMap(g=>g.pairs.map(p=>p.delta))),-.3125);
  assert.equal(groups[5].delta,-1);assert.equal(paired(data,data.responses,9,'experience').unmatched,true);
  assert.ok(!groups.some(g=>g.pairs.some(p=>p.player==='P07')));
  const strict=filteredRows(data,{mode:'strict'});assert.equal(strict.length,91);assert.ok(strict.every(r=>!r.usedSandbox));
  const complete=filteredRows(data,{cohort:'complete'});assert.equal(complete.length,120);assert.ok(complete.every(r=>r.player!=='P07'));
  for(const b of [1,2,3,5,6,7])for(const pair of paired(data,strict,b,'turns').pairs){const ls=data.levels.filter(l=>l.base===b);assert.ok(ls.every(l=>strict.some(r=>r.player===pair.player&&r.level===l.key)));}
});
test('every view and source drilldown renders, including filtered empty states',()=>{
  const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);assert.equal(scripts.length,2);
  const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',textContent:'',hidden:false,open:false,addEventListener(){},classList:{toggle(){}},showModal(){this.open=true},close(){this.open=false},scrollTop:0});return elements.get(id);};
  const ctx=vm.createContext({console,URL,URLSearchParams,Blob,setTimeout(){},location:{hash:'#overview'},window:{addEventListener(){},scrollTo(){}},document:{querySelector:element,querySelectorAll(){return []},addEventListener(){},getElementById(){return null}}});
  vm.runInContext(scripts.join('\n'),ctx);
  for(const page of ['overview','levels','compare','voices','methods'])for(const mode of ['all','strict'])for(const cohort of ['all','complete']){
    vm.runInContext(`state.page='${page}';state.mode='${mode}';state.cohort='${cohort}';render();`,ctx);
    const body=element('#content').innerHTML;assert.ok(body.length>100);assert.ok(!body.includes('NaN'));assert.ok(!body.includes('undefined'));
  }
  for(let i=0;i<4;i++)vm.runInContext(`openTheme(${i})`,ctx);
  for(const l of data.levels)vm.runInContext(`openLevel('${l.key}')`,ctx);
  for(const p of data.players)vm.runInContext(`state.voicePlayer='${p.key}';state.page='voices';render()`,ctx);
  vm.runInContext("state.mode='strict';state.cohort='complete';state.metric='elapsedSeconds';render();openLevel('L14');openResponse('P01','L01');",ctx);
});
