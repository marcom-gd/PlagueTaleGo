import { iconNames, iconVariants, defaultVariant } from './icons.js';
import { validateBehaviours, validateMoveTarget, validateReferenceOverrides } from './behaviour-schema.js';
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
// Keep the original tile value for Ground so existing maps retain their floors.
export const floorVariants = [
  { tile: 'floor-elevated', label: 'Elevated' },
  { tile: 'floor', label: 'Ground' },
  { tile: 'floor-underground', label: 'Underground' }
];
export const isFloor = tile => floorVariants.some(variant => variant.tile === tile);
// Legacy maps store standalone nodes in tiles; new nodes use a separate layer.
export const hasNode = (level, key) => level.tiles[key] === 'node' || (level.nodes || []).includes(key);
export const nodeCells = level => [...new Set([...Object.keys(level.tiles).filter(key => level.tiles[key] === 'node'), ...(level.nodes || [])])];
export function paintLevelTiles(level, cells, tile) {
  for (const key of cells) {
    const node = hasNode(level, key);
    if (tile === 'node' || (isFloor(tile) && node)) {
      if (!level.nodes) level.nodes = [];
      if (!level.nodes.includes(key)) level.nodes.push(key);
    }
    if (tile === 'node') {
      if (!isFloor(level.tiles[key])) delete level.tiles[key];
    } else {
      if (!isFloor(tile) && level.nodes) level.nodes = level.nodes.filter(cell => cell !== key);
      if (tile === 'empty') delete level.tiles[key]; else level.tiles[key] = tile;
    }
  }
  for(const patrol of level.patrols || [])patrol.nodes=patrol.nodes.filter(key=>hasNode(level,key));
  level.blockedLinks = level.blockedLinks.filter(key => adjacentNodes(level, ...key.split('|')));
}
export function blankLevel(id = uid(), name = 'The quiet courtyard') {
  const tiles = {};
  for (let y = 1; y < 8; y++) for (let x = 1; x < 9; x++) tiles[`${x},${y}`] = 'floor';
  return { id, name, width: 10, height: 9, tiles, blockedLinks: [], objectLinks: [], patrols: [], instances: [], postIts: [] };
}
export const newProject = () => ({ version: 3, title: 'Plague Tale GO', tags: [], assets: [], levels: [blankLevel()], cardDraws: [] });
// A canonical key makes a connection identical from either endpoint.
export const linkKey = (a, b) => [a, b].sort().join('|');
export function adjacentNodes(l, a, b) {
  if (!hasNode(l,a) || !hasNode(l,b)) return false;
  const [ax, ay] = a.split(',').map(Number), [bx, by] = b.split(',').map(Number);
  return Math.abs(ax-bx) + Math.abs(ay-by) === 1;
}
export const nodesConnected = (l, a, b) => adjacentNodes(l,a,b) && !(l.blockedLinks || []).includes(linkKey(a,b));
function migrateProject(input) {
  if(input?.version===3 && (input.cardDraws===undefined || input.levels?.some(l=>l.objectLinks===undefined || l.postIts===undefined || l.patrols===undefined))) {
    const p=clone(input);p.cardDraws ??=[];for(const l of p.levels){l.objectLinks ??=[];l.postIts ??=[];l.patrols ??=[];}return p;
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
export const parameterIcons = ['area','self','sight','cone','rectangle','cross'];
export const isParameter = a => !isState(a) && parameterIcons.includes(a?.icon);
// Uses keep their own hierarchy identity, while these properties belong to the definition.
const parameterKeys=['name','icon','variant','rule','tags','color','range','width','rotation','direction','followTokenFacing','occludedByWalls','overlapThreshold','overlapColor','overlapAssetIds','behaviours'];
export const parameterDefinition = (project,a) => a?.parameterId ? project.assets.find(b=>b.id===a.parameterId) : a;
function syncParameters(p) {
  for(const use of p.assets.filter(a=>a.parameterId)) {
    const definition=parameterDefinition(p,use);
    if(!definition || definition.parameterId || !isParameter(definition))throw Error('Missing reusable parameter definition.');
    for(const key of parameterKeys) {
      if(key in definition)use[key]=clone(definition[key]);else delete use[key];
    }
  }
}
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
  if(p.behaviourOrder!==undefined&&(!Array.isArray(p.behaviourOrder)||p.behaviourOrder.length>15000||new Set(p.behaviourOrder).size!==p.behaviourOrder.length||p.behaviourOrder.some(id=>typeof id!=='string'||!id||id.length>100)))throw Error('Invalid behaviour resolution order.');
  const behaviourIds=new Set();
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
    validateBehaviours(a,isParameter(a));
    if(!a.parameterId)for(const b of a.behaviours||[]){if(behaviourIds.has(b.id))throw Error('Duplicate behaviour ID.');behaviourIds.add(b.id);}
    if(a.exclusiveStates!==undefined&&typeof a.exclusiveStates!=='boolean')throw Error('Invalid exclusive states option.');
    for(const key of ['autoFacing','followTokenFacing'])if(a[key]!==undefined && typeof a[key]!=='boolean')throw Error('Invalid facing option.');
    if(a.direction!=null && ![0,90,180,270].includes(a.direction))throw Error('Invalid token direction.');
    if(a.rotation!==undefined && ![0,90,180,270].includes(a.rotation))throw Error('Invalid definition rotation.');
    if(a.occludedByWalls!==undefined && typeof a.occludedByWalls!=='boolean')throw Error('Invalid wall occlusion.');
    if(a.overlapThreshold!==undefined && (!Number.isInteger(a.overlapThreshold)||a.overlapThreshold<0||a.overlapThreshold>1000))throw Error('Invalid overlap threshold.');
    if(a.overlapAssetIds!=null && (!Array.isArray(a.overlapAssetIds)||a.overlapAssetIds.length>500||new Set(a.overlapAssetIds).size!==a.overlapAssetIds.length||a.overlapAssetIds.some(id=>!p.assets.some(b=>b.id===id&&!isState(b)&&!parameterIcons.includes(b.icon)))))throw Error('Invalid overlap objects.');
    if(a.overlapColor!==undefined && !/^#[0-9a-f]{6}$/i.test(a.overlapColor))throw Error('Invalid overlap color.');
    if(a.width!==undefined && (!Number.isInteger(a.width)||a.width<1||a.width>12))throw Error('Invalid effect width.');
    if(a.kind!==undefined && !['token','state'].includes(a.kind))throw Error('Invalid token kind.');
    if(a.variant!==undefined && (!Object.hasOwn(iconVariants,a.icon)||!Object.hasOwn(iconVariants[a.icon],a.variant)))throw Error('Invalid icon variant.');
    if(isState(a) && (typeof a.enabled!=='boolean' || !a.parentId))throw Error('A state needs a parent token and an enabled switch.');
    if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 80 || typeof a.rule !== 'string' || a.rule.length > 4000 || !Array.isArray(a.tags) || a.tags.some(t => !p.tags.some(tag=>tag.id===t)) || new Set(a.tags).size !== a.tags.length || a.tags.length > 30 || !/^#[0-9a-f]{6}$/i.test(a.color) || !Object.hasOwn(iconNames,a.icon) || !Number.isInteger(a.range) || a.range < 1 || a.range > 12) throw Error('Invalid token properties.');
  }
  for (const a of p.assets) {
    if (a.parentId && !p.assets.some(b => b.id === a.parentId)) throw Error('Missing parent token.');
    if(a.parameterId!==undefined) {
      const definition=parameterDefinition(p,a);
      if(!a.parentId || !isParameter(a) || !definition || definition===a || definition.parameterId || !isParameter(definition) || definition.parentId || parameterKeys.some(key=>JSON.stringify(a[key])!==JSON.stringify(definition[key])))throw Error('Invalid reusable parameter reference.');
    }
    if(isState(a) && parameterIcons.includes(p.assets.find(b=>b.id===a.parentId)?.icon))throw Error('States must belong to a token or another state.');
    const seen = new Set([a.id]); let parent = a.parentId;
    while (parent) { if (seen.has(parent)) throw Error('Tokens cannot contain themselves.'); seen.add(parent); parent = p.assets.find(b => b.id === parent)?.parentId; }
  }
  for (const l of p.levels) {
    reserve(l.id);
    validateReferenceOverrides(l.referenceOverrides);
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
      if (!/^\d+,\d+$/.test(key) || x >= l.width || y >= l.height || !(isFloor(value) || ['wall', 'node'].includes(value))) throw Error('Invalid level tile.');
    }
    if(l.nodes!==undefined && (!Array.isArray(l.nodes) || l.nodes.length>l.width*l.height || new Set(l.nodes).size!==l.nodes.length || l.nodes.some(key=>{
      if(typeof key!=='string'||!/^\d+,\d+$/.test(key))return true;
      const [x,y]=key.split(',').map(Number);
      return x>=l.width||y>=l.height||l.tiles[key]==='wall'||l.tiles[key]==='node';
    })))throw Error('Invalid level nodes.');
    if (!Array.isArray(l.blockedLinks) || new Set(l.blockedLinks).size !== l.blockedLinks.length || l.blockedLinks.length > 1500) throw Error('Invalid node connections.');
    for (const key of l.blockedLinks) {
      if (typeof key !== 'string') throw Error('Invalid node connection.');
      const [a,b,...extra] = key.split('|');
      if (extra.length || key !== linkKey(a,b) || !adjacentNodes(l,a,b)) throw Error('Invalid node connection.');
    }
    if(!Array.isArray(l.patrols)||l.patrols.length>1000)throw Error('Invalid patrol paths.');
    for(const patrol of l.patrols){
      reserve(patrol.id);
      if(typeof patrol.name!=='string'||!patrol.name.trim()||patrol.name.length>80||!/^#[0-9a-f]{6}$/i.test(patrol.color)||typeof patrol.hidden!=='boolean'||!Array.isArray(patrol.nodes)||patrol.nodes.length>l.width*l.height||new Set(patrol.nodes).size!==patrol.nodes.length||patrol.nodes.some(key=>typeof key!=='string'||!hasNode(l,key)))throw Error('Invalid patrol path. Choose existing nodes.');
    }
    for (const i of l.instances) {
      reserve(i.id);
      if(i.moveTarget!==undefined&&i.moveTarget!==null)validateMoveTarget(i.moveTarget);
      validateReferenceOverrides(i.referenceOverrides);
      if(i.patrolProgress!==undefined&&(!i.patrolProgress||typeof i.patrolProgress!=='object'||Array.isArray(i.patrolProgress)||Object.entries(i.patrolProgress).some(([id,v])=>!id||!['start','end'].includes(v))))throw Error('Invalid patrol progress.');
      if(i.patrolColor!=null&&!/^#[0-9a-f]{6}$/i.test(i.patrolColor))throw Error('Invalid placement color dot.');
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
    case 'behaviour.configure': {
      const next=applyAction(p,{type:'asset.update',data:{id:d.id,behaviours:d.behaviours}});
      return applyAction(next,{type:'behaviour.order',data:{ids:d.ids}});
    }
    case 'behaviour.order': p.behaviourOrder=d.ids;break;
    case 'asset.compose': {
      const existing=p.assets.find(a=>a.id===d.asset.id);
      const savedAsset=isParameter(d.asset)&&!d.asset.parameterId&&d.asset.parentId?{...d.asset,parentId:existing?.parentId||null}:d.asset;
      let next=applyAction(p,{type:existing?'asset.update':'asset.add',data:savedAsset});
      if(isParameter(d.asset)&&!d.asset.parameterId&&d.asset.parentId)next=applyAction(next,{type:'parameter.attach',data:{id:d.asset.id,parentId:d.asset.parentId,usageId:d.usageId,originalUsageId:d.originalUsageId}});
      for(const id of d.removals||[]) {
        if(!next.assets.some(a=>a.id===id&&a.parentId===d.asset.id&&isParameter(a)))throw Error('This parameter does not belong to the edited token.');
        next=applyAction(next,{type:'asset.delete',data:{id}});
      }
      for(const attachment of d.attachments||[])next=applyAction(next,{type:'parameter.attach',data:{...attachment,parentId:d.asset.id}});
      return next;
    }
    case 'parameter.attach': {
      const definition=parameterDefinition(p,p.assets.find(a=>a.id===d.id));
      const parent=p.assets.find(a=>a.id===d.parentId);
      if(!definition || !isParameter(definition) || !parent || definition.id===parent.id || descendants(p,definition.id).some(a=>a.id===parent.id))throw Error('Choose a parameter and a different parent token.');
      // Preserve old hierarchies when a formerly nested parameter is first reused.
      if(definition.parentId) {
        const original={...clone(definition),id:d.originalUsageId,parameterId:definition.id};
        definition.parentId=null;
        for(const child of p.assets.filter(a=>a.parentId===definition.id))child.parentId=original.id;
        p.assets.push(original);
      }
      if(p.assets.some(a=>a.parentId===parent.id&&a.parameterId===definition.id))break;
      p.assets.push({...clone(definition),id:d.usageId,parentId:parent.id,parameterId:definition.id});
      break;
    }
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
      const target = p.assets.find(a => a.id === d.id); if (!target) throw Error('Token no longer exists.');
      const a=parameterDefinition(p,target);
      if(target.parameterId && 'icon' in d && !parameterIcons.includes(d.icon))throw Error('A reusable parameter needs a parameter shape.');
      if(!target.parameterId && isParameter(a) && 'icon' in d && !parameterIcons.includes(d.icon) && p.assets.some(b=>b.parameterId===a.id))throw Error('Detach all uses before changing this parameter into a token.');
      for (const key of ['name','icon','variant','kind','enabled','rule','tags','color','range','width','rotation','direction','autoFacing','followTokenFacing','occludedByWalls','overlapThreshold','overlapColor','overlapAssetIds','parentId','exclusiveStates','behaviours']) if (key in d) a[key] = d[key];
      if(target.parameterId && 'parentId' in d){target.parentId=d.parentId;a.parentId=null;}
      if(d.exclusiveStates===true){const enabled=p.assets.filter(b=>isState(b)&&b.parentId===a.id&&b.enabled);for(const sibling of enabled.slice(0,-1))sibling.enabled=false;}
      if(d.enabled&&isState(a)&&p.assets.find(b=>b.id===a.parentId)?.exclusiveStates)for(const sibling of p.assets.filter(b=>isState(b)&&b.parentId===a.parentId&&b.id!==a.id))sibling.enabled=false;
      if('parentId' in d||'kind' in d)for(const l of p.levels)for(const i of l.instances)if(i.stateOverrides){const allowed=new Set(descendants(p,i.assetId).filter(isState).map(s=>s.id));i.stateOverrides=Object.fromEntries(Object.entries(i.stateOverrides).filter(([id])=>allowed.has(id)));}
      if('icon' in d && !('variant' in d))a.variant=defaultVariant(a.icon);
      if(('icon' in d || 'kind' in d) && (isState(a)||parameterIcons.includes(a.icon)))for(const b of p.assets)if(b.overlapAssetIds)b.overlapAssetIds=b.overlapAssetIds.filter(id=>id!==a.id);
      break;
    }
    case 'asset.delete': {
      const remove = new Set([d.id, ...descendants(p, d.id).map(a => a.id)]);
      let previousSize;
      do {previousSize=remove.size;for(const a of p.assets)if(a.parameterId&&remove.has(a.parameterId))for(const child of [a,...descendants(p,a.id)])remove.add(child.id);} while(remove.size!==previousSize);
      if(p.levels.some(l=>l.instances.some(i=>i.locked&&remove.has(i.assetId))))throw Error('Unlock the scenery placements before deleting this definition.');
      p.assets = p.assets.filter(a => !remove.has(a.id));
      for(const a of p.assets)if(a.overlapAssetIds)a.overlapAssetIds=a.overlapAssetIds.filter(id=>!remove.has(id));
      p.levels.forEach(l => {l.instances = l.instances.filter(i => !remove.has(i.assetId));for(const i of l.instances)if(i.stateOverrides)i.stateOverrides=Object.fromEntries(Object.entries(i.stateOverrides).filter(([id])=>!remove.has(id)));pruneLinks(l);}); break;
    }
    case 'tile.paint': {
      if(!['node','wall','empty'].includes(d.tile)&&!isFloor(d.tile))throw Error('Invalid level tile.');
      paintLevelTiles(level(),d.cells,d.tile);break;
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
      for (const key of ['x','y','rotation','direction','note','locked','patrolColor','moveTarget']) if (key in d) i[key] = d[key]; break;
    }
    case 'instance.delete': { const l = level();if(l.instances.find(i=>i.id===d.id)?.locked)throw Error('Unlock this scenery piece before removing it.');l.instances = l.instances.filter(i => i.id !== d.id); pruneLinks(l); break; }
    case 'patrol.add': level().patrols.push(d.patrol);break;
    case 'patrol.update': {
      const patrol=level().patrols.find(p=>p.id===d.id);if(!patrol)throw Error('Patrol no longer exists.');
      for(const key of ['name','color','nodes','hidden'])if(key in d)patrol[key]=d[key];break;
    }
    case 'patrol.delete': level().patrols=level().patrols.filter(p=>p.id!==d.id);break;
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
  syncParameters(p);
  return validateProject(p);
}

// Definition directions are relative to parents, independently of placement facing.
export function effectContains(effect, dx, dy, rotation=0) {
  const angle=(rotation+360)%360;
  const forward=angle===0?-dy:angle===90?dx:angle===180?dy:-dx;
  const side=angle===0?dx:angle===90?dy:angle===180?-dx:-dy;
  if(effect.icon==='self')return dx===0 && dy===0;
  if(effect.icon==='area')return Math.abs(dx)+Math.abs(dy)<=effect.range;
  if(effect.icon==='cross')return (dx===0 || dy===0) && Math.abs(dx)+Math.abs(dy)<=effect.range;
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
    if(effectContains(effect,x-instance.x,y-instance.y,rotation) && (effect.icon==='self' || !effect.occludedByWalls || (level.tiles[`${x},${y}`]!=='wall' && !wallBlocks(level.tiles,instance.x,instance.y,x,y))))cells.push([x,y]);
  }
  const covered=new Set(cells.map(([x,y])=>`${x},${y}`));
  const count=level.instances.filter(i=>{
    const a=project.assets.find(a=>a.id===i.assetId);
    return i.id!==instance.id && a && (effect.overlapAssetIds==null || effect.overlapAssetIds.includes(a.id)) && !isState(a) && !parameterIcons.includes(a.icon) && assetIsActive(project,a.id,i) && covered.has(`${i.x},${i.y}`);
  }).length;
  return {cells,count,color:effect.overlapThreshold>0 && count>=effect.overlapThreshold ? (effect.overlapColor??'#edc47c') : effect.color};
}
