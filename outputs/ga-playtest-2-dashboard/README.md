# Plague Tale GO — playtest 02 notebook

Interactive, self-contained report for the nine JSON exports in `User Test Feedback/ga-playtest-2`.

Open `dist/index.html` directly in a browser. Everything needed for the dashboard is embedded; no server, network, or install is required. `dist/playtest-data.json` contains every response with exact saved comments, using report-local player and level keys. Live tester resume keys, submission IDs, and project snapshots are excluded.

To regenerate after the source exports change, run `node build-report.mjs` from this folder. Run `node --test report.test.mjs` to check analytical calculations, exact comment preservation, filtered rendering, and drilldowns. For a local HTTP preview, run `node preview.mjs` and visit `http://127.0.0.1:4317`.

The report covers all 15 levels and six matched Validé/_B pairs, includes user and level drilldowns, and exports JSON and CSV. Global filters select all/eight full sessions and include/exclude any sandbox use. Exact comments remain in their original languages. Game overs, retries, and reset counts are unavailable because the exports did not record them. Turns are the final timeline cursor, not cumulative actions. See “Behind the numbers” in the report for definitions and interpretation limits.

The live source’s feedback schema and turn/timer handling were checked in `public/user-test-schema.js`, `public/user-test-flow.js`, and `public/app.js` in the workshop repository. This report does not change the game or its telemetry.
