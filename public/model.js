import { iconNames, iconVariants, defaultVariant } from './icons.js';
// randomUUID is unavailable on plain HTTP LAN addresses, unlike localhost.
export const uid = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for(let i=0;i<16;i++) bytes[i]=Math.floor(Math.random()*256);
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const h=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
export const clone = x => JSON.parse(JSON.stringify(x));
export function blankLevel(id = uid(), name = 'The quiet courtyard') {
  const tiles = {};
  for (let y = 2; y < 9; y++) for (let x = 2; x < 12; x++) tiles[`${x},${y}`] = 'floor';
  return { id, name, width: 14, height: 11, tiles, blockedLinks: [], objectLinks: [], instances: [], postIts: [] };
}
export const newProject = () => ({ version: 3, title: 'Plague Tale GO', tags: [], assets: [], levels: [blankLevel()], cardDraws: [] });
// A canonical key makes a connection identical from either endpoint.
export const linkKey = (a, b) => [a, b].sort().join('|');
export function adjacentNodes(l, a, b) {
  if (l.tiles[a] !== 'node' || l.tiles[b] !== 'node') return false;
  const [ax, ay] = a.split(',').map(Number), [bx, by] = b.split(',').map(Number);
  return Math.abs(ax-bx) + Math.abs(ay-by) === 1;
}
export const nodesConnected = (l, a, b) => adjacentNodes(l,a,b) && !(l.blockedLinks || []).includes(linkKey(a,b));
function migrateProject(input) {
  if(input?.version===3 && (input.cardDraws===undefined || input.levels?.some(l=>l.objectLinks===undefined || l.postIts===undefined))) {
    const p=clone(input);p.cardDraws ??=[];for(const l of p.levels){l.objectLinks ??=[];l.postIts ??=[];}return p;
  }
  if(input?.version===2) {
    const p=clone(input);p.version=3;
    for(const a of p.assets || []) {a.kind='token';a.variant=defaultVariant(a.icon);}
    return migrateProject(p);
  }
  if (input?.version !== 1) return input;
  const p = clone(input), byName = new Map();
  p.version = 2; p.tags = [];
  for (const a of p.assets || []) a.tags = [...new Set((a.tags || []).filter(name => typeof name !== 'string' || name.trim()).map(name => {
    if (typeof name !== 'string' || !name.trim() || name.length > 60) throw Error('Invalid legacy tag.');
    const key = name.trim().toLowerCase();
    if (!byName.has(key)) {
      const tag = {id:`legacy-tag-${p.tags.length+1}`,name:name.trim(),rule:'',color:'#b8cf96'};
      // Imported IDs may use any string, including the migration prefix.
      while ([...(p.assets || []), ...(p.levels || []), ...(p.levels || []).flatMap(l=>l.instances || [])].some(x=>x.id===tag.id)) tag.id += '-tag';
      byName.set(key,tag.id); p.tags.push(tag);
    }
    return byName.get(key);
  }))];
  for (const l of p.levels || []) l.blockedLinks = [];
  return migrateProject(p);
}
export function descendants(project, id, visited = new Set()) {
  if (visited.has(id)) return [];
  visited.add(id);
  return project.assets.filter(a => a.parentId === id).flatMap(a => [a, ...descendants(project, a.id, visited)]);
}
export const isState = a => a?.kind === 'state';
export function stateEnabled(project,a,instance=null) {
  const override=s=>instance?.stateOverrides&&Object.hasOwn(instance.stateOverrides,s.id)?instance.stateOverrides[s.id]:undefined;
  const enabled=s=>override(s)??s.enabled;
  if(!enabled(a))return false;
  if(!project.assets.find(p=>p.id===a.parentId)?.exclusiveStates)return true;
  const candidates=project.assets.filter(s=>isState(s)&&s.parentId===a.parentId&&enabled(s));
  return (candidates.filter(s=>override(s)===true).at(-1)||candidates.at(-1))?.id===a.id;
}
export function assetIsActive(project,id,instance=null) {
  let a=project.assets.find(a=>a.id===id);const seen=new Set();
  while(a) {
    if(seen.has(a.id) || (isState(a)&&!stateEnabled(project,a,instance)))return false;
    seen.add(a.id);a=project.assets.find(b=>b.id===a.parentId);
  }
  return true;
}
export function activeDescendants(project,id,instance=null) {
  return descendants(project,id).filter(a=>assetIsActive(project,a.id,instance));
}
export function appearance(project,a,instance=null) {
  const states=project.assets.filter(b=>b.parentId===a.id && isState(b) && stateEnabled(project,b,instance));
  return states.length?appearance(project,states.at(-1),instance):a;
}
export function validateProject(p) {
  p = migrateProject(p);
  if (!p || p.version !== 3 || !Array.isArray(p.tags) || p.tags.length > 500 || !Array.isArray(p.assets) || !Array.isArray(p.levels) || !p.levels.length || p.levels.length > 30 || p.assets.length > 500) throw Error('This is not a supported workshop project.');
  if (typeof p.title !== 'string' || p.title.length > 120) throw Error('Invalid project title.');
  const ids = new Set();
  const reserve = id => { if (typeof id !== 'string' || !id || id.length > 100 || ids.has(id)) throw Error('Invalid or duplicate item ID.'); ids.add(id); };
  if(!Array.isArray(p.cardDraws)||p.cardDraws.length>1000)throw Error('Invalid card history.');
  const drawn=new Set();
  for(const draw of p.cardDraws){
    reserve(draw.id);
    const key=`${draw.deckId}:${draw.cardId}`;
    if(!['experiments','challenges'].includes(draw.deckId)||typeof draw.cardId!=='string'||!draw.cardId||draw.cardId.length>80||drawn.has(key)||typeof draw.title!=='string'||!draw.title.trim()||draw.title.length>120||typeof draw.task!=='string'||!draw.task.trim()||draw.task.length>2000||typeof draw.reflection!=='string'||draw.reflection.length>1000)throw Error('Invalid or repeated drawn card.');
    drawn.add(key);
  }
  const tagNames = new Set();
  for (const t of p.tags) {
    reserve(t.id);
    if (typeof t.name !== 'string' || !t.name.trim() || t.name.length > 60 || typeof t.rule !== 'string' || t.rule.length > 4000 || !/^#[0-9a-f]{6}$/i.test(t.color)) throw Error('Invalid tag properties.');
    const key = t.name.trim().toLowerCase();
    if (tagNames.has(key)) throw Error('A tag with this name already exists.');
    tagNames.add(key);
  }
  for (const a of p.assets) {
    reserve(a.id);
    if(a.exclusiveStates!==undefined&&typeof a.exclusiveStates!=='boolean')throw Error('Invalid exclusive states option.');
    for(const key of ['autoFacing','followTokenFacing'])if(a[key]!==undefined && typeof a[key]!=='boolean')throw Error('Invalid facing option.');
    if(a.direction!=null && ![0,90,180,270].includes(a.direction))throw Error('Invalid token direction.');
    if(a.rotation!==undefined && ![0,90,180,270].includes(a.rotation))throw Error('Invalid definition rotation.');
    if(a.occludedByWalls!==undefined && typeof a.occludedByWalls!=='boolean')throw Error('Invalid wall occlusion.');
    if(a.overlapThreshold!==undefined && (!Number.isInteger(a.overlapThreshold)||a.overlapThreshold<0||a.overlapThreshold>1000))throw Error('Invalid overlap threshold.');
    if(a.overlapAssetIds!=null && (!Array.isArray(a.overlapAssetIds)||a.overlapAssetIds.length>500||new Set(a.overlapAssetIds).size!==a.overlapAssetIds.length||a.overlapAssetIds.some(id=>!p.assets.some(b=>b.id===id&&!isState(b)&&!['area','sight','cone','rectangle'].includes(b.icon)))))throw Error('Invalid overlap objects.');
    if(a.overlapColor!==undefined && !/^#[0-9a-f]{6}$/i.test(a.overlapColor))throw Error('Invalid overlap color.');
    if(a.width!==undefined && (!Number.isInteger(a.width)||a.width<1||a.width>12))throw Error('Invalid effect width.');
    if(a.kind!==undefined && !['token','state'].includes(a.kind))throw Error('Invalid token kind.');
    if(a.variant!==undefined && (!Object.hasOwn(iconVariants,a.icon)||!Object.hasOwn(iconVariants[a.icon],a.variant)))throw Error('Invalid icon variant.');
    if(isState(a) && (typeof a.enabled!=='boolean' || !a.parentId))throw Error('A state needs a parent token and an enabled switch.');
    if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 80 || typeof a.rule !== 'string' || a.rule.length > 4000 || !Array.isArray(a.tags) || a.tags.some(t => !p.tags.some(tag=>tag.id===t)) || new Set(a.tags).size !== a.tags.length || a.tags.length > 30 || !/^#[0-9a-f]{6}$/i.test(a.color) || !Object.hasOwn(iconNames,a.icon) || !Number.isInteger(a.range) || a.range < 1 || a.range > 12) throw Error('Invalid token properties.');
  }
  for (const a of p.assets) {
    if (a.parentId && !p.assets.some(b => b.id === a.parentId)) throw Error('Missing parent token.');
    if(isState(a) && ['area','sight','cone','rectangle'].includes(p.assets.find(b=>b.id===a.parentId)?.icon))throw Error('States must belong to a token or another state.');
    const seen = new Set([a.id]); let parent = a.parentId;
    while (parent) { if (seen.has(parent)) throw Error('Tokens cannot contain themselves.'); seen.add(parent); parent = p.assets.find(b => b.id === parent)?.parentId; }
  }
  for (const l of p.levels) {
    reserve(l.id);
    if (typeof l.name !== 'string' || l.name.length > 80 || !Number.isInteger(l.width) || !Number.isInteger(l.height) || l.width < 4 || l.width > 32 || l.height < 4 || l.height > 24 || !l.tiles || !Array.isArray(l.instances) || l.instances.length > 1000) throw Error('Invalid level.');
    if(!Array.isArray(l.postIts)||l.postIts.length>500)throw Error('Too many post-its in this level.');
    for(const note of l.postIts){
      reserve(note.id);
      const floating=note.space==='canvas';
      if(note.space!==undefined&&!floating)throw Error('Invalid annotation space.');
      if(note.kind!==undefined&&!['note','arrow','step','question','deck','card'].includes(note.kind))throw Error('Invalid annotation kind.');
      if(note.hidden!==undefined&&typeof note.hidden!=='boolean')throw Error('Invalid annotation visibility.');
      for(const key of ['dx','dy'])if(note[key]!==undefined&&(!Number.isFinite(note[key])||Math.abs(note[key])>100000))throw Error('Invalid arrow endpoint.');
      if(typeof note.text!=='string'||!note.text.trim()||note.text.length>4000||!/^#[0-9a-f]{6}$/i.test(note.color)||!Number.isFinite(note.x)||!Number.isFinite(note.y)||(floating?(Math.abs(note.x)>100000||Math.abs(note.y)>100000):(!Number.isInteger(note.x)||!Number.isInteger(note.y)||note.x<0||note.y<0||note.x>=l.width||note.y>=l.height)))throw Error('Invalid post-it. Keep notes inside the level.');
    }
    for (const [key, value] of Object.entries(l.tiles)) {
      const [x, y] = key.split(',').map(Number);
      if (!/^\d+,\d+$/.test(key) || x >= l.width || y >= l.height || !['floor', 'wall', 'node'].includes(value)) throw Error('Invalid level tile.');
    }
    if (!Array.isArray(l.blockedLinks) || new Set(l.blockedLinks).size !== l.blockedLinks.length || l.blockedLinks.length > 1500) throw Error('Invalid node connections.');
    for (const key of l.blockedLinks) {
      if (typeof key !== 'string') throw Error('Invalid node connection.');
      const [a,b,...extra] = key.split('|');
      if (extra.length || key !== linkKey(a,b) || !adjacentNodes(l,a,b)) throw Error('Invalid node connection.');
    }
    for (const i of l.instances) {
      reserve(i.id);
      if(i.locked!==undefined&&typeof i.locked!=='boolean')throw Error('Invalid scenery lock.');
      if(i.stateOverrides!==undefined){
        const allowed=new Set(descendants(p,i.assetId).filter(isState).map(s=>s.id));
        if(!i.stateOverrides||typeof i.stateOverrides!=='object'||Array.isArray(i.stateOverrides)||Object.entries(i.stateOverrides).some(([id,v])=>!allowed.has(id)||typeof v!=='boolean'))throw Error('Invalid placement state overrides.');
      }
      if(i.direction!=null && ![0,90,180,270].includes(i.direction))throw Error('Invalid placed direction.');
      if(isState(p.assets.find(a=>a.id===i.assetId)))throw Error('States belong inside tokens and cannot be placed separately.');
      if (!p.assets.some(a => a.id === i.assetId) || !Number.isInteger(i.x) || !Number.isInteger(i.y) || i.x < 0 || i.y < 0 || i.x >= l.width || i.y >= l.height || ![0,90,180,270].includes(i.rotation) || (i.note !== undefined && (typeof i.note !== 'string' || i.note.length > 4000))) throw Error('Invalid placed token.');
    }
    if(!Array.isArray(l.objectLinks)||l.objectLinks.length>1000)throw Error('Invalid object links.');
    for(const link of l.objectLinks) {
      reserve(link.id);
      if(typeof link.name!=='string'||!link.name.trim()||link.name.length>80||typeof link.rule!=='string'||link.rule.length>4000||!/^#[0-9a-f]{6}$/i.test(link.color)||!Array.isArray(link.instanceIds)||link.instanceIds.length<2||link.instanceIds.length>1000||new Set(link.instanceIds).size!==link.instanceIds.length||link.instanceIds.some(id=>!l.instances.some(i=>i.id===id)))throw Error('Invalid object link. Choose at least two different objects in this level.');
    }
  }
  return p;
}
export function applyAction(input, action) {
  const p = clone(validateProject(input)), d = action.data;
  const level = () => { const l = p.levels.find(l => l.id === d.levelId); if (!l) throw Error('Level no longer exists.'); return l; };
  const pruneLinks=l=>{l.objectLinks=l.objectLinks.map(link=>({...link,instanceIds:link.instanceIds.filter(id=>l.instances.some(i=>i.id===id))})).filter(link=>link.instanceIds.length>=2);};
  switch (action.type) {
    case 'instance.batch': {
      let next=p;
      for(const update of d.updates||[])next=applyAction(next,{type:'instance.update',data:{levelId:d.levelId,...update}});
      for(const id of d.removeIds||[])next=applyAction(next,{type:'instance.delete',data:{levelId:d.levelId,id}});
      for(const instance of d.additions||[])next=applyAction(next,{type:'instance.add',data:{levelId:d.levelId,instance}});
      for(const link of d.links||[])next=applyAction(next,{type:'objectLink.add',data:{levelId:d.levelId,link}});
      return next;
    }
    case 'asset.addMany': p.assets.push(...d.assets);break;
    case 'instance.state': {
      const i=level().instances.find(i=>i.id===d.id),s=p.assets.find(a=>a.id===d.stateId);
      if(!i||!s||!isState(s)||!descendants(p,i.assetId).some(a=>a.id===s.id)||typeof d.enabled!=='boolean')throw Error('Invalid placed state.');
      i.stateOverrides??={};
      if(d.enabled&&p.assets.find(a=>a.id===s.parentId)?.exclusiveStates)for(const sibling of p.assets.filter(a=>isState(a)&&a.parentId===s.parentId))i.stateOverrides={...i.stateOverrides,[sibling.id]:false};
      i.stateOverrides={...i.stateOverrides,[s.id]:d.enabled};break;
    }
    case 'instance.resetStates': {
      const i=level().instances.find(i=>i.id===d.id);if(!i)throw Error('Placed token no longer exists.');delete i.stateOverrides;break;
    }
    case 'postIt.add': level().postIts.push(d.note);break;
    case 'postIt.update': {
      const note=level().postIts.find(n=>n.id===d.id);if(!note)throw Error('Post-it no longer exists.');
      for(const key of ['text','color','x','y','space','kind','hidden','dx','dy'])if(key in d)note[key]=d[key];break;
    }
    case 'postIt.delete': level().postIts=level().postIts.filter(n=>n.id!==d.id);break;
    case 'card.record': p.cardDraws.push(d.draw);break;
    case 'card.claim': p.cardDraws.push(d.draw);level().postIts.push(d.note);break;
    case 'card.reset': {
      if(!['experiments','challenges'].includes(d.deckId))throw Error('Unknown card deck.');
      p.cardDraws=p.cardDraws.filter(draw=>draw.deckId!==d.deckId);break;
    }
    case 'tag.add': p.tags.push(d); break;
    case 'tag.update': {
      const t = p.tags.find(t=>t.id===d.id); if (!t) throw Error('Tag no longer exists.');
      for (const key of ['name','rule','color']) if (key in d) t[key] = d[key];
      break;
    }
    case 'tag.delete': p.tags = p.tags.filter(t=>t.id!==d.id); p.assets.forEach(a=>a.tags=a.tags.filter(id=>id!==d.id)); break;
    case 'asset.add': p.assets.push(d); break;
    case 'asset.update': {
      const a = p.assets.find(a => a.id === d.id); if (!a) throw Error('Token no longer exists.');
      for (const key of ['name','icon','variant','kind','enabled','rule','tags','color','range','width','rotation','direction','autoFacing','followTokenFacing','occludedByWalls','overlapThreshold','overlapColor','overlapAssetIds','parentId','exclusiveStates']) if (key in d) a[key] = d[key];
      if(d.exclusiveStates===true){const enabled=p.assets.filter(b=>isState(b)&&b.parentId===a.id&&b.enabled);for(const sibling of enabled.slice(0,-1))sibling.enabled=false;}
      if(d.enabled&&isState(a)&&p.assets.find(b=>b.id===a.parentId)?.exclusiveStates)for(const sibling of p.assets.filter(b=>isState(b)&&b.parentId===a.parentId&&b.id!==a.id))sibling.enabled=false;
      if('parentId' in d||'kind' in d)for(const l of p.levels)for(const i of l.instances)if(i.stateOverrides){const allowed=new Set(descendants(p,i.assetId).filter(isState).map(s=>s.id));i.stateOverrides=Object.fromEntries(Object.entries(i.stateOverrides).filter(([id])=>allowed.has(id)));}
      if('icon' in d && !('variant' in d))a.variant=defaultVariant(a.icon);
      if(('icon' in d || 'kind' in d) && (isState(a)||['area','sight','cone','rectangle'].includes(a.icon)))for(const b of p.assets)if(b.overlapAssetIds)b.overlapAssetIds=b.overlapAssetIds.filter(id=>id!==a.id);
      break;
    }
    case 'asset.delete': {
      const remove = new Set([d.id, ...descendants(p, d.id).map(a => a.id)]);
      if(p.levels.some(l=>l.instances.some(i=>i.locked&&remove.has(i.assetId))))throw Error('Unlock the scenery placements before deleting this definition.');
      p.assets = p.assets.filter(a => !remove.has(a.id));
      for(const a of p.assets)if(a.overlapAssetIds)a.overlapAssetIds=a.overlapAssetIds.filter(id=>!remove.has(id));
      p.levels.forEach(l => {l.instances = l.instances.filter(i => !remove.has(i.assetId));for(const i of l.instances)if(i.stateOverrides)i.stateOverrides=Object.fromEntries(Object.entries(i.stateOverrides).filter(([id])=>!remove.has(id)));pruneLinks(l);}); break;
    }
    case 'tile.paint': {
      const l = level(); for (const key of d.cells) { if (d.tile === 'empty') delete l.tiles[key]; else l.tiles[key] = d.tile; }
      l.blockedLinks = l.blockedLinks.filter(key=>adjacentNodes(l,...key.split('|'))); break;
    }
    case 'link.update': {
      const l = level();
      if (!adjacentNodes(l,d.from,d.to) || typeof d.connected !== 'boolean') throw Error('Choose two adjacent path nodes.');
      const key = linkKey(d.from,d.to);
      l.blockedLinks = l.blockedLinks.filter(k=>k!==key);
      if (!d.connected) l.blockedLinks.push(key);
      l.blockedLinks.sort(); break;
    }
    case 'instance.add': level().instances.push(d.instance); break;
    case 'instance.update': {
      const i = level().instances.find(i => i.id === d.id); if (!i) throw Error('Placed token no longer exists.');
      if(i.locked&&['x','y','rotation','direction'].some(key=>key in d))throw Error('Unlock this scenery piece before moving or rotating it.');
      if(p.assets.find(a=>a.id===i.assetId)?.autoFacing && !('direction' in d)){
        const dx=(d.x??i.x)-i.x, dy=(d.y??i.y)-i.y;
        if(dx || dy)i.direction=Math.abs(dx)>=Math.abs(dy)?(dx>0?90:270):(dy>0?180:0);
      }
      for (const key of ['x','y','rotation','direction','note','locked']) if (key in d) i[key] = d[key]; break;
    }
    case 'instance.delete': { const l = level();if(l.instances.find(i=>i.id===d.id)?.locked)throw Error('Unlock this scenery piece before removing it.');l.instances = l.instances.filter(i => i.id !== d.id); pruneLinks(l); break; }
    case 'objectLink.add': level().objectLinks.push(d.link); break;
    case 'objectLink.update': {
      const link=level().objectLinks.find(link=>link.id===d.id);if(!link)throw Error('Link no longer exists.');
      for(const key of ['name','rule','color','instanceIds'])if(key in d)link[key]=d[key];break;
    }
    case 'objectLink.delete': {const l=level();l.objectLinks=l.objectLinks.filter(link=>link.id!==d.id);break;}
    case 'level.add': p.levels.push(d); break;
    case 'level.update': { const l = level(); for (const key of ['name','width','height']) if (key in d) l[key] = d[key]; break; }
    case 'level.delete': if (p.levels.length > 1) p.levels = p.levels.filter(l => l.id !== d.levelId); break;
    case 'project.replace': return validateProject(clone(d));
    default: throw Error('Unknown editor action.');
  }
  return validateProject(p);
}

// Definition directions are relative to parents, independently of placement facing.
export function effectContains(effect, dx, dy, rotation=0) {
  const angle=(rotation+360)%360;
  const forward=angle===0?-dy:angle===90?dx:angle===180?dy:-dx;
  const side=angle===0?dx:angle===90?dy:angle===180?-dx:-dy;
  if(effect.icon==='area')return Math.abs(dx)+Math.abs(dy)<=effect.range;
  if(forward<1||forward>effect.range)return false;
  if(effect.icon==='sight')return side===0;
  const width=effect.width??3;
  // Whole cells centered on a cell axis must widen in pairs.
  if(effect.icon==='cone')return Math.abs(side)<=Math.floor(Math.floor((width-1)/2)*forward/effect.range);
  const rowWidth=width;
  return side>=-Math.floor((rowWidth-1)/2)&&side<=Math.ceil((rowWidth-1)/2);
}
export function effectRotation(project, root, effect, placementRotation=0) {
  let rotation=placementRotation, a=effect;
  while(a){rotation+=a.rotation??0;if(a.id===root.id)break;a=project.assets.find(b=>b.id===a.parentId);}
  return rotation%360;
}

// Trace cell centers with a supercover: touching a wall corner also blocks the ray.
export function wallBlocks(tiles, x0, y0, x1, y1) {
  const dx=x1-x0,dy=y1-y0,nx=Math.abs(dx),ny=Math.abs(dy),sx=Math.sign(dx),sy=Math.sign(dy);
  let x=x0,y=y0,ix=0,iy=0;
  const wall=(x,y)=>tiles[`${x},${y}`]==='wall';
  while(ix<nx||iy<ny){
    const decision=(1+2*ix)*ny-(1+2*iy)*nx;
    if(decision===0){if(wall(x+sx,y)||wall(x,y+sy))return true;x+=sx;y+=sy;ix++;iy++;}
    else if(decision<0){x+=sx;ix++;}else{y+=sy;iy++;}
    if(wall(x,y))return true;
  }
  return false;
}
export const facingDirection = (asset,instance) => instance.direction === undefined ? (asset.direction ?? null) : instance.direction;
export function parameterOverlay(project,root,effect,instance,level) {
  const rotation=effectRotation(project,root,effect,instance.rotation+(effect.followTokenFacing?(facingDirection(root,instance)??0):0)), cells=[];
  for(let y=0;y<level.height;y++)for(let x=0;x<level.width;x++){
    if(effectContains(effect,x-instance.x,y-instance.y,rotation) && (!effect.occludedByWalls || (level.tiles[`${x},${y}`]!=='wall' && !wallBlocks(level.tiles,instance.x,instance.y,x,y))))cells.push([x,y]);
  }
  const covered=new Set(cells.map(([x,y])=>`${x},${y}`));
  const count=level.instances.filter(i=>{
    const a=project.assets.find(a=>a.id===i.assetId);
    return i.id!==instance.id && a && (effect.overlapAssetIds==null || effect.overlapAssetIds.includes(a.id)) && !isState(a) && !['area','sight','cone','rectangle'].includes(a.icon) && assetIsActive(project,a.id,i) && covered.has(`${i.x},${i.y}`);
  }).length;
  return {cells,count,color:effect.overlapThreshold>0 && count>=effect.overlapThreshold ? (effect.overlapColor??'#edc47c') : effect.color};
}
