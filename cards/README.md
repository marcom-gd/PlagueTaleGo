# Design card inventories

## Floating canvas tools

Use **Hide sidebar / Show sidebar** beside the Edit/Playtest controls to collapse the library and expand the canvas. Use **Hide tools / Show tools** at the canvas's upper-right corner to independently hide or restore the floating toolbar. Both preferences are remembered on your device. New levels do not automatically place decks or cards. In the toolbar, click **Review experiments / Review challenges** to review a deck, or drag the same control onto the canvas to place it. Dragging it again moves or restores that level's existing deck, including after it was hidden; the deck visibility category is also re-enabled. Previously placed decks and cards remain saved with the level.

The toolbar now floats on the right of the canvas. Choose a paper color and drag **Post-it** onto any part of the canvas, including outside the board grid. Drag notes and cards freely; double-click notes, numbered steps, or question pins to edit. Drag **Arrow**, **Step**, or **Question** from the toolbar to create annotations. Drag an arrow's endpoint handle to change its length and direction. Floating positions do not snap to cells or constrain level resizing.

Each deck floats on the canvas. Drag its body to move it; click its top-right draw button to draw a random card. The card stays on the canvas and can be dragged separately. Inventories are cached in the browser, draws appear synchronously, and saving happens in the background. The server still rejects duplicate draws if two participants happen to choose the same remaining card simultaneously; the losing browser rolls back that draw and can draw again.

Use the minus button to hide an individual item. **Visibility** toggles post-its, arrows, steps, questions, decks, and cards separately; **Restore hidden items** restores individually hidden items. **Projector view** hides the header, library, and editing controls while keeping the board and chosen floating items visible. Its exit button stays in the top-right corner.


The app's two master inventories live here, rather than inside any room or exported workshop:

- `experiments.json`: deliberate changes, predictions, tests, and observations.
- `challenges.json`: creative constraints for building encounters and progression.

Each starts with 12 cards. Each room independently saves its drawn-card history. All levels in a room share that history. Draws use the local cached inventory and exclude drawn IDs; the server validates and saves them in the background. Concurrent claims for the same card cannot both succeed. An exhausted deck stays empty until someone chooses **Return all cards**. Resetting one deck does not affect the other.

## Review and edit

Open **Review & edit inventories** from either deck in the workshop, or visit `http://localhost:3000/cards.html` on the host computer. The Card Studio previews every card, lets you edit its title, task, and reflection prompt, and supports adding and removing cards. **Save inventory** writes the corresponding JSON file in this folder. These edits are ordinary repository changes that you can review with Git.

The editor saves only from localhost in the regular LAN server mode. Students opening the editor over the LAN, and online sessions, can review the collection. The host can always edit these files directly in a text editor, including for online sessions. Reopen a workshop deck to refresh its inventory preview; future draws read the files without a server restart. Conflicting editor saves are rejected so another editor's changes are preserved; keep a copy of your edits before reloading.

## File format

Each file is a JSON object with `id`, `name`, `description`, and a `cards` array. A card has:

```json
{
  "id": "change-one-thing",
  "title": "Change one thing",
  "task": "Choose one measurable parameter. Predict, change, and test.",
  "reflection": "What changed for the player?"
}
```

Keep card IDs stable when editing wording: a drawn card remains out of the deck. Give a new card a new ID using lowercase letters, numbers, and hyphens. Removing a card stops future draws; previously drawn cards keep a snapshot of their original wording. Empty inventories are allowed. Deck limits are 300 cards, 120 characters per title, 2,000 per task, and 1,000 per reflection prompt.

## Post-its

Choose a paper color, then drag **Post-it** from the floating toolbar onto the canvas. Type a note and save. Drag its body to move it; double-click to edit. Focus a floating item and press Delete to remove it. Press P to focus the creation control.

Notes belong to a level, are shared immediately, and are included in project exports. Notes added or edited during a private playtest remain saved when returning to Edit or resetting the playtest. Piece movements still stay private. Card draws and deck resets are also shared in playtests.
