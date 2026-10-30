# Plague Tale GO · Atomic Parameters Workshop

A local web tabletop for teaching game design through atomic parameters. Original pixel sprites, plain-language token rules, and no automated game logic. Requires **Node.js 20+**; there are no package dependencies and no build step.

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

**Shift/Ctrl-click** pieces to add or remove them from a selection. The **Manipulate & organize** panel also offers **Select all pieces**, **Clear selection**, **Duplicate selection**, **Lock scenery**, **Unlock**, **Remove selected**, and **Duplicate level**. Drag selected pieces or use arrow keys to move the group; **R** rotates selected icons, **Ctrl+D** duplicates, and **Ctrl+C/V** copies/pastes selected pieces. Internal object links are copied when at least two selected members remain in the copied link. Group actions are atomic and use the existing undo system in Edit mode.

Locked placements can still be selected and inspected, but movement, rotation, and deletion are blocked until unlocked. A duplicate selection starts unlocked. With stacked pieces, the inspector's **Objects at this cell** picker selects any piece without moving the ones above it.

Select a library token and choose **Duplicate whole hierarchy** to copy its states, nested tokens, and parameters into independent definitions. **Duplicate level** deep-copies placements, state overrides, locks, object links, and annotations into a new level while retaining references to the shared token definitions. Master card inventories and draw history remain shared by the project.

The canvas toolbar includes colored **Post-its** and the **Design Experiments** / **Design Challenges** decks. Notes are saved and shared even during private playtests. Each deck starts with 12 prompts and draws randomly without replacement, with independent history per room. Use **Review & edit inventories** to open the host's Card Studio. Master cards live in repository JSON files, while project exports contain notes and drawn-card history. See [Cards and notes](cards/README.md) for editing and usage details. Restart an already-running workshop server after installing this update, then refresh browsers.

1. The library opens in **Objects**, which shows whole token hierarchies with collapsible branches. **Tokens**, **Parameters**, and **Tags** provide focused catalogs; **All** includes every hierarchy and the tag catalog. Click **+** in Tokens to create a token with a name, pixel icon, description, tags, and color.
2. Use **+** in Parameters to create an **Area of effect** or **Line of sight** parameter. Adjust its cell range. Drag it onto another token in the library to nest it. Any token can contain other tokens; cycles are prevented.
3. Drag a library token onto a level cell, or click its **+** and then a cell. Its nested parameters come with it. The same definition can be placed many times.
4. Paint floors, walls, and GO path nodes with the left toolbar. Adjacent path nodes connect automatically in both directions. **Erase connection (X)** breaks a link without removing either node; **Reconnect nodes (C)** restores it. With either tool, click a line (broken links appear dashed) or select two adjacent nodes. Hold and drag to paint tiles. Erase tiles removes tiles; Delete removes the selected piece.
5. Select a placed piece to see its rule, tags, children, and placement notes. Drag to move, press **R** to rotate 90°, or use arrow keys. Double-click a piece or library token to edit its definition. Definitions update all placements; notes belong to one placement.
6. Use **+** beside the level tabs to add levels. Level settings rename, resize, or delete the current level. To shrink a level, first erase tiles and remove pieces beyond the new bounds.
7. **Playtest** makes a temporary copy in your browser. Move, rotate, duplicate, annotate, or remove pieces manually. Open the backpack toolbar at the canvas's upper left to see the **Player inventory**. Drop objects from the library to add copies, or from the canvas to collect pieces (preserving their states and removing them from the board). Drag inventory items back onto the canvas to place them, or use × to discard them. The backpack follows you between levels in this playtest. Reset restores the starting layout and empties the backpack. Returning to Edit discards playtest changes. Other participants keep editing the shared project.
8. **Project** exports/imports JSON, exports an inventory spreadsheet, loads an optional teaching example, or clears the room. Export before replacing an existing project. Imports are validated.

### Inventory spreadsheet export

In **Project → Export spreadsheet**, choose **Saved Edit design**, or during a playtest choose **Playtest starting layout** / **Current private playtest**, then **Download .xlsx**. Capture a private playtest before returning to Edit. Exporting does not modify the shared room. Saved-design exports require all changes to have finished saving; a concurrent room change asks you to review and retry.

The workbook opens in Excel and can be uploaded/imported into Google Sheets. It includes colored compact tabs, atomic definitions and tags, flattened recipes with linked ingredients and instances, every level's geometry and objects, editable challenge patterns, introductions, and game progression. Distinct effective placement states get separate recipes. Existing object links seed suggested challenge groups; confirm their description and gameplay type, add skill tags, and enter difficulty modifiers before interpreting scores. Unscored inputs remain incomplete rather than being treated as zero. Introductions initially follow first use in level order and can be edited in the sheet.

Each export creates a new workbook. Scores, sheet-only recipes/patterns, and planning notes edited in a workbook are not imported back or merged into later exports. Tags and multiple skills use portable text; native Google Sheets chip presentation can be applied after import. All source records are retained, with dynamically sized tables and at least 20 spare catalog rows. The six linked progression slots are a compact view; the Introductions tab retains the complete list. **Export Info** records snapshot kind, source revision, export time, and the complete project JSON in ordered chunks. Master card inventories remain in the repository.

Restart an already-running Workshop server and refresh the browser after installing the export feature. No dependencies, Google account integration, or build step are required.

Tags have a **name**, **rule / description**, and **color**. Create or edit them in the Tags tab, then reuse the same tag in multiple tokens. In the token editor, type in the tag search to attach an existing tag or choose **Create** to define and attach a new one without leaving the editor. Click an attached tag’s × to detach it from that token. You can also drag a tag from its tab onto a library token or a placed piece. Editing a tag updates all uses; deleting it detaches it everywhere. Tags on nested tokens stay with those token definitions. Existing projects and imports automatically migrate text labels into reusable tags.

Select a token and click **Add state** to create a named state folder with a description, icon variant, tags, and its own nested contents. Use **Nest inside** in an editor (or drag in Objects/All) to put sub-tokens and parameters under that state. State folders must belong to a token or another state and cannot be placed independently.

Toggle states from the parent inspector or hierarchy. Disabled states keep their folder visible but hide their tags and descendants, remove their overlays, and hide any separate placements of those descendants. Enable the state to restore them. States combine independently; the last enabled state in the list supplies the parent icon, including any enabled nested state. Definition switches affect every placement; Playtest switches stay in its private copy and reset when returning to Edit. The example demonstrates a torch with Lit/Unlit states and a guard with Alive/Dead states.

Choose an icon, then select an **Icon variant** with a visual preview: creatures Alive/Dead; torch, fire, chandelier, and noise On/Off; door Closed/Open; lever Off/On; rock, wall, and bridge Intact/Broken; exit Active/Inactive; key Available/Used. The selected variant saves with the token or state. Variants change artwork; put behavioral parameters inside state folders to switch those as well. Existing v1 and v2 projects migrate without changing their saved hierarchy, tags, placements, or broken connections.

The workshop opens in **Light mode**, with cream panels, beige floor tiles, and blue selection accents. Use **Dark mode / Light mode** in the header to switch. Your choice is remembered on this device and does not change anyone else's view.

Icons use a **32 × 32 pixel grid**, with crisp outlines, shading, and highlights. Alongside the original 17 icons, the catalogue includes **Cat, Sling, Dog, Crow, Lantern, Chest, Barrel, Crate, Rope, Ladder, Trap, and Bell**. Each has two variants: sitting/prowling cat, loaded/empty sling, standing/sitting dog, perched/flying crow, lit/unlit lantern, closed/open chest, intact/broken barrel, crate and ladder, coiled/hanging rope, armed/sprung trap, and idle/ringing bell. Five generic markers—**A square, B triangle, C hexagon, D circle, and E diamond**—offer filled lettered and outline variants.

### Visual parameters

Use **Link objects (L)** in the canvas toolbar to connect two or more placed objects. Click each object to include or remove it, then **Create link**. Give the link a name, rule / description, and color; the editor also lets you change its members. Semi-transparent lines follow the objects as they move. The name label appears when any member is selected or **Show all parameters** is on. Click the label (or a link in a placed object's inspector) to inspect, edit, or **Delete link**. Delete/Backspace also removes a selected link. Links are saved with the level and included in exports and undo history. Removing a member keeps links with at least two remaining objects; smaller links are removed automatically. State rows show their chosen icon and variant.

Area of effect uses Manhattan distance: a **diamond** of grid cells around the placement. Line of sight is a **straight line** in its facing direction (up at 0°, right at 90°). Selecting a piece shows its own and all nested overlays. The eye button shows overlays for every placed token. Color and range belong to definitions; rotation belongs to placements.

These overlays are visual rulers. Walls do not clip them. The application does not enforce movement, collision, turns, light, pickup rules, enemy behavior, or victories. Overlapping pieces are allowed; the most recently placed piece is on top. Move or remove it to reach the others. Children travel as parameter definitions, not additional movable pieces.

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
