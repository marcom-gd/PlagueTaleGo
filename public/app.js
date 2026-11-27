import { uid, clone, newProject, blankLevel, validateProject, applyAction, descendants, nodesConnected, adjacentNodes, isState, assetIsActive, activeDescendants, appearance, effectContains, effectRotation, parameterOverlay, facingDirection, stateEnabled, parameterDefinition, isParameter, parameterIcons } from './model.js';
import { sprite, iconNames, iconVariants, defaultVariant } from './icons.js';
import { initPresence } from './presence.js';
import { deckIcon } from './cards-catalog.js';
import { manipulation } from './manipulation.js';
import { floatingCanvas } from './floating-canvas.js';
import { initWorkshopProgress } from './workshop-progress.js';
import { collectItems, releaseItem, adjustStack, createPlaytestState } from './player-inventory.js';
import { editorDraft } from './editor-draft.js';
import { applyTextScale, textScale } from './ui-preferences.js';
import { copyLevel } from './editing.js';
import { levelTabDragging } from './level-tabs.js';
import { levelTransferUI } from './level-transfer-ui.js';
import { reviewProjectCleanup } from './project-cleanup.js';
import { playtestModes, canMoveInPlaytest, checkPlaytestMovement } from './playtest-mode.js';
import { userTestFlow } from './user-test-flow.js';
import { behaviourEditor } from './behaviour-editor.js';
import { behaviourNames, effectActions } from './behaviour-schema.js';
import {behaviourChip,behaviourHierarchy} from './behaviour-ui.js';
import {workshopPanels} from './workshop-panels.js';
import {behaviourDragging,behaviourDropTarget,clearBehaviourDrop} from './behaviour-drag.js';
import { createSequence, captureSequence, hasRecordedNextTurn, nextTurn, previousTurn, validateSequence, eventTurn } from './turn-sequence.js';
import {gameOutcome,outcomeMessages} from './game-outcomes.js';
import { availableUses, useObject, eventsAdvanceTurn, movementEvents } from './behaviours.js';
import { availableThrows, throwObject } from './throw-object.js';
import {distractAfterStateEdit} from './distraction.js';
import { throwingUI, throwIcon } from './throwing-ui.js';
import { checkMovement, effectOverlay } from './behaviour-areas.js';
import { startingInventoryEditor } from './starting-inventory-editor.js';
import {dropCarriedItem,interactionOwners,releaseMissingCarriers} from './carried-items.js';
import {carriedBadges,nestedBadges} from './carried-ui.js';
import {entityEffects,trayTransferEffects} from './entity-effects.js';
import {countdown,syncLifetimes} from './lifetimes.js';
import {serverSupportsEditor,serverUpdateMessage} from './server-compatibility.js';
import { floorVariants, isFloor, hasNode, nodeCells, paintLevelTiles, isClosedPatrol, appendPatrolNode, canConnectNodes } from './model.js';
import { parameterLayers, parameterLayer } from './model.js';
const $ = s => document.querySelector(s);
let uiTextScale = 100;
try { uiTextScale = textScale(localStorage.getItem('workshop-text-scale') ?? 100); } catch {}
applyTextScale(uiTextScale);
// Appearance is a device preference, independent of the shared workshop.
function applyTheme(theme) {
  document.documentElement.dataset.theme=theme;
  const light=theme==='light',button=$('#theme-toggle');
  button.innerHTML=light?'☾ <span>Dark mode</span>':'☀ <span>Light mode</span>';
  button.setAttribute('aria-label',`Switch to ${light?'dark':'light'} mode`);
  document.querySelector('meta[name="theme-color"]').content=light?'#f7f3eb':'#1c231f';
}
applyTheme(document.documentElement.dataset.theme);
function expandLibrary(expanded) {
  if(expanded)showDefinitionOnly(false);
  $('#workshop-sidebar').classList.toggle('library-expanded',expanded);
  const button=$('#library-expand');button.setAttribute('aria-pressed',String(expanded));button.setAttribute('aria-label',expanded?'Restore library layout':'Expand library vertically');button.title=expanded?'Restore library layout':'Expand library vertically';button.textContent=expanded?'↧':'↕';
  try{localStorage.setItem('workshop-library-expanded',String(expanded));}catch{}
}
function showDefinitionOnly(enabled) {
  if(enabled)expandLibrary(false);
  if(enabled)collapseDefinition(false);
  $('#workshop-sidebar').classList.toggle('definition-only',enabled);
  const button=$('#definition-only');
  button.setAttribute('aria-pressed',String(enabled));
  button.setAttribute('aria-label',enabled?'Restore library and definition layout':'Show only definition');
  button.title=enabled?'Restore library and definition layout':'Show only definition';
  try{localStorage.setItem('workshop-definition-only',String(enabled));}catch{}
}
function collapseDefinition(collapsed){
  if(collapsed&&$('#workshop-sidebar').classList.contains('definition-only'))showDefinitionOnly(false);
  $('#workshop-sidebar').classList.toggle('definition-collapsed',collapsed);
  $('#definition-toggle').setAttribute('aria-expanded',String(!collapsed));
  $('#definition-toggle').setAttribute('aria-label',collapsed?'Expand definition':'Collapse definition');
  $('#definition-toggle').lastElementChild.textContent=collapsed?'▸':'▾';
  $('#definition-contents').hidden=collapsed;
  try{localStorage.setItem('workshop-definition-collapsed',String(collapsed));}catch{}
}
let definitionCollapsed=false;try{definitionCollapsed=localStorage.getItem('workshop-definition-collapsed')==='true';}catch{}
collapseDefinition(definitionCollapsed);
let libraryExpanded=false;try{libraryExpanded=localStorage.getItem('workshop-library-expanded')==='true';}catch{}
expandLibrary(libraryExpanded);
let definitionOnly=false;try{definitionOnly=localStorage.getItem('workshop-definition-only')==='true';}catch{}
showDefinitionOnly(definitionOnly);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params = new URLSearchParams(location.search);
let room = params.get('room');
if (!/^[\w-]{1,64}$/.test(room || '')) { room = uid().slice(0,8); history.replaceState(null,'',`?room=${room}`); }
if(room!==room.toLowerCase()){room=room.toLowerCase();history.replaceState(null,'',`?room=${room}`);}
const endpoint = `/api/rooms/${room}`;
// Resolve the launch mode before exposing any editing controls.
let appConfig;
while (!appConfig) {
  try {
    const response = await fetch('/api/config', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error('Configuration unavailable');
    appConfig = await response.json();
  } catch { await new Promise(resolve => setTimeout(resolve, 2000)); }
}
const userTestSession = appConfig.userTest === true;
document.body.classList.toggle('user-test-session', userTestSession);
if (userTestSession) {
  document.body.classList.add('projector-mode', 'workshop-strip-collapsed');
  document.title = 'Plague Tale GO · User Test';
  $('.editor-heading').append($('#theme-toggle'));
}
const workshopProgress = initWorkshopProgress({ endpoint, toast });
let project = newProject(), authoritative = clone(project), revision = -1, pending = [], busy = false, connected = false, serverNeedsRestart = !serverSupportsEditor(appConfig);
let levelId, selected = null, staged = null, tool = 'select', zoom = 1, play = null, playStart = null, historyStack = [], redoStack = [];
let playStartRevision = null, playtestMode = userTestSession ? 'userTest' : 'sandbox';
let testFlow = null, presence = null, testLevelStarted = 0, testUsedSandbox = false, testCompletion = 'automatic';
const canManuallyMove = instance => !play || canMoveInPlaytest(play, instance, playtestMode);
let turnSequence=null;
let turnOutcome=null;
const savedOutcomes=new Set();
let playInitialState=null;
let eventTurnQueued=false;
let playerInventory=[], inventoryExpanded=false, graveyard=[], graveyardExpanded=false;
let dragPayload = null, paint = null, toastTimer, didInitialFit = false;
let layerMenuOpen = false;
const parameterLayersPreferenceKey=userTestSession?'user-test-parameter-layers':'workshop-parameter-layers';
const visibleParameterLayers = new Set(userTestSession?['Light','Vision']:[]);
try{
  const saved=JSON.parse(localStorage.getItem(parameterLayersPreferenceKey));
  if(Array.isArray(saved)){visibleParameterLayers.clear();for(const layer of saved)if(parameterLayers.includes(layer))visibleParameterLayers.add(layer);}
}catch{}
let notePending = null, noteTimer;
let connectionStart = null, libraryTab='objects';
const librarySearch={objects:'',atomic:''};
const panels=workshopPanels({onChange:tab=>{libraryTab=tab;renderLibrary();}});
const throwing=throwingUI({getState:()=>({project:play,inventory:playerInventory}),getLevel:()=>level(),art:(a,i)=>tokenArt(a,i),toast,
  perform:(choice,destination)=>{
    if(turnOutcome)return;
    const before=turnState(),result=throwObject(play,playerInventory,graveyard,choice,destination);
    play=result.project;playerInventory=result.inventory;graveyard=result.graveyard;
    throwing.cancel();notifyPlayEvents(before,result.events,result.log);render();toast('Object thrown.');
  }});
const entityMotion=entityEffects({art:(a,i)=>tokenArt(a,i)});
behaviourDragging({isPlay:()=>!!play,dispatch,onDragEnd:()=>{suppressClickUntil=Date.now()+200;}});
const atomicKinds={parameters:'Parameters',behaviours:'Behaviours',tags:'Tags',tokens:'Tokens'};
const atomicFilters=new Set(Object.keys(atomicKinds)),collapsedCatalogs=new Set();
let floorTile = 'floor';
let patrolId=null, showPatrols=!userTestSession;
const activePatrol=()=>level().patrols?.find(p=>p.id===patrolId);
function updatePatrol(changes){if(activePatrol())return dispatch({type:'patrol.update',data:{levelId:level().id,id:patrolId,...changes}});}
function newPatrol(){const patrol={id:uid(),name:'Patrol '+((level().patrols?.length||0)+1),color:activePatrol()?.color||'#e89750',nodes:[],hidden:false};patrolId=patrol.id;tool='patrol';staged=null;selected=null;showPatrols=true;dispatch({type:'patrol.add',data:{levelId:level().id,patrol}});}
const painterTile = () => tool === 'floor' ? floorTile : tool;
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
const unavailableTestLevel=blankLevel('unavailable-user-test-level','No levels available');
const shownLevels = () => (play || project).levels.filter(l=>!userTestSession||l.hideFromPlaytest!==true);
const level = () => shownLevels().find(l => l.id === levelId) || shownLevels()[0] || unavailableTestLevel;
const asset = id => (play || project).assets.find(a => a.id === id);
const tag = id => (play || project).tags.find(t => t.id === id);
const assetTags = a => a.tags.map(tag).filter(Boolean);
const currentProject = () => play || project;
levelTabDragging({host:$('#level-tabs'), getLevels:()=>currentProject().levels, isPlay:()=>!!play,
  move:(levelId,beforeId)=>dispatch({type:'level.move',data:{levelId,beforeId}}), announce:toast});
const tokenArt = (a,i=null) => {const visual=isState(a)?a:appearance(currentProject(),a,i);return sprite(visual.icon,visual.color,visual.variant);};
const stateSwitch = (a,i=null) => `<button class="state-switch ${stateEnabled(currentProject(),a,i)?'enabled':''}" ${i?`data-state-instance="${esc(i.id)}"`:''} data-toggle-state="${esc(a.id)}" role="switch" aria-checked="${stateEnabled(currentProject(),a,i)}" aria-label="Enable state ${esc(a.name)}">${stateEnabled(currentProject(),a,i)?'On':'Off'}</button>`;
const assetPath = a => a.parentId?`${assetPath(asset(a.parentId))} / ${a.name}`:a.name;
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
  if (connectionStart && !hasNode(level(),connectionStart)) connectionStart = null;
  setStatus(); render();
}
function receive(data) {
  workshopProgress.receive(data);
  if (userTestSession && testFlow?.ready) return;
  if (data.project && (data.project.version < 3 || !Array.isArray(data.project.cardDraws))) {
    serverNeedsRestart = true; connected = false; setStatus();
    toast('Restart the workshop server, then refresh to use this update.'); return;
  }
  if (data.project) {
    serverNeedsRestart = !serverSupportsEditor(appConfig);
    if(serverNeedsRestart)toast(serverUpdateMessage);
  }
  if (data.actionId) pending = pending.filter(p => p.actionId !== data.actionId);
  if (data.project && data.revision >= revision) { authoritative = data.project; revision = data.revision; rebuild(); }
}
let events, polling = false;
function receiveUpdate(data) {
  receive(data);
  if (userTestSession && data.project) testFlow?.start();
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
    polling = appConfig.transport === 'poll';
    if (polling) return poll();
    events = new EventSource(endpoint + '/events');
    events.onopen = () => { connected = !serverNeedsRestart; setStatus(); pump(); };
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
  if (userTestSession && (!play || testFlow?.blocked)) return false;
  if(snapToNodes && ['instance.add','instance.update'].includes(action.type)){
    const data=action.data, item=action.type==='instance.add'?data.instance:data;
    if(item.x!==undefined || item.y!==undefined){
      const l=currentProject().levels.find(l=>l.id===data.levelId), previous=l?.instances.find(i=>i.id===data.id);
      if(!l||!hasNode(l,[item.x??previous?.x,item.y??previous?.y].join(','))){toast('Snap to Nodes is on. Choose an existing node.');return false;}
    }
  }
  if (serverNeedsRestart) {toast(serverUpdateMessage);return false;}
  // Observations and deck history are shared even while pieces are playtested privately.
  if (play && (userTestSession || !action.type.startsWith('postIt.') && !action.type.startsWith('card.'))) {
    if(turnOutcome){toast('Clear Sequence to Restart, or go to the next level.');return false;}
    try {
      const before=turnState(),next=applyAction(play,action);checkPlaytestMovement(play,next,playtestMode);checkMovement(play,next,playerInventory);
      if(['instance.state','instance.resetStates'].includes(action.type))distractAfterStateEdit(play,next,action.data.levelId,action.data.id,playerInventory);
      play=next;notifyPlayEvents(before,movementEvents(before.project,play));render();return true;
    } catch(e) { toast(e.message);return false; }
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
  renderOutcome();
  const l = level();
  const focusedLevel = document.activeElement?.closest('#level-tabs [data-level]')?.dataset.level;
  $('#brand-icon').innerHTML = sprite('torch');
  $('#level-title').textContent = l.name;
  $('#snap-to-nodes').setAttribute('aria-pressed',String(snapToNodes));
  $('#snap-to-nodes').classList.toggle('active',snapToNodes);
  $('#dimensions').textContent = `${l.width} × ${l.height} GRID`;
  $('#asset-count').textContent = (play || project).assets.filter(a=>!a.parameterId).length + (play || project).tags.length + ((play || project).behaviourLibrary?.length||0);
  $('#token-count').textContent = `${l.instances.length} token${l.instances.length === 1 ? '' : 's'} placed`;
  $('#level-tabs').innerHTML = shownLevels().map((l,i) => {
    const state = userTestSession ? testFlow?.tabState(l.id) || 'locked' : '';
    const hiddenIcon=l.hideFromPlaytest===true?'<svg class="level-hidden-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Hidden from User Test"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="m3 3 18 18"/></svg>':'';
    return `<button data-level="${esc(l.id)}" class="${l.id === levelId ? 'active' : ''} ${state}" aria-current="${l.id === levelId}" ${state && state !== 'current' ? 'disabled' : ''} ${play||userTestSession?'':'data-reorderable="true" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"'} title="${state==='locked'?'Complete earlier levels to unlock':state==='completed'?'Completed · thank you for your feedback':play?'Current level':'Drag to reorder · Alt+Left/Right to move'}${hiddenIcon?' · Hidden from User Test':''}"><span>${state==='locked'?'🔒':state==='completed'?'✓':String(i+1).padStart(2,'0')}</span>${esc(l.name)}${hiddenIcon}${userTestSession?'<span class="level-avatars" aria-label="Players here"></span>':''}</button>`;
  }).join('');
  presence?.renderLevelAvatars();
  if (focusedLevel) [...$('#level-tabs').children].find(tab=>tab.dataset.level===focusedLevel)?.focus({preventScroll:true});
  $('#edit-mode').classList.toggle('active',!play); $('#play-mode').classList.toggle('active',!!play);
  $('#play-banner').hidden = !play; $('#tools').hidden = false;
  $('#playtest-mode').value=playtestMode;
  $('#play-banner span').textContent=playtestMode==='userTest'?'Move enabled objects one step to an adjacent connected node.':'Pieces & turns are private. Notes & cards are saved.';
  $('#turn-toolbar').hidden=!play;
  if (userTestSession) {
    const hasCompletion = play && level().instances.some(i => [asset(i.assetId), ...descendants(play, i.assetId)].some(a => a?.behaviours?.some(b => b.type === 'levelComplete' && b.enabled)));
    $('#test-manual-finish').hidden = !play || !!turnOutcome || testFlow?.blocked || hasCompletion;
  }
  if(play&&turnSequence){
    const turn=turnSequence.cursor;
    $('#turn-label').textContent=turn?`Turn ${turn}`:'Ready to start';
    const replayOnly=playtestMode==='userTest';
    $('#next-turn').textContent=replayOnly?'Replay next turn →':turn?'Next turn →':'Start turn 1 →';
    $('#next-turn').title=replayOnly?'Replay a recorded turn. Play an action to record new turns.':'Advance to the next turn';
    $('#previous-turn').disabled=turn===0;
    $('#next-turn').disabled=!!turnOutcome || replayOnly&&!hasRecordedNextTurn(turnSequence,turnState());
    $('#turn-log').disabled=!turn;
  }
  $('#canvas-wrap').classList.toggle('playtesting',!!play);
  if(play){releaseMissingCarriers(play,playerInventory);syncLifetimes(play,playerInventory);}
  renderInventory();renderInventory(true);
  $('#create-token').disabled = !!play; $('#add-level').disabled = !!play; $('#level-settings').disabled = !!play;
  $('#undo').disabled = !historyStack.length || !!play; $('#redo').disabled = !redoStack.length || !!play;
  $('#mode-label').innerHTML = `<span class="tiny-dot"></span>${play ? playtestModes[playtestMode].toUpperCase() : 'EDITING CANVAS'}`;
  const tools = [['select','↖','Select & move · V'],['floor','▦','Paint floor · F'],['patrol','〰','Patrol path'],['node','⊙','Paint path nodes · N'],['wall','▧','Paint walls · W'],['empty','⌫','Erase tiles · E'],['unlink','⋯','Erase connection · X'],['connect','↔','Reconnect nodes · C'],['link','⚯','Link objects · L']];
  $('#tools').innerHTML = (play?[]:tools).map(([id,icon,label]) => {
    const active=tool===id&&!staged;
    const button=`<button data-tool="${id}" class="${active?'active':''}" aria-label="${label}" data-tip="${label}" aria-pressed="${active}" ${id==='floor'?`aria-expanded="${active}" aria-controls="floor-variants"`:''}>${icon}</button>`;
    if(id!=='floor')return button;
    return `<div class="floor-tool">${button}<div id="floor-variants" class="floor-variants" role="group" aria-label="Floor type" ${active?'':'hidden'}><span class="floor-variants-title">Floor type</span>${floorVariants.map(({tile,label})=>`<button data-floor-tile="${tile}" aria-pressed="${floorTile===tile}" class="${floorTile===tile?'active':''}"><span class="floor-swatch ${tile}" aria-hidden="true"></span><span>${label}</span><span class="floor-choice-check" aria-hidden="true">${floorTile===tile?'✓':''}</span></button>`).join('')}</div></div>`;
  }).join('') + `<div class="tool-separator"></div><div class="parameter-layer-tool"><button data-tool="overlays" class="${visibleParameterLayers.size ? 'active' : ''}" aria-label="Parameter layers" aria-expanded="${layerMenuOpen}" aria-controls="parameter-layer-menu" data-tip="Show parameter layers">◉</button><div id="parameter-layer-menu" class="parameter-layer-menu" role="group" aria-label="Show parameter layers on all tokens" ${layerMenuOpen?'':'hidden'}><span class="floor-variants-title">Parameter layers</span>${parameterLayers.map(layer=>`<label><input type="checkbox" data-parameter-layer="${layer}" ${visibleParameterLayers.has(layer)?'checked':''}> ${layer}</label>`).join('')}<small>Show checked layers on all tokens. Selected tokens preview all their parameters.</small></div></div>`;
  $('#tools').insertAdjacentHTML('beforeend', '<button id="toggle-patrols" aria-label="Toggle patrol visibility" aria-pressed="'+showPatrols+'" data-tip="Hide / show patrols">〰</button>');
  $('#tools').insertAdjacentHTML('beforeend','<button id="behaviour-order" aria-label="Configure behaviour resolution order" data-tip="Behaviour resolution order">⇅</button>');
  renderPatrolPanel();
  $('#canvas-hint').innerHTML = play ? (playtestMode==='userTest'?'Move objects with “Can Be Moved in User Test” enabled one step to an adjacent connected node.<br><b>Piece changes are private. Post-its and cards stay saved.</b>':'Drag pieces to play. Piece changes are temporary.<br><b>Post-its and card draws stay shared and saved.</b>') : staged ? `Placing ${esc(asset(staged)?.name || 'token')}.<br><b>Click a cell to place. Esc to finish.</b>` : l.instances.length ? 'Every piece is a possibility.<br><b>Select a token to inspect its parameters.</b>' : 'An empty stage for your ideas.<br><b>Start with a token, or shape the ground.</b>';
  if (!play && ['connect','unlink'].includes(tool)) $('#canvas-hint').innerHTML = `${tool==='unlink'?'Erase a connection':'Reconnect nodes'}.<br><b>${connectionStart?'Now select an adjacent node.':'Click a line, or select two adjacent nodes.'}</b>`;
  if(!play&&!staged&&tool==='floor')$('#canvas-hint').innerHTML=floorTile==='stairs'?'Stairs connect different floor heights.<br><b>Click or drag to paint, then add path nodes with N.</b>':`${floorVariants.find(v=>v.tile===floorTile).label} floor.<br><b>Click or drag cells to paint. F opens floor types.</b>`;
  if(!play&&tool==='patrol')$('#canvas-hint').innerHTML='Select or create a patrol, then paint existing nodes in order.<br><b>Return to S from a connected node to close the patrol.</b>';
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
const patrolColors=[['#e89750','Orange'],['#5088dd','Blue'],['#75ad82','Green'],['#d66565','Red'],['#b281cf','Purple'],['#e5c359','Yellow'],['#55b5b2','Teal'],['#dc87b1','Pink']];
function patrolColorChoices(color,instance=false,hasColor=true){
  const custom=!patrolColors.some(([value])=>value===color.toLowerCase());
  return `<div class="patrol-colors" role="group" aria-label="${instance?'Object patrol color':'Patrol color'}">${patrolColors.map(([value,name])=>`<button type="button" class="patrol-color-swatch" ${instance?'data-instance-patrol-color':'data-patrol-color'}="${value}" style="--patrol-swatch:${value}" aria-label="${name} patrol color" aria-pressed="${hasColor&&value===color.toLowerCase()}" title="${name}"></button>`).join('')}<label class="patrol-custom-color ${hasColor&&custom?'selected':''}" style="--patrol-swatch:${color}" title="Choose a custom patrol color"><span aria-hidden="true">＋</span><input id="${instance?'instance-patrol-color':'patrol-color'}" type="color" value="${color}" aria-label="Custom ${instance?'object ':''}patrol color"></label></div>`;
}
function renderPatrolPanel() {
  let panel=$('#patrol-panel');
  if(!panel){panel=document.createElement('details');panel.id='patrol-panel';$('#canvas-wrap').append(panel);}
  const patrols=level().patrols||[], current=activePatrol();
  panel.hidden=tool!=='patrol'&&!patrols.length;
  if(tool==='patrol'&&!play)panel.open=true;
  panel.innerHTML=`<summary>Patrol paths · ${patrols.length}</summary><div class="patrol-list">${patrols.map(p=>`<div class="patrol-row"><button data-patrol="${esc(p.id)}" aria-pressed="${p.id===patrolId}"><span style="background:${p.color}"></span>${esc(p.name)}</button><label title="Show this patrol"><input type="checkbox" data-patrol-hidden="${esc(p.id)}" ${p.hidden?'':'checked'} aria-label="Show ${esc(p.name)}"></label></div>`).join('')}</div>${!play?`<button id="new-patrol">＋ New patrol</button>${current?`<div class="field"><label for="patrol-name">Name</label><input id="patrol-name" maxlength="80" value="${esc(current.name)}"></div><div class="field"><label>Color</label>${patrolColorChoices(current.color)}</div><small>Paint existing nodes in order. ${current.nodes.length} nodes.</small><div class="inspector-actions"><button id="swap-patrol">Swap S / E</button><button id="clear-patrol">Clear path</button><button id="delete-patrol" class="danger">Delete</button></div>`:''}`:''}`;
}
function patrolArtwork(l) {
  if(!showPatrols)return '';
  const patrols=(l.patrols||[]).filter(p=>!p.hidden).sort((a,b)=>Number(a.id===patrolId)-Number(b.id===patrolId));
  return `<svg class="patrol-artwork" viewBox="0 0 ${l.width} ${l.height}" preserveAspectRatio="none" aria-hidden="true">${patrols.map(p=>{
    const nodes=paint?.tile==='patrol'&&p.id===paint.patrolId?paint.nodes:p.nodes;
    const points=nodes.map(key=>key.split(',').map(Number).map(n=>n+.5));
    const focused=p.id===patrolId;
    const labels=isClosedPatrol(nodes)||points.length===1?[[points[0],'S/E']]:[[points[0],'S'],[points.at(-1),'E']];
    return `<g style="color:${p.color}" opacity="${activePatrol()&&!focused ? .45 : 1}"><polyline points="${points.map(v=>v.join(',')).join(' ')}"/><g>${points.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="${focused ? .16 : .12}"/>`).join('')}</g>${points.length?labels.map(([[x,y],label])=>`<text x="${x}" y="${y-.23}">${label}</text>`).join(''):''}</g>`;
  }).join('')}</svg>`;
}
function renderInventory(isGraveyard=false) {
  const panel=$(isGraveyard?'#player-graveyard':'#player-inventory');panel.hidden=!play;
  if(!play)return;
  const entries=isGraveyard?graveyard:playerInventory, expanded=isGraveyard?graveyardExpanded:inventoryExpanded;
  const key=isGraveyard?'graveyard':'inventory',title=isGraveyard?'Graveyard':'Player inventory';
  const icon=isGraveyard?'<path d="M6 22V8a6 6 0 0 1 12 0v14M3 22h18M12 5v8M9 8h6"/>':'<path d="M8 6V4a4 4 0 0 1 8 0v2M6 8 3 10v9h3m12-11 3 2v9h-3"/><rect x="6" y="6" width="12" height="16" rx="3"/><rect x="8.5" y="13" width="7" height="6" rx="1.5"/><path d="M9 10h6"/>';
  const total=entries.some(s=>s.count===0)?'∞':entries.reduce((n,s)=>n+s.count,0);
  panel.innerHTML=`<button id="${key}-toggle" class="inventory-header" aria-expanded="${expanded}" aria-controls="${key}-contents" title="${title} · drop objects here"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${icon}</svg><span>${title}</span><small>${total}</small><span aria-hidden="true">${expanded?'▾':'▸'}</span></button><div id="${key}-contents" ${expanded?'':'hidden'}><p class="inventory-hint">${isGraveyard?'Drop canvas pieces here to remove them from play. Drag back to restore.':'Drop canvas or library objects. 0 = ∞ (infinite). Drag out to place one.'}</p><ul>${entries.map(stack=>{
    const i=stack.items[0],a=asset(stack.assetId),name=esc(a?appearance(currentProject(),a,i).name:'Object'),quantity=stack.count===0?'∞':stack.count,individual=stack.items.some(i=>i.carriedBy||i.lifetimeProgress),clock=countdown(i);
    const carrier=i.carriedBy&&currentProject().levels.find(l=>l.id===i.carriedBy.levelId)?.instances.find(p=>p.id===i.carriedBy.instanceId);
    const status=[carrier?`Carried by ${asset(carrier.assetId)?.name}`:'',clock?`${clock.remaining} / ${clock.total} turns`:''].filter(Boolean).join(' · ');
    return `<li><div class="inventory-item" data-${key}-item="${esc(stack.id)}" draggable="true" tabindex="0" role="button" aria-label="${name}: ${stack.count===0?'infinite':quantity} items, drag onto canvas"><span class="inventory-icon">${a?tokenArt(a,i):''}<span class="stack-count" aria-label="${stack.count===0?'Infinite supply':quantity+' items'}">${quantity}</span></span><span>${name}${status?`<small class="inventory-carry-status">${esc(status)}</small>`:''}</span></div>${isGraveyard?'':`<div class="inventory-quantity"><button data-stack-adjust="${esc(stack.id)}" data-delta="-1" aria-label="Decrease ${name} quantity" title="Decrease quantity · 0 = infinite" ${stack.count===0||individual?'disabled':''}>−</button><button data-stack-adjust="${esc(stack.id)}" data-delta="1" aria-label="Increase ${name} quantity" title="Increase quantity" ${individual?'disabled':''}>+</button></div>`}<button data-discard-${key}="${esc(stack.id)}" aria-label="Remove ${name} from ${key}" title="Remove stack">×</button></li>`;
  }).join('')}</ul>${entries.length?'':`<p class="inventory-empty">${isGraveyard?'No pieces removed yet.':'Your backpack is empty.'}</p>`}</div>`;
}
function collectInInventory(payload,isGraveyard=false) {
  if(!play||turnOutcome||isGraveyard&&payload.type!=='instance')return;
  try{
    if(notePending)saveNote();
    const before=turnState(),oldIds=new Set(playerInventory.flatMap(s=>s.items.map(i=>i.id)));
    const result=collectItems(play,isGraveyard?graveyard:playerInventory,level().id,payload);if(!result)return;
    checkPlaytestMovement(play,result.project,playtestMode);
    if(playtestMode==='userTest'&&payload.type==='asset'&&!canMoveInPlaytest(play,{assetId:payload.id},playtestMode))throw Error('Only objects enabled for User Test can be added to the inventory.');
    play=result.project;
    if(isGraveyard){graveyard=result.inventory;graveyardExpanded=true;}else{playerInventory=result.inventory;inventoryExpanded=true;}
    notifyPlayEvents(before,isGraveyard?[]:playerInventory.flatMap(s=>s.items).filter(i=>!oldIds.has(i.id)).map(instance=>({type:'inventoryAdded',levelId:level().id,instanceId:instance.id,instance})));
    selected=null;render();
  }catch(error){toast(error.message);}
}
function renderBoard() {
  const l = level(), board = $('#board');
  board.dataset.paintTool=play?'select':tool;
  const preview=paint?clone(l):l;
  if(paint&&paint.tile!=='patrol')paintLevelTiles(preview,[...paint.cells],paint.tile);
  board.style.setProperty('--cols',l.width); board.style.setProperty('--rows',l.height); board.style.setProperty('--cell',`${48*zoom}px`);
  let html = '';
  for (let y = 0; y < l.height; y++) for (let x = 0; x < l.width; x++) {
    const key=`${x},${y}`,tile=preview.tiles[key],node=hasNode(preview,key);
    const floorVariant=floorVariants.find(v=>v.tile===tile);
    html += `<div class="cell ${isFloor(tile)?'floor ':''}${tile || (node?'node':'')}" role="gridcell" tabindex="0" data-x="${x}" data-y="${y}" aria-label="Column ${x+1}, row ${y+1}, ${tile==='stairs'?'stairs':floorVariant?floorVariant.label.toLowerCase()+' floor':tile || (node?'node':'empty')}${node&&isFloor(tile)?', path node':''}">`;
    if (node) html += `<span class="node-dot ${connectionStart===key?'connection-start':''}"></span>`;
    html += '</div>';
  }
  let lines = '', handles = '';
  for (const from of nodeCells(preview)) {
    const [x,y] = from.split(',').map(Number);
    for (const [nx,ny] of [[x+1,y],[x,y+1]]) {
      const to = `${nx},${ny}`;
      if (!canConnectNodes(preview,from,to)) continue;
      const connected = nodesConnected(preview,from,to), editing = !play && ['connect','unlink'].includes(tool);
      if (connected || editing) lines += `<line x1="${x+.5}" y1="${y+.5}" x2="${nx+.5}" y2="${ny+.5}" class="${connected?'':'broken'}"/>`;
      if (editing) handles += `<button class="link-handle ${ny!==y?'vertical':''}" data-link-from="${from}" data-link-to="${to}" style="--x:${(x+nx)/2+.5};--y:${(y+ny)/2+.5}" aria-label="${tool==='unlink'?'Erase':'Restore'} connection from column ${x+1}, row ${y+1} to column ${nx+1}, row ${ny+1}" title="${tool==='unlink'?'Erase':'Restore'} connection"></button>`;
    }
  }
  html += `<svg class="node-lines" viewBox="0 0 ${l.width} ${l.height}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${handles}`;
  html += patrolArtwork(l);
  for (const i of l.instances) {
    const a = asset(i.assetId); if (!a || !assetIsActive(currentProject(),a.id,i)) continue;
    const isSelected = selected?.type === 'instance' && (selected.id === i.id || editingTools?.isSelected(i.id));
    if (visibleParameterLayers.size || isSelected) html += overlays(a,i,l,isSelected);
    const children = activeDescendants(currentProject(),a.id,i);
    const facing=facingDirection(a,i);
    const stack = l.instances.filter(n => n.x === i.x && n.y === i.y).indexOf(i);
    html += `<button class="piece ${i.locked?'scenery-locked':''} ${isSelected?'selected':''} ${tool==='link'&&linkDraft.includes(i.id)?'link-picked':''}" data-instance="${esc(i.id)}" draggable="${tool!=='link'&&!i.locked&&canManuallyMove(i)}" title="${esc(a.name)} · ${(i.rotation+(a.rotation||0))%360}°" aria-label="${esc(a.name)} at ${i.x+1}, ${i.y+1}, rotated ${(i.rotation+(a.rotation||0))%360} degrees" style="--x:${i.x};--y:${i.y};--rotation:${(i.rotation+(a.rotation||0))%360}deg;${stack ? `margin-left:${stack*5}px;margin-top:${stack*-4}px;` : ''}">${tokenArt(a,i)}${i.patrolColor?`<span class="instance-color-dot" style="background:${i.patrolColor}" title="Patrol color ${i.patrolColor}"></span>`:''}${facing===null?'':`<span class="direction" data-facing="${facing}" aria-hidden="true">▴</span>`}${children.length ? `<span class="child-count">${children.length}</span>` : ''}</button>`;
  }
  html+=nestedBadges(currentProject(),l,tokenArt,esc);
  if(play){
    html+=carriedBadges(play,l,playerInventory,tokenArt,esc);
    for(const held of interactionOwners(play,l,playerInventory).filter(i=>i.carriedBy))if(visibleParameterLayers.size||selected?.id===held.carriedBy.instanceId)html+=overlays(asset(held.assetId),held,l,selected?.id===held.carriedBy.instanceId);
    const uses=availableUses(play,l,playerInventory),groups=new Map();
    for(const use of uses){const i=l.instances.find(i=>i.id===use.usedId),key=`${i.x},${i.y}`;if(!groups.has(key))groups.set(key,{i,count:0});groups.get(key).count++;}
    for(const {i,count} of groups.values()){
      const pickup=uses.filter(u=>u.usedId===i.id).every(u=>u.triggerType==='pickUp'),label=`${pickup?'Pick up':'Use'} ${asset(i.assetId).name}`;
      html+=`<button class="use-object-badge" data-use-object="${esc(i.id)}" style="--x:${i.x};--y:${i.y}" aria-label="${esc(label)}${count>1?' · choose object or action':''}" title="${count>1?'Choose an object or action':esc(label)}"><span aria-hidden="true">${pickup?'＋':'👋'}</span></button>`;
    }
    const throwGroups=new Map();
    for(const choice of availableThrows(play,l,playerInventory)){
      const i=l.instances.find(i=>i.id===choice.instanceId),key=`${i.x},${i.y}`;
      if(!throwGroups.has(key))throwGroups.set(key,{i,choices:[]});throwGroups.get(key).choices.push(choice);
    }
    for(const [key,{i,choices}] of throwGroups){
      const available=choices.some(c=>c.available),label=choices.length>1?'Choose a Throw Object action':`Throw ${asset(choices[0].throwAssetId).name}`;
      html+=`<button class="use-object-badge throw-object-badge ${groups.has(key)?'beside-use':''}" data-throw-object="${esc(i.id)}" style="--x:${i.x};--y:${i.y}" aria-label="${esc(label)}" aria-disabled="${!available}" title="${esc(available?label:label+' · object required in player inventory')}">${throwIcon}</button>`;
    }
  }
  board.innerHTML = html+objectLinkArtwork(l);
  throwing.render();
  $('#zoom-label').textContent = `${Math.round(zoom*100)}%`;
  entityMotion.flush(play,l.id);
}
function overlays(a,i,l,isSelected) {
  const effects = [a,...activeDescendants(currentProject(),a.id,i)].filter(a => parameterIcons.includes(a.icon));
  let result = '';
  for (const effect of effects) {
    if(!isSelected&&!visibleParameterLayers.has(parameterLayer(effect)))continue;
    const overlay=effect.behaviours?.some(b=>b.type==='blockNode'&&b.enabled)?parameterOverlay(currentProject(),a,effect,i,l):effectOverlay(currentProject(),a,effect,i,l,play?playerInventory:[]);
    for(const [x,y] of overlay.cells)result += `<span class="overlay-cell" style="--x:${x};--y:${y};--overlay:${overlay.color}"></span>`;
  }
  return result;
}
function renderLibrary() {
  panels.refresh();
  libraryTab=panels.activeTab();
  for(const view of ['objects','atomic'])renderLibraryView(view);
  $('#create-token').setAttribute('aria-label',libraryTab==='objects'?'Create token':'Create atomic parameter');
}
function renderLibraryView(view) {
  const p=currentProject(), tree=view==='objects', suffix=tree?'':'-atomic', library=$('#library'+suffix), search=librarySearch[view];
  if(tree)$('#library-root-drop').hidden=!!play;
  const matching=a=>!search || [a.name,a.rule,...assetTags(a).flatMap(t=>[t.name,t.rule]),...(a.behaviours||[]).flatMap(b=>[behaviourNames[b.type],p.behaviourLibrary?.find(d=>d.id===b.definitionId)?.name])].join(' ').toLowerCase().includes(search);
  $('#library-filters'+suffix).hidden=tree;
  $('#library-filters'+suffix).innerHTML=tree?'':Object.entries(atomicKinds).map(([id,label])=>`<button class="library-filter-card" data-atomic-filter="${id}" aria-pressed="${atomicFilters.has(id)}">${label}</button>`).join('');
  const branches=p.assets.filter(a=>p.assets.some(b=>b.parentId===a.id)||a.tags.length||a.behaviours?.length);
  const expanded=tree?branches.some(a=>!collapsedAssets.has(a.id)):[...atomicFilters].some(id=>!collapsedCatalogs.has(id));
  $('#library-collapse-all'+suffix).textContent=expanded?'Collapse all':'Expand all';
  $('#library-collapse-all'+suffix).dataset.expand=String(!expanded);
  library.setAttribute('aria-labelledby',`library-tab-${view}`);
  const row=(a,depth=0)=>{
    const state=isState(a), visual=appearance(p,a), branch=p.assets.some(b=>b.parentId===a.id)||a.tags.length||a.behaviours?.length;
    const collapsed=!search&&collapsedAssets.has(a.id);
    return `<div class="asset-row ${depth?'child':''} ${state?'state-row':''} ${state&&!a.enabled?'state-disabled':''} ${selected?.type==='asset'&&selected.id===a.id?'active':''}" data-asset="${esc(a.id)}" draggable="${!play||!isState(a)}" style="--depth:${depth};margin-left:${Math.min(depth,8)*14}px" tabindex="0" role="button" aria-label="${esc(a.name)}, ${state?'state':isParameter(a)?'parameter':'token'}">${tree&&branch?`<button class="tree-disclosure" data-collapse-asset="${esc(a.id)}" aria-label="${collapsed?'Expand':'Collapse'} ${esc(a.name)}" aria-expanded="${!collapsed}">${collapsed?'▸':'▾'}</button>`:'<span class="tree-spacer"></span>'}<div class="asset-icon" style="transform:rotate(${a.rotation||0}deg)">${tokenArt(a)}</div><div class="asset-copy"><strong>${esc(a.name)}</strong><small>${state?'STATE · '+(a.enabled?'enabled':'disabled'):isParameter(a)?iconNames[a.icon]+(a.icon==='self'?' · occupied cell':' · '+a.range+' cells'):iconVariants[visual.icon][visual.variant||defaultVariant(visual.icon)]}</small></div>${state?stateSwitch(a):`<button class="asset-place" data-rotate-asset="${esc(a.id)}" title="Rotate shared definition 90° · updates all placements" aria-label="Rotate ${esc(a.name)} 90 degrees" ${play?'disabled':''}>↻</button><button class="asset-place" data-place="${esc(a.id)}" aria-label="Place ${esc(a.name)}" ${play?'disabled':''}>＋</button>`}</div>`;
  };
  const show=(a,depth=0)=>{
    let html=row(a,depth);
    if(!search&&(collapsedAssets.has(a.id)||(isState(a)&&!a.enabled)))return html;
    if(tree) {
      html+=assetTags(a).map(t=>`<div class="tree-tag" style="margin-left:${(Math.min(depth,8)+1)*14+26}px">${tagChip(t)}</div>`).join('');
      html+=(a.behaviours||[]).map(b=>`<div class="tree-tag tree-behaviour" style="margin-left:${(Math.min(depth,8)+1)*14+26}px">${behaviourChip(p,b,{assetId:a.id,play:!!play})}</div>`).join('');
      html+=p.assets.filter(b=>b.parentId===a.id).map(b=>show(b,depth+1)).join('');
    }
    return html;
  };
  // Search selects whole object trees, including inactive states and sibling branches.
  let html=tree?p.assets.filter(a=>!a.parentId&&!isState(a)&&!isParameter(a)&&(!search||[a,...descendants(p,a.id)].some(matching))).map(a=>show(a)).join(''):Object.entries(atomicKinds).filter(([id])=>atomicFilters.has(id)).map(([id,label])=>{
    const entries=id==='tags'?p.tags.filter(t=>!search||[t.name,t.rule].join(' ').toLowerCase().includes(search)):id==='behaviours'?(p.behaviourLibrary||[]).filter(b=>!search||[b.name,b.rule,behaviourNames[b.behaviour.type]].join(' ').toLowerCase().includes(search)):p.assets.filter(a=>!isState(a)&&(id==='parameters'?isParameter(a)&&!a.parameterId:!isParameter(a))&&matching(a));
    const content=id==='tags'?`<div class="catalog-tags">${entries.map(t=>`<button class="tag" data-edit-tag="${esc(t.id)}" draggable="${!play}" data-tag="${esc(t.id)}" style="--tag-color:${t.color}" title="${esc(t.rule||'Edit tag')}">${esc(t.name)}</button>`).join('')}</div>`:id==='behaviours'?`<div class="catalog-behaviours">${entries.map(b=>`<div class="behaviour-catalog-item">${behaviourChip(p,b.behaviour,{definition:b,catalog:true,play:!!play})}<button class="behaviour-attach" data-attach-behaviour="${esc(b.id)}" aria-label="Attach ${esc(b.name)} to selected item" title="Attach to selected item" ${play||!activeAsset()?'disabled':''}>＋</button></div>`).join('')}</div>`:entries.map(a=>row(a)).join('');
    return `<section class="atomic-catalog"><div class="atomic-catalog-heading"><button data-collapse-catalog="${id}" aria-expanded="${!collapsedCatalogs.has(id)}">${collapsedCatalogs.has(id)?'▸':'▾'} ${label} <span>${entries.length}</span></button><button data-create-atomic="${id}" aria-label="Create ${label.toLowerCase()}" ${play?'disabled':''}>＋</button></div>${collapsedCatalogs.has(id)&&!search?'':content||'<p class="pool-empty">'+(search?'No matches.':'Use + to create a building block.')+'</p>'}</section>`;
  }).join('');
  library.innerHTML=(staged?`<div class="staged-hint">Click the level to place ${esc(asset(staged)?.name)}. Esc to finish.</div>`:'') + (html||`<p class="pool-empty">${search?'No matches in this tab.':tree?'Create a token to build an object hierarchy.':'Choose filter cards above to show building blocks.'}</p>`) + (!p.assets.length&&!p.tags.length&&!play?`<button class="text-btn" id="load-example${suffix}">Explore an example ↗</button>`:'');
}
function compositionTree(a,depth=0,i=null) {
  return currentProject().assets.filter(b=>b.parentId===a.id).map(c=>{
    if(!isState(c)&&!assetIsActive(currentProject(),c.id,i))return '';
    return `<div class="composition-branch" style="--depth:${depth}"><div class="nested-chip">${tokenArt(c)}<button class="inspect-child" data-inspect-child="${esc(c.id)}">${esc(c.name)}</button>${isState(c)?stateSwitch(c,i):''}</div>${isState(c)&&!stateEnabled(currentProject(),c,i)?'':`<div class="nested-contents"><div class="tags">${assetTags(c).map(tagChip).join('')}</div>${compositionTree(c,depth+1,i)}</div>`}</div>`;
  }).join('');
}
function inspectorBehaviourTree(node,root=true){
  const ranks=new Map((currentProject().behaviourOrder||[]).map((id,n)=>[id,n]));
  const chips=[...(node.asset.behaviours||[])].sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity)).map(b=>behaviourChip(currentProject(),b,{assetId:node.asset.id,play:!!play,hierarchy:true})).join('');
  const content=`<div class="behaviour-chips ${play?'':'behaviour-drop-zone'}" ${play?'':`data-behaviour-owner="${esc(node.asset.id)}"`} aria-label="Behaviours for ${esc(node.asset.name)}">${chips}</div>${node.children.map(c=>inspectorBehaviourTree(c,false)).join('')}`;
  if(root)return content||'<p class="behaviour-empty">No behaviours in this item or its state branches.</p>';
  return `<details class="behaviour-hierarchy-branch ${node.active?'':'behaviour-branch-inactive'}" open><summary>${tokenArt(node.asset)}<span>${esc(node.asset.name)}</span>${isState(node.asset)?`<small>State · ${node.active?'on':'off'}</small>`:!node.active?'<small>inactive</small>':''}</summary><div class="behaviour-hierarchy-contents">${content}</div></details>`;
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
  el.innerHTML=`<div class="eyebrow">${i?'PLACED TOKEN':isState(a)?'STATE DEFINITION':'TOKEN DEFINITION'}</div><div class="inspector-top"><div class="asset-icon">${tokenArt(a,i)}</div><div><h3>${esc(a.name)}</h3><small>${i?`CELL ${i.x+1}, ${i.y+1} · ${(i.rotation+(a.rotation||0))%360}° ICON ROTATION${facingDirection(a,i)===null?'':` · FACING ${['UP','RIGHT','DOWN','LEFT'][facingDirection(a,i)/90]}`}`:a.parentId?esc(assetPath(a)):'REUSABLE BUILDING BLOCK'}</small></div></div><p>${esc(a.rule||'No rule yet. What should this token mean?').replace(/\n/g,'<br>')}</p>${isState(a)?stateSwitch(a):''}${!active?'<p class="state-inactive-note">This branch is disabled. Its contents are hidden from the active object.</p>':''}<div class="tags">${tags.map(tagChip).join('')}</div>${isParameter(a)&&a.icon!=='self'?`<div class="field"><label for="quick-range">${a.icon==='area'?'Radius':a.icon==='cross'?'Arm length':'Length'} <span id="quick-range-value">${a.range}</span> cells</label><input id="quick-range" type="range" min="1" max="12" value="${a.range}" ${play?'disabled':''}></div>`:''}${['cone','rectangle'].includes(a.icon)?`<div class="field"><label for="quick-width">Width in cells${a.icon==='cone'?' · far edge':''}</label><input id="quick-width" type="number" min="1" max="${a.icon==='cone'?11:12}" step="${a.icon==='cone'?2:1}" value="${a.icon==='cone'?2*Math.floor(((a.width??3)-1)/2)+1:(a.width??3)}" ${play?'disabled':''}></div>`:''}${states.length?`<div class="nested-title">STATES · ${i?'THIS PIECE ONLY':'DEFINITION DEFAULTS'}</div><label class="check-row"><input type="checkbox" data-exclusive-states="${esc(a.id)}" ${a.exclusiveStates?'checked':''} ${play?'disabled':''}> Mutually exclusive states (shared definition)</label>${i?'<button id="reset-piece-states">Use definition defaults</button>':''}`:''}${states.length>1?`<p class="state-help">${a.exclusiveStates?'Only one sibling state can be enabled.':'States combine; the last enabled state supplies the icon.'} ${i?'Switches here affect only this placement.':''}</p>`:''}${active&&p.assets.some(b=>b.parentId===a.id)?compositionTree(a,0,i):''}${!isParameter(a)?`<div class="inspector-actions"><button data-create-kind="state" data-parent="${esc(a.id)}" ${play?'disabled':''}>＋ Add state</button><button data-create-kind="token" data-parent="${esc(a.id)}" ${play?'disabled':''}>＋ Add token</button><button data-create-kind="parameter" data-parent="${esc(a.id)}" ${play?'disabled':''}>＋ Parameter</button></div>`:''}${i?`<div class="field"><label for="instance-note">Placement notes</label><textarea id="instance-note" data-instance-note="${esc(i.id)}" maxlength="4000">${esc(i.note||'')}</textarea></div>`:''}<div class="inspector-actions">${i?'<button id="rotate-piece">↻ Rotate icon 90°</button><button id="rotate-facing">▴ Rotate facing</button><button id="duplicate-piece">⧉ Duplicate</button>':!isState(a)?`<button id="place-selected" ${play?'disabled':''}>＋ Place in level</button>`:''}<button id="edit-definition" ${play?'disabled':''}>Edit ${isState(a)?'state':'token'}</button></div><div class="inspector-actions"><button class="danger" id="delete-selected" ${play&&!i?'disabled':''}>${i?'Remove from level':isState(a)?'Delete state':'Delete token'}</button>${!i&&a.parentId&&!isState(a)?'<button id="detach-token">↳ Detach</button>':''}</div>`;
  if(!isState(a)&&!isParameter(a))el.insertAdjacentHTML('beforeend',`<label class="check-row"><input type="checkbox" data-user-test-movable="${esc(a.id)}" ${a.canBeMovedInUserTest?'checked':''} ${play?'disabled':''}> Can Be Moved in User Test</label><p>Shared object definition · off by default.</p>`);
  const parent=!i&&a.parentId?asset(a.parentId):null;
  if(parent)el.insertAdjacentHTML('afterbegin',`<button type="button" class="definition-back" data-inspect-child="${esc(parent.id)}" title="Back to parent definition: ${esc(parent.name)}" aria-label="Back to parent definition: ${esc(parent.name)}"><span aria-hidden="true">←</span><span>Back to ${esc(parent.name)}</span></button>`);
  if(isParameter(a)) {
    el.querySelector('.inspector-top').insertAdjacentHTML('afterend',`<p>Parameter layer: <b>${esc(parameterLayer(a))}</b></p>`);
    $('#edit-definition').textContent='Edit parameter';
    if(!i){el.querySelector('.eyebrow').textContent=a.parameterId?'SHARED PARAMETER USE':'PARAMETER DEFINITION';$('#delete-selected').textContent=a.parameterId?'Detach parameter':'Delete parameter';}
  }
  const hierarchy=behaviourHierarchy(p,a.id,i,{includeEmpty:!play});
  const count=node=>(node.asset.behaviours?.length||0)+node.children.reduce((n,c)=>n+count(c),0);
  el.insertAdjacentHTML('beforeend',`<div class="nested-title">BEHAVIOURS · ${count(hierarchy)}</div><div class="inspector-behaviours">${inspectorBehaviourTree(hierarchy)}</div><div class="inspector-actions"><button id="edit-behaviours" ${play?'disabled':''}>Behaviours · ${a.behaviours?.length||0} assigned</button><button id="inspector-behaviour-order">Resolution order</button></div>${i?`<p class="move-target-summary">Move target: ${esc(moveTargetLabel(i))}</p><button id="set-move-target">Set move target</button>`:''}`);
  if(i) {
    el.insertAdjacentHTML('beforeend',`<div class="field"><label for="instance-patrol-color">Patrol color dot</label>${patrolColorChoices(i.patrolColor||activePatrol()?.color||'#e89750',true,!!i.patrolColor)}<div class="inspector-actions"><button id="use-patrol-color" ${activePatrol()?'':'disabled'}>Use selected patrol color</button><button id="clear-patrol-color" ${i.patrolColor?'':'disabled'}>Remove dot</button></div><small>Choose a color to identify this placement's patrol.</small></div>`);
    const links=(level().objectLinks||[]).filter(link=>link.instanceIds.includes(i.id));
    el.insertAdjacentHTML('beforeend',`<div class="nested-title">LINKS · ${links.length}</div><div class="inspector-links">${links.map(link=>`<button data-object-link="${esc(link.id)}"><span style="background:${link.color}"></span>${esc(link.name)}</button>`).join('')}</div>`);
  }
}
function objectLinkArtwork(l) {
  let lines='',labels='';
  for(const link of l.objectLinks||[]) {
    if(!visibleParameterLayers.size && !(selected?.type==='instance'&&link.instanceIds.includes(selected.id)) && !(selected?.type==='objectLink'&&selected.id===link.id))continue;
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
    if(dispatch(action)===false)return;
    closeDialog();linkDraft=[];tool='select';selected={type:'objectLink',id:draft.id};render();
  };
  if(existing)$('#delete-editing-link').onclick=()=>{deleteObjectLink(existing.id);closeDialog();};
  watchEditor($('#object-link-form'));
}
function fitBoard() {
  entityMotion.clear();
  const view = $('#board-viewport'), l=level();
  zoom = Math.min(1.3, Math.max(.3, Math.min((view.clientWidth-30)/(l.width*48),(view.clientHeight-15)/(l.height*48)))); renderBoard();
}
function changeZoom(delta) { entityMotion.clear();zoom=Math.max(.3,Math.min(2,zoom+delta)); renderBoard(); }
function selectInstance(id) { editingTools?.onSingleSelect(id);selected={type:'instance',id}; staged=null; tool='select'; render(); }
function place(assetId,x,y) {
  if (!asset(assetId)) return;
  if(isState(asset(assetId)))return toast('States belong inside a token; place their parent token instead.');
  const instance={id:uid(),assetId,x,y,rotation:0,note:''};
  selected={type:'instance',id:instance.id};
  dispatch({type:'instance.add',data:{levelId:level().id,instance}});
}
function rotate() { const i=activeInstance(); if(i) dispatch({type:'instance.update',data:{levelId:level().id,id:i.id,rotation:(i.rotation+90)%360}}); }
function rotateFacing(){const i=activeInstance();if(i){const facing=facingDirection(asset(i.assetId),i);dispatch({type:'instance.update',data:{levelId:level().id,id:i.id,direction:facing===null?0:(facing+90)%360}});}}
function removeSelected() {
  if(activePostIt()){dispatch({type:'postIt.delete',data:{levelId:level().id,id:selected.id}});selected=null;render();return;}
  if(selected?.type==='objectLink'){deleteObjectLink(selected.id);return;}
  const i=activeInstance(), a=activeAsset(); if(!a)return;
  if(i) { if(dispatch({type:'instance.delete',data:{levelId:level().id,id:i.id}})!==false){selected=null;render();} }
  else if(a.parameterId){dispatch({type:'asset.delete',data:{id:a.id}});selected=null;render();}
  else if(isParameter(a))confirmDialog(`Delete ${a.name}?`,'This deletes the shared parameter definition, all attached uses, and its placements from every level.','Delete parameter',()=>{dispatch({type:'asset.delete',data:{id:a.id}});selected=null;render();});
  else confirmDialog(`Delete ${a.name}?`,'This removes this token, its nested tokens, and their placements from every level.','Delete token',()=>{dispatch({type:'asset.delete',data:{id:a.id}});selected=null;render();});
}
function stage(id) { if(play)return;if(isState(asset(id)))return toast('Place the parent token instead of a state.'); staged=id; selected={type:'asset',id};tool='select';connectionStart=null; render();toast(`Click a cell to place ${asset(id).name}.`); }
function moveTargetLabel(instance){
  if(instance.distraction){const d=instance.distraction,wait=d.phase==='return'?d.returnWait:d.approachWait;if(wait>0)return `Distraction · ${d.phase==='return'?'returning':'approaching'} in ${wait} turn${wait===1?'':'s'}`;return d.phase==='return'?`Distraction · returning to ${d.origin.x+1}, ${d.origin.y+1}`:`Distraction · approaching ${asset(level().instances.find(i=>i.id===d.sourceId)?.assetId)?.name||'impact position'}`;}
  const target=instance.moveTarget;
  if(!target||target.type==='self')return 'Self';
  if(target.type==='tags')return 'Tags: '+(target.tagIds.map(id=>currentProject().tags.find(t=>t.id===id)?.name||id).join(', ')||'none');
  if(target.type==='position')return `Column ${target.x+1}, row ${target.y+1}`;
  const item=level().instances.find(i=>i.id===target.id);
  return item?`${asset(item.assetId)?.name} · ${item.x+1}, ${item.y+1}`:'Missing object';
}
const turnState=()=>({project:play,inventory:playerInventory,graveyard,levelId:level().id,...(turnOutcome?{outcome:turnOutcome}:{})});
function renderOutcome(){
  if(play&&!eventTurnQueued&&!turnOutcome)turnOutcome=gameOutcome(play,graveyard,level().id);
  const outcome=play&&turnOutcome,overlay=$('#game-outcome');
  overlay.hidden=!outcome || userTestSession && testFlow?.blocked;
  $('#clear-turns').classList.toggle('restart-highlight',outcome?.type==='gameOver');
  for(const selector of ['#board','#player-inventory','#player-graveyard','#definition-contents'])$(selector).inert=!!outcome;
  if(!outcome)return;
  throwing.cancel();
  $('#game-outcome-title').textContent=outcome.type==='gameOver'?'Game Over':'Level Complete';
  $('#game-outcome-message').textContent=outcomeMessages[outcome.type];
  const next=play.levels[play.levels.findIndex(l=>l.id===outcome.levelId)+1];
  $('#next-level').hidden=outcome.type!=='levelComplete'||!next&&!userTestSession;
  $('#next-level').textContent=userTestSession?'Share feedback →':'Go to next level →';
  $('#game-outcome-detail').textContent=userTestSession?(outcome.type==='levelComplete'?'Enjoy your little victory! A few quick thoughts, then onward.':'Take a breath. Reset this level whenever you’re ready.'):outcome.type==='levelComplete'&&!next?'You GOt through every level! Clear Sequence to play again.':'Your sequence has been saved automatically.';
  // Re-renders and turn navigation must not repeatedly download the same ending.
  const key=JSON.stringify([turnSequence?.cursor,outcome]);
  if(!userTestSession&&!savedOutcomes.has(key)){
    savedOutcomes.add(key);saveTurns();
  }
}
function nextLevel(){
  if(!play||turnOutcome?.type!=='levelComplete')return;
  if(userTestSession){$('#game-outcome').hidden=true;return testFlow?.finish(testCompletion);}
  const next=play.levels[play.levels.findIndex(l=>l.id===turnOutcome.levelId)+1];
  if(!next)return;
  saveNote();turnOutcome=null;levelId=next.id;
  // Other levels also resolve turns, so restore the saved design for a fresh start.
  playInitialState=createPlaytestState(turnSequence.frames[0].project,next.id);
  play=clone(playInitialState.project);playStart=clone(play);playerInventory=clone(playInitialState.inventory);graveyard=[];inventoryExpanded=playerInventory.length>0;savedOutcomes.clear();
  turnSequence=createSequence(turnState());restoreTurn();fitBoard();
}
function notifyPlayEvents(before,events,actionLog=[],actionEffects){
  if(!play||eventTurnQueued)return;
  actionEffects??=trayTransferEffects(before,turnState());
  entityMotion.enqueue(actionEffects);
  if(!eventsAdvanceTurn(before.project,play,events)){
    const outcome=gameOutcome(play,graveyard,level().id);
    if(outcome){turnSequence=eventTurn(turnSequence,before,{...turnState(),outcome},actionLog,actionEffects);turnOutcome=outcome;}
    return;
  }
  const session=playStart,prior=clone(before);eventTurnQueued=true;
  queueMicrotask(()=>{
    eventTurnQueued=false;if(!play||session!==playStart)return;
    try{turnSequence=eventTurn(turnSequence,prior,turnState(),actionLog,actionEffects);restoreTurn(true,actionEffects.length);}
    catch(error){toast(error.message);}
  });
}
function useCanvasObject(id){
  if(!play||turnOutcome)return;
  const anchor=level().instances.find(i=>i.id===id),stacked=new Set(level().instances.filter(i=>anchor&&i.x===anchor.x&&i.y===anchor.y).map(i=>i.id));
  const choices=availableUses(play,level(),playerInventory).filter(use=>stacked.has(use.usedId));
  const perform=choice=>{
    try{
      const before=turnState(),result=useObject(play,playerInventory,graveyard,choice);
      play=result.project;playerInventory=result.inventory;graveyard=result.graveyard;
      notifyPlayEvents(before,result.events,result.log,result.visualEffects);render();toast(result.log[0]?.message||'Used object.');
    }catch(error){toast(error.message);}
  };
  if(choices.length===1)return perform(choices[0]);
  if(!choices.length)return toast('This object is no longer usable from here.');
  showDialog(modal('Choose a Use action',`<div class="use-action-choices">${choices.map((choice,n)=>{const owner=interactionOwners(play,level(),playerInventory).find(i=>i.id===choice.instanceId),used=level().instances.find(i=>i.id===choice.usedId),collector=level().instances.find(i=>i.id===choice.collectorId);return `<button data-use-choice="${n}">${esc(asset(used.assetId).name)} · ${esc(used.id.slice(0,5))}<small>${esc(asset((collector||owner).assetId).name)} / ${effectActions[choice.action]||behaviourNames[choice.triggerType]}</small></button>`;}).join('')}</div>`));
  $('#dialog-content').querySelectorAll('[data-use-choice]').forEach(button=>button.onclick=()=>{closeDialog();perform(choices[Number(button.dataset.useChoice)]);});
}
function dropCanvasItem(id){
  if(!play||turnOutcome||eventTurnQueued)return;
  try{
    const before=turnState(),result=dropCarriedItem(play,playerInventory,graveyard,level().id,id);
    play=result.project;playerInventory=result.inventory;notifyPlayEvents(before,result.events);render();toast('Object dropped.');
  }catch(error){toast(error.message);}
}
function throwCanvasObject(id){
  if(!play||turnOutcome)return;
  const anchor=level().instances.find(i=>i.id===id),stacked=new Set(level().instances.filter(i=>anchor&&i.x===anchor.x&&i.y===anchor.y).map(i=>i.id));
  const choices=availableThrows(play,level(),playerInventory).filter(c=>stacked.has(c.instanceId));
  const choose=choice=>{if(!choice.available){toast('The object must be in the player inventory.');return;}throwing.start(choice);};
  if(choices.length===1)return choose(choices[0]);
  if(!choices.length)return toast('This throw is no longer available.');
  showDialog(modal('Choose a Throw Object action',`<div class="use-action-choices">${choices.map((choice,n)=>`<button data-throw-choice="${n}" ${choice.available?'':'disabled'}>${esc(asset(choice.throwAssetId).name)}<small>${esc(asset(level().instances.find(i=>i.id===choice.instanceId).assetId).name)} / ${esc(asset(choice.assignedId).name)}${choice.available?'':' · required in player inventory'}</small></button>`).join('')}</div>`));
  $('#dialog-content').querySelectorAll('[data-throw-choice]').forEach(button=>button.onclick=()=>{closeDialog();choose(choices[Number(button.dataset.throwChoice)]);});
}
function restoreTurn(animate=false,skipEffects=0){
  throwing.cancel();
  if(!animate)entityMotion.clear();
  const frame=clone(turnSequence.frames[turnSequence.cursor]);
  if(animate)entityMotion.enqueue((frame.visualEffects||[]).slice(skipEffects));
  turnOutcome=frame.outcome||null;
  play=frame.project;playerInventory=frame.inventory;graveyard=frame.graveyard;levelId=frame.levelId;
  selected=null;staged=null;tool='select';connectionStart=null;linkDraft=[];render();
  const feedback=frame.log.filter(row=>row.message);
  if(feedback.length)toast(feedback.map(row=>row.message).join(' '));
}
function clearTurns(){
  if(userTestSession && testFlow?.blocked)return;
  if(!play)return;
  testCompletion='automatic';
  turnOutcome=null;savedOutcomes.clear();
  saveNote();play=clone(playStart);playerInventory=clone(playInitialState?.inventory||[]);graveyard=clone(playInitialState?.graveyard||[]);
  levelId=playInitialState?.levelId||play.levels[0].id;
  turnSequence=createSequence(turnState());restoreTurn();toast('Turn sequence cleared. Starting layout restored.');
}
function advanceTurn(previous=false){
  if(userTestSession && testFlow?.blocked)return;
  if(!play||!turnSequence)return;
  if(turnOutcome&&!previous)return;
  saveNote();
  try{turnSequence=previous?previousTurn(turnSequence,turnState()):nextTurn(turnSequence,turnState(),undefined,{recordedOnly:playtestMode==='userTest'});entityMotion.clear();restoreTurn(!previous);}
  catch(error){toast(error.message);}
}
function saveTurns(){
  if(!play||!turnSequence)return;
  saveNote();turnSequence=captureSequence(turnSequence,turnState());
  const blob=new Blob([JSON.stringify(turnSequence)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`plague-tale-go-${room}-turns.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Private turn sequence saved.');
}
$('#import-turns').onchange=async e=>{
  const file=e.target.files[0],session=playStart;e.target.value='';if(!file||!play)return;
  try{
    if(file.size>50*1024*1024)throw Error('Turn sequences must be smaller than 50 MB.');
    const sequence=validateSequence(JSON.parse(await file.text()));
    if(!play||session!==playStart)return;
    saveNote();savedOutcomes.clear();if(sequence.frames[sequence.cursor].outcome)savedOutcomes.add(JSON.stringify([sequence.cursor,sequence.frames[sequence.cursor].outcome]));turnSequence=sequence;playInitialState=clone(sequence.frames[0]);playStart=clone(sequence.frames[0].project);playStartRevision=null;restoreTurn();fitBoard();toast('Private turn sequence loaded.');
  }catch(error){toast(error.message);}
};
function turnLog(){
  const frame=turnSequence?.frames[turnSequence.cursor];if(!frame)return;
  showDialog(modal(`Turn ${turnSequence.cursor} · Resolution log`,`<p>${frame.log.length} behaviours resolved. Counts show objects affected, copies created, or nodes moved.</p><ol class="turn-resolution-log">${frame.log.slice(0,500).map(row=>`<li><strong>${esc(row.assetName)}</strong> · ${behaviourNames[row.type]}${row.triggerType?` / ${behaviourNames[row.triggerType]}`:''}${row.action?` / ${effectActions[row.action]}`:''}<span>${row.count}</span>${row.message?`<small class="turn-feedback">${esc(row.message)}</small>`:''}</li>`).join('')||'<li>No active behaviours this turn.</li>'}</ol>${frame.log.length>500?'<p>Showing the first 500 entries. The saved sequence contains the complete log.</p>':''}`));
}
let dialogEditor=null;
function showDialog(content) { dialogEditor=null;$('#dialog').dataset.deckView='';$('#dialog-content').innerHTML=content; if(!$('#dialog').open)$('#dialog').showModal(); }
const dialogParents=[];
function suspendDialog(restore=()=>{}) {
  const content=document.createDocumentFragment(),focus=document.activeElement,scroll=$('#dialog').scrollTop;
  content.append(...$('#dialog-content').childNodes);
  dialogParents.push({content,scroll,focus,restore,editor:dialogEditor});
}
function watchEditor(root,extra,save=()=>root.requestSubmit()) {
  dialogEditor=editorDraft(root,save,extra);
}
const closeDialog=()=>{
  dialogEditor=null;
  const parent=dialogParents.pop();
  if(parent){$('#dialog-content').replaceChildren(parent.content);dialogEditor=parent.editor;$('#dialog').scrollTop=parent.scroll;parent.restore();parent.focus?.focus();}
  else $('#dialog').close();
};
function requestCloseDialog() {
  if(!dialogEditor?.dirty())return closeDialog();
  promptToSave(dialogEditor,closeDialog);
}
function promptToSave(editor,discard) {
  suspendDialog();
  showDialog(modal('Save changes before closing?','<p class="confirm-box">You have unsaved changes. Would you like to save them before closing this editor?</p>',
    '<button data-close autofocus>Keep editing</button><button class="danger" id="discard-editor">Discard changes</button><button class="primary" id="save-editor">Save changes</button>'));
  $('#discard-editor').onclick=()=>{closeDialog();discard();};
  // Restore first: validation and failed saves must leave the draft open.
  $('#save-editor').onclick=()=>{closeDialog();editor.save();};
  $('#dialog-content [data-close]').focus();
}
const hasUnsavedEditors=()=>!!dialogEditor?.dirty()||dialogParents.some(parent=>parent.editor?.dirty());
$('#dialog').addEventListener('cancel',e=>{e.preventDefault();requestCloseDialog();});
function modal(title,body,footer='',eyebrow='THE WORKBENCH') { return `<div class="modal"><div class="eyebrow">${eyebrow}</div><div class="modal-head"><h2>${esc(title)}</h2><button data-close aria-label="Close dialog">×</button></div>${body}${footer?`<div class="modal-footer">${footer}</div>`:''}</div>`; }
const behaviourTools=behaviourEditor({getProject:currentProject,getLevel:level,isPlay:()=>!!play,dispatch,showDialog,modal,closeDialog,watchEditor,esc,toast,assetPath});
function createAtomic(kind){
  if(play)return;
  if(kind==='behaviours')behaviourTools.block();
  else if(kind==='tags')tagDialog();
  else tokenDialog(undefined,kind==='parameters'?'parameter':'token');
}
function attachBehaviour(definitionId,a=activeAsset()){
  if(play||!a)return;
  if(dispatch({type:'behaviour.attach',data:{id:a.id,definitionId,usageId:uid()}})!==false)toast('Shared behaviour attached. Edit its block to update every use.');
}
function confirmDialog(title,text,label,action) {
  const fromEditor=!!dialogEditor;
  if(fromEditor)suspendDialog();
  showDialog(modal(title,`<p class="confirm-box">${esc(text)}</p>`,'<button data-close>Cancel</button><button class="primary" id="confirm-action">'+esc(label)+'</button>'));
  $('#confirm-action').onclick=()=>{closeDialog();if(fromEditor)closeDialog();action();};
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
  watchEditor($('#post-it-form'));
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
function tokenDialog(existing, kind='token', parentId=null, onSaved=null, initialName='') {
  if(play)return;
  const parent=asset(parentId);
  const draft=clone(existing || {id:uid(),kind:kind==='state'?'state':'token',name:initialName,icon:kind==='parameter'?'area':kind==='state'?(parent?.icon||'torch'):'torch',rule:'',color:parent?.color||'#b8cf96',tags:[],range:2,parentId,...(kind==='state'?{enabled:true}:{})});
  draft.variant ||= kind==='state'?(parent?.variant||defaultVariant(draft.icon)):defaultVariant(draft.icon);
  const editorLabel=()=>isState(draft)?'state':isParameter(draft)?'parameter':'token';
  const forbidden=new Set([draft.id,...descendants(project,draft.id).map(a=>a.id)]);
  showDialog(modal(`${existing?'Edit':'Create'} a ${editorLabel()}`,`<form id="token-form"><div class="field"><label for="token-name">Name <span class="muted">· required</span></label><input id="token-name" maxlength="80" required placeholder="A torch, a rule, a possibility…" value="${esc(draft.name)}" autofocus></div>${(isState(draft)?[false]:[false,true]).map(parameter=>`<div class="field-label">${parameter?'Parameters · visual behavior':'Token icons'}</div><div class="icon-picker ${parameter?'parameter-picker':''}">${Object.entries(iconNames).filter(([id])=>parameterIcons.includes(id)===parameter).map(([id,name])=>`<button type="button" data-icon="${id}" class="${draft.icon===id?'active':''}" title="${name}" aria-label="${name}" aria-pressed="${draft.icon===id}">${sprite(id,draft.color)}${parameter?`<span>${name}</span>`:''}</button>`).join('')}</div>`).join('')}<div class="field-label">Icon variant</div><div id="variant-picker" class="variant-picker"></div><div class="field"><label for="token-parent">Nest inside</label><select id="token-parent" ${isState(draft)?'required':''}>${!isState(draft)?'<option value="">Standalone</option>':''}${project.assets.filter(a=>!forbidden.has(a.id)&&(!isState(draft)||!isParameter(a))).map(a=>`<option value="${esc(a.id)}" ${draft.parentId===a.id?'selected':''}>${esc(assetPath(a))}${isState(a)?' (state)':''}</option>`).join('')}</select></div>${isState(draft)?`<label class="check-row"><input id="state-enabled" type="checkbox" ${draft.enabled?'checked':''}> Enabled · show this state’s contents</label>`:''}<div class="field"><label for="token-rule">Rule / description</label><textarea id="token-rule" maxlength="4000" placeholder="What does it do? What can change? The rules are yours to define.">${esc(draft.rule)}</textarea></div><div class="field tag-field"><label for="token-tags">Tags <span class="muted">· reusable definitions</span></label><div id="token-tag-list" class="tags"></div><input id="token-tags" maxlength="60" placeholder="Search tags or create a new one…" autocomplete="off"><div id="tag-options" class="tag-options"></div><div id="inline-tag-editor" hidden></div></div><div class="field"><label>Parameter color</label><div class="color-picker">${['#b8cf96','#edc47c','#d8967f','#8fb8c2','#b2a1c6','#ddddbd'].map(c=>`<button type="button" data-color="${c}" class="${draft.color===c?'active':''}" style="--swatch:${c}" aria-label="Color ${c}"></button>`).join('')}<input id="custom-color" type="color" value="${draft.color}" aria-label="Custom parameter color"></div></div><p id="self-help" ${draft.icon==='self'?'':'hidden'}>Self affects only the token’s occupied cell. Use it to detect stacked objects or apply behaviours to overlaps. Range, direction and wall occlusion do not change its area.</p><div class="field" id="range-field" ${isParameter(draft)&&draft.icon!=='self'?'':'hidden'}><label id="range-name" for="token-range">${draft.icon==='area'?'Radius':draft.icon==='cross'?'Arm length':'Length'} in grid cells</label><div class="range-control"><input type="range" id="token-range" min="1" max="12" value="${draft.range}"><output id="range-value">${draft.range} cells</output></div><small id="range-help">Effect area for overlays and assigned behaviours. Areas use diamond-shaped grid distance; crosses include the origin and extend equally along all four grid axes. Line, cone and rectangle extend forward, excluding the origin. Cones stay centered and use odd widths; saved even cone widths round down. Even rectangle widths include one extra cell on the right. Enable Occluded by Walls to stop the effect at wall tiles.</small></div><div id="parameter-behavior" ${isParameter(draft)?'':'hidden'}><label class="check-row"><input id="token-follow-facing" type="checkbox" ${draft.followTokenFacing?'checked':''}> Follow Token Facing</label><small>Turn this parameter with the parent token’s facing triangle. Its own rotation remains a relative offset.</small><label class="check-row"><input id="token-occlusion" type="checkbox" ${draft.occludedByWalls?'checked':''}> Occluded by Walls</label><small>Wall tiles and cells behind them are hidden. Walls also block diagonal corners.</small><label class="check-row"><input id="token-overlap-enabled" type="checkbox" ${draft.overlapThreshold>0?'checked':''}> Change color when objects overlap</label><div id="overlap-options" ${draft.overlapThreshold>0?'':'hidden'}><div class="field"><label for="token-overlap-mode">Objects that trigger the color</label><select id="token-overlap-mode"><option value="any" ${draft.overlapAssetIds==null&&draft.overlapTagIds==null?'selected':''}>Any object</option><option value="selected" ${draft.overlapAssetIds!=null&&draft.overlapTagIds==null?'selected':''}>Selected objects</option><option value="tags" ${draft.overlapTagIds!=null?'selected':''}>Objects with tags</option></select></div><fieldset id="overlap-objects" ${draft.overlapAssetIds==null?'hidden':''}><legend>Choose library objects</legend>${project.assets.filter(a=>!isState(a)&&!isParameter(a)).map(a=>`<label class="check-row"><input type="checkbox" name="overlap-object" value="${esc(a.id)}" ${draft.overlapAssetIds?.includes(a.id)?'checked':''}> ${esc(assetPath(a))}</label>`).join('')||'<small>Create an object in the library first.</small>'}</fieldset><fieldset id="overlap-tags" ${draft.overlapTagIds==null?'hidden':''}><legend>Match any selected tag</legend>${project.tags.map(t=>`<label class="check-row"><input type="checkbox" name="overlap-tag" value="${esc(t.id)}" ${draft.overlapTagIds?.includes(t.id)?'checked':''}> ${esc(t.name)}</label>`).join('')}</fieldset><div class="field-row"><div class="field"><label for="token-overlap-count">At least X objects</label><input id="token-overlap-count" type="number" min="1" max="1000" value="${draft.overlapThreshold||1}"></div><div class="field"><label for="token-overlap-color">Overlap color</label><input id="token-overlap-color" type="color" value="${draft.overlapColor||'#edc47c'}"></div></div><small>Counts placements of the chosen library objects inside the visible effect, including stacked objects. Select none to disable matching. Excludes the owner and other parameter markers. The whole effect changes color.</small></div></div><div class="field" id="width-field" ${['cone','rectangle'].includes(draft.icon)?'':'hidden'}><label for="token-width">Width in cells (cone: far edge)</label><input id="token-width" type="number" min="1" max="${draft.icon==='cone'?11:12}" step="${draft.icon==='cone'?2:1}" value="${draft.icon==='cone'?2*Math.floor(((draft.width??3)-1)/2)+1:(draft.width??3)}"></div><div id="token-auto-facing-field" ${!isParameter(draft)&&!isState(draft)?'':'hidden'}><label class="check-row"><input id="token-auto-facing" type="checkbox" ${draft.autoFacing?'checked':''}> Auto-facing</label><small>Face the direction moved, including in playtest. Diagonal moves use the longer axis; equal diagonals face horizontally.</small></div><div class="field"><label for="token-direction">Direction (optional)</label><select id="token-direction">${[['','None'],[0,'↑ Up'],[90,'→ Right'],[180,'↓ Down'],[270,'← Left']].map(([v,n])=>`<option value="${v}" ${(draft.direction??'')===v?'selected':''}>${n}</option>`).join('')}</select><small>Facing is shown by an edge triangle. Rotating facing leaves the icon upright.</small></div><div class="field"><label for="token-rotation">Icon / parameter rotation · relative to parent / placement</label><select id="token-rotation">${[[0,'↑ Up'],[90,'→ Right'],[180,'↓ Down'],[270,'← Left']].map(([v,n])=>`<option value="${v}" ${(draft.rotation||0)===v?'selected':''}>${n}</option>`).join('')}</select><small>Shared definition: changes affect all placements. Placed pieces can also rotate independently.</small></div><div class="callout">A token holds an idea. Nest other tokens inside it to combine their parameters. Rules are descriptions for students to interpret.</div><div class="modal-footer"><button type="button" data-close>Cancel</button><button type="submit" class="primary">${existing?'Save changes':`Create ${editorLabel()}`}</button></div></form>`));
  const tokenOptions=$('#token-auto-facing-field');
  tokenOptions.insertAdjacentHTML('beforeend',`<label class="check-row"><input id="token-user-test-movable" type="checkbox" ${draft.canBeMovedInUserTest?'checked':''}> Can Be Moved in User Test</label><small>Allow manual movement in User Test Mode. Off by default; applies to every placement of this object.</small><label class="check-row"><input id="token-non-blocking" type="checkbox" ${draft.nonBlocking?'checked':''}> Nodes occupied by this token count as free</label>`);
  $('#parameter-behavior').insertAdjacentHTML('afterbegin',`<div class="field"><label for="token-parameter-layer">Parameter Layer</label><select id="token-parameter-layer">${parameterLayers.map(layer=>`<option value="${layer}" ${parameterLayer(draft)===layer?'selected':''}>${layer}</option>`).join('')}</select><small>Choose which canvas visibility layer contains this parameter. Floor-height changes always occlude parameters; stairs let an effect cross between floors along its line.</small></div>`);
  let parameterIds=project.assets.filter(a=>a.parentId===draft.id&&isParameter(a)).map(a=>a.id);
  const pendingParameters=new Map(), removedParameters=new Set();
  const parameterField=document.createElement('div');parameterField.className='field reusable-parameters';
  parameterField.innerHTML='<label for="token-parameters">Parameters <span class="muted">· reusable definitions</span></label><div id="token-parameter-list" class="parameter-chips"></div><input id="token-parameters" maxlength="80" placeholder="Search parameters or create a new one…" autocomplete="off"><div id="parameter-options" class="tag-options"></div><small>Attach a definition to this token. Editing it updates every use.</small>';
  $('#token-tags').closest('.field').after(parameterField);
  const definitionNote=document.createElement('p');definitionNote.className='parameter-definition-note';definitionNote.textContent='Reusable parameter definition. Choose Nest inside to attach it to a token; it stays available in the Parameters library. Changes update every use.';
  $('#token-name').closest('.field').after(definitionNote);
  const renderParameterChoices=()=>{
    parameterField.hidden=isParameter(draft);definitionNote.hidden=!isParameter(draft);
    const attached=[...parameterIds.filter(id=>!removedParameters.has(id)),...pendingParameters.keys()].map(id=>parameterDefinition(project,asset(id))).filter(Boolean);
    $('#token-parameter-list').innerHTML=attached.map(a=>`<span class="parameter-chip"><button type="button" data-edit-parameter="${esc(a.id)}" title="Edit shared parameter">${sprite(a.icon,a.color)}${esc(a.name)}</button><button type="button" data-remove-parameter="${esc(a.id)}" aria-label="Detach ${esc(a.name)}">×</button></span>`).join('');
    const query=$('#token-parameters').value.trim().toLowerCase(),available=project.assets.filter(a=>isParameter(a)&&!a.parameterId&&!forbidden.has(a.id)&&!attached.some(b=>b.id===a.id)&&!descendants(project,a.id).some(b=>b.id===draft.id)&&[a.name,a.rule].join(' ').toLowerCase().includes(query));
    $('#parameter-options').innerHTML=available.map(a=>`<button type="button" data-add-parameter="${esc(a.id)}">${sprite(a.icon,a.color)}<span>${esc(a.name)}<small>${esc(iconNames[a.icon])} · ${a.range} cells</small></span><span>＋</span></button>`).join('')+`<button type="button" id="inline-create-parameter">＋ ${query?`Create “${esc($('#token-parameters').value.trim())}”`:'Create a reusable parameter'}</button>`;
  };
  const attachParameter=id=>{
    const previous=parameterIds.find(useId=>(asset(useId)?.parameterId||useId)===id);
    if(previous)removedParameters.delete(previous);else if(asset(id))pendingParameters.set(id,asset(id));
    $('#token-parameters').value='';renderParameterChoices();
  };
  const editParameter=(definition=null)=>{
    const name=$('#token-parameters').value.trim();
    suspendDialog(()=>{
      const removedDefinitions=new Set([...removedParameters].map(id=>asset(id)?.parameterId||id));
      parameterIds=project.assets.filter(a=>a.parentId===draft.id&&isParameter(a)).map(a=>a.id);
      removedParameters.clear();for(const id of parameterIds)if(removedDefinitions.has(asset(id)?.parameterId||id))removedParameters.add(id);
      renderTagChoices();renderParameterChoices();
    });
    tokenDialog(definition,'parameter',null,saved=>{if(!definition)attachParameter(saved.id);},name);
    $('#dialog').scrollTop=0;
  };
  $('#token-parameters').oninput=renderParameterChoices;
  $('#token-parameters').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#parameter-options button')?.click();}};
  renderParameterChoices();
  $('#token-overlap-mode').onchange=e=>{$('#overlap-objects').hidden=e.target.value!=='selected';$('#overlap-tags').hidden=e.target.value!=='tags';};
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
    const addParameter=e.target.closest('[data-add-parameter]'),removeParameter=e.target.closest('[data-remove-parameter]'),editShared=e.target.closest('[data-edit-parameter]');
    if(addParameter)return attachParameter(addParameter.dataset.addParameter);
    if(removeParameter){const id=removeParameter.dataset.removeParameter;pendingParameters.delete(id);for(const useId of parameterIds)if((asset(useId)?.parameterId||useId)===id)removedParameters.add(useId);return renderParameterChoices();}
    if(editShared)return editParameter(asset(editShared.dataset.editParameter));
    if(e.target.closest('#inline-create-parameter'))return editParameter();
    const add=e.target.closest('[data-add-tag]'), remove=e.target.closest('[data-remove-tag]');
    if(add)return attachTag(add.dataset.addTag);
    if(remove){draft.tags=draft.tags.filter(id=>id!==remove.dataset.removeTag);return renderTagChoices();}
    if(e.target.closest('#inline-create-tag')){
      const host=$('#inline-tag-editor');host.hidden=false;
      host.innerHTML=tagEditorFields({name:$('#token-tags').value.trim(),rule:'',color:draft.color})+'<div class="inline-actions"><button type="button" data-tag-cancel>Cancel tag</button><button type="button" class="primary" data-tag-save>Create & attach tag</button></div>';
      const discard=()=>{host.hidden=true;host.innerHTML='';};
      const inlineDraft=editorDraft(host,()=>host.querySelector('[data-tag-save]').click());
      bindTagEditor(host,null,t=>{discard();attachTag(t.id);},()=>{if(inlineDraft.dirty())promptToSave(inlineDraft,discard);else discard();});
      host.querySelector('[data-tag-name]').focus();
      return;
    }
    const variant=e.target.closest('[data-variant]');if(variant){draft.variant=variant.dataset.variant;renderVariants();return;}
    const icon=e.target.closest('[data-icon]'), color=e.target.closest('[data-color]');
    if(icon) { draft.icon=icon.dataset.icon;$('#parameter-behavior').hidden=!isParameter(draft);$('#token-auto-facing-field').hidden=isParameter(draft)||isState(draft);draft.variant=defaultVariant(draft.icon);renderVariants();$('#dialog .modal-head h2').textContent=`${existing?'Edit':'Create'} a ${editorLabel()}`;$('#token-form button[type=submit]').textContent=existing?'Save changes':`Create ${editorLabel()}`; document.querySelectorAll('[data-icon]').forEach(b=>{b.classList.toggle('active',b===icon);b.setAttribute('aria-pressed',b===icon);});$('#range-field').hidden=!isParameter(draft)||draft.icon==='self';$('#self-help').hidden=draft.icon!=='self';$('#range-name').textContent=draft.icon==='area'?'Radius in grid cells':draft.icon==='cross'?'Arm length in grid cells':'Length in grid cells';$('#width-field').hidden=!['cone','rectangle'].includes(draft.icon);const widthInput=$('#token-width');widthInput.step=draft.icon==='cone'?'2':'1';widthInput.max=draft.icon==='cone'?'11':'12';if(draft.icon==='cone')widthInput.value=2*Math.floor((Number(widthInput.value)-1)/2)+1; }
    if(icon)renderParameterChoices();
    if(color) { draft.color=color.dataset.color;renderVariants();$('#custom-color').value=draft.color; document.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('active',b===color)); }
  };
  $('#custom-color').oninput=e=>{draft.color=e.target.value;renderVariants();document.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('active',b.dataset.color===draft.color));};
  $('#token-range').oninput=e=>$('#range-value').textContent=`${e.target.value} cells`;
  $('#token-form').onsubmit=e=>{
    e.preventDefault();
    const inlineTag=$('#inline-tag-editor');
    if(!inlineTag.hidden){inlineTag.querySelector('[data-tag-save]').click();if(!inlineTag.hidden)return;}
    draft.name=$('#token-name').value.trim();if(!draft.name)return $('#token-name').focus();
    draft.parentId=$('#token-parent').value||null;if(isState(draft))draft.enabled=$('#state-enabled').checked;
    draft.rule=$('#token-rule').value;draft.tags=draft.tags.filter(id=>tag(id));draft.range=Number($('#token-range').value);draft.width=Number($('#token-width').value);draft.rotation=Number($('#token-rotation').value);draft.direction=$('#token-direction').value===''?null:Number($('#token-direction').value);draft.autoFacing=$('#token-auto-facing').checked;draft.canBeMovedInUserTest=!isParameter(draft)&&!isState(draft)&&$('#token-user-test-movable').checked;draft.followTokenFacing=$('#token-follow-facing').checked;draft.occludedByWalls=$('#token-occlusion').checked;draft.overlapThreshold=$('#token-overlap-enabled').checked?Number($('#token-overlap-count').value):0;draft.overlapColor=$('#token-overlap-color').value;if($('#token-overlap-mode').value==='tags')draft.overlapTagIds=[...document.querySelectorAll('input[name=overlap-tag]:checked')].map(input=>input.value);else draft.overlapTagIds=null;draft.overlapAssetIds=$('#token-overlap-mode').value==='selected'?[...document.querySelectorAll('input[name=overlap-object]:checked')].map(input=>input.value):null;
    if(isParameter(draft))draft.parameterLayer=$('#token-parameter-layer').value;
    draft.nonBlocking=!isState(draft)&&!isParameter(draft)&&$('#token-non-blocking').checked;
    const action={type:'asset.compose',data:{asset:draft,usageId:uid(),originalUsageId:uid(),removals:[...removedParameters],attachments:[...pendingParameters.keys()].map(id=>({id,usageId:uid(),originalUsageId:uid()}))}};
    try { applyAction(project,action); }catch(error){return toast(error.message);}
    if(dispatch(action)===false)return;
    selected={type:'asset',id:draft.id};closeDialog();onSaved?.(draft);render();toast(existing?`${editorLabel()} updated everywhere it is used.`:isParameter(draft)?'Reusable parameter created. Attach it to any token.':isState(draft)?'State created. Add tags, parameters, or tokens inside it.':'Token created. Drag it into the level or another token.');
  };
  $('#token-tags').setAttribute('data-draft-ignore','');
  $('#token-parameters').setAttribute('data-draft-ignore','');
  watchEditor($('#token-form'),()=>({icon:draft.icon,variant:draft.variant,color:draft.color,tags:draft.tags,
    parameters:[...parameterIds.filter(id=>!removedParameters.has(id)).map(id=>asset(id)?.parameterId||id),...pendingParameters.keys()].sort()}));
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
    if(dispatch(action)===false)return;
    onSave(t);
  };
}
function tagDialog(existing) {
  if(play)return;
  const t=existing || {name:'',rule:'',color:'#b8cf96'};
  showDialog(modal(existing?'Edit a tag':'Create a tag',`<div id="tag-editor">${tagEditorFields(t)}<p>Tags can be reused in any token. Editing a tag updates every token that uses it.</p><div class="modal-footer">${existing?'<button class="danger" id="delete-tag">Delete tag</button>':''}<button data-tag-cancel>Cancel</button><button class="primary" data-tag-save>${existing?'Save tag':'Create tag'}</button></div></div>`));
  bindTagEditor($('#tag-editor'),existing,()=>{closeDialog();toast(existing?'Tag updated everywhere it is used.':'Tag created. Add it to any token.');},requestCloseDialog);
  const tagEditor=$('#tag-editor');
  watchEditor(tagEditor,undefined,()=>tagEditor.querySelector('[data-tag-save]').click());
  $('#tag-editor [data-tag-name]').focus();
  if(existing)$('#delete-tag').onclick=()=>confirmDialog(`Delete ${existing.name}?`,'This removes the tag from the library and every token that uses it.','Delete tag',()=>dispatch({type:'tag.delete',data:{id:existing.id}}));
}
function guideDialog() {
  showDialog(modal('Small pieces. Big possibilities.',`<p>A virtual tabletop for exploring atomic parameters. Play by hand or assign behaviours that move pieces, apply effects, and react to your actions during private playtests.</p><div class="help-list">${[
    ['Shape the stage','Select the floor painter (F) to choose Elevated, Ground, Underground, or Stairs. Nodes can be painted on any floor or stairs without replacing it. Repainting keeps its nodes; walls and Erase Tiles remove both layers. Adjacent nodes on the same floor connect automatically. Paint stairs and add path nodes to connect different floor heights. Bare nodes keep their connections to any floor. Use Erase connection (X) or Reconnect nodes (C), then click a line or two adjacent nodes. Hold and drag to paint tiles.'],
    ['Browse your building blocks','Objects shows token hierarchies, including nested states, parameters and tags. Tokens, Parameters and Tags are focused catalogs; All shows every hierarchy and the tag catalog. Use the arrows to collapse branches.'],
    ['Give an idea a token','Use + in the library. Choose a name, sprite, rule, tags and color. AoE and LoS have their own Parameters pool and adjustable cell distances. Tags have a separate editor; search existing tags or create one inside the token editor.'],
    ['Compose a mechanic','Drag Area of effect onto Torch in the library. It becomes a nested parameter. Nested tokens can contain more tokens; drag to the standalone drop zone to detach.'],
    ['Place and investigate','Drag a token from the library onto any cell, or click its + then a cell. Drag placed pieces to move them. Select one to inspect its tags and children. R rotates facing; Shift + R rotates the object 90°. Double-click opens its definition.'],
    ['Build a state','Select a token and use Add state. A state has its own name, description, tags, icon variant and contents. Use Nest inside in any editor to put a token or parameter into a state. Toggle states from the parent: disabled contents disappear from the hierarchy and overlays, but stay saved. Enabled states combine; the last one in the list supplies the parent icon. Playtest state changes are private.'],
    ['Change one thing','Try a new radius, a different tag, or a new description. What changes for the player? Definitions update every placement; placement notes belong to one piece.'],
    ['Play through turns','Playtest makes a private copy. Use Start turn 1, Next turn, and Previous turn in the horizontal toolbar. Previous restores positions, states, targets, patrol progress and both trays. Save / Load sequence keeps a separate JSON recording. Clear sequence restores the starting layout. Post-its and cards stay shared and saved.'],
    ['Assign behaviours','Select a token, state or parameter and choose Behaviours. Move To, Move Away From, Teleport and Advance Turn On Event work on all three. Expand, Apply Effect, Block Node and Use belong to parameters. Create reusable behaviour blocks in Atomic Parameters, or save an existing behaviour as a block. Drag a block onto an item; edits to that block update every use. Inactive states suppress their behaviours.',true],
    ['Choose resolution order','Use Behaviour resolution order in the collapsible Manipulate & Organize panel, the ⇅ tool, or Resolution order in the inspector. Move behaviours up or down to decide what acts first. Earlier actions can affect later ones. Distraction follows this order. Expansion copies can apply later effects this turn; other actions wait until next turn. Resolution log shows the actions and affected counts.'],
    ['Leave an observation','Choose a color, then drag Post-it from the floating toolbar onto any canvas space. Drag its body to move freely; double-click to edit. Drag Arrow, Step, or Question to annotate the board. Use Visibility to hide categories, or an item’s minus button to hide it. Notes survive playtest resets.'],
    ['Draw a design prompt','Design Experiments and Design Challenges each start with 12 cards. Draw randomly without replacement; Return all cards resets only that deck for this room. Review the inventory in the deck dialog, or open Card Studio to edit the repository files on the host.']
  ].map(([title,text,behaviourGuide],n)=>`<div class="help-item"><span class="help-number">${String(n+1).padStart(2,'0')}</span><div><strong>${title}</strong><p>${text}</p>${behaviourGuide?'<a class="behaviour-guide-link" href="/behaviour-guide.html" target="_blank" rel="noopener">Open the Behaviour Guide ↗ <span>(new tab)</span></a>':''}</div></div>`).join('')}</div><div class="callout">Overlays are visual rulers: area uses Manhattan (diamond) distance, Line Effect is a straight directional line; cones widen toward their far edge and rectangles keep a constant width. Cross Effect includes the origin and extends one-cell-wide arms in all four directions. Library rotation updates the shared definition; placement rotation adds to it. Area behaviours use these cells to find targets or block nodes during playtest. Without behaviours, play stays manual. Multiple tokens can share a cell; remove or move the top one to reach the others.</div><details><summary>Keyboard shortcuts</summary><p>V select · F floor · N nodes · W walls · E erase tiles · X erase connection · C reconnect · R facing · Shift+R rotate object · Delete remove selected token · Esc deselect · Ctrl+Z undo · Ctrl+Y or Ctrl+Shift+Z redo · / search. Use arrow keys to move a selected piece; Enter on a focused cell activates it.</p></details><p style="margin-top:18px;font-size:0.769231rem">Original workshop sprites. An unofficial, educational fan project inspired by the GO games and A Plague Tale.</p>`,'<button data-close class="primary">Back to the workbench</button>','FIELD GUIDE'));
}
async function optionsDialog() {
  showDialog(modal('Options', '<p id="options-loading" role="status">Loading options…</p>'));
  try {
    const response = await fetch('/api/options');
    if (!response.ok) throw Error('Could not load options. Refresh the workshop server and try again.');
    const options = await response.json();
    if (!$('#dialog').open || !$('#options-loading')) return;
    const disabled = options.canManageBackups ? '' : 'disabled';
    showDialog(modal('Options', `<form id="options-form">
      <label class="check-row options-autosave"><input id="options-autosave" type="checkbox" ${options.autosave ? 'checked' : ''}> Autosave every five minutes</label>
      <p>Autosaves keep the shared design with a <b>-autosave_ddmmyy_hhmm</b> filename suffix, creating a separate backup every five minutes.</p>
      <label class="check-row options-autosave"><input id="options-load-latest" type="checkbox" ${options.loadLatest ? 'checked' : ''}> When launching, load the most recent Saved Project in the Save Folder</label>
      <p>New workshops start with the newest valid project file, including autosaves. Existing rooms keep their saved work.</p>
      <div class="field"><label for="options-folder">Default Save Folder</label><input id="options-folder" value="${esc(options.saveFolder)}" required maxlength="4096" ${disabled}><small>Folder on the workshop computer. Default: Saved Projects.</small><button type="button" id="options-folder-reset" class="subtle" ${disabled}>Use Saved Projects folder</button></div>
      <p>Backup and startup options apply to this workshop server.${options.canManageBackups ? '' : ' To change the save folder, open the workshop through localhost on the workshop computer.'}</p>
      <div class="field"><label for="options-text-scale">UI Text scaling</label><div class="range-control"><input id="options-text-scale" type="range" min="50" max="200" step="5" value="${uiTextScale}"><output id="options-text-output" for="options-text-scale">${uiTextScale}%</output></div><small>50–200% · Default: 100%. Remembered in this browser.</small></div>
      <p id="options-error" class="danger" role="alert" ${options.lastError ? '' : 'hidden'}>${esc(options.lastError)}</p>
      <div class="modal-footer"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save options</button></div>
    </form>`));
    const originalScale = uiTextScale;
    const restoreScale = () => applyTextScale(uiTextScale);
    $('#dialog').addEventListener('close', restoreScale, { once: true });
    $('#options-folder-reset').onclick = () => { $('#options-folder').value = options.defaultSaveFolder; };
    $('#options-text-scale').oninput = e => {
      const scale = applyTextScale(e.target.value);
      $('#options-text-output').value = `${scale}%`;
    };
    $('#options-form').onsubmit = async e => {
      e.preventDefault();
      const form = e.currentTarget, button = form.querySelector('[type=submit]'), error = $('#options-error');
      const scale = textScale($('#options-text-scale').value);
      button.disabled = true; error.hidden = true;
      try {
        {
          const result = await fetch('/api/options', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autosave: $('#options-autosave').checked, loadLatest: $('#options-load-latest').checked, ...(options.canManageBackups ? { saveFolder: $('#options-folder').value } : {}) }) });
          const saved = await result.json();
          if (!result.ok) throw Error(saved.error || 'Could not save options.');
        }
        uiTextScale = scale;
        try { localStorage.setItem('workshop-text-scale', String(scale)); } catch {}
        applyTextScale(scale);
        if (form.isConnected) closeDialog();
      } catch (failure) {
        if (form.isConnected) { error.textContent = failure.message; error.hidden = false; error.scrollIntoView({ block: 'nearest' }); }
        else applyTextScale(originalScale);
      } finally { button.disabled = false; }
    };
  } catch (error) {
    if ($('#options-loading')) $('#options-loading').textContent = error.message;
  }
}

async function saveProject() {
  if (pending.length || notePending || !connected || revision < 0) throw Error('Wait until changes are saved and the room is connected.');
    const response = await fetch(`${endpoint}/save`, { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Could not save the project.');
    return `Saved ${result.filename} to ${result.folder}`;
}

const levelTransfers=levelTransferUI({getProject:()=>project,getLevelId:()=>level().id,showDialog,modal,closeDialog,dispatch,toast,esc,
  canImport:()=>{if(play||userTestSession){toast('Return to Edit before importing levels.');return false;}if(serverNeedsRestart||appConfig.levelTransferVersion!==1){toast(serverUpdateMessage);return false;}if(!connected||pending.length||busy||notePending||revision<0){toast('Wait until all changes are saved and the room is connected.');return false;}return true;},
  imported:id=>{levelId=id;selected=null;staged=null;render();fitBoard();}});
function cleanupDialog() {
  if(play||userTestSession)return toast('Return to Edit before cleaning up the library.');
  if(pending.length||busy||notePending||!connected||revision<0)return toast('Wait until all changes are saved and the room is connected.');
  const before=JSON.stringify(project);
  let review;
  try{review=reviewProjectCleanup(project);}catch(error){return toast(error.message);}
  const {removed,total}=review;
  const categories=[
    ['Objects',removed.assets.filter(a=>!isState(a)&&!isParameter(a))],
    ['States',removed.assets.filter(isState)],
    ['Parameters',removed.assets.filter(a=>isParameter(a)&&!a.parameterId)],
    ['Parameter attachments',removed.assets.filter(a=>a.parameterId)],
    ['Reusable behaviours',removed.behaviourLibrary],
    ['Tags',removed.tags]
  ];
  const assetIds=new Set(removed.assets.map(a=>a.id));
  const list=categories.filter(([,items])=>items.length).map(([label,items])=>`<details open><summary>${label} · ${items.length}</summary><ul>${items.map(item=>`<li>${esc(assetIds.has(item.id)?assetPath(item):item.name)}</li>`).join('')}</ul></details>`).join('');
  showDialog(modal('Clean up unused definitions',`<p>Checked all ${project.levels.length} levels, including hidden levels, starting inventory, and behaviour references. Objects keep their complete hierarchies, including disabled states and behaviours.</p>${total?`<p><b>${total} unused library items</b> can be removed from this shared project. Review the list below. You can undo this cleanup.</p><div class="cleanup-list">${list}</div>`:'<p role="status">Nothing to remove. Every library item is used or referenced by a level.</p>'}`,
    `<button data-close>${total?'Cancel':'Close'}</button>${total?'<button id="confirm-cleanup" class="danger">Remove unused items</button>':''}`));
  if(total)$('#confirm-cleanup').onclick=()=>{
    if(play||userTestSession)return toast('Return to Edit before cleaning up the library.');
    if(pending.length||busy||notePending||!connected)return toast('Wait until all changes are saved and the room is connected.');
    if(JSON.stringify(project)!==before){cleanupDialog();return toast('The project changed. Review the updated cleanup list.');}
    if(dispatch({type:'project.replace',data:review.project})===false)return;
    if(selected?.type==='asset'&&assetIds.has(selected.id))selected=null;
    if(assetIds.has(staged))staged=null;
    closeDialog();render();toast(`Removed ${total} unused library items. Undo is available.`);
  };
}
function filesDialog() {
  showDialog(modal('Your workshop, to keep.',`<p>Changes save automatically on this server. Keep a project backup, or export a connected inventory for Excel and Google Sheets.</p><div class="files-grid"><button id="export-project">↧ Export project<small>Download a readable .json backup</small></button><button id="export-inventory">▦ Export spreadsheet<small>Recipes, challenges and progression · .xlsx</small></button><button id="import-project">↥ Import project<small>Replace this room with a saved project</small></button><button id="example-project">✧ Load example<small>A torch, light, rats, and a guard</small></button><button id="new-project">＋ Clear workshop<small>Start again with an empty library</small></button></div><div class="callout">Room <b>${esc(room)}</b> · Project backups contain the saved design. Spreadsheet exports can also capture your private playtest before you return to Edit.</div>`));
  const levelButtons=document.createElement('div');levelButtons.className='files-grid level-file-actions';
  levelButtons.innerHTML='<button id="export-levels">↧ Export levels<small>Choose levels and their required definitions · .levels.json</small></button><button id="import-levels">↥ Import levels<small>Review definitions and copy or replace matching levels</small></button>';
  $('.files-grid').before(levelButtons);
  $('#export-levels').onclick=levelTransfers.exportDialog;
  $('#import-levels').onclick=levelTransfers.importFile;
  const cleanupButton=document.createElement('button');
  cleanupButton.id='cleanup-project';cleanupButton.disabled=!!play||userTestSession;
  cleanupButton.innerHTML='Clean up unused definitions<small>Review objects, parameters, behaviours and tags unused by every level</small>';
  $('.files-grid').append(cleanupButton);
  cleanupButton.onclick=cleanupDialog;
  $('#export-project').onclick=()=>{
    const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'}), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;a.download=`plague-tale-go-${room}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Project exported.');
  };
  const saveButton = document.createElement('button');
  saveButton.id = 'save-project';
  saveButton.innerHTML = '↧ Save project<small>Save a .json backup to the default save folder</small>';
  $('#dialog .files-grid').prepend(saveButton);
  const saveStatus = document.createElement('p');
  saveStatus.setAttribute('role', 'status');
  $('#dialog .files-grid').after(saveStatus);
  saveButton.onclick = async () => {
    saveButton.disabled = true; saveStatus.textContent = 'Saving project…'; saveStatus.classList.remove('danger');
    try { saveStatus.textContent = await saveProject(); }
    catch (error) { saveStatus.textContent = error.message; saveStatus.classList.add('danger'); }
    finally { saveButton.disabled = false; }
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
  if(config.localOnly){
    showDialog(modal('A workbench of your own.','<p>This session is open only on this computer. To invite others, open your session controls and choose <b>Online session</b>. Your current workshop can stay open.</p><p><a href="/welcome" target="_blank" rel="noopener">Open session controls ↗</a></p>','<button class="primary" data-close>Done</button>','LOCAL SESSION'));
    return;
  }
  const isOnline=config.transport==='poll'||config.hostControls;
  const isLoopback=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  const links=(isLoopback?config.urls:[location.origin]).map(url=>`${url}/?room=${room}`);
  if(!links.length)links.push(location.href);
  showDialog(modal('A shared workbench.',`<p>Open this room in another browser to edit together. Everyone sees the same tokens and levels as changes are saved.</p><label class="field-label">${isLoopback && !isOnline?'Classroom / local network link':'Workshop link'}</label>${links.map((url,n)=>`<div class="copy-row"><input readonly id="share-link-${n}" value="${esc(url)}" aria-label="Workshop share link"><button class="primary" data-copy="${n}">Copy</button></div>`).join('')}<div class="callout">Keep this server running. ${isOnline?'Keep the launcher open and your PC awake. Share the session username and password privately. Everyone with those credentials can edit every room on this server. Online updates arrive about every 1.5 seconds.':'Students need to be on the same local network; Windows may ask you to allow Node.js through the firewall on a private network. Anyone with network access and the room link can edit.'}</div>${config.hostControls?'<p><a href="/welcome" target="_blank" rel="noopener">Open session controls & copy invitation ↗</a></p>':''}<p style="margin-top:15px;font-size:0.846154rem">Room ID: <b>${esc(room)}</b> · <b>${esc($('#peer-count').textContent)}</b> participant(s). New rooms start at <span class="small-link">/?room=your-room-name</span>. Playtest changes stay in your browser.</p>`,'<button class="primary" data-close>Done</button>','LIVE WORKSHOP'));
  document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{const input=$(`#share-link-${b.dataset.copy}`);try{await navigator.clipboard.writeText(input.value);b.textContent='Copied';}catch{input.focus();input.select();toast('Link selected. Press Ctrl+C to copy.');}});
}
function levelSettings() {
  if(play)return;const l=level();
  showDialog(modal('Set the scene.',`<form id="level-form"><div class="field"><label for="level-name">Level name</label><input id="level-name" required maxlength="80" value="${esc(l.name)}"></div><div class="field-row"><div class="field"><label for="level-width">Columns · 4–32</label><input type="number" id="level-width" min="4" max="32" value="${l.width}" required></div><div class="field"><label for="level-height">Rows · 4–24</label><input type="number" id="level-height" min="4" max="24" value="${l.height}" required></div></div><p>When making a level smaller, remove any tiles and pieces outside its new bounds first.</p><div class="field"><label class="check-row"><input id="level-hide-playtest" type="checkbox" ${l.hideFromPlaytest===true?'checked':''} aria-describedby="level-hide-playtest-help"> Hide from Playtest</label><small id="level-hide-playtest-help">Skip this level in the dedicated User Test launcher. It stays available here in the editor and its Playtest modes.</small></div><section id="starting-inventory-editor" class="starting-inventory-editor"></section><p id="level-form-error" class="danger" role="alert" hidden></p><div class="modal-footer"><button type="button" id="duplicate-level">Duplicate level</button><button type="button" class="danger" id="delete-level" ${project.levels.length===1?'disabled':''}>Delete level</button><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save level</button></div></form>`));
  const startingEditor=startingInventoryEditor({root:$('#starting-inventory-editor'),getProject:()=>project,initial:l.startingInventory||[],esc,label:assetPath});
  $('#level-form').onsubmit=e=>{e.preventDefault();const error=$('#level-form-error');error.hidden=true;error.textContent='';const data={levelId:l.id,name:$('#level-name').value.trim(),width:Number($('#level-width').value),height:Number($('#level-height').value),startingInventory:startingEditor.read(),hideFromPlaytest:$('#level-hide-playtest').checked};if(!data.name)return;try{applyAction(project,{type:'level.update',data});}catch(failure){error.textContent=failure.message;error.hidden=false;error.scrollIntoView({block:'nearest'});return;}if(dispatch({type:'level.update',data})===false)return;closeDialog();fitBoard();};
  watchEditor($('#level-form'),startingEditor.read);
  $('#duplicate-level').onclick=()=>{
    const copy=copyLevel(l);
    // Include the current settings draft in the duplicated level.
    const data={levelId:copy.id,name:($('#level-name').value.trim()||l.name)+' copy',width:Number($('#level-width').value),height:Number($('#level-height').value),startingInventory:startingEditor.read(),hideFromPlaytest:$('#level-hide-playtest').checked};
    data.name=data.name.slice(0,80);
    const error=$('#level-form-error');
    try {
      const withCopy=applyAction(project,{type:'level.add',data:copy});
      const result=applyAction(withCopy,{type:'level.update',data});
      const next=result.levels.find(item=>item.id===copy.id);
      if(dispatch({type:'level.add',data:next})===false)return;
    } catch(failure){error.textContent=failure.message;error.hidden=false;error.scrollIntoView({block:'nearest'});return;}
    levelId=copy.id;selected=null;closeDialog();render();fitBoard();
  };
  $('#delete-level').onclick=()=>confirmDialog('Delete this level?',`The level “${l.name}” and its placements will be removed. Token definitions stay in the library.`,'Delete level',()=>{dispatch({type:'level.delete',data:{levelId:l.id}});levelId=project.levels[0].id;selected=null;render();fitBoard();});
}
function example() {
  const p=newProject(), l=p.levels[0];l.name='A light in the dark';
  l.width=14;l.height=11;l.tiles={};
  for(let y=2;y<9;y++)for(let x=2;x<12;x++)l.tiles[`${x},${y}`]='floor';
  const add=(name,icon,rule,tags,color='#b8cf96',range=2,parentId=null)=>{const a={id:uid(),name,icon,rule,tags,color,range,parentId};p.assets.push(a);return a.id;};
  const torch=add('Torch','torch','A carried flame. Ask: how does the space around it change?',['Pickable','Light source'],'#edc47c');
  add('Pool of light','area','Rats avoid the lit area. This is a proposed rule; move rats by hand. Try changing the radius from 2 to 1.',['Radius','Safety'],'#edc47c',2,torch);
  const girl=add('Amicia','girl','Move to a connected node. Can carry one pickable token.',['Player'],'#c8957d');
  p.assets.find(a=>a.id===girl).canBeMovedInUserTest=true;
  const kid=add('Hugo','kid','Follows Amicia. What happens if the two become separated?',['Companion']);
  const rat=add('Rat swarm','rat','Move toward an unlit character after each player move. Students resolve turns manually.',['Threat'],'#b2a1c6');
  const guard=add('Guard','guard','Patrol a path. Rotate to change facing.',['Patrol'],'#8fb8c2');
  add('Watchful gaze','sight','A straight visual ruler. Decide whether walls block vision and how the guard reacts.',['Directional'],'#8fb8c2',3,guard);
  const exit=add('Escape','exit','Reach here together. What are the conditions for escape?',['Goal']);
  for(let x=3;x<=10;x++)paintLevelTiles(l,[`${x},5`],'node');
  for(let y=3;y<=7;y++)paintLevelTiles(l,[`7,${y}`],'node');
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
  if(!hasNode(level(),key))return toast('Choose a path node.');
  if(!connectionStart){connectionStart=key;render();return;}
  if(connectionStart===key){connectionStart=null;render();return;}
  if(!adjacentNodes(level(),connectionStart,key))return toast('Choose a node directly beside the first one.');
  if(tool==='connect'&&!canConnectNodes(level(),connectionStart,key))return toast('Use stairs to connect nodes on different floor types.');
  editConnection(connectionStart,key);
}
document.addEventListener('click', e=>{
  if(Date.now()<suppressClickUntil){e.preventDefault();return;}
  if(notePending && e.target.id!=='instance-note') saveNote();
  const carryBadge=e.target.closest('[data-drop-carried]');if(carryBadge){dropCanvasItem(carryBadge.dataset.dropCarried);return;}
  const useBadge=e.target.closest('[data-use-object]');if(useBadge){useCanvasObject(useBadge.dataset.useObject);return;}
  const throwBadge=e.target.closest('[data-throw-object]');if(throwBadge){throwCanvasObject(throwBadge.dataset.throwObject);return;}
  const patrolSwatch=e.target.closest('[data-patrol-color]');if(patrolSwatch&&!play){updatePatrol({color:patrolSwatch.dataset.patrolColor});return;}
  const objectPatrolSwatch=e.target.closest('[data-instance-patrol-color]');if(objectPatrolSwatch&&activeInstance()){dispatch({type:'instance.update',data:{levelId:level().id,id:activeInstance().id,patrolColor:objectPatrolSwatch.dataset.instancePatrolColor}});return;}
  const patrolChoice=e.target.closest('[data-patrol]');if(patrolChoice){patrolId=patrolChoice.dataset.patrol;selected=null;staged=null;if(!play)tool='patrol';render();return;}
  if(e.target.closest('#toggle-patrols')){showPatrols=!showPatrols;render();return;}
  if(e.target.closest('#new-patrol')&&!play){newPatrol();return;}
  if(e.target.closest('#swap-patrol')&&!play&&activePatrol()){updatePatrol({nodes:[...activePatrol().nodes].reverse()});return;}
  if(e.target.closest('#clear-patrol')&&!play){updatePatrol({nodes:[]});return;}
  if(e.target.closest('#delete-patrol')&&!play){dispatch({type:'patrol.delete',data:{levelId:level().id,id:patrolId}});return;}
  if(e.target.closest('#use-patrol-color')&&activeInstance()&&activePatrol()){dispatch({type:'instance.update',data:{levelId:level().id,id:activeInstance().id,patrolColor:activePatrol().color}});return;}
  if(e.target.closest('#clear-patrol-color')&&activeInstance()){dispatch({type:'instance.update',data:{levelId:level().id,id:activeInstance().id,patrolColor:null}});return;}
  const quantity=e.target.closest('[data-stack-adjust]');if(quantity&&play){try{playerInventory=adjustStack(playerInventory,quantity.dataset.stackAdjust,Number(quantity.dataset.delta));render();}catch(error){toast(error.message);}return;}
  const discardGraveyard=e.target.closest('[data-discard-graveyard]');if(discardGraveyard&&play){graveyard=graveyard.filter(i=>i.id!==discardGraveyard.dataset.discardGraveyard);renderInventory(true);return;}
  const discard=e.target.closest('[data-discard-inventory]');if(discard&&play){playerInventory=playerInventory.filter(i=>i.id!==discard.dataset.discardInventory);render();return;}
  const close=e.target.closest('[data-close]');if(close)return requestCloseDialog();
  const deck=e.target.closest('[data-deck],[data-review-deck]');if(deck)return deckDialog(deck.dataset.deck||deck.dataset.reviewDeck);
  const color=e.target.closest('[data-note-color]');if(color){postItColor=color.dataset.noteColor;staged=null;selected=null;render();return;}
  const postIt=e.target.closest('[data-post-it]');if(postIt){
    const id=postIt.dataset.postIt,key=`postIt:${id}`,now=Date.now(),repeated=lastTokenClick?.key===key&&now-lastTokenClick.time<350;
    lastTokenClick={key,time:now};selected={type:'postIt',id};staged=null;tool='select';render();if(repeated)postItDialog(activePostIt());return;
  }
  if(tool==='postIt'&&e.target.closest('#board')){const pos=cursorCell() || (e.target.closest('.cell')?{x:Number(e.target.closest('.cell').dataset.x),y:Number(e.target.closest('.cell').dataset.y)}:null);if(pos)postItDialog(null,pos);return;}
  const editTag=e.target.closest('[data-edit-tag]');if(editTag){if(tag(editTag.dataset.editTag))tagDialog(tag(editTag.dataset.editTag));return;}
  const libraryView=e.target.closest('[data-library-tab]');if(libraryView){panels.select(libraryView.dataset.libraryTab);return;}
  const filter=e.target.closest('[data-atomic-filter]');if(filter){const id=filter.dataset.atomicFilter;atomicFilters.has(id)?atomicFilters.delete(id):atomicFilters.add(id);renderLibrary();$(`[data-atomic-filter="${id}"]`).focus();return;}
  const collapseAll=e.target.closest('#library-collapse-all,#library-collapse-all-atomic');
  if(collapseAll){
    const expand=collapseAll.dataset.expand==='true';
    if(collapseAll.closest('[data-workshop-panel]').dataset.workshopPanel==='objects'){collapsedAssets.clear();if(!expand)currentProject().assets.forEach(a=>collapsedAssets.add(a.id));}
    else {collapsedCatalogs.clear();if(!expand)Object.keys(atomicKinds).forEach(id=>collapsedCatalogs.add(id));}
    renderLibrary();return;
  }
  const catalog=e.target.closest('[data-collapse-catalog]');if(catalog){const id=catalog.dataset.collapseCatalog;collapsedCatalogs.has(id)?collapsedCatalogs.delete(id):collapsedCatalogs.add(id);renderLibrary();return;}
  const createAtom=e.target.closest('[data-create-atomic]');if(createAtom){closeDialog();createAtomic(createAtom.dataset.createAtomic);return;}
  const attachBlock=e.target.closest('[data-attach-behaviour]');if(attachBlock){attachBehaviour(attachBlock.dataset.attachBehaviour);return;}
  const editAssetBehaviours=e.target.closest('[data-edit-asset-behaviours]');if(editAssetBehaviours){const a=asset(editAssetBehaviours.dataset.editAssetBehaviours);if(a)behaviourTools.edit(a);return;}
  const block=e.target.closest('[data-edit-behaviour-block],[data-behaviour-block]');if(block){const id=block.dataset.editBehaviourBlock||block.dataset.behaviourBlock;behaviourTools.block(currentProject().behaviourLibrary?.find(b=>b.id===id));return;}
  const collapse=e.target.closest('[data-collapse-asset]');if(collapse){const id=collapse.dataset.collapseAsset;collapsedAssets.has(id)?collapsedAssets.delete(id):collapsedAssets.add(id);renderLibrary();return;}
  const toggle=e.target.closest('[data-toggle-state]');if(toggle){const a=asset(toggle.dataset.toggleState),i=level().instances.find(i=>i.id===toggle.dataset.stateInstance);if(a)dispatch(i?{type:'instance.state',data:{levelId:level().id,id:i.id,stateId:a.id,enabled:!stateEnabled(currentProject(),a,i)}}:{type:'asset.update',data:{id:a.id,enabled:!stateEnabled(currentProject(),a)}});return;}
  const child=e.target.closest('[data-inspect-child]');if(child){
    if(!asset(child.dataset.inspectChild))return;
    selected={type:'asset',id:child.dataset.inspectChild};staged=null;render();
    $('#definition-contents').scrollTop=0;
    if(e.detail===0){const focus=$('#inspector .definition-back')||$('#inspector h3');if(focus){if(focus.tagName!=='BUTTON')focus.tabIndex=-1;focus.focus({preventScroll:true});}}
    return;
  }
  const createKind=e.target.closest('[data-create-kind]');if(createKind)return tokenDialog(undefined,createKind.dataset.createKind,createKind.dataset.parent||null);
  const objectLink=e.target.closest('[data-object-link]');if(objectLink){selected={type:'objectLink',id:objectLink.dataset.objectLink};staged=null;render();return;}
  const editObjectLink=e.target.closest('[data-edit-object-link]');if(editObjectLink)return objectLinkDialog(level().objectLinks.find(link=>link.id===editObjectLink.dataset.editObjectLink));
  const deleteLink=e.target.closest('[data-delete-object-link]');if(deleteLink)return deleteObjectLink(deleteLink.dataset.deleteObjectLink);
  const link=e.target.closest('[data-link-from]');if(link&&!play)return editConnection(link.dataset.linkFrom,link.dataset.linkTo);
  const floorChoice=e.target.closest('[data-floor-tile]');
  if(floorChoice&&!play){floorTile=floorChoice.dataset.floorTile;tool='floor';staged=null;selected=null;connectionStart=null;linkDraft=[];render();$(`[data-floor-tile="${floorTile}"]`).focus();return;}
  const icon=e.target.closest('[data-tool]');
  if(icon){if(icon.dataset.tool==='overlays')layerMenuOpen=!layerMenuOpen;else{layerMenuOpen=false;tool=icon.dataset.tool;staged=null;selected=null;connectionStart=null;linkDraft=[];}render();if(icon.dataset.tool==='overlays')$('[data-tool="overlays"]').focus();return;}
  const tab=e.target.closest('[data-level]');if(tab){if(userTestSession || play&&turnOutcome)return;levelId=tab.dataset.level;selected=null;staged=null;connectionStart=null;linkDraft=[];render();fitBoard();return;}
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
    case 'edit-behaviours':if(activeAsset())behaviourTools.edit(activeAsset());break;
    case 'behaviour-order':case 'inspector-behaviour-order':behaviourTools.order();break;
    case 'set-move-target':if(activeInstance())behaviourTools.target(activeInstance());break;
    case 'next-turn':advanceTurn();break;
    case 'next-level':nextLevel();break;
    case 'previous-turn':advanceTurn(true);break;
    case 'save-turns':saveTurns();break;
    case 'load-turns':if(play&&!userTestSession)$('#import-turns').click();break;
    case 'test-manual-finish':if(userTestSession&&!$('#test-manual-finish').hidden){testCompletion='manual';turnOutcome={type:'levelComplete',levelId:level().id};render();}break;
    case 'clear-turns':clearTurns();break;
    case 'turn-log':turnLog();break;
    case 'library-expand':expandLibrary(!$('#workshop-sidebar').classList.contains('library-expanded'));break;
    case 'definition-only':showDefinitionOnly(!$('#workshop-sidebar').classList.contains('definition-only'));break;
    case 'definition-toggle':collapseDefinition($('#definition-toggle').getAttribute('aria-expanded')==='true');break;
    case 'inventory-toggle':inventoryExpanded=!inventoryExpanded;renderInventory();break;
    case 'graveyard-toggle':graveyardExpanded=!graveyardExpanded;renderInventory(true);break;
    case 'post-it-tool':toast('Drag Post-it from the floating toolbar onto the canvas.');break;
    case 'edit-post-it':if(activePostIt())postItDialog(activePostIt());break;
    case 'delete-post-it':removeSelected();break;
    case 'finish-link':if(linkDraft.length>=2)objectLinkDialog();break;
    case 'cancel-link':linkDraft=[];tool='select';render();break;
    case 'theme-toggle':{
      const theme=document.documentElement.dataset.theme==='light'?'dark':'light';
      applyTheme(theme);try{localStorage.setItem('workshop-theme',theme);}catch{}break;
    }
    case 'create-token':case 'empty-create':
      if(libraryTab==='atomic')showDialog(modal('Create an atomic parameter',`<div class="atomic-create-options">${Object.entries(atomicKinds).map(([id,label])=>`<button data-create-atomic="${id}">＋ ${label}</button>`).join('')}</div>`));
      else tokenDialog();break;
    case 'create-tag':tagDialog();break;
    case 'guide-btn':case 'inspector-guide':guideDialog();break;
    case 'files-btn':filesDialog();break;
    case 'options-btn':optionsDialog();break;
    case 'share-btn':shareDialog();break;
    case 'load-example':case 'load-example-atomic':loadExample();break;
    case 'level-settings':levelSettings();break;
    case 'zoom-in':changeZoom(.1);break;
    case 'zoom-out':changeZoom(-.1);break;
    case 'zoom-fit':fitBoard();break;
    case 'undo':undo();break;
    case 'redo':undo(true);break;
    case 'rotate-facing':rotateFacing();break;
    case 'rotate-piece':rotate();break;
    case 'delete-selected':removeSelected();break;
    case 'place-selected':if(activeAsset())stage(activeAsset().id);break;
    case 'edit-definition':if(activeAsset())tokenDialog(activeAsset());break;
    case 'detach-token':dispatch(activeAsset().parameterId?{type:'asset.delete',data:{id:activeAsset().id}}:{type:'asset.update',data:{id:activeAsset().id,parentId:null}});break;
    case 'duplicate-piece':editingTools.duplicate();break;
    case 'reset-piece-states':if(activeInstance())dispatch({type:'instance.resetStates',data:{levelId:level().id,id:activeInstance().id}});break;
    case 'snap-to-nodes':snapToNodes=!snapToNodes;try{localStorage.setItem('workshop-snap-to-nodes',String(snapToNodes));}catch{}render();break;
    case 'add-level':{if(project.levels.length>=30)return toast('This workshop supports up to 30 levels.');const l=blankLevel(uid(),`Level ${project.levels.length+1}`);dispatch({type:'level.add',data:l});levelId=l.id;selected=null;staged=null;render();fitBoard();break;}
    case 'play-mode':{
      if(play)return;if(pending.length)return toast('Wait for changes to save before playtesting.');
      turnOutcome=null;savedOutcomes.clear();
      playInitialState=createPlaytestState(project,level().id);playerInventory=clone(playInitialState.inventory);graveyard=[];graveyardExpanded=false;inventoryExpanded=playerInventory.length>0;playStartRevision=revision;playStart=clone(project);play=clone(playInitialState.project);levelId=playInitialState.levelId;turnSequence=createSequence(turnState());staged=null;tool='select';selected=null;render();toast('Private playtest ready. Start turn 1 to run behaviours.');break;
    }
    case 'edit-mode':if(userTestSession)return;if(play){saveNote();playerInventory=[];graveyard=[];play=null;playStart=null;playInitialState=null;turnSequence=null;turnOutcome=null;savedOutcomes.clear();playStartRevision=null;selected=null;if(!project.levels.some(l=>l.id===levelId))levelId=project.levels[0].id;render();toast('Back to editing. Your original level is preserved.');}break;
    case 'reset-play':clearTurns();break;
  }
});
document.addEventListener('click',e=>{
  if(layerMenuOpen&&!e.target.closest('.parameter-layer-tool')){
    layerMenuOpen=false;$('#parameter-layer-menu').hidden=true;$('[data-tool="overlays"]').setAttribute('aria-expanded','false');
  }
});
document.addEventListener('change',e=>{
  if(e.target.matches('[data-parameter-layer]')){
    const layer=e.target.dataset.parameterLayer;if(!parameterLayers.includes(layer))return;
    e.target.checked?visibleParameterLayers.add(layer):visibleParameterLayers.delete(layer);
    try{localStorage.setItem(parameterLayersPreferenceKey,JSON.stringify([...visibleParameterLayers]));}catch{}
    render();$(`[data-parameter-layer="${layer}"]`).focus();return;
  }
  if(e.target.id==='playtest-mode'){
    if(!Object.hasOwn(playtestModes,e.target.value))return;
    if(userTestSession && testFlow?.blocked)return;
    saveNote();playtestMode=e.target.value;if(userTestSession&&playtestMode==='sandbox')testUsedSandbox=true;render();return;
  }
  if(e.target.matches('[data-user-test-movable]')&&!play){dispatch({type:'asset.update',data:{id:e.target.dataset.userTestMovable,canBeMovedInUserTest:e.target.checked}});return;}
  if(e.target.matches('[data-patrol-hidden]')){dispatch({type:'patrol.update',data:{levelId:level().id,id:e.target.dataset.patrolHidden,hidden:!e.target.checked}});return;}
  if(e.target.id==='patrol-color'&&!play){updatePatrol({color:e.target.value});return;}
  if(e.target.id==='patrol-name'&&!play){updatePatrol({name:e.target.value.trim()||activePatrol().name});return;}
  if(e.target.id==='instance-patrol-color'&&activeInstance()){dispatch({type:'instance.update',data:{levelId:level().id,id:activeInstance().id,patrolColor:e.target.value}});return;}
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
for(const view of ['objects','atomic'])$('#asset-search'+(view==='objects'?'':'-atomic')).oninput=e=>{librarySearch[view]=e.target.value.toLowerCase().trim();renderLibrary();};
$('#import-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  if(file.size>2_000_000)return toast('Choose a project smaller than 2 MB.');
  try{const parsed=validateProject(JSON.parse(await file.text()));confirmDialog('Import this project?',`Replace the shared room with ${parsed.levels.length} level(s) and ${parsed.assets.length} token definition(s)?`,'Import project',()=>{selected=null;staged=null;dispatch({type:'project.replace',data:parsed});levelId=project.levels[0].id;render();fitBoard();toast('Project imported.');});}catch(error){toast(`Could not import: ${error.message}`);}
};
document.addEventListener('pointerdown',e=>{
  if(['link','patrol'].includes(tool)&&e.target.closest('#board'))return;
  if(e.button!==0||$('#dialog').open||e.target.closest('[data-use-object],[data-drop-carried],[data-throw-object],[data-place],[data-rotate-asset],[data-toggle-state],[data-collapse-asset],[data-attach-behaviour],[data-edit-behaviour-block]')||(!play&&['connect','unlink'].includes(tool)&&e.target.closest('#board')))return;
  if(tool==='postIt'&&e.target.closest('#board'))return;
  const piece=e.target.closest('[data-instance]'),row=e.target.closest('[data-asset]'),tagRow=e.target.closest('[data-tag]'),blockRow=!play&&e.target.closest('[data-behaviour-block]'),note=e.target.closest('[data-post-it]');
  const inventoryItem=play&&e.target.closest('[data-inventory-item],[data-graveyard-item]');
  if(e.target.closest('[data-discard-inventory],[data-discard-graveyard],[data-stack-adjust]'))return;
  if(!inventoryItem&&!note&&!piece&&!row&&!blockRow&&(!tagRow||play))return;
  if(piece&&!canManuallyMove(level().instances.find(i=>i.id===piece.dataset.instance)))return;
  e.preventDefault();
  pointerDrag={startX:e.clientX,startY:e.clientY,active:false,payload:inventoryItem?{type:inventoryItem.dataset.graveyardItem?'graveyard':'inventory',id:inventoryItem.dataset.graveyardItem||inventoryItem.dataset.inventoryItem}:note?{type:'postIt',id:note.dataset.postIt,levelId:level().id}:piece?{type:'instance',id:piece.dataset.instance,levelId:level().id}:blockRow?{type:'behaviour',id:blockRow.dataset.behaviourBlock}:tagRow?{type:'tag',id:tagRow.dataset.tag}:{type:'asset',id:row.dataset.asset}};
});
document.addEventListener('pointermove',e=>{
  if(!pointerDrag)return;
  if(!pointerDrag.active&&Math.hypot(e.clientX-pointerDrag.startX,e.clientY-pointerDrag.startY)>5){
    pointerDrag.active=true;
    const a=pointerDrag.payload.type==='behaviour'?currentProject().behaviourLibrary?.find(b=>b.id===pointerDrag.payload.id):pointerDrag.payload.type==='tag'?tag(pointerDrag.payload.id):pointerDrag.payload.type==='asset'?asset(pointerDrag.payload.id):asset((pointerDrag.payload.type==='inventory'?playerInventory:pointerDrag.payload.type==='graveyard'?graveyard:level().instances).find(i=>i.id===pointerDrag.payload.id)?.assetId);
    const ghost=document.createElement('div');ghost.id='drag-ghost';ghost.innerHTML=`${pointerDrag.payload.type==='postIt'?'▧':pointerDrag.payload.type==='behaviour'?'⚙':pointerDrag.payload.type==='tag'?'#':a?tokenArt(a):sprite('rock')}<span>${pointerDrag.payload.type==='postIt'?'Post-it':esc(a?.name)}</span>`;document.body.append(ghost);
  }
  if(!pointerDrag.active)return;
  const ghost=$('#drag-ghost');ghost.style.left=`${e.clientX+14}px`;ghost.style.top=`${e.clientY+14}px`;
  document.querySelectorAll('.nest-hover,.drop-target').forEach(n=>n.classList.remove('nest-hover','drop-target'));
  const target=document.elementFromPoint(e.clientX,e.clientY),cell=target?.closest('.cell'),row=target?.closest('[data-asset]'),root=target?.closest('[data-root-drop]');
  clearBehaviourDrop();
  if(pointerDrag.payload.type==='behaviour'||pointerDrag.payload.type==='tag'){if(!play){const dest=pointerDrag.payload.type==='behaviour'&&behaviourDropTarget(target,e.clientX,e.clientY);if(dest)dest.element.classList.add(dest.marker,'behaviour-drop-hover','nest-hover');else (row||target?.closest('[data-instance]'))?.classList.add('nest-hover');}}
  else if(play&&target?.closest('#player-graveyard')&&pointerDrag.payload.type==='instance')$('#player-graveyard').classList.add('drop-target');
  else if(play&&target?.closest('#player-inventory')&&['asset','instance'].includes(pointerDrag.payload.type))$('#player-inventory').classList.add('drop-target');
  else if(cell&&pointerDrag.payload.type!=='tag'&&(!play||pointerDrag.payload.type!=='asset'))cell.classList.add('drop-target');else if(!play)(pointerDrag.payload.type==='tag'?row:row||root)?.classList.add('nest-hover');
});
document.addEventListener('pointerup',e=>{
  if(!pointerDrag)return;
  const drag=pointerDrag;pointerDrag=null;$('#drag-ghost')?.remove();
  document.querySelectorAll('.nest-hover,.drop-target').forEach(n=>n.classList.remove('nest-hover','drop-target'));
  clearBehaviourDrop();
  if(drag.active){suppressClickUntil=Date.now()+200;dropToken(document.elementFromPoint(e.clientX,e.clientY),drag.payload,e.clientX,e.clientY);}
});
document.addEventListener('pointercancel',()=>{pointerDrag=null;$('#drag-ghost')?.remove();});
document.addEventListener('dragstart',e=>{
  if(pointerDrag){e.preventDefault();return;}
  const piece=e.target.closest('[data-instance]'),row=e.target.closest('[data-asset]'),tagRow=e.target.closest('[data-tag]'),blockRow=e.target.closest('[data-behaviour-block]');
  const inventoryItem=play&&e.target.closest('[data-inventory-item],[data-graveyard-item]');
  if(inventoryItem)dragPayload={type:inventoryItem.dataset.graveyardItem?'graveyard':'inventory',id:inventoryItem.dataset.graveyardItem||inventoryItem.dataset.inventoryItem};
  else if(piece&&!canManuallyMove(level().instances.find(i=>i.id===piece.dataset.instance))){e.preventDefault();return;}
  else if(piece)dragPayload={type:'instance',id:piece.dataset.instance,levelId:level().id};
  else if(blockRow&&!play)dragPayload={type:'behaviour',id:blockRow.dataset.behaviourBlock};
  else if(tagRow&&!play)dragPayload={type:'tag',id:tagRow.dataset.tag};
  else if(row)dragPayload={type:'asset',id:row.dataset.asset};
  else {e.preventDefault();return;}
  e.dataTransfer.setData('application/x-plague-token',JSON.stringify(dragPayload));e.dataTransfer.setData('text/plain',dragPayload.id);e.dataTransfer.effectAllowed=dragPayload.type==='asset'?'copyMove':'move';
});
document.addEventListener('dragover',e=>{
  if(!dragPayload)return;
  const cell=e.target.closest('.cell'),row=e.target.closest('[data-asset]'),root=e.target.closest('[data-root-drop]'),piece=e.target.closest('[data-instance]');
  const graveyardTarget=play&&e.target.closest('#player-graveyard')&&dragPayload.type==='instance';
  const inventoryTarget=play&&e.target.closest('#player-inventory')&&['asset','instance'].includes(dragPayload.type);
  const behaviourTarget=!play&&dragPayload.type==='behaviour'&&behaviourDropTarget(e.target,e.clientX,e.clientY);
  if(behaviourTarget){e.preventDefault();e.dataTransfer.dropEffect='copy';clearBehaviourDrop();behaviourTarget.element.classList.add(behaviourTarget.marker,'behaviour-drop-hover');return;}
  clearBehaviourDrop();
  const valid=graveyardTarget||inventoryTarget||(['tag','behaviour'].includes(dragPayload.type)?!play&&(row||piece):((!play||dragPayload.type!=='asset')&&(cell||piece))||(dragPayload.type==='asset'&&!play&&(row||root)));
  if(valid){e.preventDefault();e.dataTransfer.dropEffect=dragPayload.type==='asset'&&(inventoryTarget||cell||piece)?'copy':'move';}
  document.querySelectorAll('.nest-hover,.drop-target').forEach(n=>n.classList.remove('nest-hover','drop-target'));
  if(graveyardTarget)$('#player-graveyard').classList.add('drop-target');else if(inventoryTarget)$('#player-inventory').classList.add('drop-target');else if(valid&&['tag','behaviour'].includes(dragPayload.type))(row||piece)?.classList.add('nest-hover');else if(valid&&cell)cell.classList.add('drop-target');else if(row&&dragPayload.type==='asset'&&!play)row.classList.add('nest-hover');else if(root)root.classList.add('nest-hover');
});
document.addEventListener('drop',e=>{
  if(!dragPayload)return;e.preventDefault();const payload=dragPayload;dragPayload=null;
  document.querySelectorAll('.nest-hover,.drop-target').forEach(n=>n.classList.remove('nest-hover','drop-target'));
  clearBehaviourDrop();dropToken(e.target,payload,e.clientX,e.clientY);
});
function dropToken(target,payload,x,y){
  if(!target)return;
  const behaviourTarget=!play&&payload.type==='behaviour'&&behaviourDropTarget(target,x,y);
  if(behaviourTarget){dispatch({type:'behaviour.insert',data:{id:behaviourTarget.id,definitionId:payload.id,usageId:uid(),beforeId:behaviourTarget.beforeId}});return;}
  if(play&&target.closest('#player-graveyard')){collectInInventory(payload,true);return;}
  if(play&&target.closest('#player-inventory')){collectInInventory(payload);return;}
  if(payload.type==='postIt'){
    const pos=cursorCell();if(pos&&target.closest('#board')&&payload.levelId===level().id){selected={type:'postIt',id:payload.id};dispatch({type:'postIt.update',data:{levelId:payload.levelId,id:payload.id,...pos}});}return;
  }
  if(payload.type==='tag'||payload.type==='behaviour'){
    if(play)return;
    const row=target.closest('[data-asset]'),piece=target.closest('[data-instance]');
    const a=row?asset(row.dataset.asset):piece?asset(level().instances.find(i=>i.id===piece.dataset.instance)?.assetId):null;
    if(payload.type==='behaviour'){attachBehaviour(payload.id,a);return;}
    if(a && !a.tags.includes(payload.id))dispatch({type:'asset.update',data:{id:a.id,tags:[...a.tags,payload.id]}});
    return;
  }
  const cell=target.closest('.cell'),piece=target.closest('[data-instance]');
  if(cell||piece){
    const target=cell?{x:Number(cell.dataset.x),y:Number(cell.dataset.y)}:level().instances.find(i=>i.id===piece.dataset.instance);
    if(['inventory','graveyard'].includes(payload.type)&&play){
      try{const before=turnState(),fromGraveyard=payload.type==='graveyard',result=releaseItem(play,fromGraveyard?graveyard:playerInventory,level().id,payload.id,{x:target.x,y:target.y},snapToNodes);checkPlaytestMovement(play,result.project,playtestMode);play=result.project;if(fromGraveyard)graveyard=result.inventory;else playerInventory=result.inventory;selected={type:'instance',id:result.instanceId};if(!fromGraveyard)notifyPlayEvents(before,[{type:'inventoryDropped',levelId:level().id,instanceId:result.instanceId}]);render();}catch(error){toast(error.message);}return;
    }
    if(payload.type==='asset'&&!play)place(payload.id,target.x,target.y);
    if(payload.type==='instance'&&payload.levelId===level().id){selected={type:'instance',id:payload.id};dispatch({type:'instance.update',data:{levelId:level().id,id:payload.id,x:target.x,y:target.y}});}return;
  }
  if(payload.type!=='asset'||play)return;
  const row=target.closest('[data-asset]'),root=target.closest('[data-root-drop]');
  if(row||root){const parentId=row?.dataset.asset||null;
    if(!parentId&&isState(asset(payload.id)))return toast('A state must stay inside a token.');
    if(parentId===payload.id || descendants(project,payload.id).some(a=>a.id===parentId))return toast('A token cannot be nested inside itself or its own children.');
    const moving=asset(payload.id);
    const action=isParameter(moving)&&parentId?{type:'parameter.attach',data:{id:payload.id,parentId,usageId:uid(),originalUsageId:uid()}}:moving.parameterId&&!parentId?{type:'asset.delete',data:{id:payload.id}}:{type:'asset.update',data:{id:payload.id,parentId}};
    if(dispatch(action)!==false)toast(parentId?(isParameter(moving)?'Shared parameter attached. It remains available in the library.':'Token nested. Its parameters travel with the parent.'):'Token detached.');
  }
}
document.addEventListener('dragend',()=>{dragPayload=null;clearBehaviourDrop();document.querySelectorAll('.nest-hover,.drop-target').forEach(n=>n.classList.remove('nest-hover','drop-target'));});
$('#board').addEventListener('pointerdown',e=>{
  if(!play&&!staged&&tool==='patrol'&&e.button===0){
    const key=patrolPointerCell(e);if(!key||!hasNode(level(),key))return;
    const patrol=activePatrol();
    if(!patrol){toast('Create or select a patrol first.');return;}
    e.preventDefault();
    paint={tile:'patrol',patrolId:patrol.id,startLength:patrol.nodes.length,nodes:appendPatrolNode(level(),patrol.nodes,key)};
    $('#board').setPointerCapture(e.pointerId);renderBoard();return;
  }
  if(play||staged||['patrol','select','connect','unlink','link','postIt'].includes(tool)||e.button!==0||e.target.closest('[data-instance],[data-object-link],[data-post-it]'))return;
  const cell=e.target.closest('.cell');if(!cell)return;
  e.preventDefault();paint={tile:painterTile(),cells:new Set([`${cell.dataset.x},${cell.dataset.y}`])};$('#board').setPointerCapture(e.pointerId);renderBoard();
});
$('#board').addEventListener('pointermove',e=>{
  if(!paint)return;
  if(paint.tile==='patrol'){
    const key=patrolPointerCell(e),nodes=key?appendPatrolNode(level(),paint.nodes,key):paint.nodes;
    if(nodes!==paint.nodes){paint.nodes=nodes;renderBoard();}
    return;
  }
  const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest('.cell');
  if(cell){const key=`${cell.dataset.x},${cell.dataset.y}`;if(!paint.cells.has(key)){paint.cells.add(key);renderBoard();}}
});
function patrolPointerCell(e){const rect=$('#board').getBoundingClientRect(),x=Math.floor((e.clientX-rect.left)/rect.width*level().width),y=Math.floor((e.clientY-rect.top)/rect.height*level().height);return x>=0&&y>=0&&x<level().width&&y<level().height?`${x},${y}`:null;}
function finishPaint(){
  if(!paint)return;
  if(paint.tile==='patrol'){
    const stroke=paint,patrol=activePatrol();
    paint=null;suppressClickUntil=Date.now()+100;
    if(!patrol||patrol.id!==stroke.patrolId){renderBoard();return;}
    const nodes=stroke.nodes.slice(stroke.startLength).reduce((route,key)=>appendPatrolNode(level(),route,key),patrol.nodes);
    if(nodes===patrol.nodes||updatePatrol({nodes})===false)renderBoard();
    return;
  }
  const data={levelId:level().id,cells:[...paint.cells].filter(key=>paint.tile==='node'?!hasNode(level(),key):paint.tile==='empty'?!!level().tiles[key]||hasNode(level(),key):level().tiles[key]!==paint.tile),tile:paint.tile};
  paint=null;if(data.cells.length)dispatch({type:'tile.paint',data});else renderBoard();
}
$('#board').addEventListener('pointerup',finishPaint);
$('#board').addEventListener('pointercancel',()=>{paint=null;renderBoard();});
document.addEventListener('keydown',e=>{
  if($('#dialog').open || $('#workshop-step-dialog').open)return;
  if(e.key==='Escape'&&layerMenuOpen){e.preventDefault();layerMenuOpen=false;render();$('[data-tool="overlays"]').focus();return;}
  const libraryView=e.target.closest('[data-library-tab]');
  if(libraryView&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
    e.preventDefault();const tabs=['objects','atomic'],index=tabs.indexOf(libraryView.dataset.libraryTab);
    const tab=tabs[e.key==='Home'?0:e.key==='End'?1:(index+1)%2];
    panels.select(tab);$('#library-tab-'+tab).focus();return;
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
  if(e.key==='/'){e.preventDefault();const input=$('#asset-search'+(libraryTab==='objects'?'':'-atomic'));input.focus();return;}
  if(e.key.toLowerCase()==='p'){e.preventDefault();$('#post-it-tool').focus();toast('Drag Post-it onto the canvas.');return;}
  if(e.key.toLowerCase()==='r'){e.preventDefault();if(e.shiftKey)rotate();else rotateFacing();return;}
  if(['Delete','Backspace'].includes(e.key)){e.preventDefault();removeSelected();return;}
  if(e.key==='Enter'){
    const block=e.target.closest('[data-behaviour-block]');if(block&&e.target===block){e.preventDefault();behaviourTools.block(currentProject().behaviourLibrary?.find(b=>b.id===block.dataset.behaviourBlock));return;}
    const linkPiece=e.target.closest('[data-instance]');if(tool==='link'&&linkPiece){e.preventDefault();pickLinkObject(linkPiece.dataset.instance);return;}
    const cell=e.target.closest('.cell'),row=e.target.closest('[data-asset]');
    if(row){selected={type:'asset',id:row.dataset.asset};render();return;}
    if(cell){if(tool==='postIt')postItDialog(null,{x:Number(cell.dataset.x),y:Number(cell.dataset.y)});else if(staged)place(staged,Number(cell.dataset.x),Number(cell.dataset.y));else if(!play&&['connect','unlink'].includes(tool))connectionNode(`${cell.dataset.x},${cell.dataset.y}`);else if(tool!=='select'&&!play)dispatch({type:'tile.paint',data:{levelId:level().id,cells:[`${cell.dataset.x},${cell.dataset.y}`],tile:painterTile()}});}return;
  }
  const directions={ArrowUp:[0,-1],ArrowRight:[1,0],ArrowDown:[0,1],ArrowLeft:[-1,0]},i=activeInstance();
  if(directions[e.key]&&activePostIt()){e.preventDefault();const note=activePostIt(),[dx,dy]=directions[e.key],x=note.x+dx,y=note.y+dy;if(x>=0&&y>=0&&x<savedLevel().width&&y<savedLevel().height)dispatch({type:'postIt.update',data:{levelId:level().id,id:note.id,x,y}});return;}
  if(directions[e.key]&&i){e.preventDefault();const [dx,dy]=directions[e.key],x=i.x+dx,y=i.y+dy;if(x>=0&&y>=0&&x<level().width&&y<level().height)dispatch({type:'instance.update',data:{levelId:level().id,id:i.id,x,y}});return;}
  const shortcut={v:'select',f:'floor',n:'node',w:'wall',e:'empty',x:'unlink',c:'connect',l:'link'}[e.key.toLowerCase()];if(shortcut&&!play){tool=shortcut;staged=null;selected=null;connectionStart=null;linkDraft=[];render();}
});
$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=$('#dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)requestCloseDialog();}});
window.addEventListener('beforeunload',e=>{if(pending.length||notePending||hasUnsavedEditors()){e.preventDefault();e.returnValue='';}});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(fitBoard,200);});
editingTools=manipulation({getProject:currentProject,getLevel:level,getSelected:()=>selected,setSelected:value=>{selected=value;staged=null;tool='select';},dispatch,render,toast,isPlay:()=>!!play,canMove:canManuallyMove,snap:()=>snapToNodes,esc,collectInventory:collectInInventory,openBehaviourOrder:()=>behaviourTools.order()});
floatingTools=floatingCanvas({getProject:()=>project,getLevel:level,dispatch,edit:postItDialog,uid,esc});
if (userTestSession) {
  testFlow = userTestFlow({ endpoint, room,
    getProfile: () => presence?.getProfile(), react: emotion => presence?.react(emotion),
    getRun: () => ({ mode: playtestMode, usedSandbox: testUsedSandbox, turns: turnSequence?.cursor || 0, elapsedSeconds: (Date.now() - testLevelStarted) / 1000 }),
    onLevel: (snapshot, id) => {
      project=clone(snapshot);authoritative=clone(snapshot);levelId=id;turnOutcome=null;testCompletion='automatic';savedOutcomes.clear();
      playInitialState=createPlaytestState(snapshot,id);playerInventory=clone(playInitialState.inventory);graveyard=[];
      inventoryExpanded=playerInventory.length>0;graveyardExpanded=false;playStart=clone(playInitialState.project);play=clone(playStart);
      turnSequence=createSequence(turnState());selected=null;staged=null;tool='select';testLevelStarted=Date.now();testUsedSandbox=playtestMode==='sandbox';
      render();requestAnimationFrame(fitBoard);
    },
    onComplete: session => {
      project=clone(session.project);levelId=project.levels.at(-1).id;
      play=clone(project);turnOutcome=null;render();
    }
  });
}
render();

presence=initPresence({ endpoint, uid, userTest: userTestSession, getView: () => ({ levelId: level().id, play: Boolean(play), finished: testFlow?.complete }) });
document.body.classList.remove('app-loading');
