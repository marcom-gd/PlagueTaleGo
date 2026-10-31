// Panel layout is local to this browser; the actual live views move with it.
export function workshopPanels({onChange}) {
  const sidebar=document.querySelector('#workshop-sidebar');
  const dock=document.querySelector('.library-browser');dock.classList.replace('library-browser','library-dock');
  const tabs=document.querySelector('#library-tabs');
  const labels={objects:'Objects',atomic:'Atomic Parameters',definition:'Definition'};
  const panels=new Map();let active='objects',drag=null,top=100,suppressUntil=0;
  const objects=document.createElement('section');objects.className='library-browser';
  for(const child of [...dock.children])if(child!==tabs)objects.append(child);
  const atomic=objects.cloneNode(true);
  for(const element of atomic.querySelectorAll('[id]'))element.id+='-atomic';
  atomic.querySelector('[data-root-drop]').remove();
  for(const [id,element] of [['objects',objects],['atomic',atomic],['definition',document.querySelector('.definition-panels')]]){
    element.dataset.workshopPanel=id;
    const slot=document.createElement('div');slot.className='panel-dock-slot';slot.dataset.dockSlot=id;slot.textContent=`Drop ${labels[id]} here to dock`;
    if(id==='definition')element.before(slot);else dock.append(slot,element);
    const header=document.createElement('div');header.className='panel-titlebar';
    header.innerHTML=`<span class="panel-grip" data-panel-handle="${id}" tabindex="0" role="button" aria-label="Move ${labels[id]} panel" title="Drag to move · Alt+arrows to move · Alt+Enter to dock">⠿ <strong>${labels[id]}</strong></span><button data-dock-panel="${id}" title="Dock ${labels[id]} back in the sidebar">↙ Dock</button>`;
    element.prepend(header);
    panels.set(id,{element,slot,floating:false});
  }
  tabs.innerHTML=['objects','atomic'].map(id=>`<button role="tab" id="library-tab-${id}" data-library-tab="${id}" data-panel-handle="${id}" aria-controls="${id==='objects'?'library':'library-atomic'}" title="Click to view · drag out to float">${labels[id]} <span aria-hidden="true">⠿</span></button>`).join('');
  document.querySelector('#definition-toggle').dataset.panelHandle='definition';
  const restore=document.createElement('button');restore.id='dock-all-panels';restore.textContent='↙';restore.title='Dock all floating panels';restore.setAttribute('aria-label',restore.title);
  document.querySelector('.library-heading-actions').prepend(restore);
  let saved={};try{saved=JSON.parse(localStorage.getItem('workshop-floating-panels')||'{}');}catch{}
  function save(){
    const value={};for(const [id,p] of panels)if(p.floating){const r=p.element.getBoundingClientRect();value[id]={x:r.x,y:r.y,width:r.width,height:r.height};}
    try{localStorage.setItem('workshop-floating-panels',JSON.stringify(value));}catch{}
  }
  function clamp(p,x,y){
    const r=p.element.getBoundingClientRect();
    p.element.style.left=Math.max(0,Math.min(x,window.innerWidth-r.width))+'px';
    p.element.style.top=Math.max(0,Math.min(y,window.innerHeight-45))+'px';
  }
  function refresh(){
    const available=['objects','atomic'].filter(id=>!panels.get(id).floating);
    if(!available.includes(active))active=available[0]||active;
    for(const [id,p] of panels){
      p.element.hidden=!p.floating&&id!=='definition'&&id!==active;
      p.slot.hidden=!p.floating;
      const tab=tabs.querySelector(`[data-library-tab="${id}"]`);
      if(tab){tab.classList.toggle('tab-floating',p.floating);tab.setAttribute('aria-selected',String(!p.floating&&active===id));tab.tabIndex=active===id?0:-1;tab.title=p.floating?'Floating · click to bring forward · double-click to dock':'Click to view · drag out to float';}
    }
    dock.classList.toggle('all-library-floating',available.length===0);
    sidebar.classList.toggle('definition-floating',panels.get('definition').floating);
    restore.disabled=![...panels.values()].some(p=>p.floating);
  }
  function float(id,rect){
    const p=panels.get(id);if(p.floating)return;
    p.floating=true;p.element.hidden=false;p.element.classList.add('workshop-floating-panel');document.body.append(p.element);
    const width=Math.max(280,Math.min(Number(rect?.width)||380,window.innerWidth));
    const height=Math.max(180,Math.min(Number(rect?.height)||520,window.innerHeight-20));
    Object.assign(p.element.style,{width:width+'px',height:height+'px',zIndex:String(++top)});
    clamp(p,Number.isFinite(rect?.x)?rect.x:60,Number.isFinite(rect?.y)?rect.y:100);refresh();
  }
  function dockPanel(id){
    const p=panels.get(id);if(!p.floating)return;
    p.floating=false;p.element.classList.remove('workshop-floating-panel');p.element.removeAttribute('style');p.slot.after(p.element);
    if(id!=='definition')active=id;refresh();save();onChange(active);
  }
  function select(id){
    const p=panels.get(id);
    if(p.floating){p.element.style.zIndex=String(++top);p.element.querySelector('.panel-grip').focus();}
    else active=id;
    refresh();onChange(active);
  }
  const targetAt=(x,y,id)=>{
    for(const target of id==='definition'?[panels.get(id).slot]:[tabs,panels.get(id).slot]){
      const r=target.getBoundingClientRect();if(r.width>0&&r.height>0&&x>=r.left-12&&x<=r.right+12&&y>=r.top-12&&y<=r.bottom+12)return target;
    }
    return null;
  };
  document.addEventListener('pointerdown',e=>{
    const panel=e.target.closest('.workshop-floating-panel');if(panel)panel.style.zIndex=String(++top);
    const handle=e.target.closest('[data-panel-handle]');if(!handle||e.button!==0||document.querySelector('dialog[open]'))return;
    const id=handle.dataset.panelHandle,p=panels.get(id),r=p.element.getBoundingClientRect();
    drag={id,p,pointerId:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,wasFloating:p.floating,active:false};
    e.preventDefault();e.stopImmediatePropagation();
  },true);
  document.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.pointerId)return;
    const d=drag,dx=e.clientX-d.x,dy=e.clientY-d.y;
    if(!d.active&&Math.hypot(dx,dy)<7)return;
    if(!d.active){d.active=true;document.body.classList.add('moving-workshop-panel');if(!d.wasFloating){float(d.id,{x:e.clientX-100,y:e.clientY-18});d.left=d.p.element.offsetLeft-dx;d.top=d.p.element.offsetTop-dy;onChange(active);}}
    clamp(d.p,d.left+dx,d.top+dy);
    document.querySelectorAll('.panel-dock-hover').forEach(n=>n.classList.remove('panel-dock-hover'));
    targetAt(e.clientX,e.clientY,d.id)?.classList.add('panel-dock-hover');
    e.preventDefault();e.stopImmediatePropagation();
  },true);
  function finish(e,cancel=false){
    if(!drag)return;const d=drag;drag=null;
    document.body.classList.remove('moving-workshop-panel');document.querySelectorAll('.panel-dock-hover').forEach(n=>n.classList.remove('panel-dock-hover'));
    if(d.active){suppressUntil=performance.now()+300;if(cancel){if(!d.wasFloating)dockPanel(d.id);else clamp(d.p,d.left,d.top);}else if(targetAt(e.clientX,e.clientY,d.id))dockPanel(d.id);save();e.preventDefault();e.stopImmediatePropagation();}
  }
  document.addEventListener('pointerup',e=>finish(e),true);
  document.addEventListener('pointercancel',e=>finish(e,true),true);
  window.addEventListener('blur',()=>{if(drag){finish({preventDefault(){},stopImmediatePropagation(){}},true);}});
  document.addEventListener('click',e=>{
    if(performance.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();return;}
    const button=e.target.closest('[data-dock-panel],#dock-all-panels');if(!button)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(button.id==='dock-all-panels')for(const id of panels.keys())dockPanel(id);else dockPanel(button.dataset.dockPanel);
  },true);
  tabs.addEventListener('dblclick',e=>{const tab=e.target.closest('[data-library-tab]');if(tab)dockPanel(tab.dataset.libraryTab);});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&drag){finish(e,true);return;}
    const handle=e.target.closest('[data-panel-handle]');if(!handle||!e.altKey)return;
    const id=handle.dataset.panelHandle,p=panels.get(id);
    if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();p.floating?dockPanel(id):(float(id),save(),onChange(active));}
    else if(p.floating&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();const r=p.element.getBoundingClientRect();clamp(p,r.x+(e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0),r.y+(e.key==='ArrowDown'?20:e.key==='ArrowUp'?-20:0));save();}
  },true);
  window.addEventListener('resize',()=>{for(const p of panels.values())if(p.floating){p.element.style.width=Math.min(p.element.offsetWidth,window.innerWidth)+'px';const r=p.element.getBoundingClientRect();clamp(p,r.x,r.y);}save();});
  const observer=new ResizeObserver(()=>{if(!drag)save();});
  for(const [id,rect] of Object.entries(saved||{}))if(panels.has(id)&&rect&&typeof rect==='object')float(id,rect);
  for(const p of panels.values())observer.observe(p.element);
  refresh();
  return {select,refresh,activeTab:()=>active,isFloating:id=>panels.get(id)?.floating};
}
