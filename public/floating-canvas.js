import {deckIcon} from './cards-catalog.js';
export function floatingCanvas({getProject,getLevel,dispatch,edit,uid,esc}) {
  const canvas=document.querySelector('#canvas-wrap'),toolbar=document.querySelector('.workshop-toolbar');
  canvas.append(toolbar);
  const layer=document.createElement('div');layer.className='floating-layer';canvas.append(layer);
  let catalogs=[],drag=null,suppressSourceClickUntil=0;
  try{catalogs=JSON.parse(localStorage.getItem('design-card-cache')||'[]');}catch{}
  const refreshCatalog=()=>fetch('/api/decks',{signal:AbortSignal.timeout(5000)}).then(r=>r.json()).then(data=>{if(Array.isArray(data.decks)){catalogs=data.decks;localStorage.setItem('design-card-cache',JSON.stringify(catalogs));render();}}).catch(()=>{});
  refreshCatalog();window.addEventListener('focus',refreshCatalog);
  window.addEventListener('storage',event=>{if(event.key==='design-card-cache'){try{const next=JSON.parse(event.newValue);if(Array.isArray(next)){catalogs=next;render();}}catch{}}});
  const hidden=new Set();
  const notes=()=>getProject().levels.find(l=>l.id===getLevel().id)?.postIts||[];
  const position=(event)=>{const r=canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};};
  const items=()=>notes().map(n=>n.space==='canvas'?n:{...n,space:'canvas',x:n.x*48+80,y:n.y*48+55});
  const update=(item,changes)=>dispatch(item.virtual?{type:'postIt.add',data:{levelId:getLevel().id,note:{...item,virtual:undefined,...changes}}}:{type:'postIt.update',data:{levelId:getLevel().id,id:item.id,...changes,space:'canvas'}});
  const create=(kind,pos)=>{
    if(kind.startsWith('deck:')){
      const deckId=kind.slice(5),existing=notes().find(n=>n.kind==='deck'&&n.deckId===deckId);
      hidden.delete('deck');const visibility=toolbar.querySelector('[data-visible-kind="deck"]');if(visibility)visibility.checked=true;
      if(existing)update(existing,{...pos,hidden:false});
      else dispatch({type:'postIt.add',data:{levelId:getLevel().id,note:{id:uid(),kind:'deck',space:'canvas',deckId,text:'Design '+(deckId==='experiments'?'Experiments':'Challenges'),color:deckId==='experiments'?'#bfddce':'#edc47c',...pos}}});
      return;
    }
    const item={id:uid(),space:'canvas',kind,color:document.querySelector('[data-note-color][aria-pressed=true]')?.dataset.noteColor||'#f6dfa0',...pos,text:kind==='step'?String(notes().filter(n=>n.kind==='step').length+1):kind==='question'?'?':kind==='arrow'?'Arrow':'New observation',...(kind==='arrow'?{dx:120,dy:35}:{})};
    if(kind==='note'||kind==='question')edit(null,item);else dispatch({type:'postIt.add',data:{levelId:getLevel().id,note:item}});
  };
  function draw(deckId,pos){
    const deck=catalogs.find(d=>d.id===deckId);if(!deck){alert('The card inventory is still loading. Try again shortly.');return;}
    const used=new Set(getProject().cardDraws.filter(d=>d.deckId===deckId).map(d=>d.cardId)),available=deck.cards.filter(c=>!used.has(c.id));
    if(!available.length){alert('Deck empty. Use Review cards to return all cards.');return;}
    const card=available[Math.floor(Math.random()*available.length)],draw={id:uid(),deckId,cardId:card.id,title:card.title,task:card.task,reflection:card.reflection};
    dispatch({type:'card.claim',data:{levelId:getLevel().id,draw,note:{id:uid(),space:'canvas',kind:'card',deckId,cardId:card.id,text:card.title+'\n\n'+card.task+(card.reflection?'\n\nREFLECT\n'+card.reflection:''),color:deckId==='experiments'?'#bfddce':'#edc47c',x:pos.x-240,y:pos.y+25}}});
  }
  function render(){
    if(drag)return;
    layer.innerHTML=items().filter(n=>!n.hidden&&!hidden.has(n.kind||'note')).map(n=>{
      const kind=n.kind||'note';
      const controls=`<button data-float-hide="${esc(n.id)}" title="Hide this item" aria-label="Hide ${esc(kind)}">−</button>${kind==='deck'?`<button data-float-draw="${esc(n.deckId)}" data-item="${esc(n.id)}" title="Draw a card" aria-label="Draw ${esc(n.text)}">↗</button>`:''}`;
      const content=kind==='deck'?`${deckIcon(n.deckId)}<strong>${esc(n.text)}</strong><small>${Math.max(0,(catalogs.find(d=>d.id===n.deckId)?.cards.length||0)-getProject().cardDraws.filter(d=>d.deckId===n.deckId).length)} cards remaining</small>`:kind==='arrow'?`<svg class="annotation-arrow" style="left:${Math.min(0,n.dx??120)}px;top:${Math.min(0,n.dy??35)}px;width:${Math.abs(n.dx??120)+8}px;height:${Math.abs(n.dy??35)+8}px" viewBox="0 0 ${Math.abs(n.dx??120)+8} ${Math.abs(n.dy??35)+8}"><defs><marker id="head-${esc(n.id)}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="currentColor"/></marker></defs><line x1="${(n.dx??120)<0?Math.abs(n.dx):4}" y1="${(n.dy??35)<0?Math.abs(n.dy):4}" x2="${(n.dx??120)<0?4:(n.dx??120)}" y2="${(n.dy??35)<0?4:(n.dy??35)}" stroke="currentColor" stroke-width="3" marker-end="url(#head-${esc(n.id)})"/></svg><button class="arrow-end" data-arrow-end="${esc(n.id)}" style="left:${n.dx??120}px;top:${n.dy??35}px" aria-label="Move arrow endpoint">●</button>`:kind==='step'||kind==='question'?`<strong>${esc(n.text)}</strong>`:`<span class="float-paper-label">${kind==='card'?'DESIGN CARD':'OBSERVATION'}</span><p>${esc(n.text)}</p>`;
      return `<article class="float-item float-${kind}" data-float-id="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px;--paper:${n.color}" tabindex="0" aria-label="${esc(kind+': '+n.text)}"><div class="float-controls">${controls}</div>${content}</article>`;
    }).join('');
  }
  const extra=document.createElement('div');extra.className='annotation-extras';
  toolbar.id='canvas-workshop-toolbar';
  const toolbarToggle=document.createElement('button');toolbarToggle.id='canvas-toolbar-toggle';toolbarToggle.setAttribute('aria-controls',toolbar.id);canvas.append(toolbarToggle);
  const setToolbar=collapsed=>{toolbar.classList.toggle('toolbar-hidden',collapsed);toolbarToggle.setAttribute('aria-expanded',String(!collapsed));toolbarToggle.textContent=collapsed?'☷ Show tools':'☷ Hide tools';};
  let toolsCollapsed=false;try{toolsCollapsed=localStorage.getItem('workshop-tools-collapsed')==='true';}catch{}setToolbar(toolsCollapsed);
  toolbarToggle.onclick=()=>{const next=!toolbar.classList.contains('toolbar-hidden');setToolbar(next);try{localStorage.setItem('workshop-tools-collapsed',String(next));}catch{}};
  const sidebarToggle=document.createElement('button');sidebarToggle.id='sidebar-toggle';sidebarToggle.setAttribute('aria-controls','workshop-sidebar');
  document.querySelector('.editor-heading').append(sidebarToggle);
  const setSidebar=collapsed=>{document.body.classList.toggle('sidebar-collapsed',collapsed);document.querySelector('#workshop-sidebar').inert=collapsed;sidebarToggle.setAttribute('aria-expanded',String(!collapsed));sidebarToggle.textContent=collapsed?'◧ Show sidebar':'◨ Hide sidebar';window.dispatchEvent(new Event('resize'));};
  let collapsed=false;try{collapsed=localStorage.getItem('workshop-sidebar-collapsed')==='true';}catch{}setSidebar(collapsed);
  sidebarToggle.onclick=()=>{const next=!document.body.classList.contains('sidebar-collapsed');setSidebar(next);try{localStorage.setItem('workshop-sidebar-collapsed',String(next));}catch{}};
  extra.innerHTML='<div class="float-create-tools"><button data-create-float="arrow" title="Drag onto canvas">↗ Arrow</button><button data-create-float="step" title="Drag onto canvas">① Step</button><button data-create-float="question" title="Drag onto canvas">? Question</button></div><details><summary>Visibility</summary><div class="float-visibility">'+['note','arrow','step','question','deck','card'].map(k=>`<label><input type="checkbox" checked data-visible-kind="${k}"> ${k==='note'?'Post-its':k+'s'}</label>`).join('')+'<button id="restore-floats">Restore hidden items</button></div></details><button id="projector-view">Projector view</button>';
  toolbar.append(extra);
  toolbar.querySelectorAll('[data-deck]').forEach(b=>{b.dataset.reviewDeck=b.dataset.deck;b.dataset.createFloat='deck:'+b.dataset.deck;delete b.dataset.deck;b.title='Click to review · drag onto canvas to place or restore';b.innerHTML=deckIcon(b.dataset.reviewDeck)+'<span>Review '+b.dataset.reviewDeck+'</span><span aria-hidden="true">⠿</span>';});
  const deckHint=document.createElement('small');deckHint.className='deck-drag-hint';deckHint.textContent='Click to review · drag to place';toolbar.querySelector('.deck-tools').append(deckHint);
  document.addEventListener('click',e=>{if(performance.now()<suppressSourceClickUntil&&e.target.closest('[data-review-deck]')){e.preventDefault();e.stopImmediatePropagation();}},true);
  toolbar.querySelector('#post-it-tool').dataset.createFloat='note';
  toolbar.addEventListener('change',e=>{const k=e.target.dataset.visibleKind;if(k){e.target.checked?hidden.delete(k):hidden.add(k);render();}});
  toolbar.addEventListener('click',e=>{if(e.target.id==='restore-floats'){for(const n of items().filter(n=>n.hidden))update(n,{hidden:false});render();}if(e.target.id==='projector-view'){document.body.classList.toggle('projector-mode');e.target.textContent=document.body.classList.contains('projector-mode')?'Exit projector':'Projector view';}});
  document.addEventListener('pointerdown',e=>{
    if(e.button!==0||document.querySelector('dialog[open]'))return;
    const source=e.target.closest('[data-create-float]'),element=e.target.closest('[data-float-id]');if(!source&&!element)return;
    if(e.target.closest('[data-float-hide],[data-float-draw]'))return;
    e.preventDefault();e.stopImmediatePropagation();const start=position(e),item=element?items().find(n=>n.id===element.dataset.floatId):null;
    drag={source:source?.dataset.createFloat,item,element,start,active:false,end:!!e.target.closest('[data-arrow-end]')};
  },true);
  document.addEventListener('pointermove',e=>{if(!drag)return;const pos=position(e),dx=pos.x-drag.start.x,dy=pos.y-drag.start.y;if(Math.hypot(dx,dy)>3)drag.active=true;if(!drag.active)return;
    if(drag.element){if(drag.end){drag.element.querySelector('.arrow-end').style.transform=`translate(${dx}px,${dy}px)`;}else drag.element.style.transform=`translate(${dx}px,${dy}px)`;}
    else {let ghost=document.querySelector('#float-ghost');if(!ghost){ghost=document.createElement('div');ghost.id='float-ghost';ghost.textContent=drag.source==='note'?'New post-it':drag.source;document.body.append(ghost);}ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';}
  },true);
  document.addEventListener('pointerup',e=>{if(!drag)return;const d=drag;drag=null;document.querySelector('#float-ghost')?.remove();const pos=position(e);if(d.active){e.preventDefault();e.stopImmediatePropagation();if(d.source){suppressSourceClickUntil=performance.now()+300;if(pos.x>=0&&pos.y>=0&&pos.x<=canvas.clientWidth&&pos.y<=canvas.clientHeight)create(d.source,pos);}else update(d.item,d.end?{dx:(d.item.dx??120)+pos.x-d.start.x,dy:(d.item.dy??35)+pos.y-d.start.y}:{x:d.item.x+pos.x-d.start.x,y:d.item.y+pos.y-d.start.y});}render();},true);
  document.addEventListener('pointercancel',()=>{drag=null;document.querySelector('#float-ghost')?.remove();render();});
  layer.addEventListener('click',e=>{e.stopPropagation();const hide=e.target.closest('[data-float-hide]'),drawButton=e.target.closest('[data-float-draw]');if(hide)update(items().find(n=>n.id===hide.dataset.floatHide),{hidden:true});if(drawButton){const item=items().find(n=>n.id===drawButton.dataset.item);draw(item.deckId,item);}});
  layer.addEventListener('dblclick',e=>{e.stopPropagation();const item=items().find(n=>n.id===e.target.closest('[data-float-id]')?.dataset.floatId);if(item&&!['deck','arrow','card'].includes(item.kind))edit(item);});
  layer.addEventListener('keydown',e=>{const item=items().find(n=>n.id===e.target.closest('[data-float-id]')?.dataset.floatId);if(!item)return;if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopPropagation();if(item.virtual)update(item,{hidden:true});else dispatch({type:'postIt.delete',data:{levelId:getLevel().id,id:item.id}});}if(e.key==='Enter'&&item.kind==='deck'){e.preventDefault();draw(item.deckId,item);}});
  return {render,draw};
}


