# Plague Tale GO · Atomic Parameters Workshop

A local web tabletop for teaching game design through atomic parameters. Original pixel sprites, plain-language token rules, and optional turn behaviours for private playtests. Requires **Node.js 20+**; there are no package dependencies and no build step.

## Start on Windows

Double-click **start-workshop.cmd**, or run this in PowerShell from this folder:

```powershell
node server.mjs
```

Open **http://localhost:3000**. A new random room is created for a bare URL. Keep the resulting room link to reopen the same project. To use an explicit classroom room, visit `http://localhost:3000/?room=class-a`. Room names are case-insensitive. The launcher uses a standard Node installation, or the bundled Codex Node runtime when available on this computer.

To change the port:

```powershell
$env:PORT = '3100'
node server.mjs
```

## Workshop workflow

### Shared step guide and timer

The strip below the header follows the class programme: two 90-minute blocks and a ten-minute break. It shows the numbered step and title; click the title for a short, friendly activity reminder. Everyone can open the reminder on their own screen.

Use **‹ / ›** to move the whole room to the previous or next step. Click the timer to **start**, **pause**, or **resume** its allotted time; **↺** restores the full allowance. A completed timer can be restarted. Changing steps loads the new allowance and leaves it stopped. Time reaching zero gives a quiet wrap-up message and keeps the current step visible.

The small tab at the right edge collapses the entire strip and restores it when clicked again. This preference is remembered on your device; the shared timer keeps running while hidden. Controls respond immediately and save changes in order in the background. Timer progress uses a small separate room file (`data/<room>.workshop.json`), avoiding project rewrites and the project editing queue.

The current step and timer are shared across participants, including online sessions, and survive refreshes and server restarts. They are stored separately from the project, so editing, undo, importing a project, and private playtests do not reset them. All room participants can use the controls. The programme’s titles, durations, and participant-facing reminders live in `public/workshop-programme.js`. Restart the server and refresh browsers after changing the programme or installing this feature.

### Placement states and editing tools

Select a placed piece to change its state switches for **that piece only**. Its icon, active tags, and nested parameter overlays follow its own state. Library switches still set shared definition defaults. **Use definition defaults** removes a placement's overrides. Playtest state changes remain private and reset normally.

For tokens with several states, enable **Mutually exclusive states (shared definition)** in the inspector to allow at most one sibling state at a time (for example Alive/Dead or Lit/Unlit). Leave it off for combinable states. Nested state groups use their own parent's setting.

**Shift/Ctrl-click** pieces to add or remove them from a selection. The **Manipulate & organize** panel also offers **Select all pieces**, **Clear selection**, **Duplicate selection**, **Lock scenery**, **Unlock**, **Remove selected**. Drag selected pieces or use arrow keys to move the group; **R** rotates selected icons, **Ctrl+D** duplicates, and **Ctrl+C/V** copies/pastes selected pieces. Internal object links are copied when at least two selected members remain in the copied link. Group actions are atomic and use the existing undo system in Edit mode.

Locked placements can still be selected and inspected, but movement, rotation, and deletion are blocked until unlocked. A duplicate selection starts unlocked. With stacked pieces, the inspector's **Objects at this cell** picker selects any piece without moving the ones above it.

Select a library token and choose **Duplicate Selected** to copy that item and its descendants under the same parent, or **Duplicate whole hierarchy** to copy from its top-level ancestor, including sibling branches. Both create independent nested token and state definitions. Attachments to reusable parameters keep their shared definitions. **Level settings → Duplicate level** deep-copies placements, state overrides, locks, object links, and annotations into a new level while retaining references to the shared token definitions. The copy opens in a new tab and uses the current Level settings draft for its name and dimensions; the original level stays unchanged. Master card inventories and draw history remain shared by the project.

The canvas toolbar includes colored **Post-its** and the **Design Experiments** / **Design Challenges** decks. Notes are saved and shared even during private playtests. Each deck starts with 12 prompts and draws randomly without replacement, with independent history per room. Use **Review & edit inventories** to open the host's Card Studio. Master cards live in repository JSON files, while project exports contain notes and drawn-card history. See [Cards and notes](cards/README.md) for editing and usage details. Restart an already-running workshop server after installing this update, then refresh browsers.

1. The library opens in **Objects**, which shows whole token hierarchies with collapsible branches. **Tokens**, **Parameters**, and **Tags** provide focused catalogs; **All** includes every hierarchy and the tag catalog. Click **+** in Tokens to create a token with a name, pixel icon, description, tags, and color.
2. Use **+** in Parameters to create a reusable **Area of effect**, **Line Effect**, **Cone Effect**, **Rectangle Effect**, or **Cross Effect** definition. Adjust its cell range. Drag it onto a token to attach it; the definition stays in Parameters for reuse. Any token can contain other tokens; cycles are prevented.
3. Drag a library token onto a level cell, or click its **+** and then a cell. Its nested parameters come with it. The same definition can be placed many times.
4. Paint floors, walls, and GO path nodes with the left toolbar. Selecting **Floor (F)** expands a sub-panel with **Elevated**, **Ground**, and **Underground** variants. Ground is the default for existing maps; the chosen variant stays selected when returning to the floor painter. Nodes sit on top of any floor variant, preserving the floor beneath them. Repainting a floor keeps its nodes and connections; walls and Erase Tiles remove both layers. Adjacent path nodes connect automatically in both directions. **Erase connection (X)** breaks a link without removing either node; **Reconnect nodes (C)** restores it. With either tool, click a line (broken links appear dashed) or select two adjacent nodes. Hold and drag to paint tiles. Delete removes the selected piece.
5. Select a placed piece to see its rule, tags, children, and placement notes. Drag to move, press **R** to rotate 90°, or use arrow keys. Double-click a piece or library token to edit its definition. Definitions update all placements; notes belong to one placement.
6. Use **+** beside the level tabs to add levels. Level settings rename, resize, or delete the current level. To shrink a level, first erase tiles and remove pieces beyond the new bounds.
7. **Playtest** makes a temporary copy in your browser. Move, rotate, duplicate, annotate, or remove pieces manually. Open the backpack toolbar at the canvas's upper left to see the **Player inventory**. Drop objects from the library to add copies, or from the canvas to collect pieces (preserving their states and removing them from the board). Matching objects stack, with their quantity at the icon’s bottom right. Use + / − to adjust a stack; 0 displays as ∞ and supplies unlimited copies. Drag a stack onto the canvas to place one item; placing the last finite item removes that stack. Use × to discard a whole stack. Drop canvas pieces onto the **Graveyard** at the bottom left to remove them from play; expand it to inspect removed pieces or drag one back to restore it. Individual piece states are preserved in both trays. The backpack and graveyard follow you between levels in this playtest. Reset restores the starting layout and empties both trays. Returning to Edit discards playtest changes. Other participants keep editing the shared project.
8. **Project** exports/imports JSON, exports an inventory spreadsheet, loads an optional teaching example, or clears the room. Export before replacing an existing project. Imports are validated.

### Inventory spreadsheet export

In **Project → Export spreadsheet**, choose **Saved Edit design**, or during a playtest choose **Playtest starting layout** / **Current private playtest**, then **Download .xlsx**. Capture a private playtest before returning to Edit. Exporting does not modify the shared room. Saved-design exports require all changes to have finished saving; a concurrent room change asks you to review and retry.

The workbook opens in Excel and can be uploaded/imported into Google Sheets. It includes colored compact tabs, atomic definitions and tags, flattened recipes with linked ingredients and instances, every level's geometry and objects, editable challenge patterns, introductions, and game progression. Distinct effective placement states get separate recipes. Existing object links seed suggested challenge groups; confirm their description and gameplay type, add skill tags, and enter difficulty modifiers before interpreting scores. Unscored inputs remain incomplete rather than being treated as zero. Introductions initially follow first use in level order and can be edited in the sheet.

Each export creates a new workbook. Scores, sheet-only recipes/patterns, and planning notes edited in a workbook are not imported back or merged into later exports. Tags and multiple skills use portable text; native Google Sheets chip presentation can be applied after import. All source records are retained, with dynamically sized tables and at least 20 spare catalog rows. The six linked progression slots are a compact view; the Introductions tab retains the complete list. **Export Info** records snapshot kind, source revision, export time, and the complete project JSON in ordered chunks. Master card inventories remain in the repository.

Restart an already-running Workshop server and refresh the browser after installing the export feature. No dependencies, Google account integration, or build step are required.

Tags have a **name**, **rule / description**, and **color**. Create or edit them in the Tags tab, then reuse the same tag in multiple tokens. In the token editor, type in the tag search to attach an existing tag or choose **Create** to define and attach a new one without leaving the editor. Click an attached tag’s × to detach it from that token. You can also drag a tag from its tab onto a library token or a placed piece. Editing a tag updates all uses; deleting it detaches it everywhere. Tags on nested tokens stay with those token definitions. Existing projects and imports automatically migrate text labels into reusable tags.

Parameters work as shared definitions too. In a token or state editor, search **Parameters** to attach an existing definition, or choose **Create** to open the parameter editor and return with it attached. Your unfinished token fields are preserved. Click an attached parameter to edit its shared definition, or × to detach it. You can also create a parameter directly in the Parameters tab and choose **Nest inside** to attach it while keeping it reusable. Changes to its shape, range, rule, tags, color, and behavior update every use. Detaching a use or deleting its owner keeps the definition available; deleting the definition removes all its uses.

Closing an editor with unsaved changes offers **Save changes**, **Discard changes**, or **Keep editing**. This applies to tokens, parameters, states, tags, object links, post-its, and level settings, including Cancel, Escape, and clicks outside the editor. Saving validates the draft before closing; a nested parameter editor returns to the unfinished token. Closing or refreshing the browser tab also warns about unsaved drafts.

Click **↕** beside the library’s **+** to expand it through the sidebar’s available height, hiding the inspector and other sidebar panels. Click again to restore the layout. This preference is remembered on your device.

Select a token and click **Add state** to create a named state folder with a description, icon variant, tags, and its own nested contents. Use **Nest inside** in an editor (or drag in Objects/All) to put sub-tokens and parameters under that state. State folders must belong to a token or another state and cannot be placed independently.

Toggle states from the parent inspector or hierarchy. Disabled states keep their folder visible but hide their tags and descendants, remove their overlays, and hide any separate placements of those descendants. Enable the state to restore them. States combine independently; the last enabled state in the list supplies the parent icon, including any enabled nested state. Definition switches affect every placement; Playtest switches stay in its private copy and reset when returning to Edit. The example demonstrates a torch with Lit/Unlit states and a guard with Alive/Dead states.

Choose an icon, then select an **Icon variant** with a visual preview: creatures Alive/Dead; torch, fire, chandelier, and noise On/Off; door Closed/Open; lever Off/On; rock, wall, and bridge Intact/Broken; exit Active/Inactive; key Available/Used. The selected variant saves with the token or state. Variants change artwork; put behavioral parameters inside state folders to switch those as well. Existing v1 and v2 projects migrate without changing their saved hierarchy, tags, placements, or broken connections.

The workshop opens in **Light mode**, with cream panels, beige floor tiles, and blue selection accents. Use **Dark mode / Light mode** in the header to switch. Your choice is remembered on this device and does not change anyone else's view.

**Options**, immediately before **Share workshop**, includes:

- **Autosave every five minutes**, enabled by default. While the server runs, it backs up loaded rooms’ shared designs to JSON files such as `plague-tale-go-my-room-autosave_301026_1535.json`. The suffix uses the workshop computer’s local date and time (`ddmmyy_hhmm`), keeping successive five-minute backups separate. Disabling this option stops backup files; live room edits still save normally.
- **Default Save Folder**, initially the project's **Saved Projects** folder. Enter an absolute folder path or a path relative to the project directory. Backup settings are remembered by the server in `data/backup-options.json`. Folder changes require `localhost` on the workshop computer. The autosave and startup-loading checkboxes can be changed from local, LAN, or authenticated online sessions and apply to the workshop server.
- **When launching, load the most recent Saved Project in the Save Folder**, enabled by default. A new workshop room starts from the most recently modified valid `.json` project in that folder, including autosaves. Invalid files are skipped; an empty or missing folder starts a fresh design. Existing rooms retain their saved work. Turn this off to start new rooms with a fresh design.
- **UI Text scaling**, from **50% to 200%**, initially **100%**. Preview changes with the slider, then choose **Save options**. Cancel restores the previous scale. This preference is remembered per browser and scales text independently of board sprites.

Use **Project → Save project** on the workshop computer to save a manual JSON backup to the configured folder. **Export project** still downloads through the browser. Autosaves and manual folder saves contain the shared design; private playtest changes are excluded. Import a backup using **Project → Import project**. Restart an already-running server after installing this update.

Folders within the project are stored as relative paths, so moving the project to another computer keeps them portable. The default **Saved Projects** path is resolved on that computer. If a custom folder is missing or inaccessible at startup, the server falls back to **Saved Projects** and shows a message in Options. Shared participants use the host computer’s save folder; they do not need matching local directories.

Icons use a **32 × 32 pixel grid**, with crisp outlines, shading, and highlights. Alongside the original 17 icons, the catalogue includes **Cat, Sling, Dog, Crow, Lantern, Chest, Barrel, Crate, Rope, Ladder, Trap, and Bell**. Each has two variants: sitting/prowling cat, loaded/empty sling, standing/sitting dog, perched/flying crow, lit/unlit lantern, closed/open chest, intact/broken barrel, crate and ladder, coiled/hanging rope, armed/sprung trap, and idle/ringing bell. Five generic markers—**A square, B triangle, C hexagon, D circle, and E diamond**—offer filled lettered and outline variants.

### Visual parameters

**Cross Effect** draws a + centered on the token, including its cell. Arm length controls how many cells each of its four one-cell-wide arms reaches. It supports wall occlusion and overlap coloring like other parameters.

Use **Link objects (L)** in the canvas toolbar to connect two or more placed objects. Click each object to include or remove it, then **Create link**. Give the link a name, rule / description, and color; the editor also lets you change its members. Semi-transparent lines follow the objects as they move. The name label appears when any member is selected or **Show all parameters** is on. Click the label (or a link in a placed object's inspector) to inspect, edit, or **Delete link**. Delete/Backspace also removes a selected link. Links are saved with the level and included in exports and undo history. Removing a member keeps links with at least two remaining objects; smaller links are removed automatically. State rows show their chosen icon and variant.

Area of effect uses Manhattan distance: a **diamond** of grid cells around the placement. Line of sight is a **straight line** in its facing direction (up at 0°, right at 90°). Selecting a piece shows its own and all nested overlays. The eye button shows overlays for every placed token. Color and range belong to definitions; rotation belongs to placements.

Overlays are visual rulers and define the cells used by effect behaviours. Enable **Occluded by Walls** to clip an effect. Without assigned behaviours, play remains manual. You can still move and stack objects freely by hand; automated movement uses connected, free path nodes. Children travel as parameter definitions, not additional movable pieces.

### Playtest turns and behaviours

Select a token, state, or parameter in Edit mode and choose **Behaviours** in its inspector. **Move To** can be assigned to any of these; **Expand** and **Apply Effect** belong to an effect parameter. Parameter behaviours are shared by all attached uses. Place an effect under a state to gate it: inactive states and all their descendants do not act. A Move To assigned directly to a state moves the placed parent object while that state is active.

The horizontal toolbar appears in **Playtest**. **Start turn 1** resolves the first turn; **Next turn** resolves another. **Previous turn** restores the previous snapshot, including every level, object position, individual state, current move target, patrol direction, inventory, and graveyard. Next replays an existing future snapshot; changing pieces or settings after going back discards that future and resolves a new branch. Manual changes are captured when you navigate or save. Turn 0 is the layout before the first turn.

**Save sequence** downloads a separate JSON file containing all turn snapshots and the current position in the sequence. **Load sequence** validates and replaces your private playtest with that file, including its object definitions; it does not import it into the shared design. **Clear sequence** (or Reset) restores the starting layout, empties the trays, and returns to turn 0. Sequences support 200 turns and imports up to 50 MB. Save before leaving Playtest or refreshing. Notes and design cards remain shared room observations and are not rewound or imported by turn playback.

- **Expand:** at turn start, duplicate the placed object with its hierarchy, state overrides and placement properties onto existing path nodes highlighted by the effect. By default, skip nodes already containing the same object type. An optional stacking switch allows additional copies. New copies first act on the next turn. The 1,000 placements per level limit still applies; a turn exceeding it leaves the previous state intact.
- **Apply Effect:** choose eligible library object types (an empty selected list affects nothing), or Any object type. Uses the effect's current shape, rotation, facing and wall occlusion. The source and effect markers are excluded. Choose **Switch State**, **Send to Graveyard**, **Set Move Target**, or **Flush**.
- **Switch State:** choose an existing state ID from the suggestions, or enter a state name/key to match a state in each target's own hierarchy. Enable or disable it for that piece only. Enabling also enables ancestor states and respects exclusive sibling groups. Objects without that state are skipped.
- **Send to Graveyard:** remove matching objects in the area, retaining their individual states and targets in the graveyard. Drag them back to restore them. Links losing too many members are removed.
- **Set Move Target:** give matching objects a target of **Self** (the object carrying the effect), a custom position, or another specific canvas object. Object targets track their current position. The placement inspector also offers **Set move target** for initial/manual targets; Self there means stay in place.
- **Flush:** start with matching objects caught in the effect, then send each continuous chain of the same object type to the graveyard, even beyond the area. Connections use horizontal/vertical touching cells, including stacked instances; they do not require path nodes. Diagonals, gaps, inactive instances and different object types do not extend a chain. The source is excluded. Only the initial catch uses effect geometry and wall occlusion.
- **Move To:** move up to X free connected path nodes per turn (1–100). **Current Move Target** follows a shortest available path to the target; an occupied object target is approached to an adjacent free node. Missing or unreachable targets cause no movement. Active objects block movement; effect markers and inactive objects do not. Broken node connections are respected, locked scenery stays still, and Auto-facing follows each step.
- **Patrol Start / End:** choose a saved patrol, or match the placement's patrol color dot. Start/End chooses the initial destination; the object follows the saved node order back and forth, reversing at each endpoint. An off-route object first travels to the chosen endpoint. Disconnected or occupied route segments stop movement. Patrol progress survives turn navigation, save/load and copies of levels.

Use **⇅ Behaviour resolution order** in the canvas tools, or **Resolution order** in the inspector, to rearrange behaviours with ↑ / ↓. The order is saved with the project and can also be changed privately during Playtest. A fixed queue of existing placements resolves across all levels, top to bottom, then in saved placement order. State activity, positions and eligible objects are checked as each behaviour resolves, so an earlier state change or removal can suppress a later action. The **Resolution log** shows what ran and how many objects or nodes it affected.

Restart the workshop server and refresh browsers after installing this feature. Existing projects need no conversion; objects without behaviours retain manual play.

### Shortcuts

V select · F floor · N path node · W wall · E erase tiles · X erase connection · C reconnect · R rotate · Delete/Backspace remove · Esc deselect · / search · Ctrl+Z undo · Ctrl+Y or Ctrl+Shift+Z redo. Enter activates a focused grid cell or library row. Arrow keys move a selected placed token.

## Live classroom sharing

Each browser opens a welcome card: choose a nickname, one of seven original 64 × 64 silhouette avatars (Rat, Dog, Cat, Bird, Bathtub Duck, Agent 47, or Lara Croft), and a color. Your previous choices are prefilled on this device. Click your own avatar in the top strip to change them later.

The top strip shows participants in the current room. Colored cursors and nickname tags show where others are pointing on the same level, including across different zoom sizes. **Hide cursors** hides them on your device; use **Show cursors** to restore them. Cursors stay hidden during private playtests and dialogs. Presence is temporary, separate from saved projects, and disconnected participants expire after about 35–40 seconds if their browser cannot send a departure message. Cursor updates use long polling in both LAN and online sessions, independently of project saves.

For participants outside your local network, double-click **start-online.cmd**. It downloads the tunnel tool on first use and prints a temporary HTTPS room link, username, and session password. Keep the launcher open and your PC awake. See [Online sharing](ONLINE-SHARING.md) for setup, student distribution, and troubleshooting.

Click **Share workshop** for this computer's local-network address and room link. Students on the same LAN open that link. Keep the Node process running. Allow Node.js on your **private network** in Windows Firewall if asked. Networks with client isolation may prevent students reaching the server.

Edits are transmitted as individual actions and serialized on the server. Each browser immediately sees its own edit, then receives server updates using Server-Sent Events. Different simultaneous edits are retained; for edits to the same property, the last accepted action wins. Reconnection retries unsaved actions while the page stays open. The interface displays save/connection status. Do not close a tab with unsaved edits.

Project replacement (import, clear, example, undo/redo) requires an unchanged server revision. A stale replacement is rejected rather than overwriting collaborators. Undo history is local to a browser and is cleared if another participant has changed the project since that undo entry. Playtest is private to each browser.

Projects persist in **data/<room>.json** after each accepted edit. Back up this folder or export JSON. An exported project includes all levels, definitions and placement notes, excluding temporary playtests. Font loading uses Google Fonts when available, with system-font fallbacks; all functional assets are local.

The regular **start-workshop.cmd** mode is a **trusted local classroom tool** with no authentication, TLS, or permissions. Anyone who can reach that server and knows a room link can edit it. Do not expose that mode directly to the public internet. Use **start-online.cmd** for a password-protected HTTPS tunnel instead. Its password grants editing access to all rooms. Use separate room links to organize student groups. The regular LAN server listens on `0.0.0.0`; online mode listens only on `127.0.0.1`.

## Development and checks

For setup on another computer and the daily save/sync workflow, see [Working between PCs](WORKING-BETWEEN-PCS.md).

```powershell
node --test
```

Pure browser modules in `public/`; HTTP server uses only Node built-ins. No installation required. Stop the server with Ctrl+C. The original sprite art and application code are included in this folder. This is an unofficial educational fan project; it is not affiliated with the creators of A Plague Tale, Hitman GO, or Lara Croft GO.

The standalone-token drop target stays pinned below the library list while its rows scroll, including in the expanded library view. The **Show only definition** button next to **Expand library vertically** gives the definition inspector the sidebar space. Click it again to restore the library and organization controls. This view preference is remembered in the browser.

### Patrol paths

Choose **Patrol path** in the paint toolbar, create a patrol, choose its color, then click or drag over existing nodes in order. The first and last nodes show **S** and **E**; **Swap S / E** reverses the route. Select a patrol in the list to bring overlapping paths into focus. Each patrol has a visibility checkbox, and the toolbar can hide or show all patrols, including during playtest.

Select an object placement to assign its **Patrol color dot**, use the selected patrol's color, or remove the dot. The color belongs to that instance. **Show all parameters** remains available in playtest. Patrol edits and dots save with the project; changes made during playtest use its temporary private copy.
