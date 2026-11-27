// Presentation records stay separate from gameplay events and shared projects.
export function trayTransferEffects(before,after){
  return ['inventory','graveyard'].flatMap(tray=>{
    const previous=new Set((before[tray]||[]).flatMap(s=>s.items.map(i=>i.id)));
    return (after[tray]||[]).flatMap(s=>s.items).filter(i=>!previous.has(i.id)).map(instance=>{
      const origin=before.project.levels.flatMap(l=>l.instances.map(i=>({level:l,instance:i}))).find(row=>row.instance.id===instance.id);
      const held=(before.inventory||[]).flatMap(s=>s.items).find(i=>i.id===instance.id);
      const carrier=held?.carriedBy,levelId=origin?.level.id||carrier?.levelId||instance.sourceLevelId||after.levelId;
      const source=origin?.instance||before.project.levels.find(l=>l.id===levelId)?.instances.find(i=>i.id===carrier?.instanceId)||instance;
      return {type:'tray',tray,levelId,instance:structuredClone(instance),from:{x:source.x,y:source.y},...(!origin&&!held?{source:'library'}:{})};
    });
  });
}

export function entityEffects({art}){
  let pending=[],active=new Set(),currentLevel=null;
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const query=selector=>document.querySelector(selector);
  const center=element=>{
    const r=element?.getBoundingClientRect();
    return r?.width&&r.height?{x:r.left+r.width/2,y:r.top+r.height/2,size:Math.min(r.width,r.height)}:null;
  };
  const cell=position=>center(query(`.cell[data-x="${position.x}"][data-y="${position.y}"]`));
  const piece=id=>query(`.piece[data-instance="${CSS.escape(id)}"]`);
  function clear(){
    pending=[];
    for(const effect of [...active])effect.finish();
  }
  function pulse(element,color){
    if(!element?.animate)return;
    element.animate([{boxShadow:`0 0 0 0 ${color}`},{boxShadow:`0 0 0 9px transparent`},{boxShadow:'none'}],{duration:380});
  }
  function flush(project,levelId){
    if(!project||currentLevel!==levelId){
      // Retain only newly queued effects when changing the displayed level.
      const queued=pending;clear();pending=queued;currentLevel=levelId;
    }
    const batch=pending;pending=[];
    if(!project)return;
    // Board rendering replaces its buttons, so reapply temporary visibility.
    for(const effect of active)if(effect.hideId)piece(effect.hideId)?.classList.add('entity-arriving');
    const delays=new Map();let index=0;
    for(const effect of active){
      const timing=effect.animation.effect.getTiming(),remaining=timing.delay+timing.duration-(effect.animation.currentTime||0);
      delays.set(effect.instanceId,Math.max(delays.get(effect.instanceId)||0,remaining));
    }
    for(const effect of batch){
      if(effect.levelId!==levelId)continue;
      const {instance}=effect,asset=project.assets.find(a=>a.id===instance.assetId);
      if(!asset)continue;
      const tray=effect.type==='tray',color=effect.tray==='graveyard'?'#dfb777':'#b8cf96';
      const header=tray?query(`#${effect.tray}-toggle`):null;
      const from=effect.source==='library'?center(query(`.asset-row[data-asset="${CSS.escape(instance.assetId)}"] .asset-icon`)):cell(effect.from);
      const target=tray?center(header?.querySelector('svg')):center(piece(instance.id))||cell(instance);
      if(!from||!target)continue;
      if(reduceMotion.matches){pulse(header||piece(instance.id),color);continue;}
      const size=from.size*.8,delay=delays.get(instance.id)??Math.min(index++*16,160),duration=tray?620:480;
      delays.set(instance.id,delay+duration);
      const ghost=document.createElement('div');
      ghost.className=`entity-flight ${tray?'entity-flight-tray':'entity-flight-expand'}`;
      ghost.dataset.effect=effect.type;ghost.setAttribute('aria-hidden','true');
      ghost.style.cssText=`left:${from.x-size/2}px;top:${from.y-size/2}px;width:${size}px;height:${size}px;--flight-color:${color};--rotation:${(instance.rotation+(asset.rotation||0))%360}deg`;
      ghost.innerHTML=art(asset,instance);document.body.append(ghost);
      const hideId=tray?null:instance.id;
      if(hideId)piece(hideId)?.classList.add('entity-arriving');
      const dx=target.x-from.x,dy=target.y-from.y,arc=Math.min(70,Math.hypot(dx,dy)*.18+12);
      const animation=ghost.animate([
        {transform:`translate(0,0) scale(${tray?1:.28})`,opacity:tray?1:.3},
        {transform:`translate(${dx*.48}px,${dy*.48-arc}px) scale(1.08)`,opacity:1,offset:.48},
        {transform:`translate(${dx}px,${dy}px) scale(${tray ? .24 : target.size/from.size})`,opacity:tray?0:1}
      ],{duration,delay,easing:'cubic-bezier(.2,.65,.3,1)',fill:'both'});
      const running={hideId,instanceId:instance.id,animation,finish:()=>{
        animation.cancel();ghost.remove();active.delete(running);
        if(hideId&&![...active].some(e=>e.hideId===hideId))piece(hideId)?.classList.remove('entity-arriving');
      }};
      active.add(running);
      animation.finished.then(()=>{running.finish();pulse(header||piece(instance.id),color);},()=>{});
    }
  }
  // Fixed overlay paths must not linger after the canvas or viewport moves.
  window.addEventListener('resize',clear);
  document.addEventListener('scroll',clear,true);
  reduceMotion.addEventListener('change',clear);
  return {enqueue:effects=>{pending=pending.concat(effects||[]);},flush,clear};
}
