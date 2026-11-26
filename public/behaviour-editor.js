import {clone,uid,isParameter,isState,parameterDefinition} from './model.js';
import {behaviourNames,effectActions,turnEvents,eligibilityMode,triggerBehaviours,maxWaitTurns} from './behaviour-schema.js';
import {orderedBehaviours} from './behaviours.js';
import {behaviourChip,behaviourColor} from './behaviour-ui.js';
const colorPresets=[['#e89750','Orange'],['#5088dd','Blue'],['#75ad82','Green'],['#d66565','Red'],['#b281cf','Purple'],['#e5c359','Yellow'],['#55b5b2','Teal'],['#dc87b1','Pink']];

export function behaviourEditor({getProject,getLevel,isPlay,dispatch,showDialog,modal,closeDialog,watchEditor,esc,toast,assetPath}) {
  const $=s=>document.querySelector(s);
  const options=(values,current)=>Object.entries(values).map(([key,name])=>`<option value="${esc(key)}" ${key===current?'selected':''}>${esc(name)}</option>`).join('');
  const objects=()=>getProject().assets.filter(a=>!isState(a)&&!isParameter(a));
  const canvasObjects=()=>getLevel().instances.filter(i=>objects().some(a=>a.id===i.assetId));
  const objectChoices=current=>{
    const choices=canvasObjects();
    return `${current&&!choices.some(i=>i.id===current)?`<option value="${esc(current)}" selected>Missing object · ${esc(current)}</option>`:''}`+choices.map(i=>`<option value="${esc(i.id)}" ${i.id===current?'selected':''}>${esc(getProject().assets.find(a=>a.id===i.assetId)?.name)} · ${i.x+1}, ${i.y+1} · ${esc(i.id.slice(0,5))}</option>`).join('');
  };
  function targetFields(target={type:'self'}) {
    return `<div class="field"><label>Move target<select data-b="targetType">${options({self:'Self (the object carrying this effect)',position:'Custom position',object:'Other object in the canvas',tags:'Objects with tags'},target.type)}</select></label></div>${target.type==='position'?`<div class="field-row"><label>Column (1–32)<input data-b="x" type="number" min="1" max="32" value="${(target.x??0)+1}" required></label><label>Row (1–24)<input data-b="y" type="number" min="1" max="24" value="${(target.y??0)+1}" required></label></div>`:''}${target.type==='tags'?tagSelection('move-tags',target.tagIds)+'<small>Tracks the nearest active matching object each time movement runs. Ties use saved placement order; Self is excluded.</small>':''}${target.type==='object'?`<div class="field"><label>Canvas object<select data-b="objectId" required><option value="">Choose an object…</option>${objectChoices(target.id)}</select></label><small>Objects are specific placements on this level. A missing target causes no movement.</small></div>`:''}`;
  }
  const readTarget=root=>{
    const value=key=>root.querySelector(`[data-b="${key}"]`)?.value;
    return value('targetType')==='tags'?{type:'tags',tagIds:checked(root,'move-tags')}:value('targetType')==='position'?{type:'position',x:Number(value('x')??1)-1,y:Number(value('y')??1)-1}:value('targetType')==='object'?{type:'object',id:value('objectId')||''}:{type:'self'};
  };
  const typeSelection=(name,selected)=>`<div class="eligible-objects">${objects().map(a=>`<label class="check-row"><input type="checkbox" name="${name}" value="${esc(a.id)}" ${selected?.includes(a.id)?'checked':''}> ${esc(assetPath(a))}</label>`).join('')||'<p>Create tokens first.</p>'}</div><small>An empty selection matches nothing.</small>`;
  const checked=(root,name)=>[...root.querySelectorAll('[name="'+name+'"]:checked')].map(input=>input.value);
  const tagSelection=(name,selected=[])=>'<div class="eligible-objects">'+getProject().tags.map(t=>'<label class="check-row"><input type="checkbox" name="'+name+'" value="'+esc(t.id)+'" '+(selected.includes(t.id)?'checked':'')+'> '+esc(t.name)+'</label>').join('')+'</div><small>Matches any selected tag on the object or its active contents. Empty selection matches nothing.</small>';
  const field=(label,key,choices,current)=>`<div class="field"><label>${label}<select data-b="${key}">${options(choices,current)}</select></label></div>`;
  const coordinates=(xKey,yKey,target)=>`<div class="field-row"><label>Column (1–32)<input data-b="${xKey}" type="number" min="1" max="32" value="${(target?.x??0)+1}" required></label><label>Row (1–24)<input data-b="${yKey}" type="number" min="1" max="24" value="${(target?.y??0)+1}" required></label></div>`;
  const destinationFields=(destination={type:'position',x:0,y:0})=>field('Teleport destination','destinationType',{position:'Specific cell',linked:'Linked object',object:'Selected canvas object',tags:'Objects with tags'},destination.type)+(destination.type==='tags'?tagSelection('destination-tags',destination.tagIds)+'<small>Uses the nearest active matching object, excluding the piece being teleported. Ties use saved placement order.</small>':destination.type==='position'?coordinates('destinationX','destinationY',destination):`<div class="field"><label>${destination.type==='linked'?'Linked destination':'Destination object'}<select data-b="destinationId" ${destination.type==='object'?'required':''}><option value="">${destination.type==='linked'?'First linked object in saved link order':'Choose an object…'}</option>${objectChoices(destination.id)}</select></label>${destination.type==='linked'?'<small>Must be directly linked to the object being teleported. It can share the destination object’s cell.</small>':''}</div>`);
  const readDestination=root=>{
    const value=key=>root.querySelector(`[data-b="${key}"]`)?.value,type=value('destinationType');
    return type==='tags'?{type,tagIds:checked(root,'destination-tags')}:type==='position'?{type,x:Number(value('destinationX')??1)-1,y:Number(value('destinationY')??1)-1}:{type,id:value('destinationId')||(type==='linked'?null:'')};
  };
  const flushFields=b=>field('Max flush reach','flushReachMode',{infinite:'Infinite',limited:'Limited'},b.flushReach==null?'infinite':'limited')
    +(b.flushReach==null?'':`<div class="field"><label>Maximum continuous cells<input data-b="flushReach" type="number" min="1" max="768" value="${b.flushReach}" required></label></div>`)
    +'<p>Counts continuous cells from each initially caught cell, including that cell. 1 reaches only initially caught cells; 2 adds one adjacent step. Infinite keeps spreading until a gap or effect blocker.</p>'
    +`<div class="field"><label>Preserve first N cells<input data-b="flushPreserve" type="number" min="0" max="768" value="${b.flushPreserve??0}" required></label><small>0 removes every reached object. 1 keeps all objects on each initially caught cell. Preserved cells still carry the flush onward. Larger values preserve that many continuous cells from the nearest initial catch, including branches and stacks. Preserved cells count toward Max flush reach.</small></div>`;
  const actionFields=b=>field('Action','action',effectActions,b.action)+(b.action==='switchState'?`<div class="field"><label>Desired state or key<input data-b="stateKey" list="behaviour-states" maxlength="100" value="${esc(b.stateKey)}" required></label><small>Choose a state ID or type a state name to match each target’s hierarchy. Unavailable states are skipped.</small></div>${field('Switch','stateEnabled',{true:'Enable state',false:'Disable state',toggle:'Toggle mutually exclusive states'},b.stateToggle?'toggle':String(b.stateEnabled))}${'<small>Toggle cycles through the selected state’s mutually exclusive siblings in their saved order. With two states, each application switches to the other. The chosen state identifies the group and is enabled first if none is active. Non-exclusive groups are skipped.</small>'}`:b.action==='setMoveTarget'?targetFields(b.moveTarget):b.action==='teleport'?destinationFields(b.destination):b.action==='flush'?flushFields(b):'');
  function behaviourFields(b,triggered=false){
    if(b.type==='spawn')return `<div class="field"><label>Object to spawn<select data-b="spawnAssetId" required><option value="">Choose an object…</option>${b.spawnAssetId&&!objects().some(a=>a.id===b.spawnAssetId)?`<option value="${esc(b.spawnAssetId)}" selected>Missing object · ${esc(b.spawnAssetId)}</option>`:''}${objects().map(a=>`<option value="${esc(a.id)}" ${a.id===b.spawnAssetId?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label></div><div class="field"><label>Copies per ${triggered?'use':'turn'}<input data-b="spawnCount" type="number" min="1" max="100" value="${b.spawnCount}" required></label></div><p>Creates the chosen object at ${triggered?'each target’s':'the parent placement’s'} cell, allowing stacks. Uses the chosen definition’s default states, not the source’s states. New objects act next turn; later effects this turn can affect them. Put Spawn after Flush to keep the new object out of that flush.</p>`;
    if(b.type==='addToTray')return field('Destination','tray',{graveyard:'Graveyard',inventory:'Player inventory'},b.tray)+`<p>Moves ${triggered?'each chosen target':'the object carrying this behaviour'} into the chosen tray, preserving its individual states. Put this last if the object must flush or spawn first.</p>`;
    if(b.type==='wait')return `<div class="field"><label>Turns to wait<input data-b="turns" type="number" min="1" max="${maxWaitTurns}" value="${b.turns}" required></label></div><p>Delays this placement’s later turn behaviours for this many turns. Put Wait before the behaviour you want to delay. Under a state, the countdown starts again each time the state becomes active.</p>`;
    if(b.type==='moveAway')return `<div class="field"><label>Free nodes per ${triggered?'use':'turn'}<input data-b="steps" type="number" min="1" max="100" value="${b.steps}" required></label></div><p>Move away from the Current Move Target. Set a position or canvas object as the placement’s move target. Each step must increase grid distance from that target. Missing targets and Self cause no movement.</p><small>Follows free connected nodes, respecting Block Node, broken connections, occupied cells, locks and Auto-facing. Ties use Up, Right, Down, Left order.</small>`;
    if(b.type==='expand')return `<p>Copy the placed hierarchy onto highlighted path nodes. New copies act next turn.</p><label class="check-row"><input data-b="allowStacking" type="checkbox" ${b.allowStacking?'checked':''}> Allow copies where this object type is already present</label>`;
    if(b.type==='applyEffect')return triggered?actionFields(b):field('Eligible objects','eligible',{any:'Any object type in area',selected:'Selected object types in area',linked:'Linked Object(s)',tags:'Objects with tags in area'},eligibilityMode(b))+(eligibilityMode(b)==='tags'?tagSelection('eligible-tags',b.eligibleTagIds):eligibilityMode(b)==='selected'?typeSelection('eligible-object',b.eligibleAssetIds)+(['switchState','graveyard','inventory','flush'].includes(b.action)?'<small>Selected nested objects are targeted at their carrier’s cell.</small>':''):eligibilityMode(b)==='linked'?'<p>Affects objects directly linked to the parent placement. Links bypass the area’s range; effect blockers still apply.</p>':'')+actionFields(b);
    if(b.type==='useEffect'){
      const mode=b.usableMode??(b.usableAssetIds===null?'any':'selected'),trigger=b.trigger||{...b,type:'applyEffect'};
      return field('Usable objects','usableMode',{any:'Any object type in range',selected:'Selected object types',tags:'Objects with tags in range'},mode)+(mode==='tags'?tagSelection('usable-tags',b.usableTagIds):mode==='selected'?typeSelection('usable-object',b.usableAssetIds):'')+field('Trigger on','useTarget',{used:'Clicked usable object',linked:'Clicked object’s Linked Object(s)',tags:'Objects with tags'},b.useTarget)+(b.useTarget==='tags'?tagSelection('use-target-tags',b.targetTagIds):'')+field('Behaviour to trigger','triggerType',triggerBehaviours,trigger.type)+'<div data-trigger-settings>'+behaviourFields(trigger,true)+'</div><p>Click the hand badge during Playtest to run this behaviour once on the chosen targets. Apply Effect acts directly on these targets. Expand uses this parameter’s area centered on each target. Passive blockers and turn events are configured separately.</p>';
    }
    if(b.type==='blockNode')return field('Block for','blockMode',{any:'All objects',selected:'Selected object types',tags:'Objects with tags'},b.blockMode??(b.blockAssetIds===null?'any':'selected'))+(b.blockMode==='tags'?tagSelection('block-tags',b.blockTagIds):b.blockAssetIds===null?'':typeSelection('block-object',b.blockAssetIds))+field('Blocks','blockScope',{movement:'Movement only',movementAndEffects:'Movement and other effects'},b.blockScope)+`<label class="check-row"><input data-b="excludeSelf" type="checkbox" ${b.excludeSelf?'checked':''}> Exclude Self</label><small>Only this parent placement ignores its own blocker. Other copies and blockers still apply.</small>`+'<p>Passive while active. Highlighted nodes block the chosen objects’ movement. Also blocking effects makes these nodes act like walls for effects cast by those objects, stopping cells on and beyond them.</p>';
    if(b.type==='teleport')return field('Object to teleport','teleportTarget',{self:'Self (parent placement)',object:'Selected canvas object',tags:'All objects with tags'},b.teleportTarget)+(b.teleportTarget==='tags'?tagSelection('teleport-tags',b.targetTagIds):b.teleportTarget==='object'?`<div class="field"><label>Object<select data-b="teleportObject" required><option value="">Choose an object…</option>${objectChoices(b.targetInstanceId)}</select></label></div>`:'')+destinationFields(b.destination)+`<small>${triggered?'Runs when used.':'Runs at turn start.'} Skips locked objects, walls, out-of-bounds cells and blocked destinations. Teleport can share a destination object’s cell.</small>`;
    if(b.type==='advanceOnEvent')return `<p>Advance when any selected event occurs to this parent placement:</p>${Object.entries(turnEvents).map(([key,name])=>`<label class="check-row"><input type="checkbox" name="advance-event" value="${key}" ${b.events.includes(key)?'checked':''}> ${name}</label>`).join('')}<p>Dragging/dropping and arrow-key moves both count. Each user action advances once. Actions performed by turn resolution do not start another turn.</p>`;
    return `<div class="field"><label>Free nodes per ${triggered?'use':'turn'}<input data-b="steps" type="number" min="1" max="100" value="${b.steps}" required></label></div>${field('Move towards','moveMode',{current:'Current Move Target',patrolStart:'Patrol · Start first',patrolEnd:'Patrol · End first'},b.target)}${b.target!=='current'?field('Patrol mode','patrolMode',{pingPong:'Ping-pong',loop:'Loop'},b.patrolMode||'pingPong')+`<div class="field"><label>Patrol<select data-b="patrolId"><option value="">Match placement’s patrol color dot</option>${getProject().levels.flatMap(l=>l.patrols.map(p=>`<option value="${esc(p.id)}" ${p.id===b.patrolId?'selected':''}>${esc(l.name)} / ${esc(p.name)}</option>`)).join('')}</select></label></div><p>Ping-pong reverses along the route at each end. Loop follows the route in one direction, then takes a shortest free connected path back to the first endpoint. Adjacent connected endpoints close the loop in one step.</p>`:''}<small>Follows free connected path nodes. Respects Block Node, broken connections and scenery locks.</small>`;
  }
  function edit(assigned,blockMode=false){
    if(isPlay())return;
    const asset=blockMode?assigned:parameterDefinition(getProject(),assigned),draft=clone(asset.behaviours||[]);
    for(const b of draft)if(b.type==='useEffect'&&!b.trigger&&!b.definitionId){b.trigger={...clone(b),id:uid(),type:'applyEffect',eligibleMode:'any',eligibleAssetIds:null};for(const key of ['definitionId','usableAssetIds','usableMode','usableTagIds','useTarget','targetTagIds'])delete b.trigger[key];for(const key of ['action','stateKey','stateEnabled','stateToggle','moveTarget','destination','flushReach','flushPreserve'])delete b[key];}
    let blockColor=asset.color?.toLowerCase()||null;
    showDialog(modal(`${blockMode?'Reusable behaviour':'Behaviours'} · ${asset.name}`,`<form id="behaviour-form">${blockMode?`<div class="field"><label>Name<input id="behaviour-block-name" maxlength="80" value="${esc(asset.name)}" required></label></div><div class="field"><label>Description<textarea id="behaviour-block-rule" maxlength="4000">${esc(asset.rule||'')}</textarea></label></div><p>Saved in Atomic Parameters → Behaviours. Changes update every attached use. Area behaviours can only attach to parameters.</p>`:'<p>Configure turn actions, passive blockers, clickable Use actions and turn events. Behaviours inside inactive states stay silent. Effect settings update every attached use.</p>'}<p><a class="behaviour-guide-link" href="/behaviour-guide.html" target="_blank" rel="noopener">Open the Behaviour Guide ↗ <span>(new tab)</span></a></p><div id="behaviour-cards"></div><button type="button" id="add-behaviour" ${blockMode?'hidden':''}>＋ Add behaviour</button><p id="behaviour-error" role="alert"></p><div class="modal-footer">${blockMode&&getProject().behaviourLibrary?.some(b=>b.id===asset.id)?'<button type="button" id="delete-behaviour-block" class="danger">Delete block</button>':''}<button type="button" data-close>Cancel</button><button class="primary" type="submit">${blockMode?'Save block':'Save behaviours'}</button></div></form>`));
    if(blockMode){
      $('#behaviour-block-rule').closest('.field').insertAdjacentHTML('afterend',`<div class="field"><div class="field-label">Chip color</div><div class="patrol-colors behaviour-colors" role="group" aria-label="Behaviour chip color"><button type="button" class="behaviour-type-color" data-behaviour-color="" aria-pressed="false">By behaviour type</button>${colorPresets.map(([value,name])=>`<button type="button" class="patrol-color-swatch" data-behaviour-color="${value}" style="--patrol-swatch:${value}" aria-label="${name} behaviour color" aria-pressed="false" title="${name}"></button>`).join('')}<label class="patrol-custom-color" id="behaviour-custom-picker" title="Choose a custom behaviour color"><span aria-hidden="true">＋</span><input type="color" id="behaviour-block-color" aria-label="Custom behaviour color" value="${blockColor||behaviourColor(draft[0])}"></label></div><div class="behaviour-block-preview" id="behaviour-block-preview" aria-label="Behaviour preview"></div></div>`);
      $('.behaviour-colors').addEventListener('click',e=>{const preset=e.target.closest('[data-behaviour-color]');if(preset){blockColor=preset.dataset.behaviourColor||null;renderBlockPreview();}});
      $('#behaviour-block-color').addEventListener('input',e=>{blockColor=e.target.value.toLowerCase();renderBlockPreview();});
      $('#behaviour-block-name').addEventListener('input',renderBlockPreview);
    }
    function renderBlockPreview(){
      if(!blockMode)return;
      const color=$('#behaviour-block-color');color.value=blockColor||behaviourColor(draft[0]);
      for(const button of $('.behaviour-colors').querySelectorAll('[data-behaviour-color]'))button.setAttribute('aria-pressed',String((button.dataset.behaviourColor||null)===blockColor));
      const picker=$('#behaviour-custom-picker');picker.style.setProperty('--patrol-swatch',color.value);picker.classList.toggle('selected',!!blockColor&&!colorPresets.some(([value])=>value===blockColor));
      $('#behaviour-block-preview').innerHTML=behaviourChip(getProject(),draft[0],{definition:{...asset,name:$('#behaviour-block-name').value||'New behaviour',color:blockColor||undefined}});
      const chip=$('#behaviour-block-preview button');chip.disabled=true;chip.removeAttribute('data-edit-behaviour-block');
    }
    function readBehaviour(card,b){
      const value=key=>card.querySelector('[data-b="'+key+'"]')?.value,selected=name=>checked(card,name);
      if(b.type==='expand')b.allowStacking=card.querySelector('[data-b="allowStacking"]').checked;
      if(b.type==='moveTo'){b.steps=Number(value('steps'));b.target=value('moveMode');b.patrolId=value('patrolId')||null;b.patrolMode=value('patrolMode')||b.patrolMode||'pingPong';}
      if(b.type==='spawn'){b.spawnAssetId=value('spawnAssetId')||'';b.spawnCount=Number(value('spawnCount'));}
      if(b.type==='addToTray')b.tray=value('tray');
      if(b.type==='wait')b.turns=Number(value('turns'));
      if(b.type==='moveAway')b.steps=Number(value('steps'));
      if(b.type==='blockNode'){b.blockMode=value('blockMode');b.blockAssetIds=b.blockMode==='selected'?selected('block-object'):null;b.blockTagIds=selected('block-tags');b.blockScope=value('blockScope');b.excludeSelf=card.querySelector('[data-b="excludeSelf"]').checked;}
      if(b.type==='advanceOnEvent')b.events=selected('advance-event');
      if(b.type==='teleport'){b.teleportTarget=value('teleportTarget');b.targetInstanceId=value('teleportObject')||null;b.targetTagIds=selected('teleport-tags');b.destination=readDestination(card);}
      if(b.type==='useEffect'){b.usableMode=value('usableMode');b.usableAssetIds=b.usableMode==='selected'?selected('usable-object'):null;b.usableTagIds=selected('usable-tags');b.useTarget=value('useTarget');b.targetTagIds=selected('use-target-tags');readBehaviour(card.querySelector('[data-trigger-settings]'),b.trigger);}
      if(b.type==='applyEffect'){
        if(value('eligible')!==undefined){b.eligibleMode=value('eligible');b.eligibleAssetIds=b.eligibleMode==='selected'?selected('eligible-object'):null;b.eligibleTagIds=selected('eligible-tags');}
        if(b.action==='switchState'){b.stateKey=value('stateKey')?.trim()||'';b.stateToggle=value('stateEnabled')==='toggle';b.stateEnabled=value('stateEnabled')!=='false';}
        if(b.action==='setMoveTarget')b.moveTarget=readTarget(card);
        if(b.action==='teleport')b.destination=readDestination(card);
        if(b.action==='flush'){b.flushReach=value('flushReachMode')==='infinite'?null:Number(value('flushReach')??1);b.flushPreserve=Number(value('flushPreserve')??0);}
      }
    }
    const read=()=>{
      for(const card of $('#behaviour-cards').querySelectorAll('[data-behaviour]')){
        const b=draft.find(b=>b.id===card.dataset.behaviour);if(b.definitionId)continue;
        b.enabled=card.querySelector('[data-b="enabled"]').checked;readBehaviour(card,b);
      }
    };
    const render=()=>{
      const types=blockMode||isParameter(asset)?behaviourNames:{moveTo:behaviourNames.moveTo,moveAway:behaviourNames.moveAway,wait:behaviourNames.wait,spawn:behaviourNames.spawn,addToTray:behaviourNames.addToTray,teleport:behaviourNames.teleport,advanceOnEvent:behaviourNames.advanceOnEvent};
      $('#behaviour-cards').innerHTML=draft.map((b,n)=>`<fieldset class="behaviour-card" data-behaviour="${esc(b.id)}"><legend>${n+1}. ${behaviourNames[b.type]}</legend><div class="behaviour-card-heading"><label class="check-row"><input type="checkbox" data-b="enabled" ${b.enabled?'checked':''}> Enabled</label><div><button type="button" data-shift="-1" ${n===0?'disabled':''} aria-label="Move behaviour up">↑</button><button type="button" data-shift="1" ${n===draft.length-1?'disabled':''} aria-label="Move behaviour down">↓</button><button type="button" data-remove-behaviour aria-label="Remove behaviour">×</button></div></div>${field('Behaviour','type',types,b.type)}${behaviourFields(b)}</fieldset>`).join('')+`<datalist id="behaviour-states">${getProject().assets.filter(isState).map(s=>`<option value="${esc(s.id)}">${esc(getProject().assets.find(a=>a.id===s.parentId)?.name)} / ${esc(s.name)}</option>`).join('')}</datalist>`;
      $('#add-behaviour').disabled=draft.length>=30;
      for(const card of $('#behaviour-cards').querySelectorAll('[data-behaviour]')){
        const b=draft.find(b=>b.id===card.dataset.behaviour);
        if(blockMode){card.querySelector('[data-remove-behaviour]').hidden=true;card.querySelectorAll('[data-shift]').forEach(button=>button.hidden=true);}
        else if(b.definitionId){
          card.querySelectorAll('[data-b],.eligible-objects input,[name="advance-event"]').forEach(input=>input.disabled=true);
          const definition=getProject().behaviourLibrary?.find(d=>d.id===b.definitionId);
          card.insertAdjacentHTML('beforeend',`<p>Shared block: <strong>${esc(definition?.name)}</strong></p><button type="button" data-edit-shared="${esc(b.definitionId)}">Edit shared block</button>`);
        }else card.insertAdjacentHTML('beforeend','<button type="button" data-save-block>Save as reusable block</button>');
      }
      renderBlockPreview();
    };
    const make=type=>{
      const settings={expand:{allowStacking:false},spawn:{spawnAssetId:'',spawnCount:1},addToTray:{tray:'graveyard'},moveTo:{steps:1,target:'current',patrolId:null,patrolMode:'pingPong'},moveAway:{steps:1},wait:{turns:1},blockNode:{blockAssetIds:null,blockScope:'movement'},teleport:{teleportTarget:'self',targetInstanceId:null,destination:{type:'position',x:0,y:0}},advanceOnEvent:{events:['moved']},applyEffect:{action:'switchState',eligibleAssetIds:[],eligibleMode:'selected',stateKey:'',stateEnabled:true},useEffect:{usableAssetIds:[],useTarget:'used',trigger:{id:uid(),type:'applyEffect',enabled:true,action:'switchState',eligibleMode:'any',eligibleAssetIds:null,stateKey:'',stateEnabled:true}}};
      return {id:uid(),enabled:true,type,...settings[type]};
    };
    $('#add-behaviour').onclick=()=>{read();draft.push(make(isParameter(asset)?'expand':'moveTo'));render();};
    $('#behaviour-cards').onclick=e=>{
      const card=e.target.closest('[data-behaviour]');if(!card)return;
      if(e.target.closest('[data-save-block]')){
        read();const b=draft.find(b=>b.id===card.dataset.behaviour),definition={id:uid(),name:behaviourNames[b.type],rule:'',behaviour:{...clone(b),id:uid()}};
        if(dispatch({type:'behaviour.save',data:definition})!==false){
          draft[draft.findIndex(entry=>entry.id===b.id)]={...clone(definition.behaviour),id:b.id,definitionId:definition.id};render();
          toast('Block created. Save behaviours to attach its shared logic here.');
        }
        return;
      }
      const shared=e.target.closest('[data-edit-shared]');if(shared){
        // Save this form first so switching editors cannot discard pending edits.
        if($('#behaviour-form').reportValidity()){$('#behaviour-form').requestSubmit();if(!$('#dialog').open)block(getProject().behaviourLibrary?.find(d=>d.id===shared.dataset.editShared));}return;
      }
      if(e.target.closest('[data-remove-behaviour]')){read();draft.splice(draft.findIndex(b=>b.id===card.dataset.behaviour),1);render();}
      const shift=e.target.closest('[data-shift]');if(shift){read();const n=draft.findIndex(b=>b.id===card.dataset.behaviour),to=n+Number(shift.dataset.shift);[draft[n],draft[to]]=[draft[to],draft[n]];render();}
    };
    $('#behaviour-cards').onchange=e=>{
      const field=e.target.dataset.b;
      if(!['type','triggerType','action','eligible','targetType','moveMode','usableMode','useTarget','blockMode','teleportTarget','destinationType','flushReachMode'].includes(field))return;
      // Read the old form before replacing controls with the new settings.
      read();const card=e.target.closest('[data-behaviour]'),n=draft.findIndex(b=>b.id===card.dataset.behaviour),b=e.target.closest('[data-trigger-settings]')?draft[n].trigger:draft[n];
      if(field==='triggerType'){b.trigger=make(e.target.value);if(b.trigger.type==='applyEffect'){b.trigger.eligibleMode='any';b.trigger.eligibleAssetIds=null;}}
      if(field==='type')draft[n]={...make(e.target.value),id:b.id,enabled:b.enabled};
      if(field==='action'){delete b.flushReach;delete b.flushPreserve;delete b.stateToggle;b.action=e.target.value;if(b.action==='switchState'){b.stateKey='';b.stateEnabled=true;}if(b.action==='setMoveTarget')b.moveTarget={type:'self'};if(b.action==='teleport')b.destination={type:'position',x:0,y:0};}
      render();
    };
    $('#behaviour-form').onsubmit=e=>{
      e.preventDefault();read();
      if(blockMode){
        const definition={id:asset.id,name:$('#behaviour-block-name').value.trim(),rule:$('#behaviour-block-rule').value.trim(),behaviour:draft[0],...(blockColor?{color:blockColor}:{})};
        if(dispatch({type:'behaviour.save',data:definition})!==false)closeDialog();return;
      }
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
    $('#delete-behaviour-block')?.addEventListener('click',()=>{if(dispatch({type:'behaviour.delete',data:{id:asset.id}})!==false){closeDialog();toast('Block removed. Attached behaviours keep their settings.');}});
    render();watchEditor($('#behaviour-form'),()=>({draft,blockColor,name:$('#behaviour-block-name')?.value,rule:$('#behaviour-block-rule')?.value}));
  }
  function block(definition){
    const d=definition||{id:uid(),name:'New behaviour',rule:'',behaviour:{id:uid(),type:'moveTo',enabled:true,steps:1,target:'current',patrolId:null}};
    edit({...d,behaviours:[d.behaviour]},true);
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
    showDialog(modal('Set current move target',`<form id="move-target-form">${targetFields(instance.moveTarget||{type:'self'})}<p>Self means stay here. Move To approaches this target; Move Away From increases distance from it. Both read the target each turn.</p><div class="modal-footer"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Set target</button></div></form>`));
    const form=$('#move-target-form');
    form.onchange=e=>{if(e.target.dataset.b==='targetType'){const target=readTarget(form);form.innerHTML=targetFields(target)+'<p>Self means stay here.</p><div class="modal-footer"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Set target</button></div>';}};
    form.onsubmit=e=>{e.preventDefault();if(dispatch({type:'instance.update',data:{levelId:getLevel().id,id:instance.id,moveTarget:readTarget(form)}})!==false)closeDialog();};
    watchEditor(form);
  }
  return {edit,block,order,target};
}
