import { uid, clone, newProject, blankLevel, validateProject, applyAction, descendants, nodesConnected, adjacentNodes, isState, assetIsActive, activeDescendants, appearance, effectContains, effectRotation, parameterOverlay, facingDirection, stateEnabled } from './model.js';
import { sprite, iconNames, iconVariants, defaultVariant } from './icons.js';
import { initPresence } from './presence.js';
import { deckIcon } from './cards-catalog.js';
import { manipulation } from './manipulation.js';
import { floatingCanvas } from './floating-canvas.js';
import { initWorkshopProgress } from './workshop-progress.js';
import { collectItems, releaseItem } from './player-inventory.js';
const $ = s => document.querySelector(s);
// Appearance is a device preference, independent of the shared workshop.
function applyTheme(theme) {
  document.documentElement.dataset.theme=theme;
  const light=theme==='light',button=$('#theme-toggle');
  button.innerHTML=light?'☾ <span>Dark mode</span>':'☀ <span>Light mode</span>';
  button.setAttribute('aria-label',`Switch to ${light?'dark':'light'} mode`);
  document.querySelector('meta[name="theme-color"]').content=light?'#f7f3eb':'#1c231f';
}
applyTheme(document.documentElement.dataset.theme);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params = new URLSearchParams(location.search);
let room = params.get('room');
if (!/^[\w-]{1,64}$/.test(room || '')) { room = uid().slice(0,8); history.replaceState(null,'',`?room=${room}`); }
if(room!==room.toLowerCase()){room=room.toLowerCase();history.replaceState(null,'',`?room=${room}`);}
const endpoint = `/api/rooms/${room}`;
const workshopProgress = initWorkshopProgress({ endpoint, toast });
let project = newProject(), authoritative = clone(project), revision = -1, pending = [], busy = false, connected = false, serverNeedsRestart = false;
let levelId, selected = null, staged = null, tool = 'select', search = '', zoom = 1, play = null, playStart = null, historyStack = [], redoStack = [];
let playStartRevision = null;
let playerInventory=[], inventoryExpanded=false;
let dragPayload = null, showAll = false, paint = null, toastTimer, didInitialFit = false;
let notePending = null, noteTimer;
let connectionStart = null, libraryTab='objects';
let linkDraft=[];
let copiedInstance=null, canvasPointer=null, snapToNodes=false;
const postItColors=[['#f6dfa0','Yellow'],['#f4beb9','Pink'],['#bfddce','Mint'],['#bedbef','Blue'],['#d9caed','Lavender']];
let postItColor=postItColors[0][0], cardDecks=[], cardsBusy=false, activeDeck=null;
const savedLevel=()=>project.levels.find(l=>l.id===level().id);
const activePostIt=()=>selected?.type==='postIt'?savedLevel()?.postIts.find(n=>n.id===selected.id):null;
let floatingTools, editingTools;
try{snapToNodes=localStorage.getItem('workshop-snap-to-nodes')==='true';}catch{}
function duplicateInstance(source, position=null) {
  if(!source || !asset(source.assetId))return toast('The copied object is no longer available.');
  const copy={...clone(source),id:uid(),...(position||{x:Math.min(level().width-1,source.x+1),y:Math.min(level().height-1,source.y)})};
  if(dispatch({type:'instance.add',data:{levelId:level().id,instance:copy}})!==false){selected={type:'instance',id:copy.id};render();}
}
function cursorCell() {
  if(!canvasPointer)return null;
  const rect=$('#board').getBoundingClientRect(), viewport=$('#board-viewport').getBoundingClientRect();
  const {x,y}=canvasPointer;
  if(x<rect.left||x>=rect.right||y<rect.top||y>=rect.bottom||x<viewport.left||x>=viewport.right||y<viewport.top||y>=viewport.bottom)return null;
  return {x:Math.floor((x-rect.left)/rect.width*level().width),y:Math.floor((y-rect.top)/rect.height*level().height)};
}
document.addEventListener('pointermove',e=>{canvasPointer={x:e.clientX,y:e.clientY};});
document.addEventListener('dragover',e=>{canvasPointer={x:e.clientX,y:e.clientY};});
document.documentElement.addEventListener('pointerleave',()=>{canvasPointer=null;});
window.addEventListener('blur',()=>{canvasPointer=null;});
const collapsedAssets=new Set();
const level = () => (play || project).levels.find(l => l.id === levelId) || (play || project).levels[0];
const asset = id => (play || project).assets.find(a => a.id === id);
const tag = id => (play || project).tags.find(t => t.id === id);
const assetTags = a => a.tags.map(tag).filter(Boolean);
const currentProject = () => play || project;
const tokenArt = (a,i=null) => {const visual=isState(a)?a:appearance(currentProject(),a,i);return sprite(visual.icon,visual.color,visual.variant);};
const stateSwitch = (a,i=null) => `<button class="state-switch ${stateEnabled(currentProject(),a,i)?'enabled':''}" ${i?`data-state-instance="${esc(i.id)}"`:''} data-toggle-state="${esc(a.id)}" role="switch" aria-checked="${stateEnabled(currentProject(),a,i)}" aria-label="Enable state ${esc(a.name)}">${stateEnabled(currentProject(),a,i)?'On':'Off'}</button>`;
const assetPath = a => a.parentId?`${assetPath(asset(a.parentId))} / ${a.name}`:a.name;
const isParameter = a => ['area','sight','cone','rectangle'].includes(a?.icon);
const tagChip = t => `<button class="tag" data-edit-tag="${esc(t.id)}" style="--tag-color:${t.color}" title="${esc(t.rule || 'Edit tag')}">${esc(t.name)}</button>`;
const activeInstance = () => selected?.type === 'instance' ? level().instances.find(i => i.id === selected.id) : null;
const activeAsset = () => selected?.type === 'asset' ? asset(selected.id) : asset(activeInstance()?.assetId);
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3800); }
function setStatus() { $('#save-state').textContent = serverNeedsRestart ? 'Restart server to update' : !connected ? 'Reconnecting…' : pending.length || notePending ? 'Saving…' : 'All changes saved'; $('#save-state').classList.toggle('offline', !connected); }
function saveNote() {
  clearTimeout(noteTimer); const note=notePending; notePending=null;
  if(note && note.session===playStart) dispatch(note.action);
  setStatus();
}
function rebuild() {
  project = clone(authoritative);
  const keep = [];
  for (const item of pending) { try { project = applyAction(project,item.action); keep.push(item); } catch(e) { toast(e.message); } }
  pending = keep;
  if (!project.levels.some(l => l.id === levelId)) { levelId = project.levels[0].id; selected = null; }
  if (selected?.type === 'asset' && !project.assets.some(a => a.id === selected.id)) selected = null;
  if (selected?.type === 'instance' && !level().instances.some(i => i.id === selected.id)) selected = null;
  if (selected?.type === 'objectLink' && !level().objectLinks?.some(link=>link.id===selected.id)) selected = null;
  if (selected?.type === 'postIt' && !savedLevel()?.postIts.some(note=>note.id===selected.id)) selected = null;
  linkDraft=linkDraft.filter(id=>level().instances.some(i=>i.id===id));
  if (connectionStart && level().tiles[connectionStart] !== 'node') connectionStart = null;
  setStatus(); render();
}
function receive(data) {
  workshopProgress.receive(data);
  if (data.project && (data.project.version < 3 || !Array.isArray(data.project.cardDraws))) {
    serverNeedsRestart = true; connected = false; setStatus();
    toast('Restart the workshop server, then refresh to use this update.'); return;
  }
  if (data.project) serverNeedsRestart = false;
  if (data.actionId) pending = pending.filter(p => p.actionId !== data.actionId);
  if (data.project && data.revision >= revision) { authoritative = data.project; revision = data.revision; rebuild(); }
}
let events, polling = false;
function receiveUpdate(data) {
  receive(data);
  if (!didInitialFit && data.project) { didInitialFit = true; requestAnimationFrame(fitBoard); }
}
async function poll() {
  try {
    const response = await fetch(`${endpoint}?since=${revision}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Connection failed');
    receiveUpdate(await response.json());
    connected = !serverNeedsRestart; setStatus(); pump();
  } catch { connected = false; setStatus(); }
  finally { setTimeout(poll, 1500); }
}
async function connect() {
  try {
    const response = await fetch('/api/config', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Connection failed');
    polling = (await response.json()).transport === 'poll';
    if (polling) return poll();
    events = new EventSource(endpoint + '/events');
    events.onopen = () => { connected = true; setStatus(); pump(); };
    events.onerror = () => { connected = false; setStatus(); };
    events.onmessage = event => receiveUpdate(JSON.parse(event.data));
  } catch { connected = false; setStatus(); setTimeout(connect, 2000); }
}
connect();
async function pump() {
  if (busy || !pending.length || !connected) return;
  busy = true;
  const item = pending[0];
  try {
    const response = await fetch(endpoint + '/actions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(item) });
    const result = await response.json();
    if (!response.ok) {
      pending = pending.filter(p => p.actionId !== item.actionId);
      toast(result.error || 'The change could not be saved.');
      if (response.status === 409) receive(await (await fetch(endpoint)).json());
      rebuild();
    } else receive(result);
  } catch { connected = false; setStatus(); if (!polling) setTimeout(() => { connected = events?.readyState === EventSource.OPEN; pump(); setStatus(); }, 2000); }
  finally { busy = false; if (connected && pending.length) pump(); }
}
function dispatch(action, {record = true} = {}) {
  if(snapToNodes && ['instance.add','instance.update'].includes(action.type)){
    const data=action.data, item=action.type==='instance.add'?data.instance:data;
    if(item.x!==undefined || item.y!==undefined){
      const l=currentProject().levels.find(l=>l.id===data.levelId), previous=l?.instances.find(i=>i.id===data.id);
      if(l?.tiles[[item.x??previous?.x,item.y??previous?.y].join(',')]!=='node'){toast('Snap to Nodes is on. Choose an existing node.');return false;}
    }
  }
  if (serverNeedsRestart) {toast('Restart the workshop server, then refresh to use this update.');return false;}
  // Observations and deck history are shared even while pieces are playtested privately.
  if (play && !action.type.startsWith('postIt.') && !action.type.startsWith('card.')) {
    try { play = applyAction(play, action); render();return true; } catch(e) { toast(e.message);return false; }
  }
  if (revision < 0) {toast('Wait for the workshop to connect.');return false;}
  try {
    const next = applyAction(project,action);
    if (record) { historyStack.push({before:clone(project),after:clone(next)}); if (historyStack.length > 40) historyStack.shift(); redoStack = []; }
    pending.push({action,actionId:uid(),expectedRevision:revision}); project = next; setStatus(); render(); pump();return true;
  } catch(e) { toast(e.message);return false; }
}
function undo(redo = false) {
  if (play) return toast('Leave playtest to undo level edits.');
  if (pending.length || !connected) return toast('Wait until changes are saved.');
  const stack = redo ? redoStack : historyStack, item = stack.at(-1);
  if (!item) return;
  const expected = redo ? item.before : item.after;
  if (JSON.stringify(project) !== JSON.stringify(expected)) { historyStack=[]; redoStack=[]; render(); return toast('A collaborator has edited this project. Undo history has been refreshed.'); }
  stack.pop(); (redo ? historyStack : redoStack).push(item);
  dispatch({type:'project.replace',data:redo ? item.after : item.before},{record:false});
}
function render() {
  const l = level();
  $('#brand-icon').innerHTML = sprite('torch');
  $('#level-title').textContent = l.name;
  $('#snap-to-nodes').setAttribute('aria-pressed',String(snapToNodes));
  $('#snap-to-nodes').classList.toggle('active',snapToNodes);
  $('#dimensions').textContent = `${l.width} × ${l.height} GRID`;
  $('#asset-count').textContent = (play || project).assets.length + (play || project).tags.length;
  $('#token-count').textContent = `${l.instances.length} token${l.instances.length === 1 ? '' : 's'} placed`;
  $('#level-tabs').innerHTML = (play || project).levels.map((l,i) => `<button data-level="${esc(l.id)}" class="${l.id === levelId ? 'active' : ''}"><span>${String(i+1).padStart(2,'0')}</span>${esc(l.name)}</button>`).join('');
  $('#edit-mode').classList.toggle('active',!play); $('#play-mode').classList.toggle('active',!!play);
  $('#play-banner').hidden = !play; $('#tools').hidden = !!play;
  renderInventory();
  $('#create-token').disabled = !!play; $('#add-level').disabled = !!play; $('#level-settings').disabled = !!play;
  $('#undo').disabled = !historyStack.length || !!play; $('#redo').disabled = !redoStack.length || !!play;
  $('#mode-label').innerHTML = `<span class="tiny-dot"></span>${play ? 'MANUAL PLAYTEST' : 'EDITING CANVAS'}`;
  const tools = [['select','↖','Select & move · V'],['floor','▦','Paint floor · F'],['node','⊙','Paint path nodes · N'],['wall','▧','Paint walls · W'],['empty','⌫','Erase tiles · E'],['unlink','⋯','Erase connection · X'],['connect','↔','Reconnect nodes · C'],['link','⚯','Link objects · L']];
  $('#tools').innerHTML = tools.map(([id,icon,label]) => `<button data-tool="${id}" class="${tool === id && !staged ? 'active' : ''}" aria-label="${label}" data-tip="${label}" aria-pressed="${tool === id && !staged}">${icon}</button>`).join('') + `<div class="tool-separator"></div><button data-tool="overlays" class="${showAll ? 'active' : ''}" aria-label="Toggle all parameter overlays" data-tip="Show all parameters">◉</button>`;
  $('#canvas-hint').innerHTML = play ? 'Drag pieces to play. Piece changes are temporary.<br><b>Post-its and card draws stay shared and saved.</b>' : staged ? `Placing ${esc(asset(staged)?.name || 'token')}.<br><b>Click a cell to place. Esc to finish.</b>` : l.instances.length ? 'Every piece is a possibility.<br><b>Select a token to inspect its parameters.</b>' : 'An empty stage for your ideas.<br><b>Start with a token, or shape the ground.</b>';
  if (!play && ['connect','unlink'].includes(tool)) $('#canvas-hint').innerHTML = `${tool==='unlink'?'Erase a connection':'Reconnect nodes'}.<br><b>${connectionStart?'Now select an adjacent node.':'Click a line, or select two adjacent nodes.'}</b>`;
  if(tool==='link')$('#canvas-hint').innerHTML='Click objects to include them in a link.<br><b>Choose two or more, then Create link. Esc to cancel.</b>';
  let builder=$('#link-builder');
  if(!builder){builder=document.createElement('div');builder.id='link-builder';builder.className='link-builder';$('#canvas-wrap').append(builder);}
  builder.hidden=tool!=='link'||!!play;
  builder.innerHTML=`<span>${linkDraft.length} objects selected</span><button id="finish-link" ${linkDraft.length<2?'disabled':''}>Create link</button><button id="cancel-link">Cancel</button>`;
  renderBoard(); renderLibrary(); renderInspector(); editingTools?.render();
  floatingTools?.render();
  $('#post-it-tool').setAttribute('aria-pressed',String(tool==='postIt'));
  $('#post-it-colors').innerHTML=postItColors.map(([color,name])=>`<button class="note-swatch" data-note-color="${color}" style="--note-color:${color}" aria-label="${name} post-it" aria-pressed="${postItColor===color}"></button>`).join('');
  document.querySelectorAll('.deck-tools [data-deck]').forEach(button=>{const id=button.dataset.deck;button.innerHTML=`${deckIcon(id)}<span>Design ${id==='experiments'?'Experiments':'Challenges'}</span>`;});
  if(tool==='postIt')$('#canvas-hint').innerHTML='Choose a color, then click the canvas.<br><b>Post-its are shared and saved, including during playtests.</b>';
  if(activeDeck && $('#dialog').open && $('#dialog').dataset.deckView===activeDeck)renderDeckDialog();
}
function renderInventory() {
  const panel=$('#player-inventory');panel.hidden=!play;
  if(!play)return;
  panel.innerHTML=`<button id="inventory-toggle" class="inventory-header" aria-expanded="${inventoryExpanded}" aria-controls="inventory-contents" title="Player inventory · drop objects here"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 6V4a4 4 0 0 1 8 0v2M6 8 3 10v9h3m12-11 3 2v9h-3"/><rect x="6" y="6" width="12" height="16" rx="3"/><rect x="8.5" y="13" width="7" height="6" rx="1.5"/><path d="M9 10h6"/></svg><span>Player inventory</span><small>${playerInventory.length}</small><span aria-hidden="true">${inventoryExpanded?'▾':'▸'}</span></button><div id="inventory-contents" ${inventoryExpanded?'':'hidden'}><p class="inventory-hint">Drop objects here from the canvas or library. Drag them back to place.</p><ul>${playerInventory.map(i=>{const a=asset(i.assetId);return `<li><div class="inventory-item" data-inventory-item="${esc(i.id)}" draggable="true" tabindex="0" role="button" aria-label="${esc(a?.name||'Object')}: drag onto canvas">${a?tokenArt(a,i):''}<span>${esc(a?.name||'Object')}</span></div><button data-discard-inventory="${esc(i.id)}" aria-label="Remove ${esc(a?.name||'object')} from inventory" title="Remove from inventory">×</button></li>`;}).join('')}</ul>${playerInventory.length?'':'<p class="inventory-empty">Your backpack is empty.</p>'}</div>`;
}
function collectInInventory(payload) {
  if(!play)return;
  try{
    if(notePending)saveNote();
    const result=collectItems(play,playerInventory,level().id,payload);if(!result)return;
    play=result.project;playerInventory=result.inventory;selected=null;inventoryExpanded=true;render();
  }catch(error){toast(error.message);}
}
function renderBoard() {
  const l = level(), board = $('#board');
  board.style.setProperty('--cols',l.width); board.style.setProperty('--rows',l.height); board.style.setProperty('--cell',`${48*zoom}px`);
  let html = '';
  for (let y = 0; y < l.height; y++) for (let x = 0; x < l.width; x++) {
    const tile = paint?.cells.has(`${x},${y}`) ? paint.tile : l.tiles[`${x},${y}`];
    html += `<div class="cell ${tile || ''}" role="gridcell" tabindex="0" data-x="${x}" data-y="${y}" aria-label="Column ${x+1}, row ${y+1}, ${tile || 'empty'}">`;
    if (tile === 'node') html += `<span class="node-dot ${connectionStart===`${x},${y}`?'connection-start':''}"></span>`;
    html += '</div>';
  }
  const preview = {...l,tiles:{...l.tiles}};
  if (paint) for (const key of paint.cells) preview.tiles[key] = paint.tile;
  let lines = '', handles = '';
  for (const [from,tile] of Object.entries(preview.tiles)) {
    if (tile !== 'node') continue;
    const [x,y] = from.split(',').map(Number);
    for (const [nx,ny] of [[x+1,y],[x,y+1]]) {
      const to = `${nx},${ny}`;
      if (!adjacentNodes(preview,from,to)) continue;
      const connected = nodesConnected(preview,from,to), editing = !play && ['connect','unlink'].includes(tool);
      if (connected || editing) lines += `<line x1="${x+.5}" y1="${y+.5}" x2="${nx+.5}" y2="${ny+.5}" class="${connected?'':'broken'}"/>`;
      if (editing) handles += `<button class="link-handle ${ny!==y?'vertical':''}" data-link-from="${from}" data-link-to="${to}" style="--x:${(x+nx)/2+.5};--y:${(y+ny)/2+.5}" aria-label="${tool==='unlink'?'Erase':'Restore'} connection from column ${x+1}, row ${y+1} to column ${nx+1}, row ${ny+1}" title="${tool==='unlink'?'Erase':'Restore'} connection"></button>`;
    }
  }
  html += `<svg class="node-lines" viewBox="0 0 ${l.width} ${l.height}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${handles}`;
  for (const i of l.instances) {
    const a = asset(i.assetId); if (!a || !assetIsActive(currentProject(),a.id,i)) continue;
    const isSelected = selected?.type === 'instance' && (selected.id === i.id || editingTools?.isSelected(i.id));
    if (showAll || isSelected) html += overlays(a,i,l);
    const children = activeDescendants(currentProject(),a.id,i);
    const facing=facingDirection(a,i);
    const stack = l.instances.filter(n => n.x === i.x && n.y === i.y).indexOf(i);
    html += `<button class="piece ${i.locked?'scenery-locked':''} ${isSelected?'selected':''} ${tool==='link'&&linkDraft.includes(i.id)?'link-picked':''}" data-instance="${esc(i.id)}" draggable="${tool!=='link'&&!i.locked}" title="${esc(a.name)} · ${(i.rotation+(a.rotation||0))%360}°" aria-label="${esc(a.name)} at ${i.x+1}, ${i.y+1}, rotated ${(i.rotation+(a.rotation||0))%360} degrees" style="--x:${i.x};--y:${i.y};--rotation:${(i.rotation+(a.rotation||0))%360}deg;${stack ? `margin-left:${stack*5}px;margin-top:${stack*-4}px;` : ''}">${tokenArt(a,i)}${facing===null?'':`<span class="direction" data-facing="${facing}" aria-hidden="true">▴</span>`}${children.length ? `<span class="child-count">${children.length}</span>` : ''}</button>`;
  }
  board.innerHTML = html+objectLinkArtwork(l);
  $('#zoom-label').textContent = `${Math.round(zoom*100)}%`;
}
function overlays(a,i,l) {
  const effects = [a,...activeDescendants(currentProject(),a.id,i)].filter(a => ['area','sight','cone','rectangle'].includes(a.icon));
  let result = '';
  for (const effect of effects) {
    const overlay=parameterOverlay(currentProject(),a,effect,i,l);
    for(const [x,y] of overlay.cells)result += `<span class="overlay-cell" style="--x:${x};--y:${y};--overlay:${overlay.color}"></span>`;
  }
  return result;
}
function renderLibrary() {
  const p=currentProject(), library=$('#library'), tree=['objects','all'].includes(libraryTab);
  const matching=a=>!search || [a.name,a.rule,...assetTags(a).flatMap(t=>[t.name,t.rule])].join(' ').toLowerCase().includes(search);
  $('#library-tabs').innerHTML=['objects','tokens','parameters','tags','all'].map(id=>`<button role="tab" id="library-tab-${id}" aria-controls="library" aria-selected="${id===libraryTab}" data-library-tab="${id}">${id[0].toUpperCase()+id.slice(1)}</button>`).join('');
  library.setAttribute('aria-labelledby',`library-tab-${libraryTab}`);
  $('#create-token').setAttribute('aria-label',libraryTab==='tags'?'Create tag':libraryTab==='parameters'?'Create parameter':'Create token');
  const row=(a,depth=0)=>{
    const state=isState(a), visual=appearance(p,a), branch=p.assets.some(b=>b.parentId===a.id)||a.tags.length;
    return `<div class="asset-row ${depth?'child':''} ${state?'state-row':''} ${state&&!a.enabled?'state-disabled':''} ${selected?.type==='asset'&&selected.id===a.id?'active':''}" data-asset="${esc(a.id)}" draggable="${!play||!isState(a)}" style="--depth:${depth};margin-left:${Math.min(depth,8)*14}px" tabindex="0" role="button" aria-label="${esc(a.name)}, ${state?'state':isParameter(a)?'parameter':'token'}">${tree&&branch?`<button class="tree-disclosure" data-collapse-asset="${esc(a.id)}" aria-label="${collapsedAssets.has(a.id)?'Expand':'Collapse'} ${esc(a.name)}" aria-expanded="${!collapsedAssets.has(a.id)}">${collapsedAssets.has(a.id)?'▸':'▾'}</button>`:'<span class="tree-spacer"></span>'}<div class="asset-icon" style="transform:rotate(${a.rotation||0}deg)">${tokenArt(a)}</div><div class="asset-copy"><strong>${esc(a.name)}</strong><small>${state?'STATE · '+(a.enabled?'enabled':'disabled'):isParameter(a)?iconNames[a.icon]+' · '+a.range+' cells':iconVariants[visual.icon][visual.variant||defaultVariant(visual.icon)]}</small></div>${state?stateSwitch(a):`<button class="asset-place" data-rotate-asset="${esc(a.id)}" title="Rotate shared definition 90° · updates all placements" aria-label="Rotate ${esc(a.name)} 90 degrees" ${play?'disabled':''}>↻</button><button class="asset-place" data-place="${esc(a.id)}" aria-label="Place ${esc(a.name)}" ${play?'disabled':''}>＋</button>`}</div>`;
  };
  const show=(a,depth=0)=>{
    if(search&&!matching(a)&&!activeDescendants(p,a.id).some(matching))return '';
    let html=row(a,depth);
    if(collapsedAssets.has(a.id)&&!search || (isState(a)&&!a.enabled))return html;
    if(tree) {
      html+=assetTags(a).filter(t=>!search||matching(a)||[t.name,t.rule].join(' ').toLowerCase().includes(search)).map(t=>`<div class="tree-tag" style="margin-left:${(Math.min(depth,8)+1)*14+26}px">${tagChip(t)}</div>`).join('');
      html+=p.assets.filter(b=>b.parentId===a.id).map(b=>show(b,depth+1)).join('');
    }
    return html;
  };
  let roots;
  if(libraryTab==='objects')roots=p.assets.filter(a=>!a.parentId&&!isState(a)&&!isParameter(a));
  else if(libraryTab==='all')roots=p.assets.filter(a=>!a.parentId);
  else roots=p.assets.filter(a=>!isState(a)&&assetIsActive(p,a.id)&&isParameter(a)===(libraryTab==='parameters'));
  let html=libraryTab==='tags'?'':roots.map(a=>show(a)).join('');
  if(['tags','all'].includes(libraryTab))html+=`<div class="catalog-tags">${p.tags.filter(t=>!search||[t.name,t.rule].join(' ').toLowerCase().includes(search)).map(t=>`<button class="tag" data-edit-tag="${esc(t.id)}" draggable="${!play}" data-tag="${esc(t.id)}" style="--tag-color:${t.color}" title="${esc(t.rule||'Edit tag')}">${esc(t.name)}</button>`).join('')}</div>`;
  library.innerHTML=(staged?`<div class="staged-hint">Click the level to place ${esc(asset(staged)?.name)}. Esc to finish.</div>`:'') + (html && html!=='<div class="catalog-tags"></div>'?html:`<p class="pool-empty">${search?'No matches in this tab.':libraryTab==='objects'?'Create a token to build an object hierarchy.':`No ${libraryTab} yet. Use + to create one.`}</p>`) + (!play&&libraryTab!=='tags'?'<div class="root-drop" data-root-drop>Drop here to make a standalone token</div>':'') + (!p.assets.length&&!p.tags.length&&!play?'<button class="text-btn" id="load-example">Explore an example ↗</button>':'');
}
function compositionTree(a,depth=0,i=null) {
  return currentProject().assets.filter(b=>b.parentId===a.id).map(c=>{
    if(!isState(c)&&!assetIsActive(currentProject(),c.id,i))return '';
    return `<div class="composition-branch" style="--depth:${depth}"><div class="nested-chip">${tokenArt(c)}<button class="inspect-child" data-inspect-child="${esc(c.id)}">${esc(c.name)}</button>${isState(c)?stateSwitch(c,i):''}</div>${isState(c)&&!stateEnabled(currentProject(),c,i)?'':`<div class="nested-contents"><div class="tags">${assetTags(c).map(tagChip).join('')}</div>${compositionTree(c,depth+1,i)}</div>`}</div>`;
  }).join('');
}
function renderInspector() {
  const a=activeAsset(), i=activeInstance(), el=$('#inspector');
  const note=activePostIt();
  if(note){el.innerHTML=`<div class="eyebrow">SHARED POST-IT</div><h3>Notes & observations</h3><p class="note-inspector-text">${esc(note.text)}</p><p>Saved with this level. Playtest resets keep this note.</p><div class="inspector-actions"><button id="edit-post-it">Edit post-it</button><button id="delete-post-it" class="danger">Delete post-it</button></div>`;return;}
  const focused=document.activeElement;
  if(focused?.id==='instance-note'&&focused.dataset.instanceNote===i?.id)return;
  if(selected?.type==='objectLink') {
    const link=level().objectLinks?.find(link=>link.id===selected.id);
    if(link){el.innerHTML=`<div class="eyebrow">OBJECT LINK</div><h3>${esc(link.name)}</h3><p>${esc(link.rule||'No rule description yet.').replace(/\n/g,'<br>')}</p><div class="linked-objects">${link.instanceIds.map(id=>{const item=level().instances.find(i=>i.id===id),a=asset(item.assetId);return `<div>${tokenArt(a)}<span>${esc(a.name)} · ${item.x+1}, ${item.y+1}</span></div>`;}).join('')}</div><div class="inspector-actions"><button data-edit-object-link="${esc(link.id)}" ${play?'disabled':''}>Edit link</button><button class="danger" data-delete-object-link="${esc(link.id)}">Delete link</button></div>`;return;}
  }
  if(!a){el.innerHTML='<div class="eyebrow">A NOTE FROM THE WORKBENCH</div><h3>Think in small pieces.</h3><p>Select an object to explore its hierarchy, states, tags, and parameters.</p><button class="text-btn" id="inspector-guide">Open the field guide ↗</button>';return;}
  const p=currentProject(), active=assetIsActive(p,a.id,i), children=activeDescendants(p,a.id,i), states=p.assets.filter(b=>b.parentId===a.id&&isState(b));
  const tags=[...new Set((active?[a,...children]:[]).flatMap(b=>b.tags))].map(tag).filter(Boolean);
  el.innerHTML=`<div class="eyebrow">${i?'PLACED TOKEN':isState(a)?'STATE DEFINITION':'TOKEN DEFINITION'}</div><div class="inspector-top"><div class="asset-icon">${tokenArt(a,i)}</div><div><h3>${esc(a.name)}</h3><small>${i?`CELL ${i.x+1}, ${i.y+1} · ${(i.rotation+(a.rotation||0))%360}° ICON ROTATION${facingDirection(a,i)===null?'':` · FACING ${['UP','RIGHT','DOWN','LEFT'][facingDirection(a,i)/90]}`}`:a.parentId?esc(assetPath(a)):'REUSABLE BUILDING BLOCK'}</small></div></div><p>${esc(a.rule||'No rule yet. What should this token mean?').replace(/\n/g,'<br>')}</p>${isState(a)?stateSwitch(a):''}${!active?'<p class="state-inactive-note">This branch is disabled. Its contents are hidden from the active object.</p>':''}<div class="tags">${tags.map(tagChip).join('')}</div>${isParameter(a)?`<div class="field"><label for="quick-range">${a.icon==='area'?'Radius':'Length'} <span id="quick-range-value">${a.range}</span> cells</label><input id="quick-range" type="range" min="1" max="12" value="${a.range}" ${play?'disabled':''}></div>`:''}${['cone','rectangle'].includes(a.icon)?`<div class="field"><label for="quick-width">Width in cells${a.icon==='cone'?' · far edge':''}</label><input id="quick-width" type="number" min="1" max="${a.icon==='cone'?11:12}" step="${a.icon==='cone'?2:1}" value="${a.icon==='cone'?2*Math.floor(((a.width??3)-1)/2)+1:(a.width??3)}" ${play?'disabled':''}></div>`:''}${states.length?`<div class="nested-title">STATES · ${i?'THIS PIECE ONLY':'DEFINITION DEFAULTS'}</div><label class="check-row"><input type="checkbox" data-exclusive-states="${esc(a.id)}" ${a.exclusiveStates?'checked':''} ${play?'disabled':''}> Mutually exclusive states (shared definition)</label>${i?'<button id="reset-piece-states">Use definition defaults</button>':''}`:''}${states.length>1?`<p class="state-help">${a.exclusiveStates?'Only one sibling state can be enabled.':'States combine; the last enabled state supplies the icon.'} ${i?'Switches here affect only this placement.':''}</p>`:''}${active&&p.assets.some(b=>b.parentId===a.id)?compositionTree(a,0,i):''}${!isParameter(a)?`<div class="inspector-actions"><button data-create-kind="state" data-parent="${esc(a.id)}" ${play?'disabled':''}>＋ Add state</button><button data-create-kind="token" data-parent="${esc(a.id)}" ${play?'disabled':''}>＋ Add token</button><button data-create-kind="parameter" data-parent="${esc(a.id)}" ${play?'disabled':''}>＋ Parameter</button></div>`:''}${i?`<div class="field"><label for="instance-note">Placement notes</label><textarea id="instance-note" data-instance-note="${esc(i.id)}" maxlength="4000">${esc(i.note||'')}</textarea></div>`:''}<div class="inspector-actions">${i?'<button id="rotate-piece">↻ Rotate icon 90°</button><button id="rotate-facing">▴ Rotate facing</button><button id="duplicate-piece">⧉ Duplicate</button>':!isState(a)?`<button id="place-selected" ${play?'disabled':''}>＋ Place in level</button>`:''}<button id="edit-definition" ${play?'disabled':''}>Edit ${isState(a)?'state':'token'}</button></div><div class="inspector-actions"><button class="danger" id="delete-selected" ${play&&!i?'disabled':''}>${i?'Remove from level':isState(a)?'Delete state':'Delete token'}</button>${!i&&a.parentId&&!isState(a)?'<button id="detach-token">↳ Detach</button>':''}</div>`;
  if(i) {
    const links=(level().objectLinks||[]).filter(link=>link.instanceIds.includes(i.id));
    el.insertAdjacentHTML('beforeend',`<div class="nested-title">LINKS · ${links.length}</div><div class="inspector-links">${links.map(link=>`<button data-object-link="${esc(link.id)}"><span style="background:${link.color}"></span>${esc(link.name)}</button>`).join('')}</div>`);
  }
}
function objectLinkArtwork(l) {
  let lines='',labels='';
  for(const link of l.objectLinks||[]) {
    if(!showAll && !(selected?.type==='instance'&&link.instanceIds.includes(selected.id)) && !(selected?.type==='objectLink'&&selected.id===link.id))continue;
    const members=link.instanceIds.map(id=>l.instances.find(i=>i.id===id)).filter(i=>i&&assetIsActive(currentProject(),i.assetId));
    if(members.length<2)continue;
    let longest=-1,labelX=0,labelY=0;
    for(let n=1;n<members.length;n++) {
      const a=members[n-1],b=members[n],distance=Math.hypot(a.x-b.x,a.y-b.y);
      if(distance>longest){longest=distance;labelX=(a.x+b.x)/2+.5;labelY=(a.y+b.y)/2+.5;}
      // A curved loop keeps co-located objects' links visible too.
      const path=distance?`M ${a.x+.5} ${a.y+.5} L ${b.x+.5} ${b.y+.5}`:`M ${a.x+.5} ${a.y+.5} c -1 -1 1 -1 0 0`;
      lines+=`<path d="${path}" stroke="${link.color}"/>`;
    }
    labels+=`<button class="object-link-label" data-object-link="${esc(link.id)}" style="--x:${labelX};--y:${labelY};--link-color:${link.color}" aria-label="Inspect link ${esc(link.name)}" title="${esc(link.rule||link.name)}">${esc(link.name)}</button>`;
  }
  return `<svg class="object-link-lines" viewBox="0 0 ${l.width} ${l.height}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${labels}`;
}
function pickLinkObject(id) {
  linkDraft=linkDraft.includes(id)?linkDraft.filter(item=>item!==id):[...linkDraft,id];render();
}
function deleteObjectLink(id) {
  dispatch({type:'objectLink.delete',data:{levelId:level().id,id}});
  if(selected?.type==='objectLink'&&selected.id===id)selected=null;
  render();
}
function objectLinkDialog(existing) {
  if(play)return;
  const draft=clone(existing||{id:uid(),name:'',rule:'',color:'#5d91b5',instanceIds:[...linkDraft]}),targetLevel=level().id;
  showDialog(modal(existing?'Edit object link':'Create object link',`<form id="object-link-form"><div class="field"><label for="link-name">Link name</label><input id="link-name" required maxlength="80" value="${esc(draft.name)}" placeholder="Protects, activates, follows…" autofocus></div><div class="field"><label for="link-rule">Rule / description</label><textarea id="link-rule" maxlength="4000" placeholder="How are these objects connected?">${esc(draft.rule)}</textarea></div><div class="field"><label for="link-color">Link color</label><input type="color" id="link-color" value="${draft.color}"></div><fieldset class="link-members"><legend>Linked objects · choose at least two</legend>${level().instances.map(i=>{const a=asset(i.assetId);return `<label><input type="checkbox" name="link-member" value="${esc(i.id)}" ${draft.instanceIds.includes(i.id)?'checked':''}>${tokenArt(a)}<span>${esc(a.name)} · ${i.x+1}, ${i.y+1}</span></label>`;}).join('')}</fieldset><p id="link-form-error" role="alert"></p><div class="modal-footer">${existing?`<button type="button" class="danger" id="delete-editing-link">Delete link</button>`:''}<button type="button" data-close>Cancel</button><button type="submit" class="primary">${existing?'Save link':'Create link'}</button></div></form>`));
  $('#object-link-form').onsubmit=e=>{
    e.preventDefault();
    const instanceIds=[...document.querySelectorAll('input[name="link-member"]:checked')].map(input=>input.value);
    const name=$('#link-name').value.trim();
    if(instanceIds.length<2||!name){$('#link-form-error').textContent='Give the link a name and choose at least two objects.';return;}
    // Preserve the order chosen on the canvas; newly added members come last.
    draft.instanceIds=[...draft.instanceIds.filter(id=>instanceIds.includes(id)),...instanceIds.filter(id=>!draft.instanceIds.includes(id))];
    draft.name=name;draft.rule=$('#link-rule').value;draft.color=$('#link-color').value;
    const action=existing?{type:'objectLink.update',data:{levelId:targetLevel,...draft}}:{type:'objectLink.add',data:{levelId:targetLevel,link:draft}};
    try{applyAction(currentProject(),action);}catch(error){$('#link-form-error').textContent=error.message;return;}
    dispatch(action);
    closeDialog();linkDraft=[];tool='select';selected={type:'objectLink',id:draft.id};render();
  };
  if(existing)$('#delete-editing-link').onclick=()=>{deleteObjectLink(existing.id);closeDialog();};
}
function fitBoard() {
  const view = $('#board-viewport'), l=level();
  zoom = Math.min(1.3, Math.max(.3, Math.min((view.clientWidth-30)/(l.width*48),(view.clientHeight-15)/(l.height*48)))); renderBoard();
}
function changeZoom(delta) { zoom=Math.max(.3,Math.min(2,zoom+delta)); renderBoard(); }
function selectInstance(id) { editingTools?.onSingleSelect(id);selected={type:'instance',id}; staged=null; tool='select'; render(); }
function place(assetId,x,y) {
  if (!asset(assetId)) return;
  if(isState(asset(assetId)))return toast('States belong inside a token; place their parent token instead.');
  const instance={id:uid(),assetId,x,y,rotation:0,note:''};
  selected={type:'instance',id:instance.id};
  dispatch({type:'instance.add',data:{levelId:level().id,instance}});
}
function rotate() { const i=activeInstance(); if(i) dispatch({type:'instance.update',data:{levelId:level().id,id:i.id,rotation:(i.rotation+90)%360}}); }
function removeSelected() {
  if(activePostIt()){dispatch({type:'postIt.delete',data:{levelId:level().id,id:selected.id}});selected=null;render();return;}
  if(selected?.type==='objectLink'){deleteObjectLink(selected.id);return;}
  const i=activeInstance(), a=activeAsset(); if(!a)return;
  if(i) { if(dispatch({type:'instance.delete',data:{levelId:level().id,id:i.id}})!==false){selected=null;render();} }
  else confirmDialog(`Delete ${a.name}?`,'This removes this token, its nested tokens, and their placements from every level.','Delete token',()=>{dispatch({type:'asset.delete',data:{id:a.id}});selected=null;render();});
}
function stage(id) { if(play)return;if(isState(asset(id)))return toast('Place the parent token instead of a state.'); staged=id; selected={type:'asset',id};tool='select';connectionStart=null; render();toast(`Click a cell to place ${asset(id).name}.`); }
function showDialog(content) { $('#dialog').dataset.deckView='';$('#dialog-content').innerHTML=content; if(!$('#dialog').open)$('#dialog').showModal(); }
const closeDialog=()=>$('#dialog').close();
function modal(title,body,footer='',eyebrow='THE WORKBENCH') { return `<div class="modal"><div class="eyebrow">${eyebrow}</div><div class="modal-head"><h2>${esc(title)}</h2><button data-close aria-label="Close dialog">×</button></div>${body}${footer?`<div class="modal-footer">${footer}</div>`:''}</div>`; }
function confirmDialog(title,text,label,action) {
  showDialog(modal(title,`<p class="confirm-box">${esc(text)}</p>`,'<button data-close>Cancel</button><button class="primary" id="confirm-action">'+esc(label)+'</button>'));
  $('#confirm-action').onclick=()=>{closeDialog();action();};
}
function postItDialog(existing,position) {
  const targetLevel=level().id, draft=existing?clone(existing):{id:uid(),text:'',color:postItColor,...position};
  showDialog(modal(existing?'Edit post-it':'Leave a post-it',`<form id="post-it-form"><p class="note-save-hint">Shared with the room and saved with the level, including during playtests.</p><div class="field"><label for="post-it-text">Note or playtest observation</label><textarea id="post-it-text" maxlength="4000" rows="6" required autofocus placeholder="What happened? What did you notice? What would you try next?">${esc(draft.text)}</textarea></div><div class="field"><label for="post-it-color">Paper color</label><input id="post-it-color" type="color" value="${draft.color}"></div><div class="modal-footer"><button type="button" data-close>Cancel</button><button class="primary" type="submit">${existing?'Save note':'Add post-it'}</button></div></form>`,'','NOTES & OBSERVATIONS'));
  $('#post-it-form').onsubmit=e=>{e.preventDefault();draft.text=$('#post-it-text').value.trim();draft.color=$('#post-it-color').value;if(!draft.text)return;
    const action=existing?{type:'postIt.update',data:{levelId:targetLevel,...draft}}:{type:'postIt.add',data:{levelId:targetLevel,note:draft}};
    try{applyAction(project,action);}catch(error){toast(error.message);return;}
    if(dispatch(action)===false)return;
    postItColor=draft.color;selected={type:'postIt',id:draft.id};tool='select';closeDialog();render();
  };
}
async function deckDialog(id) {
  activeDeck=id;
  showDialog(modal('Opening card deck…','<p>Loading the repository inventory.</p>'));
  $('#dialog').dataset.deckView=id;
  try{
    const cached=localStorage.getItem('design-card-cache');if(cached){cardDecks=JSON.parse(cached);renderDeckDialog();return;}
    const response=await fetch('/api/decks',{signal:AbortSignal.timeout(10000)});const result=await response.json();
    if(!response.ok)throw Error(result.error||'Could not load card inventories.');
    if(!$('#dialog').open || activeDeck!==id || $('#dialog').dataset.deckView!==id)return;
    cardDecks=result.decks;renderDeckDialog();
  }catch(error){if($('#dialog').open&&$('#dialog').dataset.deckView===id)showDialog(modal('Card inventory unavailable',`<p>${esc(error.message)} Try reopening the deck after checking the inventory files.</p>`));}
}
function renderDeckDialog() {
  const deck=cardDecks.find(d=>d.id===activeDeck);if(!deck)return;
  const history=project.cardDraws.filter(draw=>draw.deckId===deck.id),used=new Set(history.map(draw=>draw.cardId)),remaining=deck.cards.filter(card=>!used.has(card.id)).length,last=history.at(-1);
  const cardMarkup=card=>`<strong>${esc(card.title)}</strong><p>${esc(card.task)}</p>${card.reflection?`<div class="card-reflection"><span>REFLECT</span>${esc(card.reflection)}</div>`:''}`;
  showDialog(modal(deck.name,`<div class="deck-summary">${deckIcon(deck.id)}<div><p>${esc(deck.description)}</p><small>${remaining} remaining · ${history.length} drawn · shared across this room</small></div></div>${last?`<article class="design-card ${deck.id}" aria-label="Last drawn card"><div class="eyebrow">YOUR LATEST DRAW</div>${cardMarkup(last)}</article>`:'<div class="deck-empty">A fresh deck. Draw a prompt and see where it takes your design.</div>'}<div class="deck-actions"><button class="primary" id="draw-card" ${!remaining||cardsBusy?'disabled':''}>${cardsBusy?'Drawing…':remaining?'Draw a random card':'Deck empty'}</button><button id="reset-deck" ${!history.length||cardsBusy?'disabled':''}>Return all cards</button><a href="/cards.html" target="_blank" rel="noopener">Review & edit inventories ↗</a></div><p class="deck-caption">Drawn cards stay out until you return all cards. Each deck has its own history.</p><details class="card-inventory"><summary>Drawn cards (${history.length})</summary>${[...history].reverse().map(card=>`<article>${cardMarkup(card)}</article>`).join('')||'<p>No cards drawn yet.</p>'}</details><details class="card-inventory"><summary>Review the full inventory (${deck.cards.length})</summary>${deck.cards.map(card=>`<article><small>${used.has(card.id)?'DRAWN':'IN DECK'}</small>${cardMarkup(card)}</article>`).join('')||'<p>This inventory has no cards. Add cards in the inventory editor.</p>'}</details>`,'','DRAW · DESIGN · DISCUSS'));
  $('#dialog').dataset.deckView=deck.id;
  $('#draw-card').onclick=()=>drawCard(deck.id);
  $('#reset-deck').onclick=()=>confirmDialog('Return all cards?',`Everyone in this room will be able to draw all ${deck.name} cards again. The other deck is unchanged.`,'Return cards',()=>{dispatch({type:'card.reset',data:{deckId:deck.id}});renderDeckDialog();});
}
async function drawCard(deckId) {
  if(floatingTools){floatingTools.draw(deckId,{x:320,y:100});return;}
  if(cardsBusy)return;
  if(pending.length||!connected||revision<0)return toast('Wait until changes are saved and the room is connected.');
  cardsBusy=true;renderDeckDialog();
  try{
    const response=await fetch(endpoint+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),body:JSON.stringify({action:{type:'card.draw',data:{deckId}},actionId:uid(),expectedRevision:revision})});
    const result=await response.json();if(!response.ok)throw Error(result.error||'Could not draw a card.');receive(result);
  }catch(error){toast(`${error.message} Check the drawn-card history before trying again.`);}
  finally{cardsBusy=false;if($('#dialog').open&&$('#dialog').dataset.deckView===activeDeck)renderDeckDialog();}
}
function tokenDialog(existing, kind='token', parentId=null) {
  if(play)return;
  const parent=asset(parentId);
  const draft=clone(existing || {id:uid(),kind:kind==='state'?'state':'token',name:'',icon:kind==='parameter'?'area':kind==='state'?(parent?.icon||'torch'):'torch',rule:'',color:parent?.color||'#b8cf96',tags:[],range:2,parentId,...(kind==='state'?{enabled:true}:{})});
  draft.variant ||= kind==='state'?(parent?.variant||defaultVariant(draft.icon)):defaultVariant(draft.icon);
  const editorLabel=()=>isState(draft)?'state':isParameter(draft)?'parameter':'token';
  const forbidden=new Set([draft.id,...descendants(project,draft.id).map(a=>a.id)]);
  showDialog(modal(`${existing?'Edit':'Create'} a ${editorLabel()}`,`<form id="token-form"><div class="field"><label for="token-name">Name <span class="muted">· required</span></label><input id="token-name" maxlength="80" required placeholder="A torch, a rule, a possibility…" value="${esc(draft.name)}" autofocus></div>${(isState(draft)?[false]:[false,true]).map(parameter=>`<div class="field-label">${parameter?'Parameters · visual behavior':'Token icons'}</div><div class="icon-picker ${parameter?'parameter-picker':''}">${Object.entries(iconNames).filter(([id])=>['area','sight','cone','rectangle'].includes(id)===parameter).map(([id,name])=>`<button type="button" data-icon="${id}" class="${draft.icon===id?'active':''}" title="${name}" aria-label="${name}" aria-pressed="${draft.icon===id}">${sprite(id,draft.color)}${parameter?`<span>${name}</span>`:''}</button>`).join('')}</div>`).join('')}<div class="field-label">Icon variant</div><div id="variant-picker" class="variant-picker"></div><div class="field"><label for="token-parent">Nest inside</label><select id="token-parent" ${isState(draft)?'required':''}>${!isState(draft)?'<option value="">Standalone</option>':''}${project.assets.filter(a=>!forbidden.has(a.id)&&(!isState(draft)||!isParameter(a))).map(a=>`<option value="${esc(a.id)}" ${draft.parentId===a.id?'selected':''}>${esc(assetPath(a))}${isState(a)?' (state)':''}</option>`).join('')}</select></div>${isState(draft)?`<label class="check-row"><input id="state-enabled" type="checkbox" ${draft.enabled?'checked':''}> Enabled · show this state’s contents</label>`:''}<div class="field"><label for="token-rule">Rule / description</label><textarea id="token-rule" maxlength="4000" placeholder="What does it do? What can change? The rules are yours to define.">${esc(draft.rule)}</textarea></div><div class="field tag-field"><label for="token-tags">Tags <span class="muted">· reusable definitions</span></label><div id="token-tag-list" class="tags"></div><input id="token-tags" maxlength="60" placeholder="Search tags or create a new one…" autocomplete="off"><div id="tag-options" class="tag-options"></div><div id="inline-tag-editor" hidden></div></div><div class="field"><label>Parameter color</label><div class="color-picker">${['#b8cf96','#edc47c','#d8967f','#8fb8c2','#b2a1c6','#ddddbd'].map(c=>`<button type="button" data-color="${c}" class="${draft.color===c?'active':''}" style="--swatch:${c}" aria-label="Color ${c}"></button>`).join('')}<input id="custom-color" type="color" value="${draft.color}" aria-label="Custom parameter color"></div></div><div class="field" id="range-field" ${['area','sight','cone','rectangle'].includes(draft.icon)?'':'hidden'}><label id="range-name" for="token-range">${draft.icon==='area'?'Radius':'Length'} in grid cells</label><div class="range-control"><input type="range" id="token-range" min="1" max="12" value="${draft.range}"><output id="range-value">${draft.range} cells</output></div><small id="range-help">Visual guide only. Areas use diamond-shaped grid distance; line, cone and rectangle extend forward, excluding the origin. Cones stay centered and use odd widths; saved even cone widths round down. Even rectangle widths include one extra cell on the right. Enable Occluded by Walls to stop the effect at wall tiles.</small></div><div id="parameter-behavior" ${isParameter(draft)?'':'hidden'}><label class="check-row"><input id="token-follow-facing" type="checkbox" ${draft.followTokenFacing?'checked':''}> Follow Token Facing</label><small>Turn this parameter with the parent token’s facing triangle. Its own rotation remains a relative offset.</small><label class="check-row"><input id="token-occlusion" type="checkbox" ${draft.occludedByWalls?'checked':''}> Occluded by Walls</label><small>Wall tiles and cells behind them are hidden. Walls also block diagonal corners.</small><label class="check-row"><input id="token-overlap-enabled" type="checkbox" ${draft.overlapThreshold>0?'checked':''}> Change color when objects overlap</label><div id="overlap-options" ${draft.overlapThreshold>0?'':'hidden'}><div class="field"><label for="token-overlap-mode">Objects that trigger the color</label><select id="token-overlap-mode"><option value="any" ${draft.overlapAssetIds==null?'selected':''}>Any object</option><option value="selected" ${draft.overlapAssetIds!=null?'selected':''}>Selected objects</option></select></div><fieldset id="overlap-objects" ${draft.overlapAssetIds==null?'hidden':''}><legend>Choose library objects</legend>${project.assets.filter(a=>!isState(a)&&!isParameter(a)).map(a=>`<label class="check-row"><input type="checkbox" name="overlap-object" value="${esc(a.id)}" ${draft.overlapAssetIds?.includes(a.id)?'checked':''}> ${esc(assetPath(a))}</label>`).join('')||'<small>Create an object in the library first.</small>'}</fieldset><div class="field-row"><div class="field"><label for="token-overlap-count">At least X objects</label><input id="token-overlap-count" type="number" min="1" max="1000" value="${draft.overlapThreshold||1}"></div><div class="field"><label for="token-overlap-color">Overlap color</label><input id="token-overlap-color" type="color" value="${draft.overlapColor||'#edc47c'}"></div></div><small>Counts placements of the chosen library objects inside the visible effect, including stacked objects. Select none to disable matching. Excludes the owner and other parameter markers. The whole effect changes color.</small></div></div><div class="field" id="width-field" ${['cone','rectangle'].includes(draft.icon)?'':'hidden'}><label for="token-width">Width in cells (cone: far edge)</label><input id="token-width" type="number" min="1" max="${draft.icon==='cone'?11:12}" step="${draft.icon==='cone'?2:1}" value="${draft.icon==='cone'?2*Math.floor(((draft.width??3)-1)/2)+1:(draft.width??3)}"></div><div id="token-auto-facing-field" ${!isParameter(draft)&&!isState(draft)?'':'hidden'}><label class="check-row"><input id="token-auto-facing" type="checkbox" ${draft.autoFacing?'checked':''}> Auto-facing</label><small>Face the direction moved, including in playtest. Diagonal moves use the longer axis; equal diagonals face horizontally.</small></div><div class="field"><label for="token-direction">Direction (optional)</label><select id="token-direction">${[['','None'],[0,'↑ Up'],[90,'→ Right'],[180,'↓ Down'],[270,'← Left']].map(([v,n])=>`<option value="${v}" ${(draft.direction??'')===v?'selected':''}>${n}</option>`).join('')}</select><small>Facing is shown by an edge triangle. Rotating facing leaves the icon upright.</small></div><div class="field"><label for="token-rotation">Icon / parameter rotation · relative to parent / placement</label><select id="token-rotation">${[[0,'↑ Up'],[90,'→ Right'],[180,'↓ Down'],[270,'← Left']].map(([v,n])=>`<option value="${v}" ${(draft.rotation||0)===v?'selected':''}>${n}</option>`).join('')}</select><small>Shared definition: changes affect all placements. Placed pieces can also rotate independently.</small></div><div class="callout">A token holds an idea. Nest other tokens inside it to combine their parameters. Rules are descriptions for students to interpret.</div><div class="modal-footer"><button type="button" data-close>Cancel</button><button type="submit" class="primary">${existing?'Save changes':`Create ${editorLabel()}`}</button></div></form>`));
  $('#token-overlap-mode').onchange=e=>{$('#overlap-objects').hidden=e.target.value!=='selected';};
  $('#token-overlap-enabled').onchange=e=>{$('#overlap-options').hidden=!e.target.checked;$('#token-overlap-count').disabled=!e.target.checked;};
  $('#token-overlap-count').disabled=!$('#token-overlap-enabled').checked;
  const renderVariants=()=>{
    $('#variant-picker').innerHTML=Object.entries(iconVariants[draft.icon]).map(([id,name])=>`<button type="button" data-variant="${id}" aria-label="Variant ${name}" aria-pressed="${draft.variant===id}" class="${draft.variant===id?'active':''}">${sprite(draft.icon,draft.color,id)}<span>${name}</span></button>`).join('');
  };
  renderVariants();
  const renderTagChoices=()=>{
    draft.tags=draft.tags.filter(id=>tag(id));
    $('#token-tag-list').innerHTML=draft.tags.map(id=>{const t=tag(id);return `<button type="button" class="tag" data-remove-tag="${esc(id)}" style="--tag-color:${t.color}" title="${esc(t.rule || t.name)} · Remove from token">${esc(t.name)} ×</button>`;}).join('');
    const query=$('#token-tags').value.trim().toLowerCase(), available=project.tags.filter(t=>!draft.tags.includes(t.id) && [t.name,t.rule].join(' ').toLowerCase().includes(query));
    $('#tag-options').innerHTML=available.map(t=>`<button type="button" data-add-tag="${esc(t.id)}"><span class="tag-dot" style="--tag-color:${t.color}"></span><span>${esc(t.name)}<small>${esc(t.rule)}</small></span><span>＋</span></button>`).join('') + (query && !project.tags.some(t=>t.name.toLowerCase()===query)?`<button type="button" id="inline-create-tag">＋ Create “${esc($('#token-tags').value.trim())}”</button>`:'') + (!available.length&&!query?'<small>Type a name to create your first tag.</small>':'');
  };
  const attachTag=id=>{if(!draft.tags.includes(id)){if(draft.tags.length>=30)return toast('A token can contain up to 30 tags.');draft.tags.push(id);}$('#token-tags').value='';renderTagChoices();};
  $('#token-tags').oninput=renderTagChoices;
  $('#token-tags').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#tag-options button')?.click();}};
  renderTagChoices();
  $('#token-form').onclick=e=>{
    const add=e.target.closest('[data-add-tag]'), remove=e.target.closest('[data-remove-tag]');
    if(add)return attachTag(add.dataset.addTag);
    if(remove){draft.tags=draft.tags.filter(id=>id!==remove.dataset.removeTag);return renderTagChoices();}
    if(e.target.closest('#inline-create-tag')){
      const host=$('#inline-tag-editor');host.hidden=false;
      host.innerHTML=tagEditorFields({name:$('#token-tags').value.trim(),rule:'',color:draft.color})+'<div class="inline-actions"><button type="button" data-tag-cancel>Cancel tag</button><button type="button" class="primary" data-tag-save>Create & attach tag</button></div>';
      bindTagEditor(host,null,t=>{host.hidden=true;host.innerHTML='';attachTag(t.id);},()=>{host.hidden=true;host.innerHTML='';});
      host.querySelector('[data-tag-name]').focus();
      return;
    }
    const variant=e.target.closest('[data-variant]');if(variant){draft.variant=variant.dataset.variant;renderVariants();return;}
    const icon=e.target.closest('[data-icon]'), color=e.target.closest('[data-color]');
    if(icon) { draft.icon=icon.dataset.icon;$('#parameter-behavior').hidden=!isParameter(draft);$('#token-auto-facing-field').hidden=isParameter(draft)||isState(draft);draft.variant=defaultVariant(draft.icon);renderVariants();$('#dialog .modal-head h2').textContent=`${existing?'Edit':'Create'} a ${editorLabel()}`;$('#token-form button[type=submit]').textContent=existing?'Save changes':`Create ${editorLabel()}`; document.querySelectorAll('[data-icon]').forEach(b=>{b.classList.toggle('active',b===icon);b.setAttribute('aria-pressed',b===icon);});$('#range-field').hidden=!['area','sight','cone','rectangle'].includes(draft.icon);$('#range-name').textContent=draft.icon==='area'?'Radius in grid cells':'Length in grid cells';$('#width-field').hidden=!['cone','rectangle'].includes(draft.icon);const widthInput=$('#token-width');widthInput.step=draft.icon==='cone'?'2':'1';widthInput.max=draft.icon==='cone'?'11':'12';if(draft.icon==='cone')widthInput.value=2*Math.floor((Number(widthInput.value)-1)/2)+1; }
    if(color) { draft.color=color.dataset.color;renderVariants();$('#custom-color').value=draft.color; document.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('active',b===color)); }
  };
  $('#custom-color').oninput=e=>{draft.color=e.target.value;renderVariants();document.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('active',b.dataset.color===draft.color));};
  $('#token-range').oninput=e=>$('#range-value').textContent=`${e.target.value} cells`;
  $('#token-form').onsubmit=e=>{
    e.preventDefault();draft.name=$('#token-name').value.trim();if(!draft.name)return $('#token-name').focus();
    draft.parentId=$('#token-parent').value||null;if(isState(draft))draft.enabled=$('#state-enabled').checked;
    draft.rule=$('#token-rule').value;draft.tags=draft.tags.filter(id=>tag(id));draft.range=Number($('#token-range').value);draft.width=Number($('#token-width').value);draft.rotation=Number($('#token-rotation').value);draft.direction=$('#token-direction').value===''?null:Number($('#token-direction').value);draft.autoFacing=$('#token-auto-facing').checked;draft.followTokenFacing=$('#token-follow-facing').checked;draft.occludedByWalls=$('#token-occlusion').checked;draft.overlapThreshold=$('#token-overlap-enabled').checked?Number($('#token-overlap-count').value):0;draft.overlapColor=$('#token-overlap-color').value;draft.overlapAssetIds=$('#token-overlap-mode').value==='selected'?[...document.querySelectorAll('input[name=overlap-object]:checked')].map(input=>input.value):null;
    try { applyAction(project,{type:existing?'asset.update':'asset.add',data:draft}); }catch(error){return toast(error.message);}
    selected={type:'asset',id:draft.id};dispatch({type:existing?'asset.update':'asset.add',data:draft});closeDialog();toast(existing?`${editorLabel()} updated. All placements use this definition.`:isState(draft)?'State created. Add tags, parameters, or tokens inside it.':'Token created. Drag it into the level or another token.');
  };
}
function tagEditorFields(t) {
  return `<div class="field"><label>Tag name<input data-tag-name maxlength="60" value="${esc(t.name)}" placeholder="Pickable, fragile, light source…" aria-label="Tag name"></label></div><div class="field"><label>Rule / description<textarea data-tag-rule maxlength="4000" aria-label="Tag rule / description" placeholder="What does this tag mean?">${esc(t.rule)}</textarea></label></div><div class="field"><label>Tag color<input data-tag-color type="color" value="${t.color}" aria-label="Tag color"></label></div>`;
}
function bindTagEditor(host, existing, onSave, onCancel) {
  host.onkeydown=e=>{if(e.key==='Enter' && e.target.matches('input')){e.preventDefault();host.querySelector('[data-tag-save]').click();}};
  host.querySelector('[data-tag-cancel]').onclick=onCancel;
  host.querySelector('[data-tag-save]').onclick=()=>{
    const t={id:existing?.id || uid(),name:host.querySelector('[data-tag-name]').value.trim(),rule:host.querySelector('[data-tag-rule]').value,color:host.querySelector('[data-tag-color]').value};
    if(!t.name){host.querySelector('[data-tag-name]').focus();return toast('Give this tag a name.');}
    const action={type:existing?'tag.update':'tag.add',data:t};
    try{applyAction(project,action);}catch(error){return toast(error.message);}
    dispatch(action);onSave(t);
  };
}
function tagDialog(existing) {
  if(play)return;
  const t=existing || {name:'',rule:'',color:'#b8cf96'};
  showDialog(modal(existing?'Edit a tag':'Create a tag',`<div id="tag-editor">${tagEditorFields(t)}<p>Tags can be reused in any token. Editing a tag updates every token that uses it.</p><div class="modal-footer">${existing?'<button class="danger" id="delete-tag">Delete tag</button>':''}<button data-tag-cancel>Cancel</button><button class="primary" data-tag-save>${existing?'Save tag':'Create tag'}</button></div></div>`));
  bindTagEditor($('#tag-editor'),existing,()=>{closeDialog();toast(existing?'Tag updated everywhere it is used.':'Tag created. Add it to any token.');},closeDialog);
  $('#tag-editor [data-tag-name]').focus();
  if(existing)$('#delete-tag').onclick=()=>confirmDialog(`Delete ${existing.name}?`,'This removes the tag from the library and every token that uses it.','Delete tag',()=>dispatch({type:'tag.delete',data:{id:existing.id}}));
}
function guideDialog() {
  showDialog(modal('Small pieces. Big possibilities.',`<p>A virtual tabletop for exploring atomic parameters. There is no automated game logic: you decide what every piece means.</p><div class="help-list">${[
    ['Shape the stage','Paint floor, walls, or GO path nodes with the left toolbar. Adjacent path nodes connect automatically. Use Erase connection (X) or Reconnect nodes (C), then click a line or two adjacent nodes. Hold and drag to paint tiles.'],
    ['Browse your building blocks','Objects shows token hierarchies, including nested states, parameters and tags. Tokens, Parameters and Tags are focused catalogs; All shows every hierarchy and the tag catalog. Use the arrows to collapse branches.'],
    ['Give an idea a token','Use + in the library. Choose a name, sprite, rule, tags and color. AoE and LoS have their own Parameters pool and adjustable cell distances. Tags have a separate editor; search existing tags or create one inside the token editor.'],
    ['Compose a mechanic','Drag Area of effect onto Torch in the library. It becomes a nested parameter. Nested tokens can contain more tokens; drag to the standalone drop zone to detach.'],
    ['Place and investigate','Drag a token from the library onto any cell, or click its + then a cell. Drag placed pieces to move them. Select one to inspect its tags and children. R rotates 90°. Double-click opens its definition.'],
    ['Build a state','Select a token and use Add state. A state has its own name, description, tags, icon variant and contents. Use Nest inside in any editor to put a token or parameter into a state. Toggle states from the parent: disabled contents disappear from the hierarchy and overlays, but stay saved. Enabled states combine; the last one in the list supplies the parent icon. Playtest state changes are private.'],
    ['Change one thing','Try a new radius, a different tag, or a new description. What changes for the player? Definitions update every placement; placement notes belong to one piece.'],
    ['Play by hand, together','Playtest makes a temporary local copy of the pieces. Move and rotate freely, then reset or return to editing. Post-its and card draws stay shared and saved. Share a room link for live editing on the same local network.'],
    ['Leave an observation','Choose a color, then drag Post-it from the floating toolbar onto any canvas space. Drag its body to move freely; double-click to edit. Drag Arrow, Step, or Question to annotate the board. Use Visibility to hide categories, or an item’s minus button to hide it. Notes survive playtest resets.'],
    ['Draw a design prompt','Design Experiments and Design Challenges each start with 12 cards. Draw randomly without replacement; Return all cards resets only that deck for this room. Review the inventory in the deck dialog, or open Card Studio to edit the repository files on the host.']
  ].map(([title,text],n)=>`<div class="help-item"><span class="help-number">0${n+1}</span><div><strong>${title}</strong><p>${text}</p></div></div>`).join('')}</div><div class="callout">Overlays are visual rulers: area uses Manhattan (diamond) distance, Line Effect is a straight directional line; cones widen toward their far edge and rectangles keep a constant width. Library rotation updates the shared definition; placement rotation adds to it. Neither applies collisions, visibility, inventory, turns, or win conditions. Multiple tokens can share a cell; remove or move the top one to reach the others.</div><details><summary>Keyboard shortcuts</summary><p>V select · F floor · N nodes · W walls · E erase tiles · X erase connection · C reconnect · R rotate · Delete remove selected token · Esc deselect · Ctrl+Z undo · Ctrl+Y or Ctrl+Shift+Z redo · / search. Use arrow keys to move a selected piece; Enter on a focused cell activates it.</p></details><p style="margin-top:18px;font-size:10px">Original workshop sprites. An unofficial, educational fan project inspired by the GO games and A Plague Tale.</p>`,'<button data-close class="primary">Back to the workbench</button>','FIELD GUIDE'));
}
function filesDialog() {
  showDialog(modal('Your workshop, to keep.',`<p>Changes save automatically on this server. Keep a project backup, or export a connected inventory for Excel and Google Sheets.</p><div class="files-grid"><button id="export-project">↧ Export project<small>Download a readable .json backup</small></button><button id="export-inventory">▦ Export spreadsheet<small>Recipes, challenges and progression · .xlsx</small></button><button id="import-project">↥ Import project<small>Replace this room with a saved project</small></button><button id="example-project">✧ Load example<small>A torch, light, rats, and a guard</small></button><button id="new-project">＋ Clear workshop<small>Start again with an empty library</small></button></div><div class="callout">Room <b>${esc(room)}</b> · Project backups contain the saved design. Spreadsheet exports can also capture your private playtest before you return to Edit.</div>`));
  $('#export-project').onclick=()=>{
    const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'}), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;a.download=`plague-tale-go-${room}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Project exported.');
  };
  $('#import-project').onclick=()=>{if(play)return toast('Return to Edit before importing.');$('#import-file').click();};
  $('#export-inventory').onclick=inventoryDialog;
  $('#example-project').onclick=()=>loadExample();
  $('#new-project').onclick=()=>{if(play)return toast('Return to Edit before clearing.');confirmDialog('Clear this workshop?','All levels, token definitions, and tags in this shared room will be replaced. Export a copy first if you want to keep them.','Clear workshop',()=>{dispatch({type:'project.replace',data:newProject()});selected=null;staged=null;});};
}
function inventoryDialog() {
  const testing = !!play;
  showDialog(modal('Export your design inventory.', `<p>A connected workbook with recipe summaries, every level, suggested challenge groups, and game progression. Enter difficulty modifiers and design intentions in the spreadsheet.</p><div class="field"><label for="inventory-snapshot">Snapshot to export</label><select id="inventory-snapshot"><option value="edit-design">Saved Edit design</option>${testing ? '<option value="playtest-start">Playtest starting layout</option><option value="playtest-current" selected>Current private playtest</option>' : ''}</select><small>${testing ? 'Capture the current playtest before returning to Edit. Exporting leaves the shared room unchanged.' : 'Start a playtest to also export its starting layout or current private copy.'}</small></div><div class="callout">Open the .xlsx in Excel, or upload it to Google Sheets. Each export is a new workbook. Keep your annotated copy; spreadsheet edits are not merged into later exports.</div><p id="inventory-error" role="alert" class="confirm-box" hidden></p>`, '<button id="inventory-back">Back</button><button id="download-inventory" class="primary">Download .xlsx</button>'));
  $('#inventory-back').onclick=filesDialog;
  $('#download-inventory').onclick=async()=>{
    const button=$('#download-inventory'), error=$('#inventory-error'), snapshotKind=$('#inventory-snapshot').value;
    error.hidden=true;
    if (revision < 0 || serverNeedsRestart || (snapshotKind==='edit-design' && (!connected || pending.length || busy || notePending))) {
      error.textContent='Wait until the saved design shows “All changes saved”, then export again.'; error.hidden=false; return;
    }
    const capture=snapshotKind==='playtest-current'?play:snapshotKind==='playtest-start'?playStart:null;
    if(snapshotKind!=='edit-design' && !capture){error.textContent='This playtest has ended. Reopen the export window to choose another snapshot.';error.hidden=false;return;}
    const request={snapshotKind,revision:snapshotKind==='edit-design'?revision:playStartRevision, ...(capture?{project:clone(capture)}:{})};
    button.disabled=true;button.textContent='Building workbook…';$('#inventory-snapshot').disabled=true;
    try {
      const response=await fetch(endpoint+'/inventory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
      if(!response.ok){const result=await response.json().catch(()=>({}));throw Error(result.error || (response.status===404?'Restart the Workshop server, then refresh to enable spreadsheet export.':'The workbook could not be exported.'));}
      const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');
      a.href=url;a.download=`workshop-${room}-${snapshotKind}-inventory.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Inventory exported. Open it in Excel or Google Sheets.');
    } catch(e) { if(error.isConnected){error.textContent=e.message || 'Could not reach the Workshop server. Try again when connected.';error.hidden=false;} }
    finally { if(button.isConnected){button.disabled=false;button.textContent='Download .xlsx';$('#inventory-snapshot').disabled=false;} }
  };
}
async function shareDialog() {
  let config={urls:[]};try{config=await(await fetch('/api/config')).json();}catch{}
  const isLoopback=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  const links=(isLoopback?config.urls:[location.origin]).map(url=>`${url}/?room=${room}`);
  if(!links.length)links.push(location.href);
  showDialog(modal('A shared workbench.',`<p>Open this room on another Windows browser to edit together. Everyone sees the same tokens and levels as changes are saved.</p><label class="field-label">${isLoopback && !polling?'Classroom / local network link':'Workshop link'}</label>${links.map((url,n)=>`<div class="copy-row"><input readonly id="share-link-${n}" value="${esc(url)}" aria-label="Workshop share link"><button class="primary" data-copy="${n}">Copy</button></div>`).join('')}<div class="callout">Keep this server running. ${polling?'Keep the online launcher open and your PC awake. Share the session username and password separately. Everyone with those credentials can edit every room on this server. Updates arrive about every 1.5 seconds.':'Students need to be on the same local network; Windows may ask you to allow Node.js through the firewall on a private network. Anyone with network access and the room link can edit.'}</div><p style="margin-top:15px;font-size:11px">Room ID: <b>${esc(room)}</b> · <b>${esc($('#peer-count').textContent)}</b> participant(s). New rooms start at <span class="small-link">/?room=your-room-name</span>. Playtest changes stay in your browser.</p>`,'<button class="primary" data-close>Done</button>','LIVE WORKSHOP'));
  document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{const input=$(`#share-link-${b.dataset.copy}`);try{await navigator.clipboard.writeText(input.value);b.textContent='Copied';}catch{input.focus();input.select();toast('Link selected. Press Ctrl+C to copy.');}});
}
function levelSettings() {
  if(play)return;const l=level();
  showDialog(modal('Set the scene.',`<form id="level-form"><div class="field"><label for="level-name">Level name</label><input id="level-name" required maxlength="80" value="${esc(l.name)}"></div><div class="field-row"><div class="field"><label for="level-width">Columns · 4–32</label><input type="number" id="level-width" min="4" max="32" value="${l.width}" required></div><div class="field"><label for="level-height">Rows · 4–24</label><input type="number" id="level-height" min="4" max="24" value="${l.height}" required></div></div><p>When making a level smaller, remove any tiles and pieces outside its new bounds first.</p><div class="modal-footer"><button type="button" class="danger" id="delete-level" ${project.levels.length===1?'disabled':''}>Delete level</button><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save level</button></div></form>`));
  $('#level-form').onsubmit=e=>{e.preventDefault();const data={levelId:l.id,name:$('#level-name').value.trim(),width:Number($('#level-width').value),height:Number($('#level-height').value)};if(!data.name)return;try{applyAction(project,{type:'level.update',data});}catch{return toast('Remove tiles and tokens beyond the new level size before shrinking.');}dispatch({type:'level.update',data});closeDialog();fitBoard();};
  $('#delete-level').onclick=()=>confirmDialog('Delete this level?',`The level “${l.name}” and its placements will be removed. Token definitions stay in the library.`,'Delete level',()=>{dispatch({type:'level.delete',data:{levelId:l.id}});levelId=project.levels[0].id;selected=null;render();fitBoard();});
}
function example() {
  const p=newProject(), l=p.levels[0];l.name='A light in the dark';
  const add=(name,icon,rule,tags,color='#b8cf96',range=2,parentId=null)=>{const a={id:uid(),name,icon,rule,tags,color,range,parentId};p.assets.push(a);return a.id;};
  const torch=add('Torch','torch','A carried flame. Ask: how does the space around it change?',['Pickable','Light source'],'#edc47c');
  add('Pool of light','area','Rats avoid the lit area. This is a proposed rule; move rats by hand. Try changing the radius from 2 to 1.',['Radius','Safety'],'#edc47c',2,torch);
  const girl=add('Amicia','girl','Move to a connected node. Can carry one pickable token.',['Player'],'#c8957d');
  const kid=add('Hugo','kid','Follows Amicia. What happens if the two become separated?',['Companion']);
  const rat=add('Rat swarm','rat','Move toward an unlit character after each player move. Students resolve turns manually.',['Threat'],'#b2a1c6');
  const guard=add('Guard','guard','Patrol a path. Rotate to change facing.',['Patrol'],'#8fb8c2');
  add('Watchful gaze','sight','A straight visual ruler. Decide whether walls block vision and how the guard reacts.',['Directional'],'#8fb8c2',3,guard);
  const exit=add('Escape','exit','Reach here together. What are the conditions for escape?',['Goal']);
  for(let x=3;x<=10;x++) l.tiles[`${x},5`]='node';
  for(let y=3;y<=7;y++) l.tiles[`7,${y}`]='node';
  for(const [assetId,x,y,rotation] of [[girl,3,5,90],[kid,3,6,0],[torch,5,5,0],[rat,8,6,0],[rat,9,7,0],[guard,7,3,180],[exit,10,5,90]])l.instances.push({id:uid(),assetId,x,y,rotation,note:''});
  for(const [x,y] of [[5,3],[5,4],[9,3],[9,4],[5,7]])l.tiles[`${x},${y}`]='wall';
  p.version=1;const result=validateProject(p);
  const state=(parentId,name,variant,enabled,rule)=>{
    const parent=result.assets.find(a=>a.id===parentId);
    const a={id:uid(),kind:'state',name,icon:parent.icon,variant,enabled,rule,color:parent.color,tags:[],range:2,parentId};
    result.assets.push(a);return a;
  };
  const lit=state(torch,'Lit','on',true,'The torch is burning. Its light and safety parameters are active.');
  state(torch,'Unlit','off',false,'The torch is extinguished. Enable this state and disable Lit.');
  const light=result.assets.find(a=>a.parentId===torch&&a.icon==='area');light.parentId=lit.id;
  const lightTag=result.tags.find(t=>t.name==='Light source');
  if(lightTag){result.assets.find(a=>a.id===torch).tags=result.assets.find(a=>a.id===torch).tags.filter(id=>id!==lightTag.id);lit.tags.push(lightTag.id);}
  const alive=state(guard,'Alive','alive',true,'The guard can patrol and watch the path.');
  state(guard,'Dead','dead',false,'The guard no longer patrols. Disable Alive to hide its sight.');
  result.assets.find(a=>a.parentId===guard&&a.icon==='sight').parentId=alive.id;
  return validateProject(result);
}
function loadExample() {
  if(play)return toast('Return to Edit before loading an example.');
  const load=()=>{const p=example();selected=null;staged=null;dispatch({type:'project.replace',data:p});levelId=p.levels[0].id;closeDialog();render();fitBoard();toast('Example loaded. Select the torch or guard to see their nested parameters.');};
  if(project.assets.length || project.tags.length || project.levels.some(l=>l.instances.length))confirmDialog('Load the example?','This replaces the current shared workshop. Export a copy first if you want to keep it.','Load example',load);else load();
}

// Event delegation keeps drag sources stable while the outliner is rendered.
let pointerDrag = null, suppressClickUntil = 0, lastTokenClick = null;
function clickedToken(type,id){
  const key=`${type}:${id}`, now=Date.now(), repeated=lastTokenClick?.key===key && now-lastTokenClick.time<350;
  lastTokenClick={key,time:now};
  if(type==='asset'){selected={type,id};staged=null;render();}
  else selectInstance(id);
  if(repeated&&!play)tokenDialog(activeAsset());
}
function editConnection(from,to) {
  connectionStart=null;
  dispatch({type:'link.update',data:{levelId:level().id,from,to,connected:tool==='connect'}});
}
function connectionNode(key) {
  if(level().tiles[key]!=='node')return toast('Choose a path node.');
  if(!connectionStart){connectionStart=key;render();return;}
  if(connectionStart===key){connectionStart=null;render();return;}
  if(!adjacentNodes(level(),connectionStart,key))return toast('Choose a node directly beside the first one.');
  editConnection(connectionStart,key);
}
document.addEventListener('click', e=>{
  if(Date.now()<suppressClickUntil){e.preventDefault();return;}
  if(notePending && e.target.id!=='instance-note') saveNote();
  const discard=e.target.closest('[data-discard-inventory]');if(discard&&play){playerInventory=playerInventory.filter(i=>i.id!==discard.dataset.discardInventory);renderInventory();return;}
  const close=e.target.closest('[data-close]');if(close)return closeDialog();
  const deck=e.target.closest('[data-deck],[data-review-deck]');if(deck)return deckDialog(deck.dataset.deck||deck.dataset.reviewDeck);
  const color=e.target.closest('[data-note-color]');if(color){postItColor=color.dataset.noteColor;staged=null;selected=null;render();return;}
  const postIt=e.target.closest('[data-post-it]');if(postIt){
    const id=postIt.dataset.postIt,key=`postIt:${id}`,now=Date.now(),repeated=lastTokenClick?.key===key&&now-lastTokenClick.time<350;
    lastTokenClick={key,time:now};selected={type:'postIt',id};staged=null;tool='select';render();if(repeated)postItDialog(activePostIt());return;
  }
  if(tool==='postIt'&&e.target.closest('#board')){const pos=cursorCell() || (e.target.closest('.cell')?{x:Number(e.target.closest('.cell').dataset.x),y:Number(e.target.closest('.cell').dataset.y)}:null);if(pos)postItDialog(null,pos);return;}
  const editTag=e.target.closest('[data-edit-tag]');if(editTag){if(tag(editTag.dataset.editTag))tagDialog(tag(editTag.dataset.editTag));return;}
  const libraryView=e.target.closest('[data-library-tab]');if(libraryView){libraryTab=libraryView.dataset.libraryTab;renderLibrary();return;}
  const collapse=e.target.closest('[data-collapse-asset]');if(collapse){const id=collapse.dataset.collapseAsset;collapsedAssets.has(id)?collapsedAssets.delete(id):collapsedAssets.add(id);renderLibrary();return;}
  const toggle=e.target.closest('[data-toggle-state]');if(toggle){const a=asset(toggle.dataset.toggleState),i=level().instances.find(i=>i.id===toggle.dataset.stateInstance);if(a)dispatch(i?{type:'instance.state',data:{levelId:level().id,id:i.id,stateId:a.id,enabled:!stateEnabled(currentProject(),a,i)}}:{type:'asset.update',data:{id:a.id,enabled:!stateEnabled(currentProject(),a)}});return;}
  const child=e.target.closest('[data-inspect-child]');if(child){selected={type:'asset',id:child.dataset.inspectChild};staged=null;render();return;}
  const createKind=e.target.closest('[data-create-kind]');if(createKind)return tokenDialog(undefined,createKind.dataset.createKind,createKind.dataset.parent||null);
  const objectLink=e.target.closest('[data-object-link]');if(objectLink){selected={type:'objectLink',id:objectLink.dataset.objectLink};staged=null;render();return;}
  const editObjectLink=e.target.closest('[data-edit-object-link]');if(editObjectLink)return objectLinkDialog(level().objectLinks.find(link=>link.id===editObjectLink.dataset.editObjectLink));
  const deleteLink=e.target.closest('[data-delete-object-link]');if(deleteLink)return deleteObjectLink(deleteLink.dataset.deleteObjectLink);
  const link=e.target.closest('[data-link-from]');if(link&&!play)return editConnection(link.dataset.linkFrom,link.dataset.linkTo);
  const icon=e.target.closest('[data-tool]');
  if(icon){if(icon.dataset.tool==='overlays')showAll=!showAll;else{tool=icon.dataset.tool;staged=null;selected=null;connectionStart=null;linkDraft=[];}return render();}
  const tab=e.target.closest('[data-level]');if(tab){levelId=tab.dataset.level;selected=null;staged=null;connectionStart=null;linkDraft=[];render();fitBoard();return;}
  if(!play&&tool==='link'&&e.target.closest('[data-instance]'))return pickLinkObject(e.target.closest('[data-instance]').dataset.instance);
  if(!play&&['connect','unlink'].includes(tool)){
    const cell=e.target.closest('.cell'), piece=e.target.closest('[data-instance]');
    if(cell)return connectionNode(`${cell.dataset.x},${cell.dataset.y}`);
    if(piece){const i=level().instances.find(i=>i.id===piece.dataset.instance);return connectionNode(`${i.x},${i.y}`);}
  }
  const rotateAsset=e.target.closest('[data-rotate-asset]');if(rotateAsset){if(!play){const a=asset(rotateAsset.dataset.rotateAsset);dispatch({type:'asset.update',data:{id:a.id,rotation:((a.rotation||0)+90)%360}});}return;}
  const placeBtn=e.target.closest('[data-place]');if(placeBtn){stage(placeBtn.dataset.place);return;}
  const row=e.target.closest('[data-asset]');if(row){clickedToken('asset',row.dataset.asset);return;}
  const piece=e.target.closest('[data-instance]');if(piece){clickedToken('instance',piece.dataset.instance);return;}
  const cell=e.target.closest('.cell');if(cell && (staged || play || tool==='select')){
    if(staged)place(staged,Number(cell.dataset.x),Number(cell.dataset.y));else{selected=null;render();}return;
  }
  switch(e.target.closest('button')?.id){
    case 'inventory-toggle':inventoryExpanded=!inventoryExpanded;renderInventory();break;
    case 'post-it-tool':toast('Drag Post-it from the floating toolbar onto the canvas.');break;
    case 'edit-post-it':if(activePostIt())postItDialog(activePostIt());break;
    case 'delete-post-it':removeSelected();break;
    case 'finish-link':if(linkDraft.length>=2)objectLinkDialog();break;
    case 'cancel-link':linkDraft=[];tool='select';render();break;
    case 'theme-toggle':{
      const theme=document.documentElement.dataset.theme==='light'?'dark':'light';
      applyTheme(theme);try{localStorage.setItem('workshop-theme',theme);}catch{}break;
    }
    case 'create-token':case 'empty-create':if(libraryTab==='tags')tagDialog();else tokenDialog(undefined,libraryTab==='parameters'?'parameter':'token');break;
    case 'create-tag':tagDialog();break;
    case 'guide-btn':case 'inspector-guide':guideDialog();break;
    case 'files-btn':filesDialog();break;
    case 'share-btn':shareDialog();break;
    case 'load-example':loadExample();break;
    case 'level-settings':levelSettings();break;
    case 'zoom-in':changeZoom(.1);break;
    case 'zoom-out':changeZoom(-.1);break;
    case 'zoom-fit':fitBoard();break;
    case 'undo':undo();break;
    case 'redo':undo(true);break;
    case 'rotate-facing':{const i=activeInstance();if(i){const facing=facingDirection(asset(i.assetId),i);dispatch({type:'instance.update',data:{levelId:level().id,id:i.id,direction:facing===null?0:(facing+90)%360}});}break;}
    case 'rotate-piece':rotate();break;
    case 'delete-selected':removeSelected();break;
    case 'place-selected':if(activeAsset())stage(activeAsset().id);break;
    case 'edit-definition':if(activeAsset())tokenDialog(activeAsset());break;
    case 'detach-token':dispatch({type:'asset.update',data:{id:activeAsset().id,parentId:null}});break;
    case 'duplicate-piece':editingTools.duplicate();break;
    case 'reset-piece-states':if(activeInstance())dispatch({type:'instance.resetStates',data:{levelId:level().id,id:activeInstance().id}});break;
    case 'snap-to-nodes':snapToNodes=!snapToNodes;try{localStorage.setItem('workshop-snap-to-nodes',String(snapToNodes));}catch{}render();break;
    case 'add-level':{if(project.levels.length>=30)return toast('This workshop supports up to 30 levels.');const l=blankLevel(uid(),`Level ${project.levels.length+1}`);dispatch({type:'level.add',data:l});levelId=l.id;selected=null;staged=null;render();fitBoard();break;}
    case 'play-mode':{
      if(play)return;if(pending.length)return toast('Wait for changes to save before playtesting.');
      playerInventory=[];inventoryExpanded=false;playStartRevision=revision;playStart=clone(project);play=clone(project);staged=null;tool='select';selected=null;render();toast('Manual playtest. Drag pieces into the backpack to collect them.');break;
    }
    case 'edit-mode':if(play){playerInventory=[];play=null;playStart=null;playStartRevision=null;selected=null;if(!project.levels.some(l=>l.id===levelId))levelId=project.levels[0].id;render();toast('Back to editing. Your original level is preserved.');}break;
    case 'reset-play':if(play){playerInventory=[];play=clone(playStart);selected=null;render();toast('Playtest reset.');}break;
  }
});
document.addEventListener('change',e=>{
  if(e.target.matches('[data-exclusive-states]')){dispatch({type:'asset.update',data:{id:e.target.dataset.exclusiveStates,exclusiveStates:e.target.checked}});return;}
  if(e.target.id==='quick-width' && activeAsset()){if(e.target.checkValidity()&&e.target.value)dispatch({type:'asset.update',data:{id:activeAsset().id,width:Number(e.target.value)}});return;}
  if(e.target.id==='quick-range' && activeAsset())dispatch({type:'asset.update',data:{id:activeAsset().id,range:Number(e.target.value)}});
  if(e.target.id==='instance-note')saveNote();
});
document.addEventListener('input',e=>{
  if(e.target.id==='quick-range')$('#quick-range-value').textContent=e.target.value;
  if(e.target.id==='instance-note'){
    clearTimeout(noteTimer);
    notePending={session:playStart,action:{type:'instance.update',data:{levelId:level().id,id:e.target.dataset.instanceNote,note:e.target.value.slice(0,4000)}}};
    noteTimer=setTimeout(saveNote,400);setStatus();
  }
});
$('#asset-search').oninput=e=>{search=e.target.value.toLowerCase().trim();renderLibrary();};
$('#import-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  if(file.size>2_000_000)return toast('Choose a project smaller than 2 MB.');
  try{const parsed=validateProject(JSON.parse(await file.text()));confirmDialog('Import this project?',`Replace the shared room with ${parsed.levels.length} level(s) and ${parsed.assets.length} token definition(s)?`,'Import project',()=>{selected=null;staged=null;dispatch({type:'project.replace',data:parsed});levelId=project.levels[0].id;render();fitBoard();toast('Project imported.');});}catch(error){toast(`Could not import: ${error.message}`);}
};
document.addEventListener('pointerdown',e=>{
  if(tool==='link'&&e.target.closest('#board'))return;
  if(e.button!==0||$('#dialog').open||e.target.closest('[data-place],[data-rotate-asset],[data-toggle-state],[data-collapse-asset]')||(!play&&['connect','unlink'].includes(tool)&&e.target.closest('#board')))return;
  if(tool==='postIt'&&e.target.closest('#board'))return;
  const piece=e.target.closest('[data-instance]'),row=e.target.closest('[data-asset]'),tagRow=e.target.closest('[data-tag]'),note=e.target.closest('[data-post-it]');
  const inventoryItem=play&&e.target.closest('[data-inventory-item]');
  if(e.target.closest('[data-discard-inventory]'))return;
  if(!inventoryItem&&!note&&!piece&&!row&&(!tagRow||play))return;
  e.preventDefault();
  pointerDrag={startX:e.clientX,startY:e.clientY,active:false,payload:inventoryItem?{type:'inventory',id:inventoryItem.dataset.inventoryItem}:note?{type:'postIt',id:note.dataset.postIt,levelId:level().id}:piece?{type:'instance',id:piece.dataset.instance,levelId:level().id}:tagRow?{type:'tag',id:tagRow.dataset.tag}:{type:'asset',id:row.dataset.asset}};
});
document.addEventListener('pointermove',e=>{
  if(!pointerDrag)return;
  if(!pointerDrag.active&&Math.hypot(e.clientX-pointerDrag.startX,e.clientY-pointerDrag.startY)>5){
    pointerDrag.active=true;
    const a=pointerDrag.payload.type==='tag'?tag(pointerDrag.payload.id):pointerDrag.payload.type==='asset'?asset(pointerDrag.payload.id):asset((pointerDrag.payload.type==='inventory'?playerInventory:level().instances).find(i=>i.id===pointerDrag.payload.id)?.assetId);
    const ghost=document.createElement('div');ghost.id='drag-ghost';ghost.innerHTML=`${pointerDrag.payload.type==='postIt'?'▧':pointerDrag.payload.type==='tag'?'#':a?tokenArt(a):sprite('rock')}<span>${pointerDrag.payload.type==='postIt'?'Post-it':esc(a?.name)}</span>`;document.body.append(ghost);
  }
  if(!pointerDrag.active)return;
  const ghost=$('#drag-ghost');ghost.style.left=`${e.clientX+14}px`;ghost.style.top=`${e.clientY+14}px`;
  document.querySelectorAll('.nest-hover,.drop-target').forEach(n=>n.classList.remove('nest-hover','drop-target'));
  const target=document.elementFromPoint(e.clientX,e.clientY),cell=target?.closest('.cell'),row=target?.closest('[data-asset]'),root=target?.closest('[data-root-drop]');
  if(play&&target?.closest('#player-inventory')&&['asset','instance'].includes(pointerDrag.payload.type))$('#player-inventory').classList.add('drop-target');
  else if(cell&&pointerDrag.payload.type!=='tag'&&(!play||pointerDrag.payload.type!=='asset'))cell.classList.add('drop-target');else if(!play)(pointerDrag.payload.type==='tag'?row:row||root)?.classList.add('nest-hover');
});
document.addEventListener('pointerup',e=>{
  if(!pointerDrag)return;
  const drag=pointerDrag;pointerDrag=null;$('#drag-ghost')?.remove();
  document.querySelectorAll('.nest-hover,.drop-target').forEach(n=>n.classList.remove('nest-hover','drop-target'));
  if(drag.active){suppressClickUntil=Date.now()+200;dropToken(document.elementFromPoint(e.clientX,e.clientY),drag.payload);}
});
document.addEventListener('pointercancel',()=>{pointerDrag=null;$('#drag-ghost')?.remove();});
document.addEventListener('dragstart',e=>{
  if(pointerDrag){e.preventDefault();return;}
  const piece=e.target.closest('[data-instance]'),row=e.target.closest('[data-asset]'),tagRow=e.target.closest('[data-tag]');
  const inventoryItem=play&&e.target.closest('[data-inventory-item]');
  if(inventoryItem)dragPayload={type:'inventory',id:inventoryItem.dataset.inventoryItem};
  else if(piece)dragPayload={type:'instance',id:piece.dataset.instance,levelId:level().id};
  else if(tagRow&&!play)dragPayload={type:'tag',id:tagRow.dataset.tag};
  else if(row)dragPayload={type:'asset',id:row.dataset.asset};
  else {e.preventDefault();return;}
  e.dataTransfer.setData('application/x-plague-token',JSON.stringify(dragPayload));e.dataTransfer.setData('text/plain',dragPayload.id);e.dataTransfer.effectAllowed=dragPayload.type==='asset'?'copyMove':'move';
});
document.addEventListener('dragover',e=>{
  if(!dragPayload)return;
  const cell=e.target.closest('.cell'),row=e.target.closest('[data-asset]'),root=e.target.closest('[data-root-drop]'),piece=e.target.closest('[data-instance]');
  const inventoryTarget=play&&e.target.closest('#player-inventory')&&['asset','instance'].includes(dragPayload.type);
  const valid=inventoryTarget||(dragPayload.type==='tag'?!play&&(row||piece):((!play||dragPayload.type!=='asset')&&(cell||piece))||(dragPayload.type==='asset'&&!play&&(row||root)));
  if(valid){e.preventDefault();e.dataTransfer.dropEffect=dragPayload.type==='asset'&&(inventoryTarget||cell||piece)?'copy':'move';}
  document.querySelectorAll('.nest-hover,.drop-target').forEach(n=>n.classList.remove('nest-hover','drop-target'));
  if(inventoryTarget)$('#player-inventory').classList.add('drop-target');else if(valid&&cell)cell.classList.add('drop-target');else if(row&&dragPayload.type==='asset'&&!play)row.classList.add('nest-hover');else if(root)root.classList.add('nest-hover');
});
document.addEventListener('drop',e=>{
  if(!dragPayload)return;e.preventDefault();const payload=dragPayload;dragPayload=null;
  document.querySelectorAll('.nest-hover,.drop-target').forEach(n=>n.classList.remove('nest-hover','drop-target'));
  dropToken(e.target,payload);
});
function dropToken(target,payload){
  if(!target)return;
  if(play&&target.closest('#player-inventory')){collectInInventory(payload);return;}
  if(payload.type==='postIt'){
    const pos=cursorCell();if(pos&&target.closest('#board')&&payload.levelId===level().id){selected={type:'postIt',id:payload.id};dispatch({type:'postIt.update',data:{levelId:payload.levelId,id:payload.id,...pos}});}return;
  }
  if(payload.type==='tag'){
    if(play)return;
    const row=target.closest('[data-asset]'),piece=target.closest('[data-instance]');
    const a=row?asset(row.dataset.asset):piece?asset(level().instances.find(i=>i.id===piece.dataset.instance)?.assetId):null;
    if(a && !a.tags.includes(payload.id))dispatch({type:'asset.update',data:{id:a.id,tags:[...a.tags,payload.id]}});
    return;
  }
  const cell=target.closest('.cell'),piece=target.closest('[data-instance]');
  if(cell||piece){
    const target=cell?{x:Number(cell.dataset.x),y:Number(cell.dataset.y)}:level().instances.find(i=>i.id===piece.dataset.instance);
    if(payload.type==='inventory'&&play){
      try{const result=releaseItem(play,playerInventory,level().id,payload.id,{x:target.x,y:target.y},snapToNodes);play=result.project;playerInventory=result.inventory;selected={type:'instance',id:payload.id};render();}catch(error){toast(error.message);}return;
    }
    if(payload.type==='asset'&&!play)place(payload.id,target.x,target.y);
    if(payload.type==='instance'&&payload.levelId===level().id){selected={type:'instance',id:payload.id};dispatch({type:'instance.update',data:{levelId:level().id,id:payload.id,x:target.x,y:target.y}});}return;
  }
  if(payload.type!=='asset'||play)return;
  const row=target.closest('[data-asset]'),root=target.closest('[data-root-drop]');
  if(row||root){const parentId=row?.dataset.asset||null;
    if(!parentId&&isState(asset(payload.id)))return toast('A state must stay inside a token.');
    if(parentId===payload.id || descendants(project,payload.id).some(a=>a.id===parentId))return toast('A token cannot be nested inside itself or its own children.');
    dispatch({type:'asset.update',data:{id:payload.id,parentId}});toast(parentId?'Token nested. Its parameters travel with the parent.':'Token detached.');
  }
}
document.addEventListener('dragend',()=>{dragPayload=null;document.querySelectorAll('.nest-hover,.drop-target').forEach(n=>n.classList.remove('nest-hover','drop-target'));});
$('#board').addEventListener('pointerdown',e=>{
  if(play||staged||['select','connect','unlink','link','postIt'].includes(tool)||e.button!==0||e.target.closest('[data-instance],[data-object-link],[data-post-it]'))return;
  const cell=e.target.closest('.cell');if(!cell)return;
  e.preventDefault();paint={tile:tool,cells:new Set([`${cell.dataset.x},${cell.dataset.y}`])};$('#board').setPointerCapture(e.pointerId);renderBoard();
});
$('#board').addEventListener('pointermove',e=>{
  if(!paint)return;const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest('.cell');
  if(cell){const key=`${cell.dataset.x},${cell.dataset.y}`;if(!paint.cells.has(key)){paint.cells.add(key);renderBoard();}}
});
function finishPaint(){if(!paint)return;const data={levelId:level().id,cells:[...paint.cells].filter(key=>(level().tiles[key]||'empty')!==paint.tile),tile:paint.tile};paint=null;if(data.cells.length)dispatch({type:'tile.paint',data});else renderBoard();}
$('#board').addEventListener('pointerup',finishPaint);
$('#board').addEventListener('pointercancel',()=>{paint=null;renderBoard();});
document.addEventListener('keydown',e=>{
  if($('#dialog').open || $('#workshop-step-dialog').open)return;
  const libraryView=e.target.closest('[data-library-tab]');
  if(libraryView&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
    e.preventDefault();const tabs=['objects','tokens','parameters','tags','all'],index=tabs.indexOf(libraryTab);
    libraryTab=tabs[e.key==='Home'?0:e.key==='End'?4:(index+(e.key==='ArrowRight'?1:4))%5];
    renderLibrary();$('#library-tab-'+libraryTab).focus();return;
  }
  const editing=e.target.matches('input,textarea,select,[contenteditable]');if(editing)return;
  if(e.ctrlKey||e.metaKey){
    const key=e.key.toLowerCase();
    if(key==='c' && activeInstance()){e.preventDefault();copiedInstance=clone(activeInstance());toast('Object copied.');return;}
    if(key==='v' && copiedInstance){e.preventDefault();duplicateInstance(copiedInstance,cursorCell());return;}
    if(!['z','y'].includes(key))return;
  }
  if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();undo(e.key.toLowerCase()==='y'||e.shiftKey);return;}
  if(e.key==='Escape'){staged=null;selected=null;connectionStart=null;linkDraft=[];tool='select';render();return;}
  if(e.key==='/'){e.preventDefault();$('#asset-search').focus();return;}
  if(e.key.toLowerCase()==='p'){e.preventDefault();$('#post-it-tool').focus();toast('Drag Post-it onto the canvas.');return;}
  if(e.key.toLowerCase()==='r'){e.preventDefault();rotate();return;}
  if(['Delete','Backspace'].includes(e.key)){e.preventDefault();removeSelected();return;}
  if(e.key==='Enter'){
    const linkPiece=e.target.closest('[data-instance]');if(tool==='link'&&linkPiece){e.preventDefault();pickLinkObject(linkPiece.dataset.instance);return;}
    const cell=e.target.closest('.cell'),row=e.target.closest('[data-asset]');
    if(row){selected={type:'asset',id:row.dataset.asset};render();return;}
    if(cell){if(tool==='postIt')postItDialog(null,{x:Number(cell.dataset.x),y:Number(cell.dataset.y)});else if(staged)place(staged,Number(cell.dataset.x),Number(cell.dataset.y));else if(!play&&['connect','unlink'].includes(tool))connectionNode(`${cell.dataset.x},${cell.dataset.y}`);else if(tool!=='select'&&!play)dispatch({type:'tile.paint',data:{levelId:level().id,cells:[`${cell.dataset.x},${cell.dataset.y}`],tile:tool}});}return;
  }
  const directions={ArrowUp:[0,-1],ArrowRight:[1,0],ArrowDown:[0,1],ArrowLeft:[-1,0]},i=activeInstance();
  if(directions[e.key]&&activePostIt()){e.preventDefault();const note=activePostIt(),[dx,dy]=directions[e.key],x=note.x+dx,y=note.y+dy;if(x>=0&&y>=0&&x<savedLevel().width&&y<savedLevel().height)dispatch({type:'postIt.update',data:{levelId:level().id,id:note.id,x,y}});return;}
  if(directions[e.key]&&i){e.preventDefault();const [dx,dy]=directions[e.key],x=i.x+dx,y=i.y+dy;if(x>=0&&y>=0&&x<level().width&&y<level().height)dispatch({type:'instance.update',data:{levelId:level().id,id:i.id,x,y}});return;}
  const shortcut={v:'select',f:'floor',n:'node',w:'wall',e:'empty',x:'unlink',c:'connect',l:'link'}[e.key.toLowerCase()];if(shortcut&&!play){tool=shortcut;staged=null;selected=null;connectionStart=null;linkDraft=[];render();}
});
$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=$('#dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
window.addEventListener('beforeunload',e=>{if(pending.length||notePending){e.preventDefault();e.returnValue='';}});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(fitBoard,200);});
editingTools=manipulation({getProject:currentProject,getLevel:level,getSelected:()=>selected,setSelected:value=>{selected=value;staged=null;tool='select';},dispatch,render,toast,isPlay:()=>!!play,snap:()=>snapToNodes,esc,collectInventory:collectInInventory});
floatingTools=floatingCanvas({getProject:()=>project,getLevel:level,dispatch,edit:postItDialog,uid,esc});
render();

initPresence({ endpoint, uid, getView: () => ({ levelId: level().id, play: Boolean(play) }) });
