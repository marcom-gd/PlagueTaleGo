import fs from 'node:fs/promises';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';
const dir = new URL('./', import.meta.url);
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(new URL('latest-example-export.xlsx', dir).pathname.replace(/^\/([A-Z]:)/,'$1')));
console.log((await wb.inspect({kind:'sheet',include:'id,name',maxChars:3000})).ndjson);
console.log((await wb.inspect({kind:'table',range:"'Game Progression'!A5:N8",include:'values,formulas',tableMaxRows:4,tableMaxCols:14,maxChars:6000})).ndjson);
for (const name of ['Game Progression','Gameplay Elements','Level 01']) {
 const png = await wb.render({sheetName:name,range:name==='Gameplay Elements'?'A1:J10':'A1:N12',scale:1,format:'png'});
 await fs.writeFile(new URL(`previews/latest-${name.replaceAll(' ','-')}.png`,dir),new Uint8Array(await png.arrayBuffer()));
}
