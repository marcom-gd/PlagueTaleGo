import {isState,assetIsActive} from './model.js';
import {behaviourNames,effectActions} from './behaviour-schema.js';

const colors={expand:'#668b4b',spawn:'#559a65',addToTray:'#987250',applyEffect:'#8e66b4',moveTo:'#4b87b5',moveAway:'#bf8246',wait:'#8b805a',blockNode:'#b85e58',useEffect:'#43958b',throwObject:'#bb8a42',distraction:'#c57252',teleport:'#786bc4',advanceOnEvent:'#ae7092'};
export const behaviourColor=behaviour=>({gameOver:'#b85e58',levelComplete:'#559a65',pickUp:'#987250',lifetime:'#c48238',onHit:'#ae6659'}[behaviour.type]||colors[behaviour.type]||'#668b4b');
export const gearIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9.5 3-.7 2.3-1.5.9L5 5.6 2.5 10l1.6 1.7v1.7L2.5 15 5 19.4l2.3-.6 1.5.9.7 2.3h5l.7-2.3 1.5-.9 2.3.6 2.5-4.4-1.6-1.6v-1.7L21.5 10 19 5.6l-2.3.6-1.5-.9L14.5 3z"/><circle cx="12" cy="12.5" r="3.2"/></svg>';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Use the same compact representation in the catalog, object tree and inspector.
export function behaviourChip(project,b,{assetId=null,definition=null,catalog=false,play=false,hierarchy=false}={}){
  const shared=definition||project.behaviourLibrary?.find(d=>d.id===b.definitionId);
  const label=shared?.name||behaviourNames[b.type],color=shared?.color||behaviourColor(b);
  const action=shared?`data-edit-behaviour-block="${esc(shared.id)}"`:assetId?`data-edit-asset-behaviours="${esc(assetId)}"`:'';
  const description=[behaviourNames[b.type],b.trigger&&behaviourNames[b.trigger.type],(b.trigger?.action||b.action)&&effectActions[b.trigger?.action||b.action],shared?.rule,!b.enabled&&'Disabled'].filter(Boolean).join(' · ');
  return `<button type="button" class="behaviour-chip ${b.enabled?'':'behaviour-disabled'}" style="--behaviour-color:${color}" ${hierarchy?`data-behaviour-usage="${esc(b.id)}" data-behaviour-source="${esc(assetId)}" draggable="${!play}"`:''} ${catalog?`data-behaviour-block="${esc(shared.id)}" draggable="${!play}"`:action} title="${esc(description+(hierarchy&&!play?' · Drag to move or reorder':''))}" aria-label="${esc(catalog?'Edit reusable behaviour '+label:label+(b.enabled?'':' · disabled'))}">${gearIcon}<span>${esc(label)}</span>${!b.enabled?'<small>off</small>':''}</button>`;
}

// A child enters the summary through a state-bearing branch. Once inside a
// state, keep parameter paths too, so the state's actual logic is visible.
export function behaviourHierarchy(project,rootId,instance=null,{includeEmpty=false}={}){
  const children=new Map();
  for(const a of project.assets){if(!children.has(a.parentId))children.set(a.parentId,[]);children.get(a.parentId).push(a);}
  const hasLogic=a=>(a.behaviours?.length||0)>0||(children.get(a.id)||[]).some(hasLogic);
  const hasStates=a=>isState(a)||(children.get(a.id)||[]).some(hasStates);
  const visit=(a,inState)=>({asset:a,active:assetIsActive(project,a.id,instance),children:(children.get(a.id)||[]).filter(c=>(includeEmpty||hasLogic(c))&&(inState||hasStates(c))).map(c=>visit(c,inState||isState(c)))});
  const root=project.assets.find(a=>a.id===rootId);
  return root?visit(root,isState(root)):null;
}
