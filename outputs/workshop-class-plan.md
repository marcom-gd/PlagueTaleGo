# Atomic Parameters Workshop — facilitator plan

Four students, one shared app room, four individual levels. Two 90-minute teaching blocks, with a break between them. The break is additional to the 180 minutes below.

## Purpose

Students move repeatedly between rules, parameters, assembled mechanics, spatial challenges, and observed player behavior. They build a common vocabulary, take individual responsibility for a level, then learn to understand and revise another designer's work.

Opening statement:

> Today we will build a small shared game system, use it to create four different challenges, and test our assumptions about how those challenges work. You will also inherit someone else's level and improve it without losing its intention.

By the end, each student should be able to:

- Separate an object, a rule, a state, a parameter, and a placed instance.
- Decompose a mechanic into useful parts and explain how their interaction creates player decisions.
- Distinguish a change to shared rules from a change to a particular level layout.
- State a design intention and identify the player skill it asks for.
- Describe an observed problem without assuming its cause.
- Make a prediction, change something deliberately, and compare results.
- Revise another person's level while preserving or explicitly renegotiating its intention.
- Use an inventory and difficulty estimates to support reasoning, and calibrate them against playtests.

## Before class

- Prepare one shared room and four named level tabs, one per student.
- Prepare a tiny demonstration level separately, or as a fifth tab. Do not load an example over students' work later.
- Test student access to the room and the Google Sheet.
- Prepare the common foundation: turn order, player action budget, valid movement, interaction timing, enemy resolution, victory, failure, and restart. Introduce the relevant parts before building.
- Prepare a fallback rule for ambiguous situations: the facilitator makes and records one temporary ruling so the test can continue.
- Keep levels small enough for a first attempt to take about two minutes. A small grid, one objective, and one central challenge are sufficient.
- Limit the initial library to approximately four to six usable assembled elements. All four students contribute; they do not need four separate systems.
- Prepopulate identifiers, relationships, and formulas in the Sheet where possible. Students should spend their time making and explaining decisions.
- Review the card inventories. For timed draws, use prompts that fit one existing microlevel; scope broad prompts to a sketch or one encounter.
- Prepare a baseline project export before substantial shared revisions, and another before the handoff.
- Prepare six to eight simple slides or instruction screens. Show the relevant brief during work, rather than presenting the entire deck at the start.

## First block — 90 minutes

| Minutes | Activity | Facilitator action | Evidence of learning |
| --- | --- | --- | --- |
| 0–8 | Explain the workshop | Demonstrate the loop: decompose → assemble → build → test → analyze → revise/decompose again. State the final deliverables. | Students can explain what is being investigated. |
| 8–18 | App demonstration | Place an element, reveal its parameters and states, change one value, move a placement, enter Playtest, add an observation, return to Edit. Explain manual rule resolution. | Students distinguish the shared definition, level placement, and private playtest. |
| 18–33 | Create the common building blocks | Give each student ownership of one contribution. Have them agree interactions with each other. | Every student contributes a documented rule, state, parameter, or assembled element. |
| 33–48 | Review the library together | Run the structured review below. Test one interaction, not just four individual objects. | Ambiguities and interaction problems become explicit. |
| 48–55 | Revise and agree the starting library | Fix blockers, simplify overlaps, agree parameter names and initial values. | A shared system everyone can interpret. |
| 55–75 | Build four levels individually | Each student states an intention and constructs one short challenge from the common library. | Four solvable microlevels with distinct design intentions. |
| 75–90 | First playtest | A and B test each other's levels; C and D do the same. Use two six-minute rounds and three minutes to complete notes. | One observed test per level, with the designer watching. |

### Common building-block brief

> Together, build a small escape system. Give the player a goal, an obstacle, and a way to influence that obstacle. Each student must contribute one building block and explain how it interacts with another person's contribution.

Possible ownership: player action, threat, player tool, and environmental interaction. These are responsibilities for getting the system working, rather than isolated design territories.

For each contribution, document:

1. Its function in one sentence.
2. Its trigger or condition and resulting effect.
3. Its parameters and units.
4. Its states, if needed, and what causes transitions.
5. Its interaction with at least one other building block.
6. One uncertainty that needs testing.

Do not equate a token icon with a complete mechanic. A guard becomes a gameplay system through its detection, behavior, player response, and consequences.

### The 15-minute group review

**Minutes 0–8: four two-minute explanations.** Each student gives approximately one minute to demonstrate a contribution; another student restates it and asks one concrete question. Rotate the person who restates.

**Minutes 8–12: one combined micro-situation.** Place two or three elements together and resolve a player action step by step. Ask:

- Can we all predict the next state?
- What happens first when two rules trigger?
- Which parameter creates or removes a player option?
- Does a visual overlay match the intended rule?
- Is the player making a decision, or simply following an unavoidable sequence?

**Minutes 12–15: decide.** Mark proposals Keep, Clarify, or Park. Keep what supports the exercise; clarify blockers; park additions that consume time without improving the current system. Write the agreed values and unresolved question.

Review gate: everyone can resolve one turn consistently, every key rule has a usable initial value, the goal is reachable, and no unresolved timing rule prevents testing. Keep at least one genuine design uncertainty to investigate later.

### Individual level brief

> Use the agreed library to create one short, solvable level with one meaningful decision. State what you want the player to understand and which skill they should use. Include a starting position, a goal, and a clear failure condition if relevant.

Use this intention sentence:

> I want the player to ___ by ___; I expect ___ to be the difficult decision.

During this phase, students control placements, paths, facing, and layout in their own tabs. Proposals to change the shared library wait for the group revision slot.

### First playtest protocol

- Both participants open the same level. One plays; the other observes and resolves manual world actions as necessary. Switch levels and roles for the second round.
- Private Playtest copies do not synchronize piece movements. If both need to see the same run, use one visible screen or one shared display for that pair.
- Explain the agreed rules, then let the tester make decisions. Avoid hints about the intended solution.
- If clarification is necessary, record the question. Do not sacrifice a usable test to absolute silence.
- Record the first attempt before further retries. Note prior familiarity and any repeat attempt; improvement can come from learning.
- Each designer captures one successful decision, one hesitation or unexpected action, and one concrete problem or open question.

Example observation: “The tester crossed the exposed tile before checking the guard's facing.”

Example inference: “The direction indicator may be too easy to miss.”

These are different statements. Keep both visible.

## Break

## Second block — 90 minutes

Times below restart at zero after the break.

| Minutes | Activity | Facilitator action | Evidence of learning |
| --- | --- | --- | --- |
| 0–10 | Analyze the first tests | Give each student two minutes to report intention, observation, suspected cause, and proposed fix; use the remainder to compare patterns. | Students separate evidence from explanation. |
| 10–20 | Revise the common system | Select one or two common problems, make agreed changes, and check a previously solvable situation in each affected level. | Students distinguish local and systemic fixes and notice side effects. |
| 20–25 | Exchange levels and draw Experiment Cards | A exchanges with C; B exchanges with D. Record the handoff and the baseline. Each student draws one experiment. | Students understand inherited intent and state a prediction. |
| 25–45 | Run the experiments | Include baseline test, deliberate change, replay, observation, and a keep/revert/try-again decision. | A recorded comparison, not just an edited level. |
| 45–48 | Draw one common Design Challenge Card | Reveal a shared creative constraint. Define a version small enough for the remaining time. | Students translate a brief into a bounded design task. |
| 48–60 | Redesign the inherited levels | Preserve the inherited intention or explicitly record why it changes. | A new solution within an added constraint. |
| 60–68 | Quick validation | Return to the A/B and C/D test pairs. Use two four-minute rounds, including a short test and immediate note. Keep the level scope tiny. | One observation supporting or challenging the redesign. |
| 68–80 | Debrief | Each student shares one finding, then discuss the themes below. | Students generalize beyond their own level. |
| 80–90 | Save, export, and read the inventory | Save the project, complete selected spreadsheet records, demonstrate what the inventory reveals, and download the Google Sheet as Excel if required. | A readable design record tied to actual observations. |

### Analysis and shared mechanics revision

Each student reports:

> I intended ___. I observed ___. I suspect ___. I propose changing ___ because ___. I will check whether ___.

Classify each problem before selecting a fix:

- **Rule or model:** the behavior is ambiguous, contradictory, or missing.
- **Parameter:** the existing behavior may work with a different value.
- **Layout:** placement or connectivity produces the issue.
- **Communication:** the player cannot perceive or understand relevant information.

Do not automatically solve a level-specific issue by changing a shared rule. If a shared edit is justified, all four designers check its effect on their levels. A library revision should prompt the question: “What else did we just change?”

### Handoff and Experiment Cards

Keep the surprise in the exchange and card reveal. State the learning objective, deliverables, and available time clearly.

The outgoing designer supplies a short handoff:

> Intended experience: ___. Current rules/values: ___. Known issue: ___. Observation so far: ___.

The incoming designer restates the intention before editing. Record the original author and reviser. Export the baseline project before experiments; do not rely on private playtest positions as a saved design version.

Each student draws one Experiment Card. A useful experiment record is:

> Baseline → prediction → deliberate change → observation → interpretation → next decision.

Examples from the current inventory:

- **Change one thing:** vary one measurable parameter while keeping other conditions stable.
- **What is doing the work?:** remove one ingredient and identify which decision disappears.
- **Double it. Halve it.:** investigate whether numeric change produces a proportional effect.
- **One plus one:** test two ingredients separately and together to identify an interaction.

For cards with more than two conditions, use the existing baseline and scope the encounter to a few moves. One small experiment is enough. Keep a card if its question is useful even when its prediction fails.

Shared definitions require coordination. For independent experiments that need different values, create separate clearly named experimental definitions and place them only in the inherited level. Alternatively, agree one common parameter experiment for the whole class. Avoid four unannounced edits to the same definition.

Treat repeat play as a source of evidence and a limitation: the same tester may improve through practice. Do not interpret a few classroom attempts as a measured universal difficulty rating.

### Design Challenge Card

The experiment asks, “What happens if we change this?” The design challenge asks, “What can we make within this constraint?”

Draw one card for the whole room so the four solutions can be compared. Short candidates in the current inventory include:

- **Harder, same cast:** increase demand without adding enemies or rules.
- **One tile matters:** change one spatial relationship to alter the best strategy.
- **Fair warning:** make a threat understandable before commitment.
- **Unexpected partners:** produce a new decision from two existing ingredients.

If a broader card is drawn, scope it explicitly. For **Teach, practise, combine**, sketch the three moments and implement one; do not require three complete levels in twelve minutes.

Give each student a compact success criterion:

> My change meets the constraint because ___. A tester should now ___. I will look for ___.

## Notes, learning checkpoints, and deliverables

Use the app's persistent post-its for quick records. Suggested labels: INTENTION, OBSERVATION, QUESTION, CHANGE. Labeling is more important than color.

App behavior checked for this plan:

- Library definitions are shared across levels; changing one updates its placements.
- Placed objects and geometry belong to their level.
- Playtest piece changes are private and discarded on return to Edit.
- Post-its and card history stay shared and saved during Playtest.
- Rules and game outcomes are interpreted manually.
- Current app export downloads project JSON. Automatic app-to-spreadsheet export is not implemented in the checked code.

Expected deliverables:

- One agreed common mechanic library, with contributions from all four students.
- Four small levels with design intentions and original authors.
- At least one first-round observation per level.
- One experiment record per student on an inherited level.
- Four small responses to the common Design Challenge, with a brief validation note.
- One saved project and an updated, selected inventory in the spreadsheet.

The learning sequence is:

| Stage | What students should learn | A question that reveals understanding |
| --- | --- | --- |
| Decomposition | A visible object can contain several independent behaviors, conditions, and values. | “Which part could we change without changing the others?” |
| Assembly | Interactions can create decisions absent from each ingredient alone. | “What does the combination ask the player to do?” |
| Shared review | Rules need a consistent interpretation, including timing and edge cases. | “Do we all resolve this action the same way?” |
| Level building | Spatial arrangement changes player options even when mechanics stay fixed. | “What choice exists here, and what makes it meaningful?” |
| Playtesting | Player behavior may contradict designer intention. | “What did the tester actually do?” |
| Diagnosis | An observation is evidence; its cause is a hypothesis. | “What else could explain that hesitation?” |
| Revision | Local and shared changes have different consequences. | “Which other situations must we recheck?” |
| Experiment | A deliberate comparison can support, reject, or complicate a prediction. | “What changed besides our chosen variable?” |
| Handoff | Understanding another design precedes improving it. | “Which intention did you preserve?” |
| Design challenge | Constraints can lead to different viable solutions with existing ingredients. | “How did you meet the brief?” |
| Inventory | Documentation makes composition and progression inspectable; scores remain estimates. | “What can the sheet explain, and what still requires play?” |

## Debrief — 12 minutes

Give each student 90 seconds to explain a before/after example. Use the remaining six minutes to compare findings.

Choose three or four questions:

- Which prediction failed, and what did it teach you?
- Which interaction produced something you had not planned?
- When did the same mechanic create different demands in different layouts?
- Which problem required a shared rule change, and which needed only a local edit?
- What did another designer understand or change that you had missed?
- Did changing a numeric value produce a proportional change in challenge?
- Which observation would justify another revision?

Finish with one sentence per student:

> I used to assume ___. After observing ___, I would now ___ because ___.

## Spreadsheet showcase — final 10 minutes

Use the workbook as the record of the design reasoning. Do not attempt to complete every technical table live.

1. **Save/export the app project (2 minutes).** Confirm edits are saved. Export JSON for the actual room state, including levels, definitions, notes, and draw history.
2. **Complete selected spreadsheet entries (3 minutes).** Record the agreed mechanics, one representative challenge per level, intention, skill demand, and a useful observation/revision. Use prepared inventory rows; otherwise discuss one representative example rather than transcribing the room under time pressure.
3. **Read across the views (3 minutes).** Follow an atom into an assembled element, then a challenge and a level. Compare two levels using the same ingredients. Ask where the scoring agrees or disagrees with the playtest.
4. **Keep the workbook (2 minutes).** Download the Google Sheet as Microsoft Excel if desired. If an app-to-spreadsheet export is implemented before class, test it beforehand and substitute it for the prepared/manual inventory step.

Avoid promising automatic data transfer in the current app. Keep manual playtest observations distinct from formula-derived difficulty estimates.

## If time becomes tight

Protect the first playtest, the experiment comparison, and the debrief. Reduce map size and the number of mechanics, scope the Design Challenge to one visible edit, or demonstrate a prepared spreadsheet record. Four compact levels and clear observations are sufficient.

## Suggested presentation

1. The workshop question and learning loop.
2. One mechanic decomposed and reassembled.
3. Shared-room working rules and manual playtest basics.
4. Common library brief and group review checklist.
5. Individual level brief and playtest protocol.
6. Experiment record and handoff instructions, revealed at the relevant time.
7. The common Design Challenge and its time limit.
8. Debrief questions and the inventory view.

Keep slides short. Use the app for demonstrations and leave the current brief visible while students work.
