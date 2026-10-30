import {clone,isState,isParameter} from './model.js';

export function startingInventoryEditor({root,getProject,initial=[],esc,label=a=>a.name}){
  let draft=clone(initial);
  const objects=()=>getProject().assets.filter(a=>!isState(a)&&!isParameter(a));
  const read=()=>[...root.querySelectorAll('[data-start-row]')].map(row=>({assetId:row.querySelector('[data-start-object]').value,count:Number(row.querySelector('[data-start-count]').value)}));
  const render=()=>{
    const available=objects();
    root.innerHTML=`<h3>Player’s starting inventory</h3><p>Loaded when Playtest starts from this level. Changing level tabs keeps the current backpack. Starting items never advance the turn.</p><div class="starting-inventory-list">${draft.map((entry,n)=>`<div class="starting-inventory-row" data-start-row="${n}"><div class="field"><label for="starting-object-${n}">Object</label><select id="starting-object-${n}" data-start-object required>${!available.some(a=>a.id===entry.assetId)?`<option value="${esc(entry.assetId)}">Missing object</option>`:''}${available.filter(a=>a.id===entry.assetId||!draft.some(row=>row.assetId===a.id)).map(a=>`<option value="${esc(a.id)}" ${a.id===entry.assetId?'selected':''}>${esc(label(a))}</option>`).join('')}</select></div><div class="field"><label for="starting-count-${n}">Quantity · 0 = ∞</label><input id="starting-count-${n}" data-start-count type="number" min="0" max="1000" value="${entry.count}" required></div><button type="button" data-remove-start="${n}" aria-label="Remove starting inventory item ${n+1}">×</button></div>`).join('')||'<p class="muted">The player starts with an empty backpack.</p>'}</div><button type="button" data-add-start ${available.every(a=>draft.some(row=>row.assetId===a.id))?'disabled':''}>＋ Add inventory object</button><small>0 supplies unlimited copies. Up to 1,000 starting items; an infinite stack counts as one.</small>`;
  };
  root.addEventListener('click',event=>{
    const add=event.target.closest('[data-add-start]'),remove=event.target.closest('[data-remove-start]');
    if(!add&&!remove)return;draft=read();
    if(add){const object=objects().find(a=>!draft.some(row=>row.assetId===a.id));if(object)draft.push({assetId:object.id,count:1});}
    if(remove)draft.splice(Number(remove.dataset.removeStart),1);
    render();
  });
  root.addEventListener('change',event=>{if(event.target.matches('[data-start-object]')){draft=read();render();}});
  render();return {read};
}
