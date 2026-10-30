import {clone,uid,hasNode} from './model.js';
import {copyHierarchy,copyLevel} from './editing.js';
export function manipulation({getProject,getLevel,getSelected,setSelected,dispatch,render,toast,isPlay,snap,esc,collectInventory}){
  let selection=new Set(),drag=null,suppress=0,clipboard=null;
  const panel=document.createElement('section');panel.className='manipulation-panel';document.querySelector('#inspector').before(panel);
  const selectedItems=()=>getSelected()?.type==='instance'?getLevel().instances.filter(i=>selection.has(i.id)):[];
  const choose=(id,add=false)=>{if(!add)selection.clear();if(add&&selection.has(id))selection.delete(id);else selection.add(id);const last=[...selection].at(-1);setSelected(last?{type:'instance',id:last}:null);render();};
  const move=(dx,dy)=>{
    const items=selectedItems();if(!items.length)return;
    if(items.some(i=>i.locked))return toast('Unlock the selected scenery before moving it.');
    if(snap()&&items.some(i=>!hasNode(getLevel(),`${i.x+dx},${i.y+dy}`)))return toast('Snap to Nodes requires a node for every selected piece.');
    dispatch({type:'instance.batch',data:{levelId:getLevel().id,updates:items.map(i=>({id:i.id,x:i.x+dx,y:i.y+dy}))}});
  };
  const duplicate=(originals=selectedItems(),links=getLevel().objectLinks)=>{
    if(!originals.length)return;
    let dx=originals.every(i=>i.x+1<getLevel().width)?1:originals.every(i=>i.x>0)?-1:0;
    if(snap()&&originals.some(i=>!hasNode(getLevel(),`${i.x+dx},${i.y}`)))dx=0;
    if(snap()&&originals.some(i=>!hasNode(getLevel(),`${i.x+dx},${i.y}`)))return toast('Snap to Nodes requires a node for every copied piece.');
    const additions=originals.map(i=>({...clone(i),id:uid(),x:i.x+dx,locked:false}));
    const ids=new Map(originals.map((i,index)=>[i.id,additions[index].id]));
    const copiedLinks=links.map(link=>({...clone(link),id:uid(),instanceIds:link.instanceIds.filter(id=>ids.has(id)).map(id=>ids.get(id))})).filter(link=>link.instanceIds.length>=2);
    if(dispatch({type:'instance.batch',data:{levelId:getLevel().id,additions,links:copiedLinks}})!==false){selection=new Set(additions.map(i=>i.id));setSelected({type:'instance',id:additions.at(-1).id});render();}
  };
  function refresh(){
    const focus=getSelected();if(focus?.type!=='instance')selection.clear();else {selection=new Set([...selection].filter(id=>getLevel().instances.some(i=>i.id===id)));selection.add(focus.id);}
    for(const piece of document.querySelectorAll('[data-instance]')){const i=getLevel().instances.find(i=>i.id===piece.dataset.instance);piece.classList.toggle('group-selected',selection.has(i?.id));piece.classList.toggle('scenery-locked',!!i?.locked);piece.draggable=!i?.locked;}
    const items=selectedItems(),a=focus?.type==='asset'?getProject().assets.find(a=>a.id===focus.id):null,active=items.find(i=>i.id===focus?.id),stack=active?getLevel().instances.filter(i=>i.x===active.x&&i.y===active.y):[];
    panel.innerHTML=`<div class="eyebrow">MANIPULATE & ORGANIZE</div><p>Shift/Ctrl-click pieces to select several. Drag or use arrow keys to move the group.</p><div class="inspector-actions"><button data-edit-action="select-all">Select all pieces</button><button data-edit-action="clear">Clear selection</button><button data-edit-action="copy-level" ${isPlay()?'disabled':''}>Duplicate level</button></div>${items.length?`<p><b>${items.length} selected</b> · ${items.filter(i=>i.locked).length} locked</p><div class="inspector-actions"><button data-edit-action="duplicate">Duplicate selection</button><button data-edit-action="lock">Lock scenery</button><button data-edit-action="unlock">Unlock</button><button data-edit-action="remove">Remove selected</button></div>`:''}${a?`<button data-edit-action="copy-hierarchy" ${isPlay()?'disabled':''}>Duplicate whole hierarchy</button>`:''}${stack.length>1?`<div class="stack-picker"><label for="stack-piece">Objects at this cell (${stack.length})</label><select id="stack-piece">${stack.map(i=>`<option value="${esc(i.id)}" ${i.id===focus.id?'selected':''}>${esc(getProject().assets.find(a=>a.id===i.assetId)?.name||'Object')}${i.locked?' · locked':''} · ${esc(i.id.slice(0,5))}</option>`).join('')}</select></div>`:''}`;
  }
  panel.addEventListener('change',e=>{if(e.target.id==='stack-piece')choose(e.target.value);});
  panel.addEventListener('click',e=>{
    const action=e.target.closest('[data-edit-action]')?.dataset.editAction;if(!action)return;
    e.stopPropagation();const items=selectedItems();
    if(action==='select-all'){selection=new Set(getLevel().instances.map(i=>i.id));setSelected(selection.size?{type:'instance',id:[...selection].at(-1)}:null);render();}
    if(action==='clear'){selection.clear();setSelected(null);render();}
    if(action==='duplicate')duplicate();
    if(action==='lock'||action==='unlock')dispatch({type:'instance.batch',data:{levelId:getLevel().id,updates:items.map(i=>({id:i.id,locked:action==='lock'}))}});
    if(action==='remove')dispatch({type:'instance.batch',data:{levelId:getLevel().id,removeIds:items.map(i=>i.id)}});
    if(action==='copy-hierarchy'&&!isPlay()){const assets=copyHierarchy(getProject(),getSelected().id);if(dispatch({type:'asset.addMany',data:{assets}})!==false){setSelected({type:'asset',id:assets[0].id});render();}}
    if(action==='copy-level'&&!isPlay()){const level=copyLevel(getLevel());if(dispatch({type:'level.add',data:level})!==false)toast('Level duplicated. Open its new tab to edit it.');}
  });
  document.addEventListener('click',e=>{const piece=e.target.closest('[data-instance]');if(!piece)return;if(performance.now()<suppress){e.preventDefault();e.stopImmediatePropagation();return;}if(e.shiftKey||e.ctrlKey||e.metaKey){e.preventDefault();e.stopImmediatePropagation();choose(piece.dataset.instance,true);}},true);
  document.addEventListener('pointerdown',e=>{
    if(e.button!==0||document.querySelector('dialog[open]'))return;
    const piece=e.target.closest('[data-instance]');if(!piece)return;
    const i=getLevel().instances.find(i=>i.id===piece.dataset.instance);
    if(e.shiftKey||e.ctrlKey||e.metaKey||i?.locked){e.stopImmediatePropagation();return;}
    if(selection.size>1&&selection.has(i?.id)){e.preventDefault();e.stopImmediatePropagation();drag={x:e.clientX,y:e.clientY,i,active:false};}
  },true);
  document.addEventListener('pointermove',e=>{if(drag&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5){drag.active=true;for(const element of document.querySelectorAll('.group-selected'))element.style.transform=`translate(${e.clientX-drag.x}px,${e.clientY-drag.y}px)`;}},true);
  document.addEventListener('pointerup',e=>{if(!drag)return;const d=drag;drag=null;if(d.active){suppress=performance.now()+300;e.preventDefault();e.stopImmediatePropagation();if(isPlay()&&document.elementFromPoint(e.clientX,e.clientY)?.closest('#player-inventory,#player-graveyard')){collectInventory?.({type:'instance',id:d.i.id,ids:selectedItems().map(i=>i.id),levelId:getLevel().id},!!document.elementFromPoint(e.clientX,e.clientY)?.closest('#player-graveyard'));}else{const board=document.querySelector('#board'),r=board.getBoundingClientRect();const dx=Math.round((e.clientX-d.x)/r.width*getLevel().width),dy=Math.round((e.clientY-d.y)/r.height*getLevel().height);move(dx,dy);}}render();},true);
  document.addEventListener('pointercancel',()=>{drag=null;render();});
  document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||e.target.matches('input,textarea,select,[contenteditable]')||e.target.closest('.floating-layer'))return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'&&selectedItems().length){e.preventDefault();e.stopImmediatePropagation();clipboard={items:clone(selectedItems()),links:clone(getLevel().objectLinks)};toast('Selected pieces copied.');return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&clipboard){e.preventDefault();e.stopImmediatePropagation();duplicate(clipboard.items,clipboard.links);return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'&&selectedItems().length){e.preventDefault();e.stopImmediatePropagation();duplicate();return;}
    const directions={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
    if(selection.size>1&&directions[e.key]){e.preventDefault();e.stopImmediatePropagation();move(...directions[e.key]);}
    if(selection.size>1&&e.key.toLowerCase()==='r'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();e.stopImmediatePropagation();dispatch({type:'instance.batch',data:{levelId:getLevel().id,updates:selectedItems().map(i=>({id:i.id,rotation:(i.rotation+90)%360}))}});}
    if(selection.size>1&&['Delete','Backspace'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();dispatch({type:'instance.batch',data:{levelId:getLevel().id,removeIds:selectedItems().map(i=>i.id)}});}
  },true);
  return {render:refresh,onSingleSelect:id=>{selection=new Set([id]);},duplicate,isSelected:id=>selection.has(id)};
}
