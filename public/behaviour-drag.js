export const clearBehaviourDrop=()=>document.querySelectorAll('.behaviour-drop-before,.behaviour-drop-after,.behaviour-drop-hover').forEach(n=>n.classList.remove('behaviour-drop-before','behaviour-drop-after','behaviour-drop-hover','nest-hover'));
export function behaviourDropTarget(target,x,y){
  const zone=target?.closest('[data-behaviour-owner]');if(!zone)return null;
  const chip=target.closest('[data-behaviour-usage]');
  let beforeId=null,after=false;
  if(chip){const r=chip.getBoundingClientRect();after=x>r.left+r.width/2;beforeId=after?chip.nextElementSibling?.dataset.behaviourUsage||null:chip.dataset.behaviourUsage;}
  return {id:zone.dataset.behaviourOwner,beforeId,element:chip||zone,marker:chip?(after?'behaviour-drop-after':'behaviour-drop-before'):'behaviour-drop-hover'};
}

export function behaviourDragging({isPlay,dispatch,onDragEnd}){
  let drag=null,suppressUntil=0;
  const clean=()=>{document.querySelector('#behaviour-drag-ghost')?.remove();clearBehaviourDrop();};
  function drop(payload,target,x,y){
    if(isPlay())return;
    const dest=behaviourDropTarget(target,x,y);if(!dest)return;
    dispatch({type:'behaviour.move',data:{sourceId:payload.sourceId,usageId:payload.id,targetId:dest.id,beforeId:dest.beforeId}});
  }
  document.addEventListener('pointerdown',e=>{
    const chip=e.target.closest('[data-behaviour-usage]');if(!chip||isPlay()||e.button!==0||document.querySelector('dialog[open]'))return;
    drag={id:chip.dataset.behaviourUsage,sourceId:chip.dataset.behaviourSource,x:e.clientX,y:e.clientY,pointerId:e.pointerId,label:chip.textContent,active:false};
    e.preventDefault();e.stopImmediatePropagation();
  },true);
  document.addEventListener('pointermove',e=>{
    if(!drag||drag.pointerId!==e.pointerId)return;
    if(!drag.active&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5)return;
    drag.active=true;let ghost=document.querySelector('#behaviour-drag-ghost');
    if(!ghost){ghost=document.createElement('div');ghost.id='behaviour-drag-ghost';ghost.className='behaviour-drag-ghost';ghost.textContent='⚙ '+drag.label;document.body.append(ghost);}
    ghost.style.left=e.clientX+14+'px';ghost.style.top=e.clientY+14+'px';clearBehaviourDrop();
    const dest=behaviourDropTarget(document.elementFromPoint(e.clientX,e.clientY),e.clientX,e.clientY);
    if(dest)dest.element.classList.add(dest.marker,'behaviour-drop-hover');
    e.preventDefault();e.stopImmediatePropagation();
  },true);
  document.addEventListener('pointerup',e=>{
    if(!drag)return;const d=drag;drag=null;clean();
    if(d.active){suppressUntil=performance.now()+300;drop(d,document.elementFromPoint(e.clientX,e.clientY),e.clientX,e.clientY);onDragEnd();e.preventDefault();e.stopImmediatePropagation();}
  },true);
  const cancel=()=>{if(drag?.active)suppressUntil=performance.now()+300;drag=null;clean();};
  document.addEventListener('pointercancel',cancel,true);window.addEventListener('blur',cancel);
  document.addEventListener('click',e=>{if(performance.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){cancel();e.preventDefault();e.stopImmediatePropagation();}},true);
  // Native dragging also supports mouse/browser integrations.
  document.addEventListener('dragstart',e=>{
    const chip=e.target.closest('[data-behaviour-usage]');if(!chip)return;
    if(isPlay()){e.preventDefault();return;}
    drag={id:chip.dataset.behaviourUsage,sourceId:chip.dataset.behaviourSource,native:true};
    e.dataTransfer.setData('application/x-workshop-behaviour',JSON.stringify(drag));e.dataTransfer.effectAllowed='move';e.stopImmediatePropagation();
  },true);
  document.addEventListener('dragover',e=>{if(!drag?.native)return;clearBehaviourDrop();const dest=behaviourDropTarget(e.target,e.clientX,e.clientY);if(dest){e.preventDefault();e.dataTransfer.dropEffect='move';dest.element.classList.add(dest.marker,'behaviour-drop-hover');}e.stopImmediatePropagation();},true);
  document.addEventListener('drop',e=>{if(!drag?.native)return;const d=drag;cancel();drop(d,e.target,e.clientX,e.clientY);e.preventDefault();e.stopImmediatePropagation();},true);
  document.addEventListener('dragend',()=>{if(drag?.native)cancel();},true);
}
