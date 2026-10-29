import { uid, clone, newProject, blankLevel, validateProject, applyAction, descendants } from './model.js';
import { sprite, iconNames } from './icons.js';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params = new URLSearchParams(location.search);
let room = params.get('room');
if (!/^[\w-]{1,64}$/.test(room || '')) { room = uid().slice(0,8); history.replaceState(null,'',`?room=${room}`); }
if(room!==room.toLowerCase()){room=room.toLowerCase();history.replaceState(null,'',`?room=${room}`);}
const endpoint = `/api/rooms/${room}`;
let project = newProject(), authoritative = clone(project), revision = -1, pending = [], busy = false, connected = false;
let levelId, selected = null, staged = null, tool = 'select', search = '', zoom = 1, play = null, playStart = null, historyStack = [], redoStack = [];
let dragPayload = null, showAll = false, paint = null, toastTimer, didInitialFit = false;
let notePending = null, noteTimer;
const level = () => (play || project).levels.find(l => l.id === levelId) || (play || project).levels[0];
const asset = id => (play || project).assets.find(a => a.id === id);
const activeInstance = () => selected?.type === 'instance' ? level().instances.find(i => i.id === selected.id) : null;
const activeAsset = () => selected?.type === 'asset' ? asset(selected.id) : asset(activeInstance()?.assetId);
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3800); }
function setStatus() { $('#save-state').textContent = !connected ? 'Reconnecting…' : pending.length || notePending ? 'Saving…' : 'All changes saved'; $('#save-state').classList.toggle('offline', !connected); }
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
  setStatus(); render();
}
function receive(data) {
  if (data.peers !== undefined) $('#peer-count').textContent = data.peers;
  if (data.actionId) pending = pending.filter(p => p.actionId !== data.actionId);
  if (data.project && data.revision >= revision) { authoritative = data.project; revision = data.revision; rebuild(); }
}
const events = new EventSource(endpoint + '/events');
events.onopen = () => { connected = true; setStatus(); pump(); };
events.onerror = () => { connected = false; setStatus(); };
events.onmessage = event => {
  const data = JSON.parse(event.data);
  receive(data);
  if (!didInitialFit && data.project) { didInitialFit = true; requestAnimationFrame(fitBoard); }
};
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
  } catch { connected = false; setStatus(); setTimeout(() => { connected = events.readyState === EventSource.OPEN; pump(); setStatus(); }, 2000); }
  finally { busy = false; if (connected && pending.length) pump(); }
}
function dispatch(action, {record = true} = {}) {
  if (play) {
    try { play = applyAction(play, action); render(); } catch(e) { toast(e.message); }
    return;
  }
  if (revision < 0) return toast('Wait for the workshop to connect.');
  try {
    const next = applyAction(project,action);
    if (record) { historyStack.push({before:clone(project),after:clone(next)}); if (historyStack.length > 40) historyStack.shift(); redoStack = []; }
    pending.push({action,actionId:uid(),expectedRevision:revision}); project = next; setStatus(); render(); pump();
  } catch(e) { toast(e.message); }
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
  $('#dimensions').textContent = `${l.width} × ${l.height} GRID`;
  $('#asset-count').textContent = project.assets.length;
  $('#token-count').textContent = `${l.instances.length} token${l.instances.length === 1 ? '' : 's'} placed`;
  $('#level-tabs').innerHTML = (play || project).levels.map((l,i) => `<button data-level="${esc(l.id)}" class="${l.id === levelId ? 'active' : ''}"><span>${String(i+1).padStart(2,'0')}</span>${esc(l.name)}</button>`).join('');
  $('#edit-mode').classList.toggle('active',!play); $('#play-mode').classList.toggle('active',!!play);
  $('#play-banner').hidden = !play; $('#tools').hidden = !!play;
  $('#create-token').disabled = !!play; $('#add-level').disabled = !!play; $('#level-settings').disabled = !!play;
  $('#undo').disabled = !historyStack.length || !!play; $('#redo').disabled = !redoStack.length || !!play;
  $('#mode-label').innerHTML = `<span class="tiny-dot"></span>${play ? 'MANUAL PLAYTEST' : 'EDITING CANVAS'}`;
  const tools = [['select','↖','Select & move · V'],['floor','▦','Paint floor · F'],['node','⊙','Paint path nodes · N'],['wall','▧','Paint walls · W'],['empty','⌫','Erase tiles · E']];
  $('#tools').innerHTML = tools.map(([id,icon,label]) => `<button data-tool="${id}" class="${tool === id && !staged ? 'active' : ''}" aria-label="${label}" data-tip="${label}" aria-pressed="${tool === id && !staged}">${icon}</button>`).join('') + `<div class="tool-separator"></div><button data-tool="overlays" class="${showAll ? 'active' : ''}" aria-label="Toggle all parameter overlays" data-tip="Show all parameters">◉</button>`;
  $('#canvas-hint').innerHTML = play ? 'The rules are yours to interpret.<br><b>Drag pieces to play. Changes here are temporary.</b>' : staged ? `Placing ${esc(asset(staged)?.name || 'token')}.<br><b>Click a cell to place. Esc to finish.</b>` : l.instances.length ? 'Every piece is a possibility.<br><b>Select a token to inspect its parameters.</b>' : 'An empty stage for your ideas.<br><b>Start with a token, or shape the ground.</b>';
  renderBoard(); renderLibrary(); renderInspector();
}
function renderBoard() {
  const l = level(), board = $('#board');
  board.style.setProperty('--cols',l.width); board.style.setProperty('--rows',l.height); board.style.setProperty('--cell',`${48*zoom}px`);
  let html = '';
  for (let y = 0; y < l.height; y++) for (let x = 0; x < l.width; x++) {
    const tile = paint?.cells.has(`${x},${y}`) ? paint.tile : l.tiles[`${x},${y}`];
    html += `<div class="cell ${tile || ''}" role="gridcell" tabindex="0" data-x="${x}" data-y="${y}" aria-label="Column ${x+1}, row ${y+1}, ${tile || 'empty'}">`;
    if (tile === 'node') {
      if (l.tiles[`${x+1},${y}`] === 'node') html += '<span class="node-link"></span>';
      if (l.tiles[`${x},${y+1}`] === 'node') html += '<span class="node-link vertical"></span>';
      html += '<span class="node-dot"></span>';
    }
    html += '</div>';
  }
  for (const i of l.instances) {
    const a = asset(i.assetId); if (!a) continue;
    const isSelected = selected?.type === 'instance' && selected.id === i.id;
    if (showAll || isSelected) html += overlays(a,i,l);
    const children = descendants(play || project,a.id);
    const stack = l.instances.filter(n => n.x === i.x && n.y === i.y).indexOf(i);
    html += `<button class="piece ${isSelected?'selected':''}" data-instance="${esc(i.id)}" draggable="true" title="${esc(a.name)} · ${i.rotation}°" aria-label="${esc(a.name)} at ${i.x+1}, ${i.y+1}, rotated ${i.rotation} degrees" style="--x:${i.x};--y:${i.y};--rotation:${i.rotation}deg;${stack ? `margin-left:${stack*5}px;margin-top:${stack*-4}px;` : ''}">${sprite(a.icon,a.color)}<span class="direction">▴</span>${children.length ? `<span class="child-count">${children.length}</span>` : ''}</button>`;
  }
  board.innerHTML = html;
  $('#zoom-label').textContent = `${Math.round(zoom*100)}%`;
}
function overlays(a,i,l) {
  const effects = [a,...descendants(play || project,a.id)].filter(a => ['area','sight'].includes(a.icon));
  let result = '';
  for (const effect of effects) for (let y=0;y<l.height;y++) for (let x=0;x<l.width;x++) {
    const dx=x-i.x,dy=y-i.y, angle=i.rotation;
    const forward = angle===0 ? -dy : angle===90 ? dx : angle===180 ? dy : -dx;
    const visible = effect.icon==='area' ? Math.abs(dx)+Math.abs(dy)<=effect.range : forward>0 && forward<=effect.range && (angle%180===0 ? dx===0 : dy===0);
    if (visible) result += `<span class="overlay-cell" style="--x:${x};--y:${y};--overlay:${effect.color}"></span>`;
  }
  return result;
}
function renderLibrary() {
  const items = (play || project).assets;
  const library = $('#library');
  if (!items.length) {
    library.innerHTML = `<div class="empty-library"><div class="empty-art"><span class="block"></span><span class="block"></span><span class="block">＋</span></div><h3>Every idea starts small.</h3><p>A torch. A curious rat. A patch of light.<br>Create your first building block.</p><button class="primary" id="empty-create" ${play?'disabled':''}>＋ Create a token</button></div><div style="text-align:center"><button class="text-btn" id="load-example" ${play?'disabled':''}>Explore an example instead ↗</button></div>`; return;
  }
  let rows = '';
  const matching = a => !search || [a.name,a.rule,...a.tags].join(' ').toLowerCase().includes(search);
  const show = (a,depth=0) => {
    if (!matching(a) && !descendants(play || project,a.id).some(matching)) return;
    rows += `<div class="asset-row ${depth?'child':''} ${selected?.type==='asset' && selected.id===a.id?'active':''}" draggable="${!play}" data-asset="${esc(a.id)}" style="${depth>1?`margin-left:${Math.min(depth,7)*21}px`:''}" tabindex="0" role="button" aria-label="${esc(a.name)}, ${depth?'nested token':'token'}"><div class="asset-icon">${sprite(a.icon,a.color)}</div><div class="asset-copy"><strong>${esc(a.name)}</strong><small>${esc(a.tags.join(' · ') || (a.icon==='area' ? `Radius ${a.range} · cells` : a.icon==='sight' ? `Distance ${a.range} · directional` : iconNames[a.icon] || 'Token'))}</small></div><button class="asset-place" data-place="${esc(a.id)}" title="Place ${esc(a.name)}" aria-label="Place ${esc(a.name)}" ${play?'disabled':''}>＋</button></div>`;
    items.filter(b=>b.parentId===a.id).forEach(b=>show(b,depth+1));
  };
  items.filter(a=>!a.parentId).forEach(a=>show(a));
  if (!rows) rows='<div class="search-empty">No matching tokens or tags.</div>';
  library.innerHTML = (staged ? `<div class="staged-hint">Click the level to place ${esc(asset(staged)?.name)}. Press Esc to finish.</div>` : '') + rows + (!play ? '<div class="root-drop" data-root-drop>Drop here to make a standalone token</div>' : '');
}
function renderInspector() {
  const a = activeAsset(), i = activeInstance(), el = $('#inspector');
  // Remote edits must not replace a student's unfinished placement note.
  const focused = document.activeElement;
  if(focused?.id==='instance-note' && focused.dataset.instanceNote===i?.id) return;
  if (!a) {
    el.innerHTML = `<div class="eyebrow">A NOTE FROM THE WORKBENCH</div><h3>Think in small pieces.</h3><p class="inspector-quote">“What could change<br>if just one thing changed?”</p><div class="inspector-note"><p>Name a token. Describe its rule.<br>Combine it with another. See what happens.</p></div><button class="text-btn" id="inspector-guide" style="padding-left:0;margin-top:13px">Open the field guide ↗</button>`; return;
  }
  const children = descendants(play || project,a.id);
  el.innerHTML = `<div class="eyebrow">${i ? 'PLACED TOKEN' : 'TOKEN DEFINITION'}</div><div class="inspector-top"><div class="asset-icon">${sprite(a.icon,a.color)}</div><div><h3>${esc(a.name)}</h3><small>${i?`CELL ${i.x+1}, ${i.y+1} · ${i.rotation}° ROTATION`:'REUSABLE BUILDING BLOCK'}</small></div></div><p>${esc(a.rule || 'No rule yet. What should this token mean?').replace(/\n/g,'<br>')}</p><div class="tags">${a.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>${['area','sight'].includes(a.icon)?`<div class="field"><label for="quick-range">${a.icon==='area'?'Radius':'Distance'} <span id="quick-range-value">${a.range}</span> cells</label><input id="quick-range" type="range" min="1" max="12" value="${a.range}" ${play?'disabled':''}></div>`:''}${children.length?`<div class="nested-title">COMPOSED OF · ${children.length} PARAMETERS</div>${children.map(c=>`<div class="nested-chip" style="padding-left:${Math.min(depthOf(c,a.id),5)*10}px">${sprite(c.icon,c.color)}<span>${esc(c.name)}</span><small>${['area','sight'].includes(c.icon)?`${c.range} cells`:esc(c.tags[0]||'')}</small></div>`).join('')}`:''}${i?`<div class="field"><label for="instance-note">Placement notes</label><textarea id="instance-note" data-instance-note="${esc(i.id)}" maxlength="4000" placeholder="A note for this piece…">${esc(i.note||'')}</textarea></div>`:''}<div class="inspector-actions">${i?'<button id="rotate-piece">↻ Rotate 90°</button><button id="duplicate-piece">⧉ Duplicate</button>':`<button id="place-selected" ${play?'disabled':''}>＋ Place in level</button>`}<button id="edit-definition" ${play?'disabled':''}>Edit token</button></div><div class="inspector-actions"><button class="danger" id="delete-selected">${i?'Remove from level':'Delete token'}</button>${!i&&a.parentId?'<button id="detach-token">↳ Detach</button>':''}</div>`;
}
function depthOf(a, ancestor) { let depth=0, parent=a.parentId; while(parent && parent!==ancestor && depth<20) { depth++; parent=asset(parent)?.parentId; } return depth; }
function fitBoard() {
  const view = $('#board-viewport'), l=level();
  zoom = Math.min(1.3, Math.max(.3, Math.min((view.clientWidth-30)/(l.width*48),(view.clientHeight-15)/(l.height*48)))); renderBoard();
}
function changeZoom(delta) { zoom=Math.max(.3,Math.min(2,zoom+delta)); renderBoard(); }
function selectInstance(id) { selected={type:'instance',id}; staged=null; tool='select'; render(); }
function place(assetId,x,y) {
  if (!asset(assetId)) return;
  const instance={id:uid(),assetId,x,y,rotation:0,note:''};
  selected={type:'instance',id:instance.id};
  dispatch({type:'instance.add',data:{levelId:level().id,instance}});
}
function rotate() { const i=activeInstance(); if(i) dispatch({type:'instance.update',data:{levelId:level().id,id:i.id,rotation:(i.rotation+90)%360}}); }
function removeSelected() {
  const i=activeInstance(), a=activeAsset(); if(!a)return;
  if(i) { dispatch({type:'instance.delete',data:{levelId:level().id,id:i.id}}); selected=null;render(); }
  else confirmDialog(`Delete ${a.name}?`,'This removes this token, its nested tokens, and their placements from every level.','Delete token',()=>{dispatch({type:'asset.delete',data:{id:a.id}});selected=null;render();});
}
function stage(id) { if(play)return; staged=id; selected={type:'asset',id};tool='select'; render();toast(`Click a cell to place ${asset(id).name}.`); }
function showDialog(content) { $('#dialog-content').innerHTML=content; if(!$('#dialog').open)$('#dialog').showModal(); }
const closeDialog=()=>$('#dialog').close();
function modal(title,body,footer='',eyebrow='THE WORKBENCH') { return `<div class="modal"><div class="eyebrow">${eyebrow}</div><div class="modal-head"><h2>${esc(title)}</h2><button data-close aria-label="Close dialog">×</button></div>${body}${footer?`<div class="modal-footer">${footer}</div>`:''}</div>`; }
function confirmDialog(title,text,label,action) {
  showDialog(modal(title,`<p class="confirm-box">${esc(text)}</p>`,'<button data-close>Cancel</button><button class="primary" id="confirm-action">'+esc(label)+'</button>'));
  $('#confirm-action').onclick=()=>{closeDialog();action();};
}
function tokenDialog(existing) {
  if(play)return;
  const draft=clone(existing || {id:uid(),name:'',icon:'torch',rule:'',color:'#b8cf96',tags:[],range:2,parentId:null});
  showDialog(modal(existing?'Edit a token':'Create a token',`<form id="token-form"><div class="field"><label for="token-name">Name <span class="muted">· required</span></label><input id="token-name" maxlength="80" required placeholder="A torch, a rule, a possibility…" value="${esc(draft.name)}" autofocus></div><div class="field-label">Choose an icon</div><div class="icon-picker">${Object.entries(iconNames).map(([id,name])=>`<button type="button" data-icon="${id}" class="${draft.icon===id?'active':''}" title="${name}" aria-label="${name}" aria-pressed="${draft.icon===id}">${sprite(id,draft.color)}</button>`).join('')}</div><div class="field"><label for="token-rule">Rule / description</label><textarea id="token-rule" maxlength="4000" placeholder="What does it do? What can change? The rules are yours to define.">${esc(draft.rule)}</textarea></div><div class="field"><label for="token-tags">Tags <span class="muted">· separate with commas</span></label><input id="token-tags" maxlength="1800" placeholder="Pickable, light source, fragile" value="${esc(draft.tags.join(', '))}"></div><div class="field"><label>Parameter color</label><div class="color-picker">${['#b8cf96','#edc47c','#d8967f','#8fb8c2','#b2a1c6','#ddddbd'].map(c=>`<button type="button" data-color="${c}" class="${draft.color===c?'active':''}" style="--swatch:${c}" aria-label="Color ${c}"></button>`).join('')}<input id="custom-color" type="color" value="${draft.color}" aria-label="Custom parameter color"></div></div><div class="field" id="range-field" ${['area','sight'].includes(draft.icon)?'':'hidden'}><label id="range-name" for="token-range">${draft.icon==='sight'?'Distance':'Radius'} in grid cells</label><div class="range-control"><input type="range" id="token-range" min="1" max="12" value="${draft.range}"><output id="range-value">${draft.range} cells</output></div><small id="range-help">Visual guide only. Areas use diamond-shaped grid distance; sight follows one direction. Walls do not block overlays.</small></div><div class="callout">A token holds an idea. Nest other tokens inside it to combine their parameters. Rules are descriptions for students to interpret.</div><div class="modal-footer"><button type="button" data-close>Cancel</button><button type="submit" class="primary">${existing?'Save changes':'Create token'}</button></div></form>`));
  $('#token-form').onclick=e=>{
    const icon=e.target.closest('[data-icon]'), color=e.target.closest('[data-color]');
    if(icon) { draft.icon=icon.dataset.icon; document.querySelectorAll('[data-icon]').forEach(b=>{b.classList.toggle('active',b===icon);b.setAttribute('aria-pressed',b===icon);});$('#range-field').hidden=!['area','sight'].includes(draft.icon);$('#range-name').textContent=draft.icon==='sight'?'Distance in grid cells':'Radius in grid cells'; }
    if(color) { draft.color=color.dataset.color;$('#custom-color').value=draft.color; document.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('active',b===color)); }
  };
  $('#custom-color').oninput=e=>{draft.color=e.target.value;document.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('active',b.dataset.color===draft.color));};
  $('#token-range').oninput=e=>$('#range-value').textContent=`${e.target.value} cells`;
  $('#token-form').onsubmit=e=>{
    e.preventDefault();draft.name=$('#token-name').value.trim();if(!draft.name)return $('#token-name').focus();
    draft.rule=$('#token-rule').value;draft.tags=[...new Set($('#token-tags').value.split(',').map(t=>t.trim()).filter(Boolean))];draft.range=Number($('#token-range').value);
    try { applyAction(project,{type:existing?'asset.update':'asset.add',data:draft}); }catch(error){return toast(error.message);}
    selected={type:'asset',id:draft.id};dispatch({type:existing?'asset.update':'asset.add',data:draft});closeDialog();toast(existing?'Token updated. All placements use this definition.':'Token created. Drag it into the level or another token.');
  };
}
function guideDialog() {
  showDialog(modal('Small pieces. Big possibilities.',`<p>A virtual tabletop for exploring atomic parameters. There is no automated game logic: you decide what every piece means.</p><div class="help-list">${[
    ['Shape the stage','Paint floor, walls, or GO path nodes with the left toolbar. Adjacent path nodes connect automatically. Hold and drag to paint; use level settings to rename or resize.'],
    ['Give an idea a token','Use + in the library. Choose a name, sprite, rule, tags and color. Area of effect and line of sight have adjustable cell distances.'],
    ['Compose a mechanic','Drag Area of effect onto Torch in the library. It becomes a nested parameter. Nested tokens can contain more tokens; drag to the standalone drop zone to detach.'],
    ['Place and investigate','Drag a token from the library onto any cell, or click its + then a cell. Drag placed pieces to move them. Select one to inspect its tags and children. R rotates 90°. Double-click opens its definition.'],
    ['Change one thing','Try a new radius, a different tag, or a new description. What changes for the player? Definitions update every placement; placement notes belong to one piece.'],
    ['Play by hand, together','Playtest makes a temporary local copy. Move and rotate pieces freely, then reset or return to editing. Share a room link for live editing on the same local network.']
  ].map(([title,text],n)=>`<div class="help-item"><span class="help-number">0${n+1}</span><div><strong>${title}</strong><p>${text}</p></div></div>`).join('')}</div><div class="callout">Overlays are visual rulers: area uses Manhattan (diamond) distance, sight is a straight directional line. Neither applies collisions, visibility, inventory, turns, or win conditions. Multiple tokens can share a cell; remove or move the top one to reach the others.</div><details><summary>Keyboard shortcuts</summary><p>V select · F floor · N nodes · W walls · E erase tiles · R rotate · Delete remove selected token · Esc deselect · Ctrl+Z undo · Ctrl+Y or Ctrl+Shift+Z redo · / search. Use arrow keys to move a selected piece; Enter on a focused cell activates it.</p></details><p style="margin-top:18px;font-size:10px">Original workshop sprites. An unofficial, educational fan project inspired by the GO games and A Plague Tale.</p>`,'<button data-close class="primary">Back to the workbench</button>','FIELD GUIDE'));
}
function filesDialog() {
  showDialog(modal('Your workshop, to keep.',`<p>Changes save automatically on this server. Export a project to keep a portable copy of all levels, tokens, rules, and tags.</p><div class="files-grid"><button id="export-project">↧ Export project<small>Download a readable .json file</small></button><button id="import-project">↥ Import project<small>Replace this room with a saved project</small></button><button id="example-project">✧ Load example<small>A torch, light, rats, and a guard</small></button><button id="new-project">＋ Clear workshop<small>Start again with an empty library</small></button></div><div class="callout">Room <b>${esc(room)}</b> · Editing this room changes it for every participant. Playtest copies are local and excluded from exports.</div>`));
  $('#export-project').onclick=()=>{
    const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'}), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;a.download=`plague-tale-go-${room}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Project exported.');
  };
  $('#import-project').onclick=()=>{if(play)return toast('Return to Edit before importing.');$('#import-file').click();};
  $('#example-project').onclick=()=>loadExample();
  $('#new-project').onclick=()=>{if(play)return toast('Return to Edit before clearing.');confirmDialog('Clear this workshop?','All levels and token definitions in this shared room will be replaced. Export a copy first if you want to keep them.','Clear workshop',()=>{dispatch({type:'project.replace',data:newProject()});selected=null;staged=null;});};
}
async function shareDialog() {
  let config={urls:[]};try{config=await(await fetch('/api/config')).json();}catch{}
  const isLoopback=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  const links=(isLoopback?config.urls:[location.origin]).map(url=>`${url}/?room=${room}`);
  if(!links.length)links.push(location.href);
  showDialog(modal('A shared workbench.',`<p>Open this room on another Windows browser to edit together. Everyone sees the same tokens and levels as changes are saved.</p><label class="field-label">${isLoopback?'Classroom / local network link':'Workshop link'}</label>${links.map((url,n)=>`<div class="copy-row"><input readonly id="share-link-${n}" value="${esc(url)}" aria-label="Workshop share link"><button class="primary" data-copy="${n}">Copy</button></div>`).join('')}<div class="callout">Keep this server running. Students need to be on the same local network; Windows may ask you to allow Node.js through the firewall on a private network. This app has no accounts: anyone with network access and the room link can edit.</div><p style="margin-top:15px;font-size:11px">Room ID: <b>${esc(room)}</b> · <b>${esc($('#peer-count').textContent)}</b> connected browser(s). New rooms start at <span class="small-link">/?room=your-room-name</span>. Playtest changes stay in your browser.</p>`,'<button class="primary" data-close>Done</button>','LIVE WORKSHOP'));
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
  return p;
}
function loadExample() {
  if(play)return toast('Return to Edit before loading an example.');
  const load=()=>{const p=example();selected=null;staged=null;dispatch({type:'project.replace',data:p});levelId=p.levels[0].id;closeDialog();render();fitBoard();toast('Example loaded. Select the torch or guard to see their nested parameters.');};
  if(project.assets.length || project.levels.some(l=>l.instances.length))confirmDialog('Load the example?','This replaces the current shared workshop. Export a copy first if you want to keep it.','Load example',load);else load();
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
document.addEventListener('click', e=>{
  if(Date.now()<suppressClickUntil){e.preventDefault();return;}
  if(notePending && e.target.id!=='instance-note') saveNote();
  const close=e.target.closest('[data-close]');if(close)return closeDialog();
  const icon=e.target.closest('[data-tool]');
  if(icon){if(icon.dataset.tool==='overlays')showAll=!showAll;else{tool=icon.dataset.tool;staged=null;selected=null;}return render();}
  const tab=e.target.closest('[data-level]');if(tab){levelId=tab.dataset.level;selected=null;staged=null;render();fitBoard();return;}
  const placeBtn=e.target.closest('[data-place]');if(placeBtn){stage(placeBtn.dataset.place);return;}
  const row=e.target.closest('[data-asset]');if(row){clickedToken('asset',row.dataset.asset);return;}
  const piece=e.target.closest('[data-instance]');if(piece){clickedToken('instance',piece.dataset.instance);return;}
  const cell=e.target.closest('.cell');if(cell && (staged || play || tool==='select')){
    if(staged)place(staged,Number(cell.dataset.x),Number(cell.dataset.y));else{selected=null;render();}return;
  }
  switch(e.target.closest('button')?.id){
    case 'create-token':case 'empty-create':tokenDialog();break;
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
    case 'rotate-piece':rotate();break;
    case 'delete-selected':removeSelected();break;
    case 'place-selected':if(activeAsset())stage(activeAsset().id);break;
    case 'edit-definition':if(activeAsset())tokenDialog(activeAsset());break;
    case 'detach-token':dispatch({type:'asset.update',data:{id:activeAsset().id,parentId:null}});break;
    case 'duplicate-piece':{const i=activeInstance();if(i){const copy={...i,id:uid(),x:Math.min(level().width-1,i.x+1)};selected={type:'instance',id:copy.id};dispatch({type:'instance.add',data:{levelId:level().id,instance:copy}});}break;}
    case 'add-level':{if(project.levels.length>=30)return toast('This workshop supports up to 30 levels.');const l=blankLevel(uid(),`Level ${project.levels.length+1}`);dispatch({type:'level.add',data:l});levelId=l.id;selected=null;staged=null;render();fitBoard();break;}
    case 'play-mode':{
      if(play)return;if(pending.length)return toast('Wait for changes to save before playtesting.');
      playStart=clone(project);play=clone(project);staged=null;tool='select';selected=null;render();toast('Manual playtest. Drag and rotate pieces; you interpret the rules.');break;
    }
    case 'edit-mode':if(play){play=null;playStart=null;selected=null;if(!project.levels.some(l=>l.id===levelId))levelId=project.levels[0].id;render();toast('Back to editing. Your original level is preserved.');}break;
    case 'reset-play':if(play){play=clone(playStart);selected=null;render();toast('Playtest reset.');}break;
  }
});
document.addEventListener('change',e=>{
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
  if(e.button!==0||$('#dialog').open||e.target.closest('[data-place]'))return;
  const piece=e.target.closest('[data-instance]'),row=e.target.closest('[data-asset]');
  if(!piece&&(!row||play))return;
  e.preventDefault();
  pointerDrag={startX:e.clientX,startY:e.clientY,active:false,payload:piece?{type:'instance',id:piece.dataset.instance,levelId:level().id}:{type:'asset',id:row.dataset.asset}};
});
document.addEventListener('pointermove',e=>{
  if(!pointerDrag)return;
  if(!pointerDrag.active&&Math.hypot(e.clientX-pointerDrag.startX,e.clientY-pointerDrag.startY)>5){
    pointerDrag.active=true;
    const a=pointerDrag.payload.type==='asset'?asset(pointerDrag.payload.id):asset(level().instances.find(i=>i.id===pointerDrag.payload.id)?.assetId);
    const ghost=document.createElement('div');ghost.id='drag-ghost';ghost.innerHTML=`${sprite(a?.icon,a?.color)}<span>${esc(a?.name)}</span>`;document.body.append(ghost);
  }
  if(!pointerDrag.active)return;
  const ghost=$('#drag-ghost');ghost.style.left=`${e.clientX+14}px`;ghost.style.top=`${e.clientY+14}px`;
  document.querySelectorAll('.nest-hover,.drop-target').forEach(n=>n.classList.remove('nest-hover','drop-target'));
  const target=document.elementFromPoint(e.clientX,e.clientY),cell=target?.closest('.cell'),row=target?.closest('[data-asset]'),root=target?.closest('[data-root-drop]');
  if(cell)cell.classList.add('drop-target');else if(pointerDrag.payload.type==='asset'&&!play)(row||root)?.classList.add('nest-hover');
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
  const piece=e.target.closest('[data-instance]'),row=e.target.closest('[data-asset]');
  if(piece)dragPayload={type:'instance',id:piece.dataset.instance,levelId:level().id};
  else if(row&&!play)dragPayload={type:'asset',id:row.dataset.asset};
  else {e.preventDefault();return;}
  e.dataTransfer.setData('application/x-plague-token',JSON.stringify(dragPayload));e.dataTransfer.setData('text/plain',dragPayload.id);e.dataTransfer.effectAllowed=dragPayload.type==='asset'?'copyMove':'move';
});
document.addEventListener('dragover',e=>{
  if(!dragPayload)return;
  const cell=e.target.closest('.cell'),row=e.target.closest('[data-asset]'),root=e.target.closest('[data-root-drop]'),piece=e.target.closest('[data-instance]');
  const valid=cell||piece||(dragPayload.type==='asset'&&!play&&(row||root));
  if(valid){e.preventDefault();e.dataTransfer.dropEffect=cell||piece?(dragPayload.type==='asset'?'copy':'move'):'move';}
  document.querySelectorAll('.nest-hover,.drop-target').forEach(n=>n.classList.remove('nest-hover','drop-target'));
  if(cell)cell.classList.add('drop-target');else if(row&&dragPayload.type==='asset'&&!play)row.classList.add('nest-hover');else if(root)root.classList.add('nest-hover');
});
document.addEventListener('drop',e=>{
  if(!dragPayload)return;e.preventDefault();const payload=dragPayload;dragPayload=null;
  document.querySelectorAll('.nest-hover,.drop-target').forEach(n=>n.classList.remove('nest-hover','drop-target'));
  dropToken(e.target,payload);
});
function dropToken(target,payload){
  if(!target)return;
  const cell=target.closest('.cell'),piece=target.closest('[data-instance]');
  if(cell||piece){
    const target=cell?{x:Number(cell.dataset.x),y:Number(cell.dataset.y)}:level().instances.find(i=>i.id===piece.dataset.instance);
    if(payload.type==='asset'&&!play)place(payload.id,target.x,target.y);
    if(payload.type==='instance'&&payload.levelId===level().id){selected={type:'instance',id:payload.id};dispatch({type:'instance.update',data:{levelId:level().id,id:payload.id,x:target.x,y:target.y}});}return;
  }
  if(payload.type!=='asset'||play)return;
  const row=target.closest('[data-asset]'),root=target.closest('[data-root-drop]');
  if(row||root){const parentId=row?.dataset.asset||null;
    if(parentId===payload.id || descendants(project,payload.id).some(a=>a.id===parentId))return toast('A token cannot be nested inside itself or its own children.');
    dispatch({type:'asset.update',data:{id:payload.id,parentId}});toast(parentId?'Token nested. Its parameters travel with the parent.':'Token detached.');
  }
}
document.addEventListener('dragend',()=>{dragPayload=null;document.querySelectorAll('.nest-hover,.drop-target').forEach(n=>n.classList.remove('nest-hover','drop-target'));});
$('#board').addEventListener('pointerdown',e=>{
  if(play||staged||tool==='select'||e.button!==0||e.target.closest('[data-instance]'))return;
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
  if($('#dialog').open)return;
  const editing=e.target.matches('input,textarea,select,[contenteditable]');if(editing)return;
  if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();undo(e.key.toLowerCase()==='y'||e.shiftKey);return;}
  if(e.key==='Escape'){staged=null;selected=null;tool='select';render();return;}
  if(e.key==='/'){e.preventDefault();$('#asset-search').focus();return;}
  if(e.key.toLowerCase()==='r'){e.preventDefault();rotate();return;}
  if(['Delete','Backspace'].includes(e.key)){e.preventDefault();removeSelected();return;}
  if(e.key==='Enter'){
    const cell=e.target.closest('.cell'),row=e.target.closest('[data-asset]');
    if(row){selected={type:'asset',id:row.dataset.asset};render();return;}
    if(cell){if(staged)place(staged,Number(cell.dataset.x),Number(cell.dataset.y));else if(tool!=='select'&&!play)dispatch({type:'tile.paint',data:{levelId:level().id,cells:[`${cell.dataset.x},${cell.dataset.y}`],tile:tool}});}return;
  }
  const directions={ArrowUp:[0,-1],ArrowRight:[1,0],ArrowDown:[0,1],ArrowLeft:[-1,0]},i=activeInstance();
  if(directions[e.key]&&i){e.preventDefault();const [dx,dy]=directions[e.key],x=i.x+dx,y=i.y+dy;if(x>=0&&y>=0&&x<level().width&&y<level().height)dispatch({type:'instance.update',data:{levelId:level().id,id:i.id,x,y}});return;}
  const shortcut={v:'select',f:'floor',n:'node',w:'wall',e:'empty'}[e.key.toLowerCase()];if(shortcut&&!play){tool=shortcut;staged=null;selected=null;render();}
});
$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=$('#dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
window.addEventListener('beforeunload',e=>{if(pending.length||notePending){e.preventDefault();e.returnValue='';}});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(fitBoard,200);});
render();
