import {clone,uid,isParameter,isState,parameterDefinition} from './model.js';
import {behaviourNames,effectActions} from './behaviour-schema.js';
import {orderedBehaviours} from './behaviours.js';

export function behaviourEditor({getProject,getLevel,isPlay,dispatch,showDialog,modal,closeDialog,watchEditor,esc,toast}) {
  const $=s=>document.querySelector(s);
  const options=(values,current)=>Object.entries(values).map(([key,name])=>`<option value="${esc(key)}" ${key===current?'selected':''}>${esc(name)}</option>`).join('');
  const objects=()=>getProject().assets.filter(a=>!isState(a)&&!isParameter(a));
  const canvasObjects=()=>getLevel().instances.filter(i=>objects().some(a=>a.id===i.assetId));
  const objectChoices=current=>{
    const choices=canvasObjects();
    return `${current&&!choices.some(i=>i.id===current)?`<option value="${esc(current)}" selected>Missing object · ${esc(current)}</option>`:''}`+choices.map(i=>`<option value="${esc(i.id)}" ${i.id===current?'selected':''}>${esc(getProject().assets.find(a=>a.id===i.assetId)?.name)} · ${i.x+1}, ${i.y+1} · ${esc(i.id.slice(0,5))}</option>`).join('');
  };
  function targetFields(target={type:'self'}) {
    return `<div class="field"><label>Move target<select data-b="targetType">${options({self:'Self (the object carrying this effect)',position:'Custom position',object:'Other object in the canvas'},target.type)}</select></label></div>${target.type==='position'?`<div class="field-row"><label>Column (1–32)<input data-b="x" type="number" min="1" max="32" value="${(target.x??0)+1}" required></label><label>Row (1–24)<input data-b="y" type="number" min="1" max="24" value="${(target.y??0)+1}" required></label></div>`:''}${target.type==='object'?`<div class="field"><label>Canvas object<select data-b="objectId" required><option value="">Choose an object…</option>${objectChoices(target.id)}</select></label><small>Objects are specific placements on this level. A missing target causes no movement.</small></div>`:''}`;
  }
  const readTarget=root=>{
    const value=key=>root.querySelector(`[data-b="${key}"]`)?.value;
    return value('targetType')==='position'?{type:'position',x:Number(value('x')??1)-1,y:Number(value('y')??1)-1}:value('targetType')==='object'?{type:'object',id:value('objectId')||''}:{type:'self'};
  };
  function edit(assigned){
    if(isPlay())return;
    const asset=parameterDefinition(getProject(),assigned),draft=clone(asset.behaviours||[]);
    showDialog(modal(`Behaviours · ${asset.name}`,`<form id="behaviour-form"><p>These shared behaviours act at the beginning of each playtest turn. Behaviours inside inactive states stay silent. Effect settings update every attached use.</p><div id="behaviour-cards"></div><button type="button" id="add-behaviour">＋ Add behaviour</button><p id="behaviour-error" role="alert"></p><div class="modal-footer"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save behaviours</button></div></form>`));
    const read=()=>{
      for(const card of $('#behaviour-cards').querySelectorAll('[data-behaviour]')){
        const b=draft.find(b=>b.id===card.dataset.behaviour),value=key=>card.querySelector(`[data-b="${key}"]`)?.value;
        b.enabled=card.querySelector('[data-b="enabled"]').checked;
        if(b.type==='expand')b.allowStacking=card.querySelector('[data-b="allowStacking"]').checked;
        if(b.type==='moveTo'){b.steps=Number(value('steps'));b.target=value('moveMode');b.patrolId=value('patrolId')||null;}
        if(b.type==='applyEffect'){
          b.eligibleAssetIds=value('eligible')==='any'?null:[...card.querySelectorAll('[name="eligible-object"]:checked')].map(i=>i.value);
          if(b.action==='switchState'){b.stateKey=value('stateKey')?.trim()||'';b.stateEnabled=value('stateEnabled')==='true';}
          if(b.action==='setMoveTarget')b.moveTarget=readTarget(card);
        }
      }
    };
    const render=()=>{
      $('#behaviour-cards').innerHTML=draft.map((b,n)=>`<fieldset class="behaviour-card" data-behaviour="${esc(b.id)}"><legend>${n+1}. ${behaviourNames[b.type]}</legend><div class="behaviour-card-heading"><label class="check-row"><input type="checkbox" data-b="enabled" ${b.enabled?'checked':''}> Enabled</label><div><button type="button" data-shift="-1" ${n===0?'disabled':''} aria-label="Move behaviour up">↑</button><button type="button" data-shift="1" ${n===draft.length-1?'disabled':''} aria-label="Move behaviour down">↓</button><button type="button" data-remove-behaviour aria-label="Remove behaviour">×</button></div></div><div class="field"><label>Behaviour<select data-b="type">${options(isParameter(asset)?behaviourNames:{moveTo:'Move To'},b.type)}</select></label></div>${b.type==='expand'?`<p>Copy the placed object and its hierarchy onto the effect's highlighted path nodes. New copies begin acting next turn.</p><label class="check-row"><input data-b="allowStacking" type="checkbox" ${b.allowStacking?'checked':''}> Allow copies on nodes already containing this object type</label>`:''}${b.type==='applyEffect'?`<div class="field"><label>Action<select data-b="action">${options(effectActions,b.action)}</select></label></div><div class="field"><label>Eligible objects<select data-b="eligible">${options({any:'Any object type',selected:'Selected object types'},b.eligibleAssetIds===null?'any':'selected')}</select></label></div>${b.eligibleAssetIds!==null?`<div class="eligible-objects">${objects().map(a=>`<label class="check-row"><input type="checkbox" name="eligible-object" value="${esc(a.id)}" ${b.eligibleAssetIds.includes(a.id)?'checked':''}> ${esc(a.name)}</label>`).join('')||'<p>Create tokens first.</p>'}</div><small>An empty selection affects no objects.</small>`:''}${b.action==='switchState'?`<div class="field"><label>Desired state or key<input data-b="stateKey" list="behaviour-states" maxlength="100" value="${esc(b.stateKey)}" required></label><small>Choose a state ID below, or type a state name to match each target's own states. Unavailable states are skipped.</small></div><div class="field"><label>Switch<select data-b="stateEnabled">${options({true:'Enable state',false:'Disable state'},String(b.stateEnabled))}</select></label></div>`:''}${b.action==='setMoveTarget'?targetFields(b.moveTarget):''}${b.action==='flush'?'<p>Send eligible objects in the area to the graveyard, then continue through horizontally or vertically touching instances of the same type, including stacks. Gaps, inactive instances and other types stop each chain. The source is excluded.</p>':''}`:''}${b.type==='moveTo'?`<div class="field"><label>Free nodes per turn<input data-b="steps" type="number" min="1" max="100" value="${b.steps}" required></label></div><div class="field"><label>Move towards<select data-b="moveMode">${options({current:'Current Move Target',patrolStart:'Patrol Start → End → Start',patrolEnd:'Patrol End → Start → End'},b.target)}</select></label></div>${b.target!=='current'?`<div class="field"><label>Patrol<select data-b="patrolId"><option value="">Match placement's patrol color dot</option>${getProject().levels.flatMap(l=>l.patrols.map(p=>`<option value="${esc(p.id)}" ${p.id===b.patrolId?'selected':''}>${esc(l.name)} / ${esc(p.name)}</option>`)).join('')}</select></label></div>`:''}<small>Follows connected, unoccupied path nodes and respects broken connections. An occupied object target is approached to an adjacent free node. Locked scenery stays still.</small>`:''}</fieldset>`).join('')+`<datalist id="behaviour-states">${getProject().assets.filter(isState).map(s=>`<option value="${esc(s.id)}">${esc(getProject().assets.find(a=>a.id===s.parentId)?.name)} / ${esc(s.name)}</option>`).join('')}</datalist>`;
      $('#add-behaviour').disabled=draft.length>=30;
    };
    const make=type=>({id:uid(),enabled:true,type,...(type==='expand'?{allowStacking:false}:type==='moveTo'?{steps:1,target:'current',patrolId:null}:{action:'switchState',eligibleAssetIds:[],stateKey:'',stateEnabled:true})});
    $('#add-behaviour').onclick=()=>{read();draft.push(make(isParameter(asset)?'expand':'moveTo'));render();};
    $('#behaviour-cards').onclick=e=>{
      const card=e.target.closest('[data-behaviour]');if(!card)return;
      if(e.target.closest('[data-remove-behaviour]')){read();draft.splice(draft.findIndex(b=>b.id===card.dataset.behaviour),1);render();}
      const shift=e.target.closest('[data-shift]');if(shift){read();const n=draft.findIndex(b=>b.id===card.dataset.behaviour),to=n+Number(shift.dataset.shift);[draft[n],draft[to]]=[draft[to],draft[n]];render();}
    };
    $('#behaviour-cards').onchange=e=>{
      const field=e.target.dataset.b;
      if(!['type','action','eligible','targetType','moveMode'].includes(field))return;
      // Read the old form before replacing controls with the new settings.
      read();const card=e.target.closest('[data-behaviour]'),n=draft.findIndex(b=>b.id===card.dataset.behaviour),b=draft[n];
      if(field==='type')draft[n]={...make(e.target.value),id:b.id,enabled:b.enabled};
      if(field==='action'){b.action=e.target.value;if(b.action==='switchState'){b.stateKey='';b.stateEnabled=true;}if(b.action==='setMoveTarget')b.moveTarget={type:'self'};}
      render();
    };
    $('#behaviour-form').onsubmit=e=>{
      e.preventDefault();read();
      const current=getProject().assets.find(a=>a.id===asset.id);
      // A local order edit also updates the project-wide resolution tool.
      const order=orderedBehaviours(getProject()).map(r=>r.behaviour.id),oldIds=new Set((current?.behaviours||[]).map(b=>b.id));
      const remaining=[],replacement=draft.map(b=>b.id);let n=0,last=-1;
      for(const id of order){if(oldIds.has(id)){if(n<replacement.length)remaining.push(replacement[n++]);last=remaining.length;}else remaining.push(id);}
      remaining.splice(last<0?remaining.length:last,0,...replacement.slice(n));
      if(!current){toast('This definition was removed.');return;}
      // Use model actions to synchronize reusable parameters, then persist a
      // single action so collaborators' unrelated changes are retained.
      if(dispatch({type:'behaviour.configure',data:{id:asset.id,behaviours:draft,ids:remaining}})===false)return;
      closeDialog();
    };
    render();watchEditor($('#behaviour-form'),()=>draft);
  }
  function order(){
    const rows=orderedBehaviours(getProject()),ids=rows.map(r=>r.behaviour.id);
    showDialog(modal('Behaviour resolution order',`<form id="behaviour-order-form"><p>Top to bottom, across every level. Each behaviour resolves for placements in their saved order. States and positions are checked as each action runs. New copies wait until the next turn.</p><div id="behaviour-order-list"></div><div class="modal-footer"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save order</button></div></form>`));
    const render=()=>{$('#behaviour-order-list').innerHTML=ids.map((id,n)=>{const {asset,behaviour:b}=rows.find(r=>r.behaviour.id===id);return `<div class="behaviour-order-row"><span class="order-number">${n+1}</span><span><strong>${behaviourNames[b.type]}${b.action?` · ${effectActions[b.action]}`:''}</strong><small>${esc(asset.name)}${b.enabled?'':' · disabled'}${asset.parameterId?' · shared':''}</small></span><button type="button" data-order="${n}" data-delta="-1" ${n===0?'disabled':''} aria-label="Move ${esc(asset.name)} behaviour up">↑</button><button type="button" data-order="${n}" data-delta="1" ${n===ids.length-1?'disabled':''} aria-label="Move ${esc(asset.name)} behaviour down">↓</button></div>`;}).join('')||'<p>No behaviours yet. Select a token or effect, then choose Behaviours.</p>';};
    $('#behaviour-order-list').onclick=e=>{const button=e.target.closest('[data-order]');if(!button)return;const from=Number(button.dataset.order),to=from+Number(button.dataset.delta);[ids[from],ids[to]]=[ids[to],ids[from]];render();};
    $('#behaviour-order-form').onsubmit=e=>{e.preventDefault();if(dispatch({type:'behaviour.order',data:{ids}})!==false)closeDialog();};
    render();watchEditor($('#behaviour-order-form'),()=>ids);
  }
  function target(instance){
    showDialog(modal('Set current move target',`<form id="move-target-form">${targetFields(instance.moveTarget||{type:'self'})}<p>Self means stay here. Move To behaviours using Current Move Target read this placement's target at the beginning of each turn.</p><div class="modal-footer"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Set target</button></div></form>`));
    const form=$('#move-target-form');
    form.onchange=e=>{if(e.target.dataset.b==='targetType'){const target=readTarget(form);form.innerHTML=targetFields(target)+'<p>Self means stay here.</p><div class="modal-footer"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Set target</button></div>';}};
    form.onsubmit=e=>{e.preventDefault();if(dispatch({type:'instance.update',data:{levelId:getLevel().id,id:instance.id,moveTarget:readTarget(form)}})!==false)closeDialog();};
    watchEditor(form);
  }
  return {edit,order,target};
}
