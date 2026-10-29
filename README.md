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

1. The library starts empty. Click **+** to create a token with a name, one of 17 original pixel icons, a description, tags, and color.
2. Create an **Area of effect** or **Line of sight** token. Adjust its cell range. Drag it onto another token in the library to nest it. Any token can contain other tokens; cycles are prevented.
3. Drag a library token onto a level cell, or click its **+** and then a cell. Its nested parameters come with it. The same definition can be placed many times.
4. Paint floors, walls, and GO path nodes with the left toolbar. Adjacent path nodes connect automatically. Hold and drag to paint. Erase removes tiles; Delete removes the selected piece.
5. Select a placed piece to see its rule, tags, children, and placement notes. Drag to move, press **R** to rotate 90°, or use arrow keys. Double-click a piece or library token to edit its definition. Definitions update all placements; notes belong to one placement.
6. Use **+** beside the level tabs to add levels. Level settings rename, resize, or delete the current level. To shrink a level, first erase tiles and remove pieces beyond the new bounds.
7. **Playtest** makes a temporary copy in your browser. Move, rotate, duplicate, annotate, or remove pieces manually. Reset restores this copy. Returning to Edit discards playtest changes. Other participants keep editing the shared project.
8. **Project** exports/imports JSON, loads an optional teaching example, or clears the room. Export before replacing an existing project. Imports are validated.

Icons: torch, rock, kid, girl, guard, rat, chandelier, door, exit, area of effect, line of sight, lever, wall cube, key, fire, bridge, noise.

### Visual parameters

Area of effect uses Manhattan distance: a **diamond** of grid cells around the placement. Line of sight is a **straight line** in its facing direction (up at 0°, right at 90°). Selecting a piece shows its own and all nested overlays. The eye button shows overlays for every placed token. Color and range belong to definitions; rotation belongs to placements.

These overlays are visual rulers. Walls do not clip them. The application does not enforce movement, collision, turns, light, pickup rules, enemy behavior, or victories. Overlapping pieces are allowed; the most recently placed piece is on top. Move or remove it to reach the others. Children travel as parameter definitions, not additional movable pieces.

### Shortcuts

V select · F floor · N path node · W wall · E erase tiles · R rotate · Delete/Backspace remove · Esc deselect · / search · Ctrl+Z undo · Ctrl+Y or Ctrl+Shift+Z redo. Enter activates a focused grid cell or library row. Arrow keys move a selected placed token.

## Live classroom sharing

Click **Share workshop** for this computer's local-network address and room link. Students on the same LAN open that link. Keep the Node process running. Allow Node.js on your **private network** in Windows Firewall if asked. Networks with client isolation may prevent students reaching the server.

Edits are transmitted as individual actions and serialized on the server. Each browser immediately sees its own edit, then receives server updates using Server-Sent Events. Different simultaneous edits are retained; for edits to the same property, the last accepted action wins. Reconnection retries unsaved actions while the page stays open. The interface displays save/connection status. Do not close a tab with unsaved edits.

Project replacement (import, clear, example, undo/redo) requires an unchanged server revision. A stale replacement is rejected rather than overwriting collaborators. Undo history is local to a browser and is cleared if another participant has changed the project since that undo entry. Playtest is private to each browser.

Projects persist in **data/<room>.json** after each accepted edit. Back up this folder or export JSON. An exported project includes all levels, definitions and placement notes, excluding temporary playtests. Font loading uses Google Fonts when available, with system-font fallbacks; all functional assets are local.

This is a **trusted local classroom tool** with no authentication, TLS, or permissions. Anyone who can reach the server and knows a room link can edit it. Do not expose it to the public internet. Use separate room links for student groups. The server listens on `0.0.0.0` for LAN access.

## Development and checks

For setup on another computer and the daily save/sync workflow, see [Working between PCs](WORKING-BETWEEN-PCS.md).

```powershell
node --test
```

Pure browser modules in `public/`; HTTP server uses only Node built-ins. No installation required. Stop the server with Ctrl+C. The original sprite art and application code are included in this folder. This is an unofficial educational fan project; it is not affiliated with the creators of A Plague Tale, Hitman GO, or Lara Croft GO.
