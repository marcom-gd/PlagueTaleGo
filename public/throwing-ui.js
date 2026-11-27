import {availableThrows,throwPreview} from './throw-object.js';

export const throwIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="5" cy="18" r="3"/><path d="M6 12C8 3 17 3 20 9m-5-1 5 1 1-5M10 18l5-3"/></svg>';

export function throwingUI({getState,getLevel,art,perform,toast}){
  let choice=null,pointer=null;
  const board=()=>document.querySelector('#board');
  const clean=()=>{document.querySelector('#throw-preview')?.remove();document.querySelector('#throw-tooltip')?.remove();board().classList.remove('throwing');};
  function cancel(){choice=null;clean();}
  function position(){
    if(!pointer)return null;
    const r=board().getBoundingClientRect(),v=document.querySelector('#board-viewport').getBoundingClientRect(),l=getLevel();
    if(pointer.x<r.left||pointer.x>=r.right||pointer.y<r.top||pointer.y>=r.bottom||pointer.x<v.left||pointer.x>=v.right||pointer.y<v.top||pointer.y>=v.bottom)return null;
    return {x:Math.floor((pointer.x-r.left)/r.width*l.width),y:Math.floor((pointer.y-r.top)/r.height*l.height)};
  }
  function render(){
    if(!choice)return;
    const state=getState(),l=getLevel();
    if(!state.project||l.id!==choice.levelId||!availableThrows(state.project,l,state.inventory).some(c=>c.instanceId===choice.instanceId&&c.assignedId===choice.assignedId&&c.behaviourId===choice.behaviourId)){cancel();return;}
    clean();board().classList.add('throwing');
    const tooltip=document.createElement('div');tooltip.id='throw-tooltip';tooltip.setAttribute('role','status');
    tooltip.textContent='Throwing · Right Click to cancel';
    if(pointer){tooltip.style.left=Math.max(8,Math.min(pointer.x+18,window.innerWidth-280))+'px';tooltip.style.top=Math.max(8,Math.min(pointer.y+24,window.innerHeight-70))+'px';}
    document.body.append(tooltip);
    const dest=position();if(!dest)return;
    const preview=throwPreview(state.project,state.inventory,choice,dest),layer=document.createElement('div');layer.id='throw-preview';layer.setAttribute('aria-hidden','true');
    let lines='';
    for(let n=1;n<preview.path.length;n++){
      const a=preview.path[n-1],b=preview.path[n];
      lines+=`<line class="${b.legal?'':'illegal'}" x1="${a.x+.5}" y1="${a.y+.5}" x2="${b.x+.5}" y2="${b.y+.5}"/>`;
    }
    const reactions=preview.distractions||[],affectedIds=new Set(reactions.flatMap(r=>r.targetIds)),sourceIds=new Set(reactions.map(r=>r.sourceId));
    const reactionAreas=reactions.flatMap(r=>r.cells.map(([x,y])=>`<span class="distraction-preview-area" style="--x:${x};--y:${y};--reaction-color:${r.color}"></span>`)).join('');
    const reactionObjects=l.instances.filter(i=>affectedIds.has(i.id)||sourceIds.has(i.id)).map(i=>`<span class="distraction-preview-object ${sourceIds.has(i.id)?'distraction-preview-source':'distraction-preview-affected'}" style="--x:${i.x};--y:${i.y}"></span>`).join('');
    layer.innerHTML=reactionAreas+`<svg class="throw-path" viewBox="0 0 ${l.width} ${l.height}" preserveAspectRatio="none">${lines}</svg>`+preview.path.filter(p=>p.node).map(p=>`<span class="throw-node ${p.x===dest.x&&p.y===dest.y?'destination':''} ${!p.legal||p.x===dest.x&&p.y===dest.y&&!preview.valid?'illegal':''}" style="--x:${p.x};--y:${p.y}"></span>`).join('')+reactionObjects;
    const a=state.project.assets.find(a=>a.id===preview.throwAssetId);
    if(a){
      const item=choice.requireInventory?state.inventory.find(s=>s.assetId===a.id)?.items[0]:null;
      layer.insertAdjacentHTML('beforeend',`<span class="throw-ghost ${preview.valid?'':'illegal'}" style="--x:${dest.x};--y:${dest.y};--rotation:${(item?.rotation||0)+(a.rotation||0)}deg">${art(a,item)}</span>`);
    }
    if(!preview.valid)tooltip.textContent=preview.reason+' Right Click to cancel';
    else tooltip.textContent=(reactions.length?`Distraction · ${affectedIds.size} object${affectedIds.size===1?'':'s'} affected · `:'')+'Left Click to throw · Right Click to cancel';
    board().append(layer);
  }
  function start(next){choice=next;render();}
  document.addEventListener('pointermove',e=>{pointer={x:e.clientX,y:e.clientY};if(choice)render();});
  document.addEventListener('pointerdown',e=>{
    if(!choice||!e.target.closest('#board')&&e.button!==2)return;
    e.preventDefault();e.stopImmediatePropagation();
  },true);
  document.addEventListener('click',e=>{
    if(!choice||!e.target.closest('#board'))return;
    e.preventDefault();e.stopImmediatePropagation();
    pointer={x:e.clientX,y:e.clientY};const dest=position();if(!dest)return;
    const state=getState(),preview=throwPreview(state.project,state.inventory,choice,dest);
    if(!preview.valid){render();toast(preview.reason);return;}
    const selected=choice;
    try{perform(selected,dest);cancel();}catch(error){toast(error.message);render();}
  },true);
  document.addEventListener('contextmenu',e=>{if(choice){e.preventDefault();e.stopImmediatePropagation();cancel();}},true);
  document.addEventListener('keydown',e=>{
    if(!choice||e.target.matches('input,textarea,select,[contenteditable]'))return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();return;}
    const cell=e.target.closest('#board .cell');
    if(e.key==='Enter'&&cell){
      e.preventDefault();e.stopImmediatePropagation();
      try{perform(choice,{x:Number(cell.dataset.x),y:Number(cell.dataset.y)});cancel();}catch(error){toast(error.message);}
    }else if(['ArrowUp','ArrowRight','ArrowDown','ArrowLeft','Delete','Backspace','r','R'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  document.addEventListener('dragstart',e=>{if(choice&&e.target.closest('#board')){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.querySelector('#board-viewport').addEventListener('scroll',()=>{if(choice)render();});
  window.addEventListener('blur',cancel);
  return {start,cancel,render};
}
