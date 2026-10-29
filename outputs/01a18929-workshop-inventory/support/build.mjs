// Revision 1 local authoring fixture. The native Google Sheets now contain
// revision 2 recipes, linked introductions and updated styling. Do not reimport
// these legacy local outputs over the revised native workbooks.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Workbook, SpreadsheetFile} from '@oai/artifact-tool';
import {validateProject, assetIsActive, descendants, nodesConnected} from '../../../public/model.js';

const out=path.resolve('outputs/01a18929-workshop-inventory');
const N=80, START=6, END=START+N-1;
const skills=['Memory','Logic','Prediction','Tactics','Strategy','Perception','Management','Concentration','Reflexes','Timing','Precision','Endurance','Dexterity','Measurement'];
const types=['Stealth','Puzzle','Traversal','Combat','Exploration','Survival','Social','Other'];
const col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const ref=(s,c)=>`'${s}'!$${c}$${START}:$${c}$${END}`;
const count=(s,c,key)=>`COUNTIFS(${ref(s,c)},${key})`;
const sum=(s,c,k,key)=>`SUMIFS(${ref(s,c)},${ref(s,k)},${key})`;
const lookup=(s,c,k,key)=>`INDEX(${ref(s,c)},MATCH(${key},${ref(s,k)},0))`;
const neutral='#F2F3F5',ink='#20252B', amber='#FFF4D6',calc='#F5F7F9',blue='#DCEBFF',red='#FDE2E2';

const project={version:3,title:'Plague Tale GO — design example',tags:[
 {id:'tag-player',name:'Player',rule:'Controlled by the player.',color:'#5d91b5'},
 {id:'tag-threat',name:'Threat',rule:'Can prevent progress or end the run.',color:'#bb5c5c'},
 {id:'tag-light',name:'Light source',rule:'Creates a safe area against rats.',color:'#e0b253'},
 {id:'tag-interact',name:'Interactable',rule:'Changes state after a player action.',color:'#6b9b76'},
 {id:'tag-goal',name:'Goal',rule:'Required to complete the level.',color:'#7765a0'}],assets:[],levels:[]};
const mods={};
function atom(id,name,icon,rule,modifier=0,parentId=null,extra={}){
 project.assets.push({id,name,icon,rule,tags:[],color:'#8fb8c2',range:2,parentId,kind:'token',variant:icon==='girl'?'alive':icon==='rat'?'alive':icon==='guard'?'alive':icon==='torch'?'on':icon==='door'?'closed':icon==='lever'?'off':icon==='exit'?'active':'default',...extra});mods[id]=modifier;
}
atom('a-player','Amicia','girl','Move one connected node per turn.',0,null,{tags:['tag-player']});
atom('a-move','One-node movement','sight','Movement budget: one edge per turn.',0.5,'a-player',{range:1});
atom('a-torch','Torch','torch','Carry light to create a safe route.',0,null,{tags:['tag-interact']});
atom('s-lit','Lit','torch','Light behavior is enabled.',0,'a-torch',{kind:'state',enabled:true,tags:['tag-light']});
atom('s-unlit','Unlit','torch','Light behavior is disabled.',0,'a-torch',{kind:'state',enabled:false,variant:'off'});
atom('a-light','Light radius 2','area','Rats cannot enter the two-cell lit area.',-1,'s-lit',{range:2});
atom('a-rat','Rat swarm','rat','Moves toward an unlit player after each player move.',0.5,null,{tags:['tag-threat']});
atom('a-rat-reach','Rat threat radius','area','Entering one-cell reach ends the run.',1.5,'a-rat',{range:1});
atom('a-guard','Guard','guard','Patrols and turns after the player moves.',0.5,null,{tags:['tag-threat']});
atom('s-alive','Alive','guard','Patrol and vision are enabled.',0.5,'a-guard',{kind:'state',enabled:true});
atom('s-dead','Dead','guard','Patrol and vision are disabled.',0,'a-guard',{kind:'state',enabled:false,variant:'dead'});
atom('a-sight','Sight length 3','sight','Detects the player on a straight three-cell line.',1.5,'s-alive',{range:3});
atom('a-door','Gate','door','Blocks the route until the linked lever is used.',0,null,{tags:['tag-interact']});
atom('s-closed','Closed','door','Route remains blocked.',1,'a-door',{kind:'state',enabled:true});
atom('s-open','Open','door','Route can be crossed.',0,'a-door',{kind:'state',enabled:false,variant:'open'});
atom('a-lever','Lever','lever','Changes the linked gate state.',0,null,{tags:['tag-interact']});
atom('a-switch','Switching rule','sight','Using the lever consumes one turn.',0.5,'a-lever',{range:1});
atom('a-exit','Escape','exit','Reach the exit to complete the level.',0,null,{tags:['tag-goal']});
const defs=[
 ['GE-PLAYER','Amicia','a-player',0],['GE-TORCH','Lit torch','a-torch',0.5],['GE-RATS','Hunting rats','a-rat',0.5],
 ['GE-GUARD','Patrolling guard','a-guard',0.5],['GE-GATE','Closed gate','a-door',0.5],['GE-LEVER','Gate lever','a-lever',0],['GE-EXIT','Escape point','a-exit',0]
];
function makeLevel(id,name,w,h,points,placements,links=[]){
 const tiles={};for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)tiles[`${x},${y}`]='floor';
 for(const [x,y] of points)tiles[`${x},${y}`]='node';
 for(const [x,y] of [[2,2],[w-3,2],[w-3,h-3]])if(tiles[`${x},${y}`]!=='node')tiles[`${x},${y}`]='wall';
 project.levels.push({id,name,width:w,height:h,tiles,blockedLinks:[],instances:placements.map(([pid,e,x,y,rotation=0,note=''])=>({id:pid,assetId:defs.find(d=>d[0]===e)[2],x,y,rotation,note})),objectLinks:links});
}
makeLevel('L01','A light in the dark',14,11,[[...Array(8)].map((_,i)=>[3+i,5]),[...Array(5)].map((_,i)=>[7,3+i])].flat(),[
 ['p01-player','GE-PLAYER',3,5],['p01-torch','GE-TORCH',5,5],['p01-rats','GE-RATS',8,6],['p01-exit','GE-EXIT',10,5]
],[{id:'link-light',name:'Cross the rat corridor',rule:'Carry the torch past the rats.',color:'#5d91b5',instanceIds:['p01-torch','p01-rats']}]);
makeLevel('L02','The watched courtyard',16,12,[[...Array(11)].map((_,i)=>[2+i,5]),[...Array(8)].map((_,i)=>[8,2+i]),[...Array(6)].map((_,i)=>[3+i,8])].flat(),[
 ['p02-player','GE-PLAYER',2,5],['p02-torch','GE-TORCH',4,5],['p02-rats','GE-RATS',8,8],['p02-guard','GE-GUARD',8,3,180],['p02-exit','GE-EXIT',12,5]
]);
makeLevel('L03','The sealed crossing',18,14,[[...Array(14)].map((_,i)=>[2+i,6]),[...Array(10)].map((_,i)=>[9,2+i]),[...Array(8)].map((_,i)=>[3+i,10])].flat(),[
 ['p03-player','GE-PLAYER',2,6],['p03-torch','GE-TORCH',4,6],['p03-rats','GE-RATS',9,10],['p03-guard','GE-GUARD',9,3,180],
 ['p03-guard2','GE-GUARD',13,6,270],['p03-gate','GE-GATE',12,6],['p03-lever','GE-LEVER',9,9],['p03-exit','GE-EXIT',15,6]
],[{id:'link-gate',name:'Gate circuit',rule:'Lever opens the gate while guards patrol.',color:'#7765a0',instanceIds:['p03-lever','p03-gate','p03-guard']}]);
// Duplicate crossing coordinates are map cells, not additional nodes.
validateProject(project);

const challenges=[
 ['CP01','L01','Carry a safe zone','Carry the lit torch through a rat corridor.','Survival','Perception, Management','',1.5,1,'Illustrative: no player observations yet.','link-light'],
 ['CP02','L01','Plan the escape route','Choose a connected route to the exit before committing.','Puzzle','Logic, Prediction','',1,1,'Illustrative design intention.',''],
 ['CP03','L02','Cross a patrol lane','Predict a guard turn and cross outside its line of sight.','Stealth','Prediction, Tactics','',0.5,2,'Turn based: prediction rather than real-time reflexes.',''],
 ['CP04','L02','Protect the light route','Keep the lit route safe while avoiding the patrol.','Survival','Management, Concentration','',1.5,1,'Overlap and safe tiles need a manual playtest.',''],
 ['CP05','L03','Open the watched gate','Use the lever, then pass the gate between guard turns.','Puzzle','Memory, Logic, Strategy','',1,2,'Illustrative combination pressure.','link-gate'],
 ['CP06','L03','Cross two patrols','Plan a sequence through two intersecting guard sight lines.','Stealth','Prediction, Tactics, Concentration','',1.5,2,'Two guard placements of the same assembled definition.',''],
 ['CP07','L03','Carry light to the exit','Maintain a safe zone while travelling to the exit.','Survival','Perception, Management','',2.5,1,'No real-time physical skill assumed.','']
];
const memberSpecs=[['CP01','p01-torch'],['CP01','p01-rats'],['CP02','p01-player'],['CP02','p01-exit'],
 ['CP03','p02-player'],['CP03','p02-guard'],['CP04','p02-torch'],['CP04','p02-rats'],['CP04','p02-guard'],
 ['CP05','p03-gate'],['CP05','p03-lever'],['CP05','p03-guard'],['CP06','p03-player'],['CP06','p03-guard'],['CP06','p03-guard2'],
 ['CP07','p03-torch'],['CP07','p03-rats'],['CP07','p03-exit']];
const pitches=[
 ['L01',1,'A light in the dark','Carry one safe zone across a simple rat corridor.','Show light radius, allow a safe retry, then remove the prompt.','Low pressure. Learn one rule and one route.',2,'GE-PLAYER; GE-TORCH; GE-RATS; GE-EXIT'],
 ['L02',2,'The watched courtyard','Cross a guard patrol while keeping the light route safe.','Observe one complete patrol cycle from a safe tile.','Add prediction while reusing light management.',4.5,'GE-GUARD'],
 ['L03',3,'The sealed crossing','Open a gate while managing two patrols and a light route.','Demonstrate the lever and gate link before exposing patrol pressure.','Combine known rules. A deliberate final difficulty peak.',6,'GE-GATE; GE-LEVER']
];

const schema={
 'Game Progression':['Level ID','Order','Level name','Level pitch','Onboarding','Difficulty intention','Target difficulty','Introduced element IDs','Overall difficulty','Peak challenge','Effective gameplay types','Gameplay types used','Challenge count','Review'],
 'Challenge Patterns':['Pattern ID','Level ID','Challenge name','Challenge description','Gameplay type','Mental skills','Physical skills','Custom modifier','Level weight','Member rows','Element subtotal','Raw difficulty','Perceived difficulty','Weighted difficulty','Readiness','Playtest notes','Workshop link ID','Level row key'],
 'Pattern Members':['Member ID','Pattern ID','Element ID','Placement ID (optional)','Quantity','Element difficulty','Contribution','Readiness'],
 'Gameplay Elements':['Element ID','Name','Root asset ID (optional)','Assembly modifier','Atom subtotal','Element difficulty','Part rows','Origin','Readiness','Assembly notes'],
 'Element Parts':['Part ID','Element ID','Atom ID','Quantity','Included','Atom modifier','Contribution','Readiness','Composition notes'],
 'Atoms':['Atom ID','Kind','Name','Parent atom ID','State enabled','Rule / description','Icon','Variant','Range (cells)','Width (cells)','Rotation (degrees)','Tag IDs','Difficulty modifier','Origin','Readiness'],
 'Tags':['Tag ID','Name','Rule / description','Color hex','Origin'],
 'Placements':['Placement ID','Level ID','Element ID','Workshop asset ID','Element name','X (zero based)','Y (zero based)','Rotation','Placement notes','Origin','Readiness','Level row key'],
 'Level Data':['Level ID','Order','Level name','Width (cells)','Height (cells)','Nodes','Floor cells','Wall cells','Painted cells','Open node edges','Blocked edges','Map area (cells)','Placed objects','Challenge count','Overall difficulty','Peak challenge','Effective gameplay types','Gameplay types used','Readiness','Snapshot','Level notes']
};
const hints={
 'Game Progression':'Set the pitch, onboarding, target difficulty and introduced element IDs. Calculated results follow the level data.',
 'Challenge Patterns':'One challenge in one level per row. Add 2+ member rows, choose a gameplay type, then set a signed modifier and a positive level weight.',
 'Pattern Members':'Regroup placed objects by entering their placement IDs. The same placement can belong to several different patterns.',
 'Gameplay Elements':'A reusable assembly of atoms. Signed scores allow player aids to reduce difficulty. Add new sheet-only assemblies here.',
 'Element Parts':'One flattened atom per assembly branch. Include root and state rows once. Exclude inactive states and all of their descendants.',
 'Atoms':'Reusable definitions: objects, states and parameters. Preserve IDs when renaming. Zero is a valid modifier; blank is unscored.',
 'Tags':'Workshop tags are independent records. Atom tag references use semicolon-separated IDs.',
 'Placements':'Every placed object is a separate row. Coordinates match Workshop JSON and start at zero.',
 'Level Data':'Map counts come from a selected snapshot. Calculations update from patterns and placements; counts are not a live Workshop connection.'
};
const specs={};
async function build(filled){
 const wb=Workbook.create();const sh={};
 const names=['Game Progression','Level 01','Level 02','Level 03','Challenge Patterns','Pattern Members','Gameplay Elements','Element Parts','Atoms','Tags','Placements','Level Data','Settings','Read Me'];
 for(const name of names){const s=sh[name]=wb.worksheets.add(name);s.showGridLines=false;s.getRange('A1:V90').format.font={name:'Arial',size:10,color:ink};s.getRange('A1:V90').format.verticalAlignment='center';s.getRange('A1:V90').format.rowHeight=23;s.getRange('A1:V90').format.columnWidth=19;s.getRange('A2').values=[[name]];s.getRange('A2').format.font={name:'Arial',size:16,bold:true,color:ink};}
 const set=(s,address,v)=>sh[s].getRange(address).values=[[v]];
 const f=(s,address,v)=>sh[s].getRange(address).formulas=[[v]];
 const fmt=(s,r,v)=>Object.assign(sh[s].getRange(r).format,v);
 function formulaCol(s,c,fn,n=N){sh[s].getRange(`${c}${START}:${c}${START+n-1}`).formulas=Array.from({length:n},(_,i)=>[fn(START+i)]);fmt(s,`${c}${START}:${c}${START+n-1}`,{fill:calc});}
 function table(s,headers,rows=[]){
  const last=col(headers.length-1);sh[s].getRange(`A5:${last}5`).values=[headers];
  fmt(s,`A5:${last}5`,{fill:neutral,font:{name:'Arial',size:10,bold:true,color:ink},wrapText:true,rowHeight:42,horizontalAlignment:'center'});
  fmt(s,`A6:${last}${END}`,{fill:'#FFFFFF'});
  if(rows.length)sh[s].getRange(`A6:${last}${5+rows.length}`).values=rows.map(r=>[...r,...Array(headers.length-r.length).fill(null)]);
  sh[s].freezePanes.freezeRows(5);sh[s].freezePanes.freezeColumns(1);
  specs[s]={headers,rows:rows.length,end:END};
  set(s,'A3',hints[s]||'');fmt(s,'A3',{font:{name:'Arial',size:10,italic:true,color:'#626A73'}});
 }
 const atoms=filled?project.assets.map(a=>[a.id,a.kind==='state'?'State':['area','sight','cone','rectangle'].includes(a.icon)?'Parameter':'Object',a.name,a.parentId||'',a.kind==='state'?(a.enabled?'On':'Off'):'',a.rule,a.icon,a.variant,a.range,a.width??'',a.rotation??0,a.tags.join('; '),mods[a.id],'Workshop']):[];
 const parts=filled?defs.flatMap(d=>[project.assets.find(a=>a.id===d[2]),...descendants(project,d[2])].map((a,j)=>[`${d[0]}-part-${j+1}`,d[0],a.id,1,assetIsActive(project,a.id)?'Yes':'No',null,null,null,a.parentId?`Under ${a.parentId}`:'Root object'])):[];
 const placements=filled?project.levels.flatMap(l=>l.instances.map(i=>[i.id,l.id,defs.find(d=>d[2]===i.assetId)[0],i.assetId,null,i.x,i.y,i.rotation,i.note,'Workshop'])):[];
 const members=filled?memberSpecs.map(([pattern,pid],i)=>[`member-${i+1}`,pattern,placements.find(p=>p[0]===pid)[2],pid,1]):[];
 const challengeRows=filled?challenges.map(c=>[...c.slice(0,9),null,null,null,null,null,null,c[9],c[10]]):[];
 const levels=filled?project.levels.map((l,i)=>{let edges=0;for(const [key,t]of Object.entries(l.tiles))if(t==='node'){const[x,y]=key.split(',').map(Number);for(const k of [`${x+1},${y}`,`${x},${y+1}`])if(nodesConnected(l,key,k))edges++;}return[l.id,i+1,l.name,l.width,l.height,...['node','floor','wall'].map(t=>Object.values(l.tiles).filter(v=>v===t).length),Object.keys(l.tiles).length,edges,l.blockedLinks.length,null,null,null,null,null,null,null,null,'Edit design','Illustrative map geometry; no measured playtest data.'];}):Array.from({length:3},(_,i)=>[`L0${i+1}`,i+1,`Level ${i+1}`]);
 for(const [s,headers]of Object.entries(schema)){
  const rows=s==='Atoms'?atoms:s==='Element Parts'?parts:s==='Gameplay Elements'?(filled?defs.map(d=>[...d,null,null,null,'Workshop',null,'Uses the enabled branches in the example snapshot.']):[]):s==='Tags'?(filled?project.tags.map(t=>[t.id,t.name,t.rule,t.color,'Workshop']):[]):s==='Placements'?placements:s==='Pattern Members'?members:s==='Challenge Patterns'?challengeRows:s==='Level Data'?levels:s==='Game Progression'?(filled?pitches:Array.from({length:3},(_,i)=>[`L0${i+1}`,i+1,`Level ${i+1}`])):[];
  table(s,headers,rows);
 }
 // Vocabulary and the explicit difficulty scale.
 const settings=sh.Settings;settings.getRange('A5:C5').values=[['Player skill','Family','Color']];
 settings.getRange('A6:C19').values=skills.map((s,i)=>[s,i<8?'Mental':'Physical',i<8?'Blue':'Red']);
 settings.getRange('E5').values=[['Gameplay type']];settings.getRange('E6:E13').values=types.map(x=>[x]);
 settings.getRange('H5:J8').values=[['Difficulty scale','Value','Meaning'],['Minimum',0,'No perceived challenge'],['Maximum',10,'Very high perceived challenge'],['Minimum members',2,'Two or more assembled objects']];
 for(const r of ['A5:C5','E5:E5','H5:J5'])fmt('Settings',r,{fill:neutral,font:{name:'Arial',size:10,bold:true}});
 fmt('Settings','A6:C13',{fill:blue});fmt('Settings','A14:C19',{fill:red});fmt('Settings','I6:I8',{fill:amber});fmt('Settings','A1:A20',{columnWidth:24});fmt('Settings','J1:J20',{columnWidth:43});
 set('Settings','A22','Atomic and assembly modifiers are additive signed points. Positive makes harder. Negative makes easier.');
 set('Settings','A24','Effective gameplay types = 1 / SUM(type weight share squared). One type = 1. Equal use of three types = 3.');
 set('Settings','A26','Difficulty values are design estimates to calibrate against playtests. No automated player measurement is implied.');

 // Authoritative local validation; downstream calculations never mask an incomplete assembly as zero.
 formulaCol('Atoms','O',r=>`=IF(A${r}="","",IF(${count('Atoms','A',`A${r}`)}<>1,"Duplicate atom ID",IF(OR(B${r}="",C${r}=""),"Missing kind or name",IF(NOT(ISNUMBER(M${r})),"Set difficulty modifier",IF(AND(D${r}<>"",${count('Atoms','A',`D${r}`)}<>1),"Unknown parent",IF(AND(B${r}="State",OR(D${r}="",AND(E${r}<>"On",E${r}<>"Off"))),"Set state parent and switch","Ready"))))))`);
 formulaCol('Element Parts','F',r=>`=IF(A${r}="","",IF(${count('Atoms','A',`C${r}`)}<>1,"Missing atom",IF(${lookup('Atoms','O','A',`C${r}`)}<>"Ready","Unscored atom",${lookup('Atoms','M','A',`C${r}`)})))`);
 formulaCol('Element Parts','H',r=>`=IF(A${r}="","",IF(${count('Element Parts','A',`A${r}`)}<>1,"Duplicate part ID",IF(${count('Gameplay Elements','A',`B${r}`)}<>1,"Unknown element",IF(NOT(ISNUMBER(F${r})),"Check atom",IF(OR(NOT(ISNUMBER(D${r})),D${r}<=0),"Set positive quantity",IF(AND(E${r}<>"Yes",E${r}<>"No"),"Set Included",IF(COUNTIFS(${ref('Element Parts','B')},B${r},${ref('Element Parts','C')},C${r})<>1,"Duplicate atom in assembly","Ready")))))))`);
 formulaCol('Element Parts','G',r=>`=IF(A${r}="","",IF(H${r}<>"Ready","Incomplete",IF(E${r}="Yes",D${r}*F${r},0)))`);
 formulaCol('Gameplay Elements','G',r=>`=IF(A${r}="","",${count('Element Parts','B',`A${r}`)})`);
 formulaCol('Gameplay Elements','I',r=>`=IF(A${r}="","",IF(${count('Gameplay Elements','A',`A${r}`)}<>1,"Duplicate element ID",IF(B${r}="","Set name",IF(NOT(ISNUMBER(D${r})),"Set assembly modifier",IF(G${r}=0,"Add assembly parts",IF(COUNTIFS(${ref('Element Parts','B')},A${r},${ref('Element Parts','H')},"<>Ready")>0,"Check assembly parts","Ready"))))))`);
 formulaCol('Gameplay Elements','E',r=>`=IF(A${r}="","",IF(I${r}<>"Ready","Incomplete",${sum('Element Parts','G','B',`A${r}`)}))`);
 formulaCol('Gameplay Elements','F',r=>`=IF(A${r}="","",IF(I${r}<>"Ready","Incomplete",E${r}+D${r}))`);
 formulaCol('Placements','E',r=>`=IF(A${r}="","",IF(${count('Gameplay Elements','A',`C${r}`)}<>1,"Unknown element",${lookup('Gameplay Elements','B','A',`C${r}`)}))`);
 formulaCol('Placements','K',r=>`=IF(A${r}="","",IF(${count('Placements','A',`A${r}`)}<>1,"Duplicate placement ID",IF(${count('Level Data','A',`B${r}`)}<>1,"Unknown level",IF(${count('Gameplay Elements','A',`C${r}`)}<>1,"Unknown element",IF(OR(NOT(ISNUMBER(F${r})),NOT(ISNUMBER(G${r})),F${r}<0,G${r}<0,F${r}>=${lookup('Level Data','D','A',`B${r}`)},G${r}>=${lookup('Level Data','E','A',`B${r}`)}),"Check coordinates","Ready")))))`);
 formulaCol('Placements','L',r=>`=IF(A${r}="","",B${r}&"|"&COUNTIFS($B$6:B${r},B${r}))`);
 formulaCol('Pattern Members','F',r=>`=IF(A${r}="","",IF(${count('Gameplay Elements','A',`C${r}`)}<>1,"Unknown element",IF(${lookup('Gameplay Elements','I','A',`C${r}`)}<>"Ready","Incomplete element",${lookup('Gameplay Elements','F','A',`C${r}`)})))`);
 formulaCol('Pattern Members','H',r=>`=IF(A${r}="","",IF(${count('Pattern Members','A',`A${r}`)}<>1,"Duplicate member ID",IF(${count('Challenge Patterns','A',`B${r}`)}<>1,"Unknown pattern",IF(NOT(ISNUMBER(F${r})),"Check element",IF(OR(NOT(ISNUMBER(E${r})),E${r}<=0),"Set positive quantity",IF(D${r}="","Ready",IF(${count('Placements','A',`D${r}`)}<>1,"Unknown placement",IF(OR(${lookup('Placements','C','A',`D${r}`)}<>C${r},${lookup('Placements','B','A',`D${r}`)}<>${lookup('Challenge Patterns','B','A',`B${r}`)}),"Wrong element or level",IF(COUNTIFS(${ref('Pattern Members','B')},B${r},${ref('Pattern Members','D')},D${r})<>1,"Duplicate placement",IF(E${r}<>1,"Placement quantity must be 1","Ready"))))))))))`);
 formulaCol('Pattern Members','G',r=>`=IF(A${r}="","",IF(H${r}<>"Ready","Incomplete",E${r}*F${r}))`);
 formulaCol('Challenge Patterns','J',r=>`=IF(A${r}="","",${count('Pattern Members','B',`A${r}`)})`);
 formulaCol('Challenge Patterns','O',r=>`=IF(A${r}="","",IF(${count('Challenge Patterns','A',`A${r}`)}<>1,"Duplicate pattern ID",IF(${count('Level Data','A',`B${r}`)}<>1,"Unknown level",IF(OR(C${r}="",D${r}="",COUNTIFS(Settings!$E$6:$E$30,E${r})<>1),"Set description and gameplay type",IF(OR(NOT(ISNUMBER(H${r})),NOT(ISNUMBER(I${r})),I${r}<=0),"Set modifier and positive weight",IF(J${r}<Settings!$I$8,"Add 2+ member rows",IF(COUNTIFS(${ref('Pattern Members','B')},A${r},${ref('Pattern Members','H')},"<>Ready")>0,"Check members","Ready")))))))`);
 formulaCol('Challenge Patterns','K',r=>`=IF(A${r}="","",IF(O${r}<>"Ready","Incomplete",${sum('Pattern Members','G','B',`A${r}`)}))`);
 formulaCol('Challenge Patterns','L',r=>`=IF(A${r}="","",IF(O${r}<>"Ready","Incomplete",K${r}+H${r}))`);
 formulaCol('Challenge Patterns','M',r=>`=IF(A${r}="","",IF(O${r}<>"Ready","Incomplete",MIN(Settings!$I$7,MAX(Settings!$I$6,L${r}))))`);
 formulaCol('Challenge Patterns','N',r=>`=IF(A${r}="","",IF(O${r}<>"Ready","Incomplete",M${r}*I${r}))`);
 formulaCol('Challenge Patterns','R',r=>`=IF(A${r}="","",B${r}&"|"&COUNTIFS($B$6:B${r},B${r}))`);
 formulaCol('Level Data','L',r=>`=IF(A${r}="","",IF(AND(ISNUMBER(D${r}),ISNUMBER(E${r})),D${r}*E${r},"Set map size"))`);
 formulaCol('Level Data','M',r=>`=IF(A${r}="","",${count('Placements','B',`A${r}`)})`);
 formulaCol('Level Data','N',r=>`=IF(A${r}="","",${count('Challenge Patterns','B',`A${r}`)})`);
 formulaCol('Level Data','S',r=>`=IF(A${r}="","",IF(${count('Level Data','A',`A${r}`)}<>1,"Duplicate level ID",IF(OR(NOT(ISNUMBER(D${r})),NOT(ISNUMBER(E${r})),D${r}<=0,E${r}<=0),"Set map size",IF(N${r}=0,"Add challenges",IF(COUNTIFS(${ref('Challenge Patterns','B')},A${r},${ref('Challenge Patterns','O')},"<>Ready")>0,"Check challenges",IF(COUNTIFS(${ref('Placements','B')},A${r},${ref('Placements','K')},"<>Ready")>0,"Check placements","Ready"))))))`);
 formulaCol('Level Data','O',r=>`=IF(A${r}="","",IF(S${r}<>"Ready","Incomplete",${sum('Challenge Patterns','N','B',`A${r}`)}/${sum('Challenge Patterns','I','B',`A${r}`)}))`);
 formulaCol('Level Data','P',r=>`=IF(A${r}="","",IF(S${r}<>"Ready","Incomplete",_xlfn.MAXIFS(${ref('Challenge Patterns','M')},${ref('Challenge Patterns','B')},A${r})))`);
 // Level-specific diversity is calculated in the corresponding level view.
 for(let i=0;i<3;i++){
  const row=6+i,s=`Level 0${i+1}`;set(s,'A2',filled?project.levels[i].name:`Level ${i+1}`);set(s,'A4','Level ID');set(s,'B4',`L0${i+1}`);fmt(s,'B4',{fill:amber});
  const met=[['A6','Overall difficulty','B6','O'],['D6','Peak challenge','E6','P'],['G6','Effective types','H6','Q'],['A8','Nodes','B8','F'],['D8','Map area (cells)','E8','L'],['G8','Placed objects','H8','M'],['A10','Map width','B10','D'],['D10','Map height','E10','E'],['G10','Open node edges','H10','J'],['A12','Challenge count','B12','N'],['D12','Gameplay types used','E12','R']];
  for(const [label,l,value,c] of met){set(s,label,l);f(s,value,`=IF(COUNTIFS(${ref('Level Data','A')},$B$4)<>1,"Unknown level",${lookup('Level Data',c,'A','$B$4')})`);fmt(s,value,{fill:calc,font:{name:'Arial',size:10,bold:true},numberFormat:'0.00'});}
  set(s,'A14','Readiness');f(s,'B14',`=${lookup('Level Data','S','A','$B$4')}`);set(s,'D14','Objects listed / total');f(s,'F14',`=MIN(25,H8)&" / "&H8`);set(s,'G14','Challenges listed / total');f(s,'I14',`=MIN(25,B12)&" / "&B12`);
  sh[s].getRange('A17:D17').values=[['Gameplay type','Challenge weight','Weight share','Share squared']];
  for(let j=0;j<8;j++){const rr=18+j;set(s,`A${rr}`,types[j]);f(s,`B${rr}`,`=SUMIFS(${ref('Challenge Patterns','I')},${ref('Challenge Patterns','B')},$B$4,${ref('Challenge Patterns','E')},A${rr})`);f(s,`C${rr}`,`=IF(SUM($B$18:$B$25)=0,"",B${rr}/SUM($B$18:$B$25))`);f(s,`D${rr}`,`=IF(C${rr}="","",C${rr}^2)`);}
  fmt(s,'C18:D25',{numberFormat:'0.0%'});
  set(s,'F18','Group objects into a challenge');set(s,'F20','1. Add a row in Challenge Patterns with this Level ID.');set(s,'F22','2. In Pattern Members, add at least two placement IDs below.');set(s,'F24','3. Copy the corresponding Element IDs. Scores update automatically.');
  const ph=['Placement ID','Element ID','Object','X (0 based)','Y (0 based)','Facing','Notes'];sh[s].getRange('A28:G28').values=[ph];
  for(let j=0;j<25;j++){const rr=29+j;for(const[k,c]of ['A','C','E','F','G','H','I'].entries())f(s,`${col(k)}${rr}`,`=IF(${j+1}>$H$8,"",${lookup('Placements',c,'L',`$B$4&"|${j+1}"`)})`);}
  sh[s].getRange('A57:G57').values=[['Pattern ID','Challenge','Gameplay type','Difficulty','Weight','Mental skills','Physical skills']];
  for(let j=0;j<25;j++){const rr=58+j;for(const[k,c]of ['A','C','E','M','I','F','G'].entries())f(s,`${col(k)}${rr}`,`=IF(${j+1}>$B$12,"",${lookup('Challenge Patterns',c,'R',`$B$4&"|${j+1}"`)})`);}
  for(const range of ['A17:D17','A28:G28','A57:G57'])fmt(s,range,{fill:neutral,font:{name:'Arial',size:10,bold:true},wrapText:true,rowHeight:35,horizontalAlignment:'center'});
  fmt(s,'A1:A85',{columnWidth:26});fmt(s,'B1:B85',{columnWidth:26});fmt(s,'C1:C85',{columnWidth:28});fmt(s,'D1:E85',{columnWidth:22});fmt(s,'F1:G85',{columnWidth:33});fmt(s,'H1:I85',{columnWidth:23});
  fmt(s,'A29:G53',{wrapText:true,rowHeight:32});fmt(s,'A58:G82',{wrapText:true,rowHeight:42});fmt(s,'D58:D82',{numberFormat:'0.00'});fmt(s,'F58:F82',{fill:blue});fmt(s,'G58:G82',{fill:red});
  f('Level Data',`Q${row}`,`=IF(A${row}="","",IF(S${row}<>"Ready","Incomplete",1/SUM('${s}'!D18:D25)))`);
  f('Level Data',`R${row}`,`=IF(A${row}="","",IF(S${row}<>"Ready","Incomplete",COUNTIFS('${s}'!B18:B25,">0")))`);
 }
 // Additional level rows use the same diversity formula with a type-weight build on Level Data.
 for(let i=0;i<8;i++){
  const c=col(21+i);set('Level Data',`${c}5`,types[i]);formulaCol('Level Data',c,r=>`=IF(A${r}="","",SUMIFS(${ref('Challenge Patterns','I')},${ref('Challenge Patterns','B')},A${r},${ref('Challenge Patterns','E')},${c}$5))`);
 }
 for(let r=6;r<=END;r++){
  f('Level Data',`Q${r}`,`=IF(A${r}="","",IF(S${r}<>"Ready","Incomplete",SUM(V${r}:AC${r})^2/SUMSQ(V${r}:AC${r})))`);
  f('Level Data',`R${r}`,`=IF(A${r}="","",IF(S${r}<>"Ready","Incomplete",COUNTIFS(V${r}:AC${r},">0")))`);
 }
 for(const s of ['Level 01','Level 02','Level 03'])for(const r of ['B8','E8','H8','B10','E10','H10','B12','E12'])fmt(s,r,{numberFormat:'0'});
 for(const[c,source]of [['B','B'],['C','C'],['I','O'],['J','P'],['K','Q'],['L','R'],['M','N'],['N','S']])formulaCol('Game Progression',c,r=>`=IF(A${r}="","",IF(${count('Level Data','A',`A${r}`)}<>1,"Unknown level",${lookup('Level Data',source,'A',`A${r}`)}))`);
 for(const s of ['Level 01','Level 02','Level 03'])f(s,'A2',`=IF(${count('Level Data','A','$B$4')}<>1,"Level",${lookup('Level Data','C','A','$B$4')})`);
 // Input and formula cues, restrained formatting, and validation.
 const inputs={'Game Progression':['D6:H85'],'Atoms':['M6:M85'],'Gameplay Elements':['D6:D85'],'Element Parts':['D6:E85'],'Challenge Patterns':['E6:I85'],'Pattern Members':['B6:E85']};
 for(const[s,ranges]of Object.entries(inputs))for(const r of ranges)fmt(s,r,{fill:amber});
 for(const[s,cols]of Object.entries({'Atoms':['M'],'Gameplay Elements':['D','E','F'],'Element Parts':['F','G'],'Pattern Members':['F','G'],'Challenge Patterns':['H','K','L','M','N'],'Game Progression':['G','I','J','K'],'Level Data':['O','P','Q']}))for(const c of cols)fmt(s,`${c}6:${c}85`,{numberFormat:'0.00'});
 for(const[s,c]of [['Atoms','O'],['Gameplay Elements','I'],['Element Parts','H'],['Pattern Members','H'],['Challenge Patterns','O'],['Placements','K'],['Level Data','S'],['Game Progression','N']])sh[s].getRange(`${c}6:${c}85`).conditionalFormats.addCustom(`AND($A6<>"",${c}6<>"Ready")`,{fill:'#FDE7E7',font:{color:'#9B2929'}});
 for(const[s,c,opts]of [['Atoms','B',['Object','State','Parameter']],['Atoms','E',['On','Off']],['Atoms','N',['Workshop','Sheet']],['Gameplay Elements','H',['Workshop','Sheet']],['Element Parts','E',['Yes','No']],['Challenge Patterns','E',types],['Tags','E',['Workshop','Sheet']],['Placements','J',['Workshop','Sheet']],['Level Data','T',['Edit design','Playtest snapshot']]])sh[s].getRange(`${c}6:${c}85`).dataValidation={rule:{type:'list',values:opts}};
 // Skill cells accept comma-separated values in Excel; native multi-select chip setup is applied after import.
 fmt('Challenge Patterns','F6:F85',{fill:blue,wrapText:true});fmt('Challenge Patterns','G6:G85',{fill:red,wrapText:true});
 for(const[s,c,target,key]of [['Element Parts','B','Gameplay Elements','A'],['Element Parts','C','Atoms','A'],['Pattern Members','B','Challenge Patterns','A'],['Pattern Members','C','Gameplay Elements','A'],['Pattern Members','D','Placements','A'],['Placements','B','Level Data','A'],['Placements','C','Gameplay Elements','A'],['Challenge Patterns','B','Level Data','A']])sh[s].getRange(`${c}6:${c}85`).dataValidation={rule:{type:'list',formula1:ref(target,key)}};
 const widths={'Game Progression':{C:29,D:48,E:54,F:48,H:48,N:25},'Challenge Patterns':{C:30,D:60,E:23,F:38,G:30,O:28,P:55,Q:26,R:26},'Pattern Members':{D:29,H:29},'Gameplay Elements':{B:29,C:27,I:29,J:65},'Element Parts':{H:28,I:42},'Atoms':{C:28,D:25,F:65,L:36,O:29},'Tags':{B:27,C:65},'Placements':{D:26,E:30,I:60,K:29},'Level Data':{C:30,S:28,T:25,U:60}};
 for(const[s,ws]of Object.entries(widths))for(const[c,w]of Object.entries(ws))fmt(s,`${c}1:${c}85`,{columnWidth:w});
 for(const[s,c]of [['Atoms','F'],['Gameplay Elements','J'],['Challenge Patterns','D'],['Game Progression','D'],['Game Progression','E'],['Game Progression','F'],['Game Progression','H']])fmt(s,`${c}6:${c}85`,{wrapText:true});
 for(const s of ['Game Progression','Challenge Patterns','Atoms'])fmt(s,'A6:R85',{rowHeight:49});
 // The guide records assumptions once, including portable tag handling and extension limits.
 const guide=[
 ['Workbook',filled?'Filled example. Invented three-level teaching scenario based on the Workshop mechanics.':'Blank template. L01–L03 are reserved level IDs; add your own map data, definitions and challenges.'],
 ['Editing','Amber = scoring and planning inputs. Pale gray = formulas. Blue = Mental skills. Red = Physical skills. Other white cells contain editable records.'],
 ['Build an inventory','Add definitions to Atoms and Tags. Each atom has a unique ID and a signed difficulty modifier. Object, State and Parameter records remain separate.'],
 ['Assemble an element','Add a Gameplay Elements row, then Element Parts rows for its root and flattened descendants. Include each atom once. No recursive element-within-element scoring.'],
 ['State handling','Keep every state in Atoms. Set Included=No for disabled states and every descendant of a disabled state. Changing State enabled alone does not rebuild an assembly; update Included or make a new assembly.'],
 ['Create a challenge','Add a Challenge Patterns row for a level, then at least two Pattern Members rows. Supply an Element ID and optional Placement ID on each. Library-only members can use a quantity.'],
 ['Regroup a level','Copy placement and element IDs from a Level view to Pattern Members. A placement can participate in multiple patterns. Never repeat it inside the same pattern.'],
 ['Score an atom','Difficulty modifier is additive signed points: a threat may be +1.5, a player aid may be -1. A value such as range=3 remains descriptive until you assign its modifier.'],
 ['Score an element','Element difficulty = SUM(included atom modifier × part quantity) + assembly modifier. Element scores may be negative to represent an aid.'],
 ['Score a challenge','Raw difficulty = SUM(element difficulty × member quantity) + custom modifier. Perceived difficulty clips raw difficulty to Settings minimum/maximum, initially 0–10.'],
 ['Score a level','Overall difficulty = SUM(perceived challenge difficulty × level weight) / SUM(level weight). Peak is the hardest challenge. Weight initially represents relative encounter importance.'],
 ['Overlapping patterns','Patterns may share objects. Weights describe experienced encounters, not unique object counts. Avoid scoring the same experience twice unless repetition is intentional.'],
 ['Gameplay variety','Effective gameplay types = 1 / SUM(type weight share squared). It captures both type count and balance. Every challenge has one primary gameplay type so each weight is counted once.'],
 ['Game progression','One row per level. Set pitch, onboarding, target, intentions and introduced element IDs. IDs introduced here are available from that level onward by design intent; placement is recorded separately.'],
 ['Skills in Excel','Mental and Physical columns store comma-separated skill labels. Multiple skills are supported as text. Do not count skill tags as difficulty points.'],
 ['Skills in Google Sheets','Use chip dropdowns with Allow multiple selections. Mental options are blue and Physical options red. Native chip behavior does not round-trip to Excel; preserve text values on export.'],
 ['Reference','Alien_Isolation_RLD_MISSION14.xls was used for ideas only. Its scoring values and level content were not copied. It remains unchanged.'],
 ['Sample provenance','All map geometry, scoring, pitch and onboarding content in the example is illustrative. No playtest observations, success rates or player ratings have been fabricated.'],
 ['Future Workshop export','Export is not implemented in this task. The companion mapping document specifies stable IDs, snapshot selection, joins, derived geometry and designer-owned fields.'],
 ['After playtest','Current Workshop playtests are private temporary copies and are discarded on return to Edit. A future export must explicitly capture the playtest copy before it is discarded.'],
 ['Extend records','Rows 6–85 support 80 records per catalog or mapping. Copy the final formula row down and extend every referenced range and validation if you exceed row 85. A future exporter should size ranges to the snapshot.'],
 ['Extend levels','The first three level views have 25 placement and 25 challenge slots each. Totals include all records. Duplicate a Level view and set B4 to a registered Level ID for more levels. Extend slots if its listed/total counters differ.'],
 ['Incomplete data','Missing modifiers, members or invalid IDs block downstream scores. Blank means no record. Zero is an intentional numeric score. Resolve Readiness messages before interpreting outputs.'],
 ['Refresh policy','Update records by stable ID. Keep scoring, skill tags, pitch, onboarding and intentions when refreshing Workshop content. Mark deleted source records for review if designer mappings still reference them.']
 ];
 sh['Read Me'].getRange('A5:B5').values=[['Topic','How to use it']];sh['Read Me'].getRange(`A6:B${5+guide.length}`).values=guide;fmt('Read Me','A1:A31',{columnWidth:28});fmt('Read Me','B1:B31',{columnWidth:116,wrapText:true});fmt('Read Me',`A6:B${5+guide.length}`,{rowHeight:54});fmt('Read Me','A5:B5',{fill:neutral,font:{name:'Arial',size:10,bold:true}});
 sh['Game Progression'].tabColor='#454F5E';sh.Settings.tabColor='#9DA8B7';sh['Read Me'].tabColor='#B6B8BC';
 wb.recalculate();
 return {wb,sh,filled,rows:{atoms,parts,placements,members,challengeRows,levels}};
}

await fs.mkdir(`${out}/support/previews`,{recursive:true});
const expectedElements=Object.fromEntries(defs.map(d=>[d[0],d[3]+[project.assets.find(a=>a.id===d[2]),...descendants(project,d[2])].filter(a=>assetIsActive(project,a.id)).reduce((n,a)=>n+mods[a.id],0)]));
const expectedPatterns=challenges.map(c=>{const raw=memberSpecs.filter(m=>m[0]===c[0]).reduce((n,m)=>n+expectedElements[defs.find(d=>d[2]===project.levels.flatMap(l=>l.instances).find(p=>p.id===m[1]).assetId)[0]],0)+c[7];return{id:c[0],level:c[1],raw,score:Math.min(10,Math.max(0,raw)),weight:c[8],type:c[4]};});
const expectedLevels=project.levels.map(l=>{const ps=expectedPatterns.filter(p=>p.level===l.id),total=ps.reduce((n,p)=>n+p.weight,0),weights=types.map(t=>ps.filter(p=>p.type===t).reduce((n,p)=>n+p.weight,0));return{id:l.id,difficulty:ps.reduce((n,p)=>n+p.score*p.weight,0)/total,peak:Math.max(...ps.map(p=>p.score)),variety:total**2/weights.reduce((n,x)=>n+x*x,0)};});
for(const filled of [false,true]){
 const x=await build(filled);const {wb,sh}=x;const label=filled?'example':'template';
 console.log(label, (await wb.inspect({kind:'table',range:"'Level Data'!M5:S8",include:'values,formulas',tableMaxRows:4,tableMaxCols:7,maxChars:4500})).ndjson);
 if(filled){
  console.log('Expected',JSON.stringify({elements:expectedElements,patterns:expectedPatterns,levels:expectedLevels}));
  for(let i=0;i<expectedLevels.length;i++){const got=sh['Level Data'].getRange(`O${6+i}:Q${6+i}`).values[0];assert(Math.abs(got[0]-expectedLevels[i].difficulty)<1e-8,`Level difficulty ${i+1}: ${got}`);assert(Math.abs(got[1]-expectedLevels[i].peak)<1e-8,`Peak ${i+1}: ${got}`);assert(Math.abs(got[2]-expectedLevels[i].variety)<1e-8,`Variety ${i+1}: ${got}`);}
  // One dependency change proves recalculation from atom through assembly, challenge and level.
  const before=sh['Level Data'].getRange('O6').values[0][0];sh.Atoms.getRange('M13').values=[[2.5]];wb.recalculate();const after=sh['Level Data'].getRange('O6').values[0][0];assert(Math.abs(after-before-0.5)<1e-8,`Atomic update did not reach level: ${before} -> ${after}`);sh.Atoms.getRange('M13').values=[[1.5]];wb.recalculate();
  // A missing required modifier must propagate; explicit zero must calculate.
  sh.Atoms.getRange('M13').values=[[null]];wb.recalculate();assert.equal(sh['Level Data'].getRange('O6').values[0][0],'Incomplete');sh.Atoms.getRange('M13').values=[[0]];wb.recalculate();assert.equal(typeof sh['Level Data'].getRange('O6').values[0][0],'number');sh.Atoms.getRange('M13').values=[[1.5]];wb.recalculate();
  sh['Challenge Patterns'].getRange('H6').values=[[-100]];wb.recalculate();assert.equal(sh['Challenge Patterns'].getRange('M6').values[0][0],0);
  sh['Challenge Patterns'].getRange('H6').values=[[100]];wb.recalculate();assert.equal(sh['Challenge Patterns'].getRange('M6').values[0][0],10);
  sh['Challenge Patterns'].getRange('H6').values=[[1.5]];sh['Pattern Members'].getRange('B7').values=[['missing-pattern']];wb.recalculate();assert.equal(sh['Challenge Patterns'].getRange('O6').values[0][0],'Add 2+ member rows');assert.equal(sh['Level Data'].getRange('O6').values[0][0],'Incomplete');sh['Pattern Members'].getRange('B7').values=[['CP01']];
  // New sheet-only records use the existing reserved formula row without rebuilding the workbook.
  sh.Atoms.getRange('A24:N24').values=[['sheet-atom','Parameter','Extra timing pressure','','','Sheet-only example','sight','default',1,'',0,'',2,'Sheet']];
  sh['Gameplay Elements'].getRange('A13:D13').values=[['GE-SHEET','New sheet assembly','',0.25]];sh['Gameplay Elements'].getRange('H13').values=[['Sheet']];
  sh['Element Parts'].getRange('A24:E24').values=[['sheet-part','GE-SHEET','sheet-atom',1,'Yes']];wb.recalculate();assert.equal(sh['Gameplay Elements'].getRange('F13').values[0][0],2.25);
  sh['Pattern Members'].getRange('A24:E24').values=[['sheet-member','CP01','GE-SHEET','',1]];wb.recalculate();assert.equal(sh['Challenge Patterns'].getRange('M6').values[0][0],5.75);
  sh['Pattern Members'].getRange('A24:E24').clear({applyTo:'contents'});sh['Element Parts'].getRange('A24:E24').clear({applyTo:'contents'});sh['Gameplay Elements'].getRange('A13:D13').clear({applyTo:'contents'});sh['Gameplay Elements'].getRange('H13').clear({applyTo:'contents'});sh.Atoms.getRange('A24:N24').clear({applyTo:'contents'});wb.recalculate();assert.equal(sh['Level Data'].getRange('O6').values[0][0],2.5);
 }
 const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:30},summary:'Formula error scan',maxChars:4000});console.log(label,'errors',errors.ndjson);
 await fs.writeFile(`${out}/support/${label}-checks.json`,JSON.stringify({expected:filled?{elements:expectedElements,patterns:expectedPatterns,levels:expectedLevels}:null,errors:errors.ndjson},null,2));
 for(const name of ['Game Progression','Level 01','Level 02','Level 03','Challenge Patterns','Pattern Members','Gameplay Elements','Element Parts','Atoms','Tags','Placements','Level Data','Settings','Read Me']){
  const range=name.startsWith('Level 0')?'A1:I25':name==='Read Me'?'A1:B13':name==='Settings'?'A1:J26':`A1:${col(Math.min(schema[name]?.length||10,10)-1)}${filled?Math.min(16,6+(x.rows[name==='Atoms'?'atoms':name==='Element Parts'?'parts':name==='Placements'?'placements':name==='Pattern Members'?'members':name==='Challenge Patterns'?'challengeRows':'levels']?.length||6)):10}`;
  const img=await wb.render({sheetName:name,range,scale:1,format:'png'});await fs.writeFile(`${out}/support/previews/${label}-${name.replaceAll(' ','-')}.png`,new Uint8Array(await img.arrayBuffer()));
 }
 const file=await SpreadsheetFile.exportXlsx(wb);await file.save(`${out}/workshop-inventory-${label}.xlsx`);console.log('SAVED',`${out}/workshop-inventory-${label}.xlsx`);
}
await fs.writeFile(`${out}/support/example-workshop-project.json`,JSON.stringify(project,null,2));
await fs.writeFile(`${out}/support/table-specs.json`,JSON.stringify(specs,null,2));
