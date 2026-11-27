export const numeric = values => values.filter(v => typeof v === 'number' && Number.isFinite(v));
export const sum = values => numeric(values).reduce((a,b) => a+b,0);
export const mean = values => { const a=numeric(values); return a.length?sum(a)/a.length:null; };
export function quantile(values,q) { const a=numeric(values).sort((a,b)=>a-b); if(!a.length)return null; const p=(a.length-1)*q,i=Math.floor(p); return a[i]+(a[Math.ceil(p)]-a[i])*(p-i); }
export const median = values => quantile(values,.5);
export function summary(rows) {
  const out={n:rows.length,players:new Set(rows.map(r=>r.player)).size,sandbox:rows.filter(r=>r.usedSandbox).length,manual:rows.filter(r=>r.completion==='manual').length,noFriction:rows.filter(r=>r.noFriction).length,comments:rows.filter(r=>r.friction||r.thoughts).length};
  for(const k of ['experience','difficulty','personalChallenge','turns','elapsedSeconds']){
    const a=numeric(rows.map(r=>r[k]));out[k]={n:a.length,mean:mean(a),median:median(a),min:a.length?Math.min(...a):null,max:a.length?Math.max(...a):null,q1:quantile(a,.25),q3:quantile(a,.75)};
  }
  out.emotions=Object.fromEntries(['frustrated','excited','eureka','surprised','confused','goodTime','proud','relaxed','bored'].map(k=>[k,rows.filter(r=>r.emotions.includes(k)).length]));
  return out;
}
export function filteredRows(data,filters={}) {
  const complete=new Set(data.players.filter(p=>p.completed===p.available).map(p=>p.key));
  return data.responses.filter(r=>(filters.cohort!=='complete'||complete.has(r.player))&&(filters.mode!=='strict'||!r.usedSandbox));
}
export function paired(data,rows,base,metric) {
  const a=data.levels.find(l=>l.base===base&&l.variant==='V'),b=data.levels.find(l=>l.base===base&&l.variant==='B');
  if(!a||!b)return {base,n:0,pairs:[],unmatched:true};
  const pairs=[];
  for(const p of data.players){const v=rows.find(r=>r.player===p.key&&r.level===a.key),alt=rows.find(r=>r.player===p.key&&r.level===b.key);if(v&&alt&&Number.isFinite(v[metric])&&Number.isFinite(alt[metric]))pairs.push({player:p.key,v:v[metric],b:alt[metric],delta:alt[metric]-v[metric]});}
  return {base,n:pairs.length,pairs,v:mean(pairs.map(p=>p.v)),b:mean(pairs.map(p=>p.b)),delta:mean(pairs.map(p=>p.delta)),medianDelta:median(pairs.map(p=>p.delta)),higher:pairs.filter(p=>p.delta>0).length,equal:pairs.filter(p=>p.delta===0).length,lower:pairs.filter(p=>p.delta<0).length};
}
