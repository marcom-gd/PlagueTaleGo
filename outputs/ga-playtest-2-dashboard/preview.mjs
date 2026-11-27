import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const file=url.pathname==='/playtest-data.json'?'playtest-data.json':url.pathname==='/'||url.pathname==='/index.html'?'index.html':null;
  if(!file){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});
  fs.createReadStream(path.join(base,file)).pipe(res);
});
server.listen(4317,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4317'));
