import { iconNames } from './icons.js';
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
  return { id, name, width: 14, height: 11, tiles, instances: [] };
}
export const newProject = () => ({ version: 1, title: 'Plague Tale GO', assets: [], levels: [blankLevel()] });
export function descendants(project, id, visited = new Set()) {
  if (visited.has(id)) return [];
  visited.add(id);
  return project.assets.filter(a => a.parentId === id).flatMap(a => [a, ...descendants(project, a.id, visited)]);
}
export function validateProject(p) {
  if (!p || p.version !== 1 || !Array.isArray(p.assets) || !Array.isArray(p.levels) || !p.levels.length || p.levels.length > 30 || p.assets.length > 500) throw Error('This is not a supported workshop project.');
  if (typeof p.title !== 'string' || p.title.length > 120) throw Error('Invalid project title.');
  const ids = new Set();
  const reserve = id => { if (typeof id !== 'string' || !id || id.length > 100 || ids.has(id)) throw Error('Invalid or duplicate item ID.'); ids.add(id); };
  for (const a of p.assets) {
    reserve(a.id);
    if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 80 || typeof a.rule !== 'string' || a.rule.length > 4000 || !Array.isArray(a.tags) || a.tags.some(t => typeof t !== 'string' || t.length > 60) || a.tags.length > 30 || !/^#[0-9a-f]{6}$/i.test(a.color) || !Object.hasOwn(iconNames,a.icon) || !Number.isInteger(a.range) || a.range < 1 || a.range > 12) throw Error('Invalid token properties.');
  }
  for (const a of p.assets) {
    if (a.parentId && !p.assets.some(b => b.id === a.parentId)) throw Error('Missing parent token.');
    const seen = new Set([a.id]); let parent = a.parentId;
    while (parent) { if (seen.has(parent)) throw Error('Tokens cannot contain themselves.'); seen.add(parent); parent = p.assets.find(b => b.id === parent)?.parentId; }
  }
  for (const l of p.levels) {
    reserve(l.id);
    if (typeof l.name !== 'string' || l.name.length > 80 || !Number.isInteger(l.width) || !Number.isInteger(l.height) || l.width < 4 || l.width > 32 || l.height < 4 || l.height > 24 || !l.tiles || !Array.isArray(l.instances) || l.instances.length > 1000) throw Error('Invalid level.');
    for (const [key, value] of Object.entries(l.tiles)) {
      const [x, y] = key.split(',').map(Number);
      if (!/^\d+,\d+$/.test(key) || x >= l.width || y >= l.height || !['floor', 'wall', 'node'].includes(value)) throw Error('Invalid level tile.');
    }
    for (const i of l.instances) {
      reserve(i.id);
      if (!p.assets.some(a => a.id === i.assetId) || !Number.isInteger(i.x) || !Number.isInteger(i.y) || i.x < 0 || i.y < 0 || i.x >= l.width || i.y >= l.height || ![0,90,180,270].includes(i.rotation) || (i.note !== undefined && (typeof i.note !== 'string' || i.note.length > 4000))) throw Error('Invalid placed token.');
    }
  }
  return p;
}
export function applyAction(input, action) {
  const p = clone(input), d = action.data;
  const level = () => { const l = p.levels.find(l => l.id === d.levelId); if (!l) throw Error('Level no longer exists.'); return l; };
  switch (action.type) {
    case 'asset.add': p.assets.push(d); break;
    case 'asset.update': {
      const a = p.assets.find(a => a.id === d.id); if (!a) throw Error('Token no longer exists.');
      for (const key of ['name','icon','rule','tags','color','range','parentId']) if (key in d) a[key] = d[key];
      break;
    }
    case 'asset.delete': {
      const remove = new Set([d.id, ...descendants(p, d.id).map(a => a.id)]);
      p.assets = p.assets.filter(a => !remove.has(a.id));
      p.levels.forEach(l => l.instances = l.instances.filter(i => !remove.has(i.assetId))); break;
    }
    case 'tile.paint': {
      const l = level(); for (const key of d.cells) { if (d.tile === 'empty') delete l.tiles[key]; else l.tiles[key] = d.tile; } break;
    }
    case 'instance.add': level().instances.push(d.instance); break;
    case 'instance.update': {
      const i = level().instances.find(i => i.id === d.id); if (!i) throw Error('Placed token no longer exists.');
      for (const key of ['x','y','rotation','note']) if (key in d) i[key] = d[key]; break;
    }
    case 'instance.delete': { const l = level(); l.instances = l.instances.filter(i => i.id !== d.id); break; }
    case 'level.add': p.levels.push(d); break;
    case 'level.update': { const l = level(); for (const key of ['name','width','height']) if (key in d) l[key] = d[key]; break; }
    case 'level.delete': if (p.levels.length > 1) p.levels = p.levels.filter(l => l.id !== d.levelId); break;
    case 'project.replace': return validateProject(clone(d));
    default: throw Error('Unknown editor action.');
  }
  return validateProject(p);
}
