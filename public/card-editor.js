import {validateDeck, deckIcon} from './cards-catalog.js';
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let decks=[],originals=[],deckId='experiments',selectedId=null,canEdit=false,saving=false;
const deck=()=>decks.find(d=>d.id===deckId);
const dirty=()=>JSON.stringify(deck())!==JSON.stringify(originals.find(d=>d.id===deckId));
const status=message=>{$('#studio-status').textContent=message;};
function saveState(){
  $('#studio-save').disabled=!canEdit||saving||!dirty();
  $('#studio-save').textContent=saving?'Saving…':'Save inventory';
}
function preview(){
  const card=deck()?.cards.find(c=>c.id===selectedId);if(!card)return;
  $('#card-preview').innerHTML=`<div class="eyebrow">${esc(deck().name)}</div><strong>${esc(card.title||'Untitled card')}</strong><p>${esc(card.task||'Your task will appear here.')}</p><div class="card-reflection"><span>REFLECT</span>${esc(card.reflection)}</div>`;
  saveState();
}
function render(){
  const current=deck();if(!current)return;
  $('#studio-decks').innerHTML=decks.map(d=>`<button data-studio-deck="${d.id}" aria-pressed="${d.id===deckId}">${deckIcon(d.id)}${esc(d.name)}</button>`).join('');
  $('#studio-source').textContent=`cards/${current.id}.json`;
  $('#studio-count').textContent=current.cards.length;
  $('#studio-add').disabled=!canEdit||saving;
  if(!current.cards.some(c=>c.id===selectedId))selectedId=current.cards[0]?.id;
  $('#studio-list').innerHTML=current.cards.map((card,index)=>`<button data-card-id="${esc(card.id)}" aria-pressed="${card.id===selectedId}"><span>${String(index+1).padStart(2,'0')}</span><span class="studio-card-title">${esc(card.title)}</span></button>`).join('')||'<p>No cards yet. Add the first prompt.</p>';
  const card=current.cards.find(c=>c.id===selectedId);
  $('#studio-detail').innerHTML=card?`<article id="card-preview" class="design-card ${deckId}"></article><form id="card-edit-form"><fieldset ${!canEdit||saving?'disabled':''}><div class="field"><label for="card-title">Title</label><input id="card-title" maxlength="120" required value="${esc(card.title)}"></div><div class="field"><label for="card-task">Task</label><textarea id="card-task" maxlength="2000" rows="4" required>${esc(card.task)}</textarea></div><div class="field"><label for="card-reflection">Reflection prompt</label><textarea id="card-reflection" maxlength="1000" rows="2">${esc(card.reflection)}</textarea></div><details><summary>Stable card ID</summary><div class="field"><label for="card-id">ID · lowercase letters, numbers, and hyphens</label><input id="card-id" maxlength="80" pattern="[a-z0-9-]+" required value="${esc(card.id)}"><small>Keep an existing ID to preserve its drawn status in rooms. A new ID is treated as a new card.</small></div></details><button type="button" id="studio-remove" class="danger">Remove this card</button></fieldset></form>`:'<div class="deck-empty">An empty deck is ready for your ideas.</div>';
  if(card){
    preview();
    $('#card-edit-form').onsubmit=e=>e.preventDefault();
    for(const field of ['title','task','reflection','id'])$('#card-'+field).oninput=e=>{card[field]=e.target.value;if(field==='id')selectedId=card.id;const item=$('#studio-list').querySelector('[aria-pressed="true"]');if(item){item.dataset.cardId=card.id;item.querySelector('.studio-card-title').textContent=card.title;}preview();status('Unsaved changes — save this inventory to update future draws.');};
    $('#studio-remove').onclick=()=>{if(!confirm('Remove this card from the inventory? Save to apply the removal.'))return;current.cards=current.cards.filter(c=>c!==card);selectedId=null;render();status('Card removed locally. Save the inventory to apply.');};
  }
  saveState();
}
async function load(){
  try{const response=await fetch('/api/decks',{signal:AbortSignal.timeout(10000)});const result=await response.json();if(!response.ok)throw Error(result.error||'Could not load inventories.');decks=result.decks;originals=structuredClone(decks);canEdit=result.canEdit;
    $('#studio-access').textContent=canEdit?'You are editing the repository files on this host. Changes apply to future draws in all rooms.':'Review mode. To edit, open this page using localhost on the computer running the workshop server.';
    render();status('Inventories loaded. Choose a card to review it.');
  }catch(error){status(error.message);}
}
$('#studio-decks').onclick=e=>{const button=e.target.closest('[data-studio-deck]');if(!button||saving)return;if(dirty()&&!confirm('Discard unsaved changes in this deck?'))return;if(dirty())decks=decks.map(d=>d.id===deckId?structuredClone(originals.find(o=>o.id===deckId)):d);deckId=button.dataset.studioDeck;selectedId=null;render();status('Choose a card to review or edit.');};
$('#studio-list').onclick=e=>{const button=e.target.closest('[data-card-id]');if(button&&!saving){selectedId=button.dataset.cardId;render();}};
$('#studio-add').onclick=()=>{const card={id:'custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6),title:'Your new card',task:'Describe a clear task for the designers.',reflection:'What did you learn?'};deck().cards.push(card);selectedId=card.id;render();$('#card-title').focus();status('New card added locally. Save the inventory to apply.');};
$('#studio-reload').onclick=()=>{if(saving)return;if(dirty()&&!confirm('Discard unsaved edits and reload inventories?'))return;load();};
$('#studio-save').onclick=async()=>{
  try{if(saving||!canEdit)return;validateDeck(deck(),deckId);saving=true;render();status('Saving repository inventory…');
    const response=await fetch('/api/decks/'+deckId,{method:'PUT',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),body:JSON.stringify({deck:deck(),original:originals.find(d=>d.id===deckId)})});const result=await response.json();if(!response.ok)throw Error(result.error||'Could not save inventory.');
    originals=originals.map(d=>d.id===deckId?structuredClone(result.deck):d);localStorage.setItem('design-card-cache',JSON.stringify(decks));status('Inventory saved. Workshop card caches have been updated.');
  }catch(error){status(error.message);}finally{saving=false;render();}
};
window.addEventListener('beforeunload',e=>{if(decks.length&&dirty()){e.preventDefault();e.returnValue='';}});
load();
