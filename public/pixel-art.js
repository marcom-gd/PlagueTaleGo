// Integer pixel primitives: no filters, external images, or antialiased paths.
export function detailedPixels(name,variant,color,base) {
  const p=Array.from({length:32},()=>Array(32).fill(null));
  const ink='#34303b',wood='#84583e',warm='#c38c5a',gold='#d9a64b',light='#ffe6a3',steel='#8294a6',shine='#d1dce4';
  const rect=(x,y,w,h,c)=>{for(let j=Math.max(0,y);j<Math.min(32,y+h);j++)for(let i=Math.max(0,x);i<Math.min(32,x+w);i++)p[j][i]=c;};
  const line=(x,y,X,Y,c,w=1)=>{const n=Math.max(Math.abs(X-x),Math.abs(Y-y));for(let i=0;i<=n;i++)rect(Math.round(x+(X-x)*i/(n||1)),Math.round(y+(Y-y)*i/(n||1)),w,w,c);};
  const poly=(points,c)=>{for(let y=0;y<32;y++)for(let x=0;x<32;x++){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const [a,b]=points[i],[A,B]=points[j];if((b>y)!==(B>y)&&x<(A-a)*(y-b)/(B-b)+a)inside=!inside;}if(inside)p[y][x]=c;}};
  const oval=(x,y,rx,ry,c)=>{for(let j=0;j<32;j++)for(let i=0;i<32;i++)if(((i-x)/rx)**2+((j-y)/ry)**2<=1)p[j][i]=c;};
  const box=(x,y,w,h,c)=>{rect(x,y,w,h,ink);rect(x+1,y+1,w-2,h-2,c);line(x+2,y+2,x+w-3,y+2,shine);};
  const tint=(c,n)=>'#'+c.slice(1).match(/../g).map(v=>Math.max(0,Math.min(255,parseInt(v,16)+n)).toString(16).padStart(2,'0')).join('');
  const flame=(x,y)=>{poly([[x,y+13],[x-5,y+8],[x-2,y+3],[x,y-3],[x+2,y+2],[x+5,y+7],[x+4,y+12]],'#c9603d');poly([[x,y+11],[x-3,y+7],[x+1,y],[x+3,y+8]],gold);line(x,y+5,x,y+10,light,2);};
  if(base) {
    // Expand the original contour and shade its exposed edges on the finer grid.
    base.forEach((row,y)=>row.forEach((c,x)=>{if(c)rect(4+x*2,4+y*2,2,2,c);}));
    const original=p.map(r=>[...r]);
    original.forEach((row,y)=>row.forEach((c,x)=>{if(!c)return;if(!original[y-1]?.[x])p[y][x]=tint(c,28);if(!original[y+1]?.[x])p[y][x]=tint(c,-35);for(const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]])if(y+dy>=0&&y+dy<32&&x+dx>=0&&x+dx<32&&!original[y+dy][x+dx])p[y+dy][x+dx]=ink;}));
    // Faces, buckles, masonry, and grain break the original 2px blocks.
    if(['girl','kid','guard'].includes(name)&&variant!=='dead') {
      rect(13,9,1,1,ink);rect(18,9,1,1,ink);rect(15,12,3,1,'#9d6863');rect(14,17,2,4,color);box(14,20,4,3,gold);rect(11,25,2,1,shine);rect(19,25,2,1,shine);
      if(name==='guard'){rect(12,5,7,1,shine);rect(17,7,2,1,steel);}else{rect(12,5,5,1,warm);rect(12,15,1,6,shine);}
    }
    if(['wall','rock'].includes(name)&&variant!=='broken'){rect(12,11,3,1,shine);rect(9,16,2,1,shine);rect(18,18,3,1,steel);}
    if(['torch','door','bridge'].includes(name)){for(const [x,y] of [[15,19],[15,23],[11,15],[21,19]])if(p[y][x])p[y][x]=warm;}
    if(name==='key'&&variant==='available'){rect(12,9,2,1,light);rect(14,10,1,2,light);}
    return p;
  }
  if(['square','triangle','hexagon','circle','diamond'].includes(name)) {
    const shapes={square:[[4,4],[28,4],[28,28],[4,28]],triangle:[[16,2],[31,29],[1,29]],hexagon:[[9,3],[23,3],[31,16],[23,29],[9,29],[1,16]],diamond:[[16,1],[31,16],[16,31],[1,16]]};
    if(name==='circle'){oval(16,16,14,14,ink);oval(16,16,12,12,color);}else{poly(shapes[name],ink);poly(shapes[name].map(([x,y])=>[16+(x-16)*.84,16+(y-16)*.84]),color);}
    if(variant==='outline') {const old=p.map(r=>[...r]);for(let y=0;y<32;y++)for(let x=0;x<32;x++)if(old[y][x]&&[-3,0,3].every(d=>old[y+d]?.[x]&&old[y]?.[x+d]))p[y][x]=null;}
    else {const glyphs={square:['01110','11011','11011','11111','11011','11011','11011'],triangle:['11110','11011','11011','11110','11011','11011','11110'],hexagon:['01111','11000','11000','11000','11000','11000','01111'],circle:['11110','11011','11011','11011','11011','11011','11110'],diamond:['11111','11000','11000','11110','11000','11000','11111']};glyphs[name].forEach((r,y)=>[...r].forEach((v,x)=>{if(v==='1')rect(11+x*2,10+y*2,2,2,ink);}));}
  } else if(name==='cat'||name==='dog') {
    const cat=name==='cat',sitting=variant==='sitting',fur=cat?'#bc875c':'#aa805c';
    oval(15,28,12,2,ink);oval(sitting?16:15,21,sitting?6:10,sitting?7:5,ink);oval(sitting?16:15,20,sitting?5:9,sitting?7:4,fur);
    const hx=sitting?15:8,hy=sitting?10:15;
    poly([[hx-5,hy+3],[hx-5,hy-6],[hx-1,hy-3],[hx+4,hy-6],[hx+5,hy+4]],ink);oval(hx,hy,5,5,fur);rect(hx-4,hy-4,2,2,'#e4ac9c');rect(hx+2,hy-4,2,2,'#e4ac9c');rect(hx-3,hy,2,1,light);rect(hx+2,hy,2,1,light);rect(hx,hy+2,1,1,ink);
    if(!cat){rect(hx-6,hy-3,3,7,wood);rect(hx+4,hy-3,3,7,wood);box(hx-4,hy+2,7,4,warm);rect(hx-4,hy+2,2,2,ink);}else{line(hx-7,hy+2,hx-3,hy+3,shine);line(hx+3,hy+3,hx+7,hy+2,shine);}
    line(sitting?13:8,23,sitting?12:7,27,ink,3);line(21,23,22,27,ink,3);line(23,21,28,17,ink,2);line(28,17,28,cat?10:15,fur,2);line(11,18,12,23,wood);line(16,17,17,22,wood);rect(14,16,3,3,'#efcc9d');
  } else if(name==='crow') {
    if(variant==='flying'){poly([[15,14],[3,5],[1,13],[12,22],[20,22],[31,12],[29,4],[18,14]],ink);line(4,10,13,18,'#637b9c',2);line(19,18,28,9,steel,2);}
    oval(16,19,6,7,ink);oval(16,19,4,5,'#4f586e');oval(13,10,5,5,ink);rect(11,9,1,1,shine);poly([[8,10],[2,13],[9,14]],gold);line(15,25,13,28,wood,2);line(19,25,21,28,wood,2);line(9,29,25,29,wood,2);
  } else if(name==='lantern') {
    oval(16,7,5,5,ink);oval(16,7,3,3,null);box(7,9,18,19,wood);rect(10,12,12,12,variant==='on'?gold:'#586777');if(variant==='on')flame(16,14);rect(8,12,2,13,ink);rect(22,12,2,13,ink);rect(15,11,2,14,wood);box(6,26,20,4,steel);
  } else if(name==='sling') {
    line(7,4,12,20,ink,3);line(24,3,20,20,ink,3);line(8,4,13,20,warm);line(24,4,20,21,gold);poly([[10,19],[22,19],[23,25],[17,28],[10,25]],ink);poly([[12,20],[21,20],[21,24],[16,26],[12,24]],wood);line(13,24,19,24,warm);if(variant==='loaded'){oval(16,19,5,4,ink);oval(16,18,4,3,steel);rect(14,16,3,2,shine);}
  } else if(name==='crate'||name==='chest') {
    box(4,10,24,19,wood);for(let y=15;y<29;y+=5)line(6,y,25,y,ink);if(name==='crate'){line(6,12,24,26,ink,4);line(7,12,25,26,warm,2);line(24,12,6,26,warm,2);}else{box(4,6,24,9,warm);rect(7,7,2,20,steel);rect(23,7,2,20,steel);box(14,15,5,6,gold);if(variant==='open'){rect(5,10,22,7,ink);rect(9,12,4,3,gold);rect(17,13,5,2,light);box(4,2,24,8,wood);}}
  } else if(name==='barrel') {
    oval(16,17,11,14,ink);oval(16,17,9,13,wood);for(let x=10;x<25;x+=5)line(x,6,x,28,warm);for(const y of [8,23]){rect(6,y,21,4,steel);rect(8,y,17,1,shine);rect(9,y+2,1,1,ink);rect(23,y+2,1,1,ink);}oval(16,4,7,2,warm);
  } else if(name==='ladder') {
    for(const x of [6,23])box(x,2,4,29,warm);for(let y=6;y<29;y+=6)box(9,y,15,3,wood);
  } else if(name==='rope') {
    if(variant==='coiled'){for(const r of [11,8,5]){oval(15,17,r,Math.round(r*.7),ink);oval(15,16,r-1,Math.round(r*.7)-1,warm);oval(15,16,r-3,Math.max(1,Math.round(r*.7)-3),null);}line(23,21,28,28,ink,3);line(23,21,28,28,gold);}else{line(15,2,15,17,ink,4);line(16,2,16,18,warm,2);oval(16,23,7,7,ink);oval(16,23,5,5,warm);oval(16,22,3,4,null);for(let y=3;y<18;y+=3)rect(15,y,2,1,gold);}
  } else if(name==='trap') {
    oval(16,24,14,5,ink);oval(16,23,12,3,steel);box(11,18,10,6,wood);if(variant==='armed'){for(const x of [3,24]){line(x,9,x,23,ink,3);for(let y=10;y<22;y+=4)line(x,y,x===3?8:20,y+2,shine,2);}}else{poly([[4,22],[9,10],[16,6],[23,10],[29,22]],ink);line(7,20,16,9,steel,3);line(16,9,26,20,shine,3);}rect(14,19,5,2,'#ae5355');
  } else if(name==='bell') {
    box(14,3,5,5,wood);poly([[11,7],[22,7],[24,20],[28,24],[5,24],[9,20]],ink);poly([[12,8],[20,8],[22,21],[25,23],[8,23],[11,20]],gold);line(13,10,12,19,light,2);rect(6,23,21,3,wood);oval(16,27,3,3,ink);rect(15,26,3,2,gold);if(variant==='ringing'){line(3,9,1,16,gold,2);line(28,9,30,16,gold,2);rect(2,22,2,2,gold);}
  }
  if(variant==='broken'){for(let y=5;y<29;y++){const x=14+Math.floor(Math.sin(y*.7)*3);rect(x,y,3,null);}rect(5,29,4,2,steel);rect(24,28,4,3,wood);}
  return p;
}
export function pixelSvg(pixels) {
  let out='<svg viewBox="0 0 32 32" aria-hidden="true" shape-rendering="crispEdges">';
  pixels.forEach((row,y)=>{for(let x=0;x<32;){const c=row[x];let end=x+1;while(end<32&&row[end]===c)end++;if(c)out+=`<rect x="${x}" y="${y}" width="${end-x}" height="1" fill="${c}"/>`;x=end;}});
  return out+'</svg>';
}
