import { createHash } from 'node:crypto';
import { validateProject, clone, descendants, assetIsActive, nodesConnected, isState, isFloor, nodeCells, isParameter } from './public/model.js';
import { column, writeWorkbook } from './xlsx.mjs';

export const snapshotKinds = ['edit-design', 'playtest-start', 'playtest-current'];
const snapshotLabels = { 'edit-design': 'Saved Edit design', 'playtest-start': 'Playtest starting layout', 'playtest-current': 'Current private playtest' };
const parameter = isParameter;
const skills = ['Memory', 'Logic', 'Prediction', 'Tactics', 'Strategy', 'Perception', 'Management', 'Concentration', 'Reflexes', 'Timing', 'Precision', 'Endurance', 'Dexterity', 'Measurement'];
const gameplayTypes = ['Stealth', 'Puzzle', 'Traversal', 'Combat', 'Exploration', 'Survival', 'Social', 'Other'];
const kind = a => isState(a) ? 'State' : parameter(a) ? 'Parameter' : 'Object';
const cell = (formula, value = '', style = 2, array = false) => ({ formula, value, style, array });
const text = value => `"${String(value).replaceAll('"', '""')}"`;
const capacity = rows => Math.max(30, rows.length + 20);

// Build from one captured snapshot, never from the room while it is changing.
// Definitions are atomic. Recipes are flattened configurations, including
// inactive branches, and placement state overrides get separate stable recipes.
export function inventoryData(input, { snapshotKind = 'edit-design', room = '', revision = null, exportedAt = new Date().toISOString() } = {}) {
  if (!snapshotKinds.includes(snapshotKind)) throw Error('Choose a supported inventory snapshot.');
  if (revision !== null && (!Number.isSafeInteger(revision) || revision < 0)) throw Error('Invalid source revision.');
  const project = clone(validateProject(input));
  const atoms = project.assets.map(a => [a.id, kind(a), a.name, a.parentId || '', isState(a) ? a.enabled ? 'On' : 'Off' : '', a.rule, a.icon, a.variant || '', parameter(a) ? a.icon==='self' ? 0 : a.range : '', parameter(a) && a.icon!=='self' ? a.width ?? '' : '', a.rotation ?? 0, a.tags.join(';'), '', 'Workshop']);
  const elements = [], parts = [], placements = [], introductions = [], challenges = [], members = [];
  const roots = new Set(project.assets.filter(a => !a.parentId).map(a => a.id));
  for (const l of project.levels) for (const i of l.instances) roots.add(i.assetId);
  const recipes = new Map(), placementElements = new Map();
  function recipe(rootId, instance = null) {
    const root = project.assets.find(a => a.id === rootId), ingredients = [root, ...descendants(project, rootId)];
    const included = ingredients.map(a => assetIsActive(project, a.id, instance));
    const defaults = ingredients.map(a => assetIsActive(project, a.id));
    const variant = included.some((v, i) => v !== defaults[i]);
    const signature = ingredients.filter((a, i) => included[i]).map(a => a.id).sort();
    const suffix = variant ? `:${createHash('sha256').update(JSON.stringify(signature)).digest('hex').slice(0, 16)}` : '';
    const id = `GE:${rootId}${suffix}`;
    if (recipes.has(id)) return recipes.get(id);
    const active = ingredients.filter((a, i) => included[i]);
    const stateDescription = ingredients.filter(isState).map(a => `${a.name} ${included[ingredients.indexOf(a)] ? 'on' : 'off'}`).join(', ');
    const tagIds = new Set(active.flatMap(a => a.tags));
    const parameters = active.filter(parameter).map(a => a.icon==='self'?`${a.name} · occupied cell`:`${a.name} · ${a.range} cell${a.range === 1 ? '' : 's'}${a.width ? ` × ${a.width} wide` : ''}`).join(', ');
    const record = { id, rootId, name: root.name + (variant ? ` · ${active.filter(isState).map(a => a.name).join(' + ') || 'alternate states'}` : ''), tagIds, tags: project.tags.filter(t => tagIds.has(t.id)).map(t => t.name).join(', '), parameters, states: stateDescription, partStart: parts.length + 6 };
    recipes.set(id, record);
    elements.push([id, record.name, record.tags, parameters, stateDescription, rootId, 0, '', '', ingredients.length, 'Workshop', 'Set atom modifiers', variant ? 'Placement state configuration captured in this snapshot.' : 'Definition defaults captured in this snapshot.']);
    ingredients.forEach((a, j) => parts.push([`PART:${id}:${j + 1}`, id, a.id, 1, included[j] ? 'Yes' : 'No', '', included[j] ? 'Incomplete' : 0, included[j] ? 'Set atom modifier' : 'Ready', a.parentId ? `Under ${a.parentId}` : 'Root object']));
    return record;
  }
  for (const rootId of roots) recipe(rootId);
  const introduced = new Set();
  for (const l of project.levels) {
    for (const i of l.instances) {
      const r = recipe(i.assetId, i);
      placementElements.set(i.id, r.id);
      placements.push([i.id, l.id, r.id, i.assetId, r.name, i.x, i.y, i.rotation, i.note || '', 'Workshop', 'Ready']);
      if (!introduced.has(r.id)) { introductions.push([l.id, r.id, r.name, r.tags, r.parameters, r.states, 'Incomplete', 'Ready']); introduced.add(r.id); }
    }
    for (const link of l.objectLinks) {
      const id = `CP:${link.id}`;
      challenges.push([id, l.id, link.name, link.rule, '', '', '', '', 1, link.instanceIds.length, 'Incomplete', 'Incomplete', 'Incomplete', 'Incomplete', 'Set description and gameplay type', 'Suggested from an object link. Confirm the challenge, gameplay type, skills and modifier.', link.id]);
      link.instanceIds.forEach((pid, j) => members.push([`MEMBER:${link.id}:${j + 1}`, id, placementElements.get(pid), pid, 1, 'Incomplete', 'Incomplete', 'Check element']));
    }
  }
  const levels = project.levels.map((l, i) => {
    let edges = 0;
    const nodes=nodeCells(l);
    for (const key of nodes) {
      const [x, y] = key.split(',').map(Number);
      for (const to of [`${x + 1},${y}`, `${x},${y + 1}`]) if (nodesConnected(l, key, to)) edges++;
    }
    const nc = challenges.filter(c => c[1] === l.id).length;
    return [l.id, i + 1, l.name, l.width, l.height, nodes.length, ...['floor', 'wall'].map(t => Object.values(l.tiles).filter(v => t === 'floor' ? isFloor(v) : v === t).length), new Set([...Object.keys(l.tiles),...nodes]).size, edges, l.blockedLinks.length, l.width * l.height, l.instances.length, nc, 'Incomplete', 'Incomplete', 'Incomplete', 'Incomplete', nc ? 'Check challenges' : 'Add challenges', snapshotLabels[snapshotKind], ''];
  });
  return { project, atoms, elements, parts, placements, introductions, challenges, members, levels, recipes, source: { schemaVersion: 'workshop-inventory/2', projectVersion: project.version, projectTitle: project.title, room, revision, snapshotKind, exportedAt } };
}

export function inventorySheets(data) {
  const { project, atoms, elements, parts, placements, introductions, challenges, members, levels, recipes, source } = data;
  const definitions = {
    'Game Progression': ['Level ID', 'Order', 'Level name', 'Level pitch', 'Onboarding', 'Difficulty intention', 'Target', 'Intro 1', 'Intro 2', 'Intro 3', 'Intro 4', 'Intro 5', 'Intro 6', 'Introduced element IDs', 'Difficulty', 'Peak', 'Variety', 'Type count', 'Challenge count', 'Review'],
    'Challenge Patterns': ['Pattern ID', 'Level', 'Challenge', 'What the player faces', 'Gameplay type', 'Mental skills', 'Physical skills', 'Mod.', 'Weight', 'Member rows', 'Element subtotal', 'Raw difficulty', 'Difficulty', 'Weighted difficulty', 'Status', 'Playtest notes', 'Workshop link ID', 'Level row key'],
    'Pattern Members': ['Member ID', 'Pattern ID', 'Element ID', 'Placement ID (optional)', 'Qty', 'Element pts', 'Contribution', 'Status', 'Recipe ↗', 'Instance ↗'],
    'Gameplay Elements': ['Element ID', 'Recipe', 'Tags', 'Parameters', 'States', 'Root asset ID', 'Adjust.', 'Atom subtotal', 'Difficulty', 'Part rows', 'Origin', 'Status', 'Assembly notes', 'Parts', 'Instances', 'Recipe tag IDs'],
    'Element Parts': ['Part ID', 'Element ID', 'Atom ID', 'Qty', 'Included', 'Atom pts', 'Points', 'Status', 'Composition notes', 'Ingredient ↗', 'Atom kind', 'Atom tag IDs', 'Parameter detail', 'State in recipe'],
    'Atoms': ['Atom ID', 'Kind', 'Name', 'Parent', 'Enabled', 'Rule / description', 'Icon', 'Variant', 'Range', 'Width', 'Rotation', 'Tag IDs', 'Difficulty modifier', 'Origin', 'Status'],
    'Tags': ['Tag ID', 'Name', 'Rule / description', 'Color hex', 'Origin'],
    'Placements': ['Placement ID', 'Level', 'Element ID', 'Workshop asset ID', 'Recipe ↗', 'X', 'Y', 'Angle', 'Placement notes', 'Origin', 'Status', 'Level row key'],
    'Level Data': ['Level ID', 'Order', 'Level name', 'Width', 'Height', 'Nodes', 'Floor cells', 'Wall cells', 'Painted cells', 'Open node edges', 'Blocked edges', 'Map area', 'Objects', 'Patterns', 'Difficulty', 'Peak', 'Variety', 'Type count', 'Status', 'Snapshot', 'Level notes', ...Array.from({ length: 28 }, (_, i) => `Type weight ${i + 1}`)],
    'Introductions': ['Level ID', 'Element ID', 'Recipe ↗', 'Tags', 'Parameters', 'States', 'Difficulty', 'Status']
  };
  const rows = {
    'Game Progression': levels.map(l => [l[0], l[1], l[2]]), 'Challenge Patterns': challenges, 'Pattern Members': members, 'Gameplay Elements': elements,
    'Element Parts': parts, Atoms: atoms, Tags: project.tags.map(t => [t.id, t.name, t.rule, t.color, 'Workshop']), Placements: placements, 'Level Data': levels, Introductions: introductions
  };
  const colors = { 'Game Progression': '2563EB', 'Challenge Patterns': 'C65D16', 'Pattern Members': 'D97706', 'Gameplay Elements': '7C3AED', 'Element Parts': '8B5CF6', Atoms: 'B7791F', Tags: 'DB2777', Placements: '475569', 'Level Data': '64748B', Introductions: '3B82F6', Settings: '4F46E5', 'Read Me': '475569', 'Export Info': '64748B' };
  const hints = {
    'Game Progression': 'Edit pitch, onboarding and intentions. Manage introduced recipes in Introductions; linked labels open the recipe.',
    'Gameplay Elements': 'Recipes combine included atoms. Tags, parameters and states update from their ingredients. Open Parts or Instances to inspect.',
    'Element Parts': 'One atom per recipe. Included switches capture this snapshot, including placement-specific state configurations.',
    Atoms: 'Every definition, including unused and inactive branches. Enter signed difficulty modifiers; blank means unscored.',
    'Challenge Patterns': 'Object links are suggestions. Confirm description, gameplay type, skills and modifier; add two or more members.',
    Introductions: 'First use is suggested from level order. Change the Level ID to adjust the intended introduction; one row per recipe.',
    'Level Data': 'Geometry is captured from the selected snapshot. Difficulty and gameplay variety recalculate from challenge patterns.'
  };
  const byName = {}, sizes = Object.fromEntries(Object.entries(rows).map(([name, values]) => [name, capacity(values)]));
  const ref = (s, c) => `'${s}'!$${c}$6:$${c}$${sizes[s] + 5}`;
  // Escape wildcard criteria so a Workshop ID containing *, ? or ~ stays an ID.
  const criterion = key => `"="&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${key},"~","~~"),"*","~*"),"?","~?")`;
  const count = (s, c, key) => `COUNTIF(${ref(s, c)},${criterion(key)})`;
  const sum = (s, c, keyCol, key) => `SUMIF(${ref(s, keyCol)},${criterion(key)},${ref(s, c)})`;
  const lookup = (s, c, keyCol, key) => `INDEX(${ref(s, c)},MATCH(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${key},"~","~~"),"*","~*"),"?","~?"),${ref(s, keyCol)},0))`;
  const badRows = (s, keyCol, key, status) => `COUNTIFS(${ref(s, keyCol)},${criterion(key)},${ref(s, status)},"<>Ready")`;
  const linked = (s, keyCol, key, label) => `HYPERLINK("#'${s}'!A"&(MATCH(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${key},"~","~~"),"*","~*"),"?","~?"),${ref(s, keyCol)},0)+5),${label})`;
  const wrap = (r, formula, key = 'A') => `IF(${key}${r}="","",${formula})`;
  const blanks = n => Array(n).fill('');
  const sheet = (name, headers, values, n = capacity(values)) => {
    const width = headers.length;
    const s = { name, color: colors[name] || '0891B2', rows: [[], [name], [hints[name] || `${project.title} · ${snapshotLabels[source.snapshotKind]}`], [], headers, ...Array.from({ length: n }, (_, i) => [...(values[i] || []), ...blanks(Math.max(0, width - (values[i]?.length || 0)))])], widths: headers.map(() => 17), inputColumns: [], hiddenColumns: [], validations: [], statusColumns: [], merges: [`A2:${column(width - 1)}2`, `A3:${column(width - 1)}3`] };
    byName[name] = s;
    return s;
  };
  for (const [name, headers] of Object.entries(definitions)) sheet(name, headers, rows[name], sizes[name]);
  function formula(s, c, fn, cache = () => '', style = 2, array = false) {
    const index = [...c].reduce((n, v) => n * 26 + v.charCodeAt(0) - 64, 0) - 1;
    for (let i = 0; i < sizes[s]; i++) byName[s].rows[i + 5][index] = cell(wrap(i + 6, fn(i + 6)), i < rows[s].length ? cache(i) : '', style, array);
  }
  const incomplete = () => 'Incomplete', ready = () => 'Ready';
  formula('Atoms', 'O', r => `IF(${count('Atoms', 'A', `A${r}`)}<>1,"Duplicate atom ID",IF(OR(B${r}="",C${r}=""),"Missing kind or name",IF(NOT(ISNUMBER(M${r})),"Set difficulty modifier",IF(AND(D${r}<>"",${count('Atoms', 'A', `D${r}`)}<>1),"Unknown parent",IF(AND(B${r}="State",OR(D${r}="",AND(E${r}<>"On",E${r}<>"Off"))),"Set state parent and switch","Ready")))))`, () => 'Set difficulty modifier');
  formula('Element Parts', 'F', r => `IFERROR(IF(${lookup('Atoms', 'O', 'A', `C${r}`)}="Ready",${lookup('Atoms', 'M', 'A', `C${r}`)},"Unscored atom"),"Missing atom")`, () => 'Unscored atom');
  formula('Element Parts', 'H', r => `IF(${count('Element Parts', 'A', `A${r}`)}<>1,"Duplicate part ID",IF(${count('Gameplay Elements', 'A', `B${r}`)}<>1,"Unknown element",IF(${count('Atoms', 'A', `C${r}`)}<>1,"Unknown atom",IF(OR(NOT(ISNUMBER(D${r})),D${r}<=0),"Set positive quantity",IF(AND(E${r}<>"Yes",E${r}<>"No"),"Set Included",IF(COUNTIFS(${ref('Element Parts', 'B')},${criterion(`B${r}`)},${ref('Element Parts', 'C')},${criterion(`C${r}`)})<>1,"Duplicate atom in recipe",IF(AND(E${r}="Yes",NOT(ISNUMBER(F${r}))),"Set atom modifier","Ready")))))))`, i => parts[i][4] === 'No' ? 'Ready' : 'Set atom modifier');
  formula('Element Parts', 'G', r => `IF(H${r}<>"Ready","Incomplete",IF(E${r}="Yes",D${r}*F${r},0))`, i => parts[i][4] === 'No' ? 0 : 'Incomplete');
  formula('Element Parts', 'J', r => `IFERROR(${linked('Atoms', 'A', `C${r}`, lookup('Atoms', 'C', 'A', `C${r}`))},"Unknown atom")`, i => project.assets.find(a => a.id === parts[i][2]).name, 3);
  formula('Element Parts', 'K', r => `IFERROR(${lookup('Atoms', 'B', 'A', `C${r}`)},"")`, i => kind(project.assets.find(a => a.id === parts[i][2])));
  formula('Element Parts', 'L', r => `IFERROR(${lookup('Atoms', 'L', 'A', `C${r}`)},"")`, i => project.assets.find(a => a.id === parts[i][2]).tags.join(';'));
  formula('Element Parts', 'M', r => `IF(K${r}<>"Parameter","",IFERROR(${lookup('Atoms', 'C', 'A', `C${r}`)}&" · "&${lookup('Atoms', 'I', 'A', `C${r}`)}&IF(${lookup('Atoms', 'I', 'A', `C${r}`)}=1," cell"," cells")&IF(OR(${lookup('Atoms', 'J', 'A', `C${r}`)}="",${lookup('Atoms', 'J', 'A', `C${r}`)}=0),""," × "&${lookup('Atoms', 'J', 'A', `C${r}`)}&" wide"),""))`, i => { const a = project.assets.find(a => a.id === parts[i][2]); return parameter(a) ? `${a.name} · ${a.range} cell${a.range === 1 ? '' : 's'}${a.width ? ` × ${a.width} wide` : ''}` : ''; });
  formula('Element Parts', 'N', r => `IF(K${r}<>"State","",IFERROR(${lookup('Atoms', 'C', 'A', `C${r}`)}&IF(E${r}="Yes"," on"," off"),""))`, i => { const a = project.assets.find(a => a.id === parts[i][2]); return isState(a) ? `${a.name}${parts[i][4] === 'Yes' ? ' on' : ' off'}` : ''; });
  formula('Gameplay Elements', 'J', r => count('Element Parts', 'B', `A${r}`), i => elements[i][9]);
  const elementCache = i => parts.some(p => p[1] === elements[i][0] && p[4] === 'Yes') ? 'Incomplete' : 0;
  formula('Gameplay Elements', 'L', r => `IF(${count('Gameplay Elements', 'A', `A${r}`)}<>1,"Duplicate element ID",IF(B${r}="","Set name",IF(NOT(ISNUMBER(G${r})),"Set assembly modifier",IF(J${r}=0,"Add recipe parts",IF(${badRows('Element Parts', 'B', `A${r}`, 'H')}>0,"Check recipe parts","Ready")))))`, i => elementCache(i) === 0 ? 'Ready' : 'Check recipe parts');
  formula('Gameplay Elements', 'H', r => `IF(L${r}<>"Ready","Incomplete",${sum('Element Parts', 'G', 'B', `A${r}`)})`, elementCache);
  formula('Gameplay Elements', 'I', r => `IF(L${r}<>"Ready","Incomplete",H${r}+G${r})`, elementCache, 8);
  formula('Gameplay Elements', 'P', r => `_xlfn.TEXTJOIN(";",TRUE,IF((${ref('Element Parts', 'B')}=A${r})*(${ref('Element Parts', 'E')}="Yes"),${ref('Element Parts', 'L')},""))`, i => [...recipes.get(elements[i][0]).tagIds].join(';'), 2, true);
  formula('Gameplay Elements', 'C', r => `_xlfn.TEXTJOIN(", ",TRUE,IF((${ref('Tags', 'A')}<>"")*ISNUMBER(FIND(";"&${ref('Tags', 'A')}&";",";"&P${r}&";")),${ref('Tags', 'B')},""))`, i => elements[i][2], 2, true);
  formula('Gameplay Elements', 'D', r => `_xlfn.TEXTJOIN(", ",TRUE,IF((${ref('Element Parts', 'B')}=A${r})*(${ref('Element Parts', 'E')}="Yes"),${ref('Element Parts', 'M')},""))`, i => elements[i][3], 2, true);
  formula('Gameplay Elements', 'E', r => `_xlfn.TEXTJOIN(", ",TRUE,IF(${ref('Element Parts', 'B')}=A${r},${ref('Element Parts', 'N')},""))`, i => elements[i][4], 2, true);
  formula('Gameplay Elements', 'N', r => `IF(J${r}=0,"Add parts",${linked('Element Parts', 'B', `A${r}`, `J${r}&" parts ↗"`)})`, i => `${elements[i][9]} parts ↗`, 3);
  formula('Gameplay Elements', 'O', r => `IF(${count('Placements', 'C', `A${r}`)}=0,"Library recipe",${linked('Placements', 'C', `A${r}`, `${count('Placements', 'C', `A${r}`)}&" instances ↗"`)})`, i => { const n = placements.filter(p => p[2] === elements[i][0]).length; return n ? `${n} instances ↗` : 'Library recipe'; }, 3);
  formula('Placements', 'E', r => `IFERROR(${linked('Gameplay Elements', 'A', `C${r}`, lookup('Gameplay Elements', 'B', 'A', `C${r}`))},"Unknown element")`, i => placements[i][4], 3);
  formula('Placements', 'K', r => `IF(${count('Placements', 'A', `A${r}`)}<>1,"Duplicate placement ID",IF(${count('Level Data', 'A', `B${r}`)}<>1,"Unknown level",IF(${count('Gameplay Elements', 'A', `C${r}`)}<>1,"Unknown element",IF(OR(NOT(ISNUMBER(F${r})),NOT(ISNUMBER(G${r})),F${r}<0,G${r}<0,F${r}>=${lookup('Level Data', 'D', 'A', `B${r}`)},G${r}>=${lookup('Level Data', 'E', 'A', `B${r}`)}),"Check coordinates","Ready"))))`, ready);
  formula('Placements', 'L', r => `B${r}&"|"&COUNTIF($B$6:B${r},${criterion(`B${r}`)})`, i => `${placements[i][1]}|${placements.slice(0, i + 1).filter(p => p[1] === placements[i][1]).length}`);
  formula('Pattern Members', 'F', r => `IFERROR(IF(${lookup('Gameplay Elements', 'L', 'A', `C${r}`)}="Ready",${lookup('Gameplay Elements', 'I', 'A', `C${r}`)},"Incomplete element"),"Unknown element")`, () => 'Incomplete element');
  formula('Pattern Members', 'H', r => `IF(${count('Pattern Members', 'A', `A${r}`)}<>1,"Duplicate member ID",IF(${count('Challenge Patterns', 'A', `B${r}`)}<>1,"Unknown pattern",IF(NOT(ISNUMBER(F${r})),"Check element",IF(OR(NOT(ISNUMBER(E${r})),E${r}<=0),"Set positive quantity",IF(D${r}="","Ready",IF(${count('Placements', 'A', `D${r}`)}<>1,"Unknown placement",IF(OR(${lookup('Placements', 'C', 'A', `D${r}`)}<>C${r},${lookup('Placements', 'B', 'A', `D${r}`)}<>${lookup('Challenge Patterns', 'B', 'A', `B${r}`)}),"Wrong element or level",IF(COUNTIFS(${ref('Pattern Members', 'B')},${criterion(`B${r}`)},${ref('Pattern Members', 'D')},${criterion(`D${r}`)})<>1,"Duplicate placement",IF(E${r}<>1,"Placement quantity must be 1","Ready")))))))))`, () => 'Check element');
  formula('Pattern Members', 'G', r => `IF(H${r}<>"Ready","Incomplete",E${r}*F${r})`, incomplete);
  formula('Pattern Members', 'I', r => `IFERROR(${linked('Gameplay Elements', 'A', `C${r}`, lookup('Gameplay Elements', 'B', 'A', `C${r}`))},"Unknown element")`, i => recipes.get(members[i][2]).name, 3);
  formula('Pattern Members', 'J', r => `IF(D${r}="","Library recipe",IFERROR(${linked('Placements', 'A', `D${r}`, `D${r}&" ↗"`)},"Unknown placement"))`, i => `${members[i][3]} ↗`, 3);
  formula('Challenge Patterns', 'J', r => count('Pattern Members', 'B', `A${r}`), i => challenges[i][9]);
  formula('Challenge Patterns', 'O', r => `IF(${count('Challenge Patterns', 'A', `A${r}`)}<>1,"Duplicate pattern ID",IF(${count('Level Data', 'A', `B${r}`)}<>1,"Unknown level",IF(OR(C${r}="",D${r}="",COUNTIF(Settings!$E$6:$E$33,E${r})<>1),"Set description and gameplay type",IF(OR(NOT(ISNUMBER(H${r})),NOT(ISNUMBER(I${r})),I${r}<=0),"Set modifier and positive weight",IF(J${r}<Settings!$I$8,"Add 2+ member rows",IF(${badRows('Pattern Members', 'B', `A${r}`, 'H')}>0,"Check members","Ready"))))))`, () => 'Set description and gameplay type');
  formula('Challenge Patterns', 'K', r => `IF(O${r}<>"Ready","Incomplete",${sum('Pattern Members', 'G', 'B', `A${r}`)})`, incomplete);
  formula('Challenge Patterns', 'L', r => `IF(O${r}<>"Ready","Incomplete",K${r}+H${r})`, incomplete);
  formula('Challenge Patterns', 'M', r => `IF(O${r}<>"Ready","Incomplete",MIN(Settings!$I$7,MAX(Settings!$I$6,L${r})))`, incomplete, 8);
  formula('Challenge Patterns', 'N', r => `IF(O${r}<>"Ready","Incomplete",M${r}*I${r})`, incomplete);
  formula('Challenge Patterns', 'R', r => `B${r}&"|"&COUNTIF($B$6:B${r},${criterion(`B${r}`)})`, i => `${challenges[i][1]}|${challenges.slice(0, i + 1).filter(p => p[1] === challenges[i][1]).length}`);
  formula('Level Data', 'L', r => `IF(AND(ISNUMBER(D${r}),ISNUMBER(E${r})),D${r}*E${r},"Set map size")`, i => levels[i][11]);
  formula('Level Data', 'M', r => count('Placements', 'B', `A${r}`), i => levels[i][12]);
  formula('Level Data', 'N', r => count('Challenge Patterns', 'B', `A${r}`), i => levels[i][13]);
  formula('Level Data', 'S', r => `IF(${count('Level Data', 'A', `A${r}`)}<>1,"Duplicate level ID",IF(OR(NOT(ISNUMBER(D${r})),NOT(ISNUMBER(E${r})),D${r}<=0,E${r}<=0),"Set map size",IF(N${r}=0,"Add challenges",IF(${badRows('Challenge Patterns', 'B', `A${r}`, 'O')}>0,"Check challenges",IF(${badRows('Placements', 'B', `A${r}`, 'K')}>0,"Check placements","Ready")))))`, i => levels[i][18]);
  formula('Level Data', 'O', r => `IF(S${r}<>"Ready","Incomplete",${sum('Challenge Patterns', 'N', 'B', `A${r}`)}/${sum('Challenge Patterns', 'I', 'B', `A${r}`)})`, incomplete, 8);
  formula('Level Data', 'P', r => `IF(S${r}<>"Ready","Incomplete",MAX(IF(${ref('Challenge Patterns', 'B')}=A${r},${ref('Challenge Patterns', 'M')},0)))`, incomplete, 8, true);
  for (let i = 0; i < 28; i++) formula('Level Data', column(21 + i), r => `IF(Settings!E${6 + i}="",0,SUMIFS(${ref('Challenge Patterns', 'I')},${ref('Challenge Patterns', 'B')},${criterion(`A${r}`)},${ref('Challenge Patterns', 'E')},Settings!E${6 + i}))`, j => challenges.filter(c => c[1] === levels[j][0] && c[4] === gameplayTypes[i]).reduce((n, c) => n + c[8], 0));
  formula('Level Data', 'Q', r => `IF(S${r}<>"Ready","Incomplete",IF(SUMSQ(V${r}:AW${r})=0,"Incomplete",SUM(V${r}:AW${r})^2/SUMSQ(V${r}:AW${r})))`, incomplete, 8);
  formula('Level Data', 'R', r => `IF(S${r}<>"Ready","Incomplete",COUNTIF(V${r}:AW${r},">0"))`, incomplete);
  for (const [c, sourceCol] of [['C', 'B'], ['D', 'C'], ['E', 'D'], ['F', 'E'], ['G', 'I']]) formula('Introductions', c, r => `IFERROR(${c === 'C' ? linked('Gameplay Elements', 'A', `B${r}`, lookup('Gameplay Elements', sourceCol, 'A', `B${r}`)) : lookup('Gameplay Elements', sourceCol, 'A', `B${r}`)},"Unknown element")`, i => introductions[i][c.charCodeAt(0) - 65], c === 'C' ? 3 : c === 'G' ? 8 : 2);
  formula('Introductions', 'H', r => `IF(${count('Level Data', 'A', `A${r}`)}<>1,"Unknown level",IF(${count('Gameplay Elements', 'A', `B${r}`)}<>1,"Unknown element",IF(${count('Introductions', 'B', `B${r}`)}>1,"Element introduced twice","Ready")))`, ready);
  for (const [c, src] of [['B', 'B'], ['C', 'C'], ['O', 'O'], ['P', 'P'], ['Q', 'Q'], ['R', 'R'], ['S', 'N'], ['T', 'S']]) formula('Game Progression', c, r => `IFERROR(${lookup('Level Data', src, 'A', `A${r}`)},"Unknown level")`, i => levels[i][columnIndex(src)], ['O', 'P', 'Q'].includes(c) ? 8 : 2);
  formula('Game Progression', 'N', r => `_xlfn.TEXTJOIN("; ",TRUE,IF(${ref('Introductions', 'A')}=A${r},${ref('Introductions', 'B')},""))`, i => introductions.filter(x => x[0] === levels[i][0]).map(x => x[1]).join('; '), 2, true);
  for (let i = 0; i < 6; i++) {
    // A hidden helper ordinal in Introductions makes linked slots nonvolatile,
    // compatible with Excel and Google Sheets, and independent of display names.
    const key = `A${'ROW'}&"|${i + 1}"`;
    formula('Game Progression', column(7 + i), r => {
      const id = lookup('Introductions', 'B', 'I', key.replace('ROW', r));
      return `IFERROR(${linked('Gameplay Elements', 'A', id, lookup('Gameplay Elements', 'B', 'A', id))},"")`;
    }, j => introductions.filter(x => x[0] === levels[j][0])[i]?.[2] || '', 3);
  }
  byName.Introductions.rows[4].push('Level row key'); byName.Introductions.hiddenColumns.push(8); byName.Introductions.widths.push(16);
  formula('Introductions', 'I', r => `A${r}&"|"&COUNTIF($A$6:A${r},${criterion(`A${r}`)})`, i => `${introductions[i][0]}|${introductions.slice(0, i + 1).filter(x => x[0] === introductions[i][0]).length}`);

  const settings = sheet('Settings', ['Player skill', 'Family', 'Color', '', 'Gameplay type', '', '', 'Difficulty scale', 'Value', 'Meaning'], [], 30);
  skills.forEach((s, i) => settings.rows[i + 5].splice(0, 3, ...[s, i < 8 ? 'Mental' : 'Physical', i < 8 ? 'Blue' : 'Red'].map(value => ({ value, style: i < 8 ? 6 : 7 }))));
  gameplayTypes.forEach((t, i) => settings.rows[i + 5][4] = { value: t, style: 1 });
  [['Minimum', 0, 'No perceived challenge'], ['Maximum', 10, 'Very high challenge'], ['Minimum members', 2, 'Two or more recipe members']].forEach((v, i) => settings.rows[i + 5].splice(7, 3, v[0], { value: v[1], style: 1 }, v[2]));
  settings.widths = [20, 14, 12, 3, 20, 3, 3, 21, 12, 34]; settings.freezeColumns = 1; settings.filter = false;

  // Level views include every placed object and suggested challenge, with spare
  // rows for grouping additional encounters. No 25-object truncation.
  const levelSheets = levels.map((l, index) => {
    const name = `Level ${String(index + 1).padStart(2, '0')}`, objects = placements.filter(p => p[1] === l[0]), patterns = challenges.filter(p => p[1] === l[0]);
    const slots = Math.max(10, objects.length + 10), patternStart = 29 + slots + 3, patternSlots = Math.max(10, patterns.length + 10);
    const s = sheet(name, ['Level ID', l[0], '', '', '', '', '', ''], [], patternStart + patternSlots - 5);
    s.filter = false; s.rowHeight = 32; s.widths = [24, 25, 28, 14, 14, 21, 30, 16]; s.merges = ['A2:H2', 'A3:H3']; s.freezeColumns = 1;
    s.rows[1][0] = cell(`IFERROR(${lookup('Level Data', 'C', 'A', '$B$5')},"Unknown level")`, l[2], 5);
    const metrics = [[6, 0, 'Difficulty', 'O'], [6, 3, 'Peak challenge', 'P'], [6, 6, 'Variety', 'Q'], [8, 0, 'Nodes', 'F'], [8, 3, 'Map area', 'L'], [8, 6, 'Objects', 'M'], [10, 0, 'Map width', 'D'], [10, 3, 'Map height', 'E'], [10, 6, 'Open edges', 'J'], [12, 0, 'Patterns', 'N'], [12, 3, 'Type count', 'R'], [14, 0, 'Review', 'S']];
    for (const [r, c, label, src] of metrics) { s.rows[r - 1][c] = label; s.rows[r - 1][c + 1] = cell(`IFERROR(${lookup('Level Data', src, 'A', '$B$5')},"Unknown level")`, l[columnIndex(src)], ['O', 'P', 'Q'].includes(src) ? 8 : 2); }
    s.rows[16] = ['Regroup objects into a challenge']; s.rows[18] = ['1. Add a Challenge Patterns row with this Level ID.']; s.rows[20] = ['2. Add two or more Pattern Members using the placement IDs below.']; s.rows[22] = ['3. Set gameplay type, skills and modifier. Scores update from the recipes.'];
    for (const r of [17, 19, 21, 23]) s.merges.push(`A${r}:H${r}`);
    s.rows[27] = ['Placement ID', 'Element ID', 'Recipe ↗', 'X', 'Y', 'Angle', 'Notes', ''];
    for (let j = 0; j < slots; j++) for (const [k, src] of ['A', 'C', 'E', 'F', 'G', 'H', 'I'].entries()) {
      const key = `$B$5&"|${j + 1}"`, label = lookup('Placements', src, 'L', key);
      s.rows[j + 28][k] = cell(`IFERROR(${k === 2 ? linked('Placements', 'L', key, label) : label},"")`, objects[j]?.[columnIndex(src)] ?? '', k === 2 ? 3 : 2);
    }
    s.rows[patternStart - 1] = ['Pattern ID', 'Challenge', 'Gameplay type', 'Difficulty', 'Weight', 'Mental skills', 'Physical skills', ''];
    for (let j = 0; j < patternSlots; j++) for (const [k, src] of ['A', 'C', 'E', 'M', 'I', 'F', 'G'].entries()) s.rows[patternStart + j][k] = cell(`IFERROR(${lookup('Challenge Patterns', src, 'R', `$B$5&"|${j + 1}"`)},"")`, patterns[j]?.[columnIndex(src)] ?? '', k === 5 ? 6 : k === 6 ? 7 : 2);
    for (const r of [28, patternStart]) s.rows[r - 1] = s.rows[r - 1].map(value => ({ value, style: 9 }));
    return s;
  });

  const readme = sheet('Read Me', ['Topic', 'How to use this snapshot'], [
    ['Start here', 'Amber cells are editable inputs; purple cells are calculated recipe summaries; blue underlined labels open related records. Stable IDs connect every table.'],
    ['Captured snapshot', `${snapshotLabels[source.snapshotKind]}. Exported ${source.exportedAt}. ${project.title}. This is a snapshot, not a live connection to Workshop.`],
    ['Score definitions', 'In Atoms, set a signed difficulty modifier for each used atom. Blank is unscored; zero is deliberate. Range and width do not imply a score.'],
    ['Recipes', 'Gameplay Elements summarizes tags, included parameters and all state switches. Edit the recipe name and assembly adjustment, or open Parts to edit ingredients and Included switches.'],
    ['Placement states', 'An effective placement state configuration gets its own recipe when it differs from the definition defaults. Identical configurations share a recipe. Disabled branches are retained and excluded from scoring.'],
    ['State edits', 'Included in Element Parts is the captured effective state. Editing Enabled in Atoms does not rebuild recipes; update Included for the state and its descendants, or export a new snapshot.'],
    ['Create a challenge', 'Existing object links seed suggestions only. Confirm the description, select a gameplay type, add skills, and enter a custom modifier (zero is allowed) and positive weight.'],
    ['Regroup objects', 'Add a Challenge Patterns row and at least two Pattern Members. Use the placement and element IDs from a Level tab. For a placed object, quantity must be 1; a library recipe can have any positive quantity.'],
    ['Difficulty', 'Recipe = sum(included atom modifier × quantity) + assembly adjustment. Challenge = member sum + custom modifier, clipped to Settings minimum/maximum.'],
    ['Level score', 'Overall difficulty is the weighted mean of challenges. Peak is the hardest challenge. Missing scores or incomplete challenges block the whole level score. These are design estimates, not measured player ratings.'],
    ['Variety', 'Effective gameplay types = total weight squared / sum of each type weight squared. Also shows the simple type count. Add types in Settings E6:E33.'],
    ['Introductions', 'First use by level order is suggested in Introductions. Edit those Level IDs for design intent. Game Progression shows six clickable recipe labels; its full hidden ID list and Introductions retain any additional recipes.'],
    ['Progression', 'Set a pitch, onboarding, difficulty intention and target for every level in Game Progression. Targets are intentions, separate from calculated difficulty.'],
    ['Skills and tags', 'Tags and skills are portable text in .xlsx. Recipe summaries update automatically. In Google Sheets you can apply colored dropdown chips with multiple selections; chip styling is not carried by Excel files.'],
    ['Extend records', 'Every table includes at least 20 spare rows and formulas. If adding beyond the prepared rows, extend formulas, named ranges, validations and all cross-sheet formula bounds. Level views include all exported objects plus spare slots.'],
    ['Sort safely', 'Sort complete rows, including collapsed helper columns. Keep IDs when renaming. Links find related rows by ID.'],
    ['Export again', 'Each export creates a new workbook and never changes an earlier one. Sheet-only scoring, patterns and notes are not imported back to Workshop or merged into later exports. Keep your annotated workbook.'],
    ['Google Sheets', 'Upload the .xlsx to Drive and open with Google Sheets, or use File → Import in Sheets. No Google sign-in is needed inside Workshop.'],
    ['Source details', 'Export Info stores snapshot identity and the complete project JSON in ordered chunks, including state overrides, geometry, object links, annotations and drawn cards. No measured playtest telemetry is invented.']
  ]);
  readme.widths = [25, 110]; readme.rowHeight = 56; readme.filter = false; readme.freezeColumns = 1;
  const json = JSON.stringify(project), sourceRows = Object.entries(source).map(([k, v]) => [k, v ?? '']);
  for (let i = 0; i < json.length; i += 28000) sourceRows.push([`Project JSON ${String(Math.floor(i / 28000) + 1).padStart(5, '0')}`, json.slice(i, i + 28000)]);
  const info = sheet('Export Info', ['Field / chunk', 'Value'], sourceRows, sourceRows.length);
  info.widths = [29, 110]; info.rowHeight = 36; info.filter = false; info.freezeColumns = 1;

  // Compact revision-2 presentation. Collapsed IDs and helpers remain in-file.
  const presentation = {
    'Game Progression': { widths: [19, 7, 25, 33, 33, 30, 10, 22, 22, 22, 22, 22, 22, 35, 13, 13, 13, 13, 13, 24], hide: [11, 12, 13, 15, 17, 18, 19], inputs: [3, 4, 5, 6], status: ['T'], height: 60 },
    'Gameplay Elements': { widths: [23, 24, 31, 38, 25, 20, 12, 15, 14, 10, 16, 25, 40, 15, 18, 30], hide: [5, 7, 9, 10, 12, 15], inputs: [6], status: ['L'], height: 44 },
    'Element Parts': { widths: [24, 24, 24, 8, 12, 12, 12, 24, 35, 27, 15, 25, 35, 30], hide: [8, 10, 11, 12, 13], inputs: [1, 2, 3, 4], status: ['H'] },
    Atoms: { widths: [23, 15, 25, 24, 12, 46, 15, 15, 10, 10, 10, 28, 15, 15, 25], hide: [3, 6, 7, 10, 11, 13], inputs: [12], status: ['O'], height: 44 },
    Tags: { widths: [23, 25, 55, 16, 15] },
    Placements: { widths: [24, 21, 24, 24, 28, 8, 8, 10, 38, 15, 25, 25], hide: [3, 9, 11], status: ['K'] },
    'Pattern Members': { widths: [24, 23, 24, 24, 8, 13, 13, 25, 26, 26], inputs: [1, 2, 3, 4], status: ['H'] },
    'Challenge Patterns': { widths: [24, 21, 26, 43, 18, 28, 26, 10, 10, 10, 12, 12, 14, 14, 27, 40, 24, 28], hide: [9, 10, 11, 13, 15, 16, 17], inputs: [4, 5, 6, 7, 8], status: ['O'], height: 48 },
    'Level Data': { widths: [21, 7, 25, 9, 9, 10, 10, 10, 10, 12, 10, 12, 10, 10, 14, 12, 12, 12, 25, 27, 40, ...Array(28).fill(15)], hide: [6, 7, 8, 9, 10, 11, 15, 17, 19, 20, ...Array.from({ length: 28 }, (_, i) => i + 21)], status: ['S'] },
    Introductions: { widths: [22, 24, 28, 31, 38, 25, 14, 25, 25], hide: [8], inputs: [0, 1], status: ['H'], height: 44 }
  };
  for (const [name, p] of Object.entries(presentation)) Object.assign(byName[name], { widths: p.widths, hiddenColumns: p.hide || [], inputColumns: p.inputs || [], statusColumns: p.status || [], rowHeight: p.height || 34 });
  byName['Game Progression'].freezeColumns = 3;
  for (let i = 5; i < byName['Challenge Patterns'].rows.length; i++) for (const c of [5, 6]) byName['Challenge Patterns'].rows[i][c] = { value: challenges[i - 5]?.[c] || '', style: c === 5 ? 6 : 7 };
  const namedRanges = { AtomIDs: ref('Atoms', 'A'), ElementIDs: ref('Gameplay Elements', 'A'), LevelIDs: ref('Level Data', 'A'), PlacementIDs: ref('Placements', 'A'), PatternIDs: ref('Challenge Patterns', 'A'), GameplayTypes: 'Settings!$E$6:$E$33' };
  const validation = (s, c, f) => byName[s].validations.push({ range: `${c}6:${c}${sizes[s] + 5}`, formula: f });
  for (const [s, c, f] of [['Element Parts', 'B', 'ElementIDs'], ['Element Parts', 'C', 'AtomIDs'], ['Introductions', 'A', 'LevelIDs'], ['Introductions', 'B', 'ElementIDs'], ['Pattern Members', 'B', 'PatternIDs'], ['Pattern Members', 'C', 'ElementIDs'], ['Pattern Members', 'D', 'PlacementIDs'], ['Challenge Patterns', 'B', 'LevelIDs'], ['Challenge Patterns', 'E', 'GameplayTypes'], ['Placements', 'B', 'LevelIDs'], ['Placements', 'C', 'ElementIDs']]) validation(s, c, f);
  for (const [s, c, list] of [['Atoms', 'B', 'Object,State,Parameter'], ['Atoms', 'E', 'On,Off'], ['Element Parts', 'E', 'Yes,No']]) validation(s, c, text(list));
  const order = ['Game Progression', ...levelSheets.map(s => s.name), 'Challenge Patterns', 'Pattern Members', 'Gameplay Elements', 'Element Parts', 'Atoms', 'Tags', 'Placements', 'Level Data', 'Introductions', 'Settings', 'Read Me', 'Export Info'];
  return { sheets: order.map(n => byName[n]), namedRanges };
}
function columnIndex(c) { return [...c].reduce((n, v) => n * 26 + v.charCodeAt(0) - 64, 0) - 1; }

export function exportInventory(project, options = {}) {
  const data = inventoryData(project, options), { sheets, namedRanges } = inventorySheets(data);
  return writeWorkbook(sheets, { title: `${data.project.title} — inventory`, namedRanges });
}
