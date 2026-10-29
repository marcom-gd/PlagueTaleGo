# Workshop inventory workbook — proposed export contract

## Native Sheets revision 2

The existing Google Sheets template and example are now the current versions. The local `.xlsx` files and original `support/build.mjs` remain the revision 1 build artifacts; do not use them to overwrite the revised native Sheets.

- Gameplay Elements now reads as a recipe. Columns C, D and E are calculated Tags, Parameters and States. Tags use native colored chip display and come from included ingredient atom IDs. Parameters include current ranges. State labels describe each ingredient's Included setting.
- In Gameplay Elements, the original root asset ID, assembly modifier, subtotal, difficulty, part count, origin, readiness and notes shifted from C:J to F:M. Difficulty is now I. Parts and Instances navigation occupy N:O. P contains the calculated raw tag-ID helper and is collapsed.
- Element Parts retains its original A:I scoring contract. J:N adds linked ingredient names, kind, atom tag IDs, current parameter display and state display. These are calculated from the referenced atom; they are not independent copies.
- Introductions is the owner of first-level introduction relationships. Each row contains Level ID, Element ID, a linked recipe name, calculated recipe summaries, difficulty and status. References are stored as IDs, so display-name changes do not break them.
- Game Progression has six calculated linked recipe slots in H:M. N contains the calculated compatibility ID list. The old I:N summary fields shifted to O:T. The first four introduction slots are visible; slots five and six and technical summary columns are collapsed for compactness. The Introductions table always retains the full list. Extend the slot formulas for a larger visible list.
- Navigation formulas use MATCH on stable IDs to find current definition/instance rows. Introductions, placement recipe names, pattern membership links and recipe-to-ingredient links refer to the same underlying records. Sort complete rows and retain stable IDs.
- Header labels were shortened for the compact presentation. A future exporter should map fields through the schema and stable IDs rather than depending on the previous display wording or column positions.

Rename, parameter-range and introduction-level changes were tested in the native example, then restored. Recipe chip text, parameter summaries, linked progression labels and introduction details updated. Core difficulty results remain 2.50, 4.83 and 6.50.

This document accompanies the blank template and the three-level filled example. It describes a future export; no application export or Google authorization flow is implemented here. The attached Alien Isolation workbook is reference material only and remains unchanged.

## Feasibility

The current version 3 Workshop project contains the IDs, definitions, hierarchy, tags, map tiles, object placements and object links needed to populate the inventory. The sample fixture was validated with the existing `validateProject` function. The workbook uses stable keys, ordinary cell values and scalar formulas. It can therefore be generated as `.xlsx`, imported into Google Sheets, or populated in an existing Google Sheet later.

Google Sheets native multi-select dropdown chips are a presentation feature. Preserve their selected labels as arrays in the export metadata and as comma-separated text in Excel. Do not make difficulty calculations depend on chip formatting. Google documents multi-select dropdowns at https://support.google.com/docs/answer/186103.

## Selected snapshot

The future export must ask which snapshot it is exporting: saved Edit design, playtest starting layout, or current private playtest copy. A playtest is currently held only in browser memory (`playStart` / `play`) and is discarded on return to Edit. The existing Project JSON download exports the saved design, excluding temporary playtests.

Capture the selected project before it is discarded. Include `schemaVersion`, a stable project/room namespace, source project version, source revision, snapshot kind, export timestamp, and selected state switches in a manifest or workbook metadata. Never label a saved design export as a captured playtest result. Workshop does not currently record durations, failures, success rates or perceived-difficulty ratings; leave these absent unless a future feature collects them or the designer enters them.

## Table mapping

All record tables use row 5 headers and row 6 onward for records. IDs are text, quantities and modifiers are numbers, and formulas occupy separate calculated columns. Current workbook capacity is 80 rows per catalog/mapping. The exporter should generate formula and validation bounds for the actual project size, including a useful reserve, instead of inheriting this sample limit.

| Workbook | Source or future field | Ownership and transformation |
| --- | --- | --- |
| Atoms | `project.assets[]` | Preserve `id`, `name`, `parentId`, `rule`, `icon`, `variant`, `range`, optional `width`, optional `rotation`, tag IDs. Kind is State if `kind === 'state'`, Parameter for area/sight/cone/rectangle icons, otherwise Object. Parameters currently use token records in JSON. |
| Atoms / State enabled | `asset.enabled` | Convert booleans to On/Off for state rows; leave non-state rows blank. Store disabled definitions too. |
| Atoms / Difficulty modifier | Proposed designer metadata keyed by atom ID | Signed additive points. A new unmatched record is unscored, not automatically zero. A deliberate zero remains zero. Range/width values do not automatically imply a difficulty score. |
| Tags | `project.tags[]` | Preserve ID, name, rule and color. Atoms store semicolon-separated tag IDs; parse to arrays for an external export payload. Tags can exist without being assigned. |
| Gameplay Elements | Asset hierarchy plus explicit assembly metadata | One ID per assembled configuration. Preserve root asset ID when present; sheet-only elements may omit it. Default source assembly can be one root with its flattened hierarchy. State alternatives need separate configurations or updated inclusion flags. |
| Element Parts | `descendants(project, rootId)` plus root | Emit each atom once per assembly. Set Included using `assetIsActive`, which checks disabled ancestors as well as the atom itself. Keep disabled branches with Included=No. Do not sum a nested parent subtotal and its child modifiers again. |
| Gameplay Elements / Assembly modifier | Proposed designer metadata keyed by element ID | Signed adjustment for interactions among an element's parts. Preserve on refresh. The workbook does not recursively nest assembled elements, avoiding cyclic/double-counted scoring. |
| Placements | `level.instances[]` | Preserve instance ID, level ID, asset ID, zero-based x/y, rotation and note. Map to the matching assembled configuration ID. Effective facing may also require asset rotation; retain both values in the export manifest if visual reconstruction is needed. |
| Level Data | `project.levels[]` | Preserve level ID, order, name, width and height. Map area is width × height, including unpainted cells. Tile counts are counts of node/floor/wall values; painted count is number of tile keys. |
| Level Data / Open node edges | `nodesConnected(level,a,b)` | Count each undirected orthogonal node adjacency once (right and down) and exclude blocked links. `blockedLinks.length` is the blocked edge count. Nodes are unique tile coordinates, not visual ruler cells or object count. |
| Challenge Patterns | New designer records | ID, level ID, name, arbitrary description, primary gameplay type, mental/physical skill arrays, signed custom modifier, positive level weight, notes. This prototype uses one row per encountered challenge in a level. Reusing a concept in another level creates a new ID; a later optional family ID can relate them. |
| Pattern Members | New designer records | Member ID, pattern ID, element ID, optional placement ID, quantity. One member row per selected placed object, quantity 1. Library-only members can have positive quantities. At least two member rows are required. |
| Challenge Patterns / Workshop link ID | `level.objectLinks[]` candidate | Existing links already contain 2+ placement IDs, name and rule. They can seed a suggested group, with one membership per linked placement. A visual link is not automatically a challenge: designer supplies gameplay type, skills, modifier and weight and confirms the description. |
| Game Progression | `project.levels[]` plus new designer fields | Stable level ID and order, pitch, onboarding, intentions, target difficulty and introduced element IDs. Semicolon-separated introduced IDs serialize as an array; each becomes available starting at that level by design intent. Actual use remains in Placements. |
| Level 01 / 02 / 03 | Formula views of the above tables | Generate one view per exported level. This prototype shows 25 objects and 25 challenges per level and displays listed/total counters. A production exporter must size each view to include every record. |
| Settings | Skill/type vocabulary and scoring bounds | All 14 requested skills, Mental blue and Physical red. Initial gameplay types: Stealth, Puzzle, Traversal, Combat, Exploration, Survival, Social, Other. Adding a type requires extending dropdown options and the type-weight calculation range; the exporter should generate both from the vocabulary. |

## Proposed designer metadata shape

Keep this as a separate optional analysis document/sidecar initially. Do not silently extend project JSON and assume current validation persists it; a future application change must explicitly define validation, editing and migration for these fields.

```json
{
  "schemaVersion": "workshop-analysis/1",
  "source": {
    "projectKey": "room-or-project-namespace",
    "projectVersion": 3,
    "revision": 42,
    "snapshotKind": "playtest-current",
    "exportedAt": "ISO-8601 timestamp"
  },
  "atomModifiers": { "asset-id": 1.5 },
  "elements": [
    {
      "id": "element-id",
      "rootAssetId": "asset-id",
      "name": "Assembled element",
      "assemblyModifier": 0,
      "origin": "Workshop",
      "parts": [{ "atomId": "asset-id", "quantity": 1, "included": true }]
    }
  ],
  "placementElements": { "instance-id": "element-id" },
  "challenges": [
    {
      "id": "pattern-id",
      "levelId": "level-id",
      "name": "Cross the patrol lane",
      "description": "Predict the guard turn and cross outside its sight.",
      "gameplayType": "Stealth",
      "mentalSkills": ["Prediction", "Tactics"],
      "physicalSkills": [],
      "customModifier": 0.5,
      "levelWeight": 1,
      "members": [
        { "elementId": "element-a", "placementId": "instance-a", "quantity": 1 },
        { "elementId": "element-b", "placementId": "instance-b", "quantity": 1 }
      ]
    }
  ],
  "levelDesign": {
    "level-id": {
      "pitch": "Short level pitch",
      "onboarding": "What is taught and how",
      "difficultyIntention": "Desired challenge curve",
      "targetDifficulty": 4,
      "introducedElementIds": ["element-a"]
    }
  },
  "scoring": { "minimum": 0, "maximum": 10, "minimumMemberRows": 2 }
}
```

## Calculation contract

1. Part contribution = atom modifier × quantity when Included=Yes; otherwise 0.
2. Element difficulty = sum of part contributions + assembly modifier. This is a signed score, so aids can reduce a challenge's difficulty.
3. Member contribution = element difficulty × quantity.
4. Raw challenge difficulty = sum of member contributions + custom modifier.
5. Perceived challenge difficulty = clamp(raw, minimum, maximum), initially 0–10. Raw difficulty is kept visible so saturation remains apparent.
6. Level difficulty = weighted mean of perceived challenge difficulty. Peak difficulty = maximum perceived challenge difficulty.
7. For each primary gameplay type, share = sum of its challenge weights / total challenge weight. Effective variety = 1 / sum of squared shares. Also show the simple count of types used.

These are proposed design heuristics, not an empirical prediction model. Adjust modifiers and weights after observing playtests. Weights represent experienced encounter importance; overlapping object membership is allowed, but avoid weighting the same experience twice unintentionally. A level with incomplete challenges is unavailable instead of an understated average.

## Refresh and validation

- Upsert source records by ID, never by row number or mutable name. Prefix sheet-only IDs to avoid collisions. Keep designer-owned metadata in its own keyed fields.
- Export all raw definitions, including unused objects, disabled states, parameters and tags. Export all placements. Only Included parts contribute to assembly scores.
- Preserve designer scores, assemblies, skills, challenges, onboarding and intentions on refresh. Flag orphaned references after deletion rather than discarding the user's work.
- Validate uniqueness, hierarchy acyclicity, references, numerical types, positive quantities/weights, state ancestry and geometry bounds. A placement referenced by a challenge must belong to that challenge's level and its selected element.
- The workbook catches core missing IDs/modifiers, duplicate IDs, missing members, mismatched level/element references and invalid coordinates. It is not a replacement for the source validator or a full schema validator. In particular, update state inclusion and progression introduction references deliberately.
- Use literal typed cells for text from Workshop. If an imported name/rule begins with `=`, `+`, `-` or `@`, write it as a literal string rather than executing it as a spreadsheet formula.
- Generate standard `.xlsx` with cached formula results and recalculation enabled. For Google Sheets, either convert that file or write the same normalized tables and formulas through Sheets APIs after an explicit OAuth integration is implemented.

## Verification performed for this prototype

The authoring script validates its synthetic source project with the existing Workshop model, compares calculated element/challenge/level results to independent JavaScript calculations, checks atom-to-level recalculation and blank-versus-zero behavior, scans for formula errors, and renders every workbook tab. Native Google Sheets verification is recorded in the task delivery after import.
