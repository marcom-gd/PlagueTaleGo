import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const dir='D:/Projects/PlagueTaleGo/outputs/01a18929-workshop-inventory';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(`${dir}/support/latest-example-export.xlsx`));
const sheet=name=>wb.worksheets.getItem(name);
const parts=col=>`'Element Parts'!$${col}$6:$${col}$85`;
const join=(sep,values,condition)=>`_xlfn.TEXTJOIN(${sep},TRUE,_xlfn._xlws.FILTER(${values},${condition},""))`;
for(let r=6;r<=85;r++){
 const a=`A${r}`;
 sheet('Game Progression').getRange(`N${r}`).formulas=[[`=IF(${a}="","",${join('"; "','Introductions!$B$6:$B$85',`(Introductions!$A$6:$A$85=${a})*(Introductions!$B$6:$B$85<>"")`)})`]];
 for(let i=0;i<6;i++){
  const token=`TRIM(MID(SUBSTITUTE($N${r},";",REPT(" ",200)),${i*200+1},200))`;
  sheet('Game Progression').getRange(`${String.fromCharCode(72+i)}${r}`).formulas=[[`=IF(OR($A${r}="",${token}=""),"",IF(COUNTIFS('Gameplay Elements'!$A$6:$A$85,${token})<>1,"Unknown recipe",HYPERLINK("#'Gameplay Elements'!A"&(MATCH(${token},'Gameplay Elements'!$A$6:$A$85,0)+5),INDEX('Gameplay Elements'!$B$6:$B$85,MATCH(${token},'Gameplay Elements'!$A$6:$A$85,0)))))`]];
 }
 const ge=sheet('Gameplay Elements');
 ge.getRange(`P${r}`).formulas=[[`=IF(${a}="","",SUBSTITUTE(SUBSTITUTE(${join('";"',parts('L'),`(${parts('B')}=${a})*(${parts('E')}="Yes")`)},"; ",";")," ;",";"))`]];
 const tagArgs=Array.from({length:80},(_,i)=>{const t=i+6;return `IF(AND(Tags!A${t}<>"",ISNUMBER(SEARCH(";"&Tags!A${t}&";",";"&P${r}&";"))),Tags!B${t},"")`;}).join(',');
 const tagFormula=`=IF(${a}="","",_xlfn.TEXTJOIN(", ",TRUE,${tagArgs}))`;
 assert(tagFormula.length<8192);
 ge.getRange(`C${r}`).formulas=[[tagFormula]];
 ge.getRange(`D${r}`).formulas=[[`=IF(${a}="","",${join('CHAR(10)',parts('M'),`(${parts('B')}=${a})*(${parts('E')}="Yes")*(${parts('K')}="Parameter")`)})`]];
 ge.getRange(`E${r}`).formulas=[[`=IF(${a}="","",${join('", "',parts('N'),`(${parts('B')}=${a})*(${parts('K')}="State")`)})`]];
}
const destinations={'2030192770':'Gameplay Elements','1043638815':'Placements','214776623':'Element Parts','714642317':'Atoms'};
for(const s of wb.worksheets.items){
 const f=s.getRange('A1:AC85').formulas;
 for(let r=0;r<f.length;r++) for(let c=0;c<f[r].length;c++) if(f[r][c]?.includes('#gid=')){
  let updated=f[r][c].replace(/#gid=(\d+)&range=/g,(match,id)=>{assert(destinations[id],id);return `#'${destinations[id]}'!`;});
  let col='',n=c+1;while(n){col=String.fromCharCode(65+(n-1)%26)+col;n=Math.floor((n-1)/26);}
  s.getRange(`${col}${r+1}`).formulas=[[updated]];
 }
}
wb.recalculate();
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:10},maxChars:3000})).ndjson);
console.log((await wb.inspect({kind:'table',range:"'Gameplay Elements'!A5:F12",tableMaxRows:8,tableMaxCols:6,maxChars:5000})).ndjson);
const gp=sheet('Game Progression');
const ge=sheet('Gameplay Elements');
ge.getRange('B7').values=[['Torch rename check']];
assert(gp.getRange('I6').values[0][0].endsWith('friendlyName=Torch rename check'));
ge.getRange('B7').values=[['Lit torch']];
const atoms=sheet('Atoms');
const oldRange=atoms.getRange('I11').values;
atoms.getRange('I11').values=[[4]];
assert(ge.getRange('D7').values[0][0].includes('4 cells'));
atoms.getRange('I11').values=oldRange;
wb.recalculate();
const friendly=v=>typeof v==='string'&&v.startsWith('HYPERLINK is not implemented.')?v.split('friendlyName=')[1]:v;
assert.deepEqual(gp.getRange('H6:K6').values.map(row=>row.map(friendly)),[['Amicia','Lit torch','Hunting rats','Escape point']]);
assert.deepEqual(gp.getRange('H7:H8').values.map(row=>row.map(friendly)),[['Patrolling guard'],['Closed gate']]);
assert.equal(sheet('Gameplay Elements').getRange('C7').values[0][0],'Light source, Interactable');
assert(Math.abs(gp.getRange('O7').values[0][0]-4.833333333333333)<1e-8);
for(const name of ['Game Progression','Gameplay Elements','Introductions']){
 const png=await wb.render({sheetName:name,range:name==='Game Progression'?'A5:C8':name==='Gameplay Elements'?'A1:F12':'A1:F12',scale:1,format:'png'});
 await fs.writeFile(`${dir}/support/previews/excel-latest-${name.replaceAll(' ','-')}.png`,new Uint8Array(await png.arrayBuffer()));
}
await (await SpreadsheetFile.exportXlsx(wb)).save(`${dir}/support/latest-example-compatible.xlsx`);
console.log('Updated Excel example saved.');
