// Two 90-minute blocks, with a ten-minute break between them.
export const workshopSteps = [
  {
    id: 'welcome', title: 'A shared starting point', minutes: 8, chapter: 'Create & explore',
    description: 'Small rules can lead to interesting decisions. Together, we’ll build a shared game system, turn it into four levels, and discover what happens when someone else plays.',
    tasks: ['Break a mechanic into its rules, states, and parameters.', 'Follow the loop: assemble, play, observe, and rethink.'],
    outcome: 'A shared question: what makes a player’s choices interesting?'
  },
  {
    id: 'demo', title: 'Meet the workbench', minutes: 10, chapter: 'Create & explore',
    description: 'Let’s take a small idea for a spin. Explore how a library definition becomes a placed object, and how its parameters shape the space around it.',
    tasks: ['Place, move, and inspect an object; explore a parameter or state.', 'Try manual Playtest and leave a post-it observation.'],
    outcome: 'Everyone can place an idea, change it, and try it out.'
  },
  {
    id: 'building-blocks', title: 'Make the building blocks', minutes: 15, chapter: 'Create & explore',
    description: 'One room, one shared collection of possibilities. Each person contributes a building block and connects it to someone else’s idea.',
    tasks: ['Give each contribution a clear rule and useful starting values.', 'Describe its states and how it interacts with another building block.'],
    outcome: 'A small common library with a contribution from everyone.'
  },
  {
    id: 'review', title: 'Bring the pieces together', minutes: 15, chapter: 'Create & explore',
    description: 'Show what each piece does, then see what happens when the pieces meet. A shared understanding now gives everyone more freedom to build later.',
    tasks: ['Demonstrate each contribution; let someone else explain it back.', 'Resolve one combined situation, then choose what to keep, clarify, or set aside.'],
    outcome: 'Rules we can interpret consistently, plus an interesting question to test.'
  },
  {
    id: 'library-pass', title: 'Polish the shared rules', minutes: 7, chapter: 'Create & explore',
    description: 'Give the common library a quick finishing pass. Clear up the questions that would get in the way of building and playing.',
    tasks: ['Clarify timing, interactions, and starting parameter values.', 'Agree how a turn resolves and how a level is completed.'],
    outcome: 'A usable shared system, ready for four different interpretations.'
  },
  {
    id: 'levels', title: 'Build your level', minutes: 20, chapter: 'Create & explore',
    description: 'Use the shared ingredients to create your own short challenge. A small level with one meaningful decision gives us plenty to explore.',
    tasks: ['Write an intention: “I want the player to … by …”.', 'Build a clear start, a reachable goal, and a challenge that takes about two minutes to try.'],
    outcome: 'Four playable levels, each with a clear design intention.'
  },
  {
    id: 'first-playtest', title: 'Put it to the test', minutes: 15, chapter: 'Create & explore',
    description: 'Time to see the levels through someone else’s eyes. Work in two pairs, taking turns to play and observe on the same screen.',
    tasks: ['Play once, then swap player and observer.', 'Record a decision, a hesitation, and an unexpected action before suggesting a fix.'],
    outcome: 'A real player observation for every level.'
  },
  {
    id: 'break', title: 'Take a breather', minutes: 10, chapter: 'A little pause',
    description: 'A little space for fresh eyes. Stretch, grab a drink, and leave the workbench ready for the next round.',
    tasks: ['Check that the latest edits and observations are saved.', 'Come back ready to compare what we intended with what we observed.'],
    outcome: 'A fresh start for the second half.'
  },
  {
    id: 'analysis', title: 'Read the playtest', minutes: 10, chapter: 'Test & rethink',
    description: 'What did the player actually do? Compare the experience you intended with the moments you observed, and turn a problem into a question we can investigate.',
    tasks: ['Share one observation and a possible explanation.', 'Identify whether the issue concerns a rule, a value, the layout, or the information available.'],
    outcome: 'One focused revision goal for each level.'
  },
  {
    id: 'shared-revision', title: 'Refine the building blocks', minutes: 10, chapter: 'Test & rethink',
    description: 'Some fixes belong in a level; others belong in the shared system. Choose the smallest useful change and look for its effects across the room.',
    tasks: ['Agree which shared rules or parameters need a revision.', 'Recheck affected levels: changing a library definition changes all its uses.'],
    outcome: 'A deliberate improvement, with its wider effects understood.'
  },
  {
    id: 'exchange', title: 'A fresh pair of eyes', minutes: 5, chapter: 'Test & rethink',
    description: 'Exchange levels and inherit a new design to explore. Bring its intention with you, then draw a Design Experiment Card to find your next question.',
    tasks: ['Hand over the intention, current rules, and one known issue.', 'Restate the inherited idea and make a prediction before changing it.'],
    outcome: 'A new level to investigate and a clear experiment to try.'
  },
  {
    id: 'experiment', title: 'Try an experiment', minutes: 20, chapter: 'Test & rethink',
    description: 'Let the card turn a hunch into a comparison. Try the starting version, make a deliberate change, and see whether the result matches your prediction.',
    tasks: ['Record the baseline, prediction, and chosen change.', 'Play again; note what happened and decide what to keep, undo, or explore next.'],
    outcome: 'An observation that helps explain what the design is doing.'
  },
  {
    id: 'challenge-card', title: 'A new design challenge', minutes: 3, chapter: 'Test & rethink',
    description: 'One shared constraint, four possible answers. Draw a Design Challenge Card together and find a small, achievable version of its brief.',
    tasks: ['Read the constraint and agree the scope.', 'Name what a successful response would let the player do.'],
    outcome: 'A clear creative brief for the next round.'
  },
  {
    id: 'redesign', title: 'Make it your own', minutes: 12, chapter: 'Test & rethink',
    description: 'Respond to the challenge using the level you inherited. Keep its intention in view while looking for a fresh possibility in the existing ingredients.',
    tasks: ['Make one focused redesign that meets the card’s constraint.', 'Explain what you preserved, what you changed, and what a player should now experience.'],
    outcome: 'A small, playable response to the shared challenge.'
  },
  {
    id: 'second-playtest', title: 'Test the changes', minutes: 8, chapter: 'Test & rethink',
    description: 'Give the new version a quick turn in someone else’s hands. Look for evidence of the decision or understanding you hoped to create.',
    tasks: ['Take turns playing the revised levels in pairs.', 'Leave one concrete observation about the effect of the redesign.'],
    outcome: 'A useful check of the change, and a question worth carrying forward.'
  },
  {
    id: 'debrief', title: 'Share what changed', minutes: 12, chapter: 'Test & rethink',
    description: 'Bring the discoveries back to the group. A prediction that failed or an unexpected solution can tell us as much as a design that worked first time.',
    tasks: ['Share one before-and-after example and the observation behind it.', 'Discuss what changed your mind, and what you would investigate next.'],
    outcome: '“I used to assume … After observing … I would now … because …”'
  },
  {
    id: 'inventory', title: 'Keep the workshop', minutes: 10, chapter: 'Test & rethink',
    description: 'Save the work and read the design from another angle. Follow an ingredient through an assembled mechanic, a challenge, and a level in the spreadsheet.',
    tasks: ['Save the project and update the key inventory entries and observations.', 'Compare the difficulty estimates with playtest notes, then keep an Excel copy of the sheet.'],
    outcome: 'A shared design record we can revisit, explain, and build on.'
  }
];

export const initialWorkshop = () => ({ stepId: workshopSteps[0].id, remainingMs: workshopSteps[0].minutes * 60000, endsAt: null, revision: 0 });

export function validateWorkshop(state) {
  const step = workshopSteps.find(step => step.id === state?.stepId);
  if (!step || !Number.isSafeInteger(state.remainingMs) || state.remainingMs < 0 || state.remainingMs > step.minutes * 60000 ||
      (state.endsAt !== null && (!Number.isSafeInteger(state.endsAt) || state.endsAt < 0)) ||
      !Number.isSafeInteger(state.revision) || state.revision < 0) throw Error('Invalid workshop progress.');
  return { stepId: state.stepId, remainingMs: state.remainingMs, endsAt: state.endsAt, revision: state.revision };
}

export function workshopRemaining(state, now = Date.now()) {
  return state.endsAt === null ? state.remainingMs : Math.max(0, Math.min(state.remainingMs, state.endsAt - now));
}

// Server time anchors the countdown; no per-second writes or browser-owned deadlines.
export function updateWorkshop(state, command, now = Date.now()) {
  validateWorkshop(state);
  const index = workshopSteps.findIndex(step => step.id === state.stepId);
  const next = { ...state, revision: state.revision + 1 };
  if (command === 'step.next' || command === 'step.previous') {
    const step = workshopSteps[index + (command === 'step.next' ? 1 : -1)];
    if (!step) throw Error('There are no more steps in that direction.');
    return { ...next, stepId: step.id, remainingMs: step.minutes * 60000, endsAt: null };
  }
  if (command === 'timer.start') {
    if (state.endsAt !== null && workshopRemaining(state, now) > 0) return state;
    const remainingMs = workshopRemaining(state, now) || workshopSteps[index].minutes * 60000;
    return { ...next, remainingMs, endsAt: now + remainingMs };
  }
  if (command === 'timer.pause') return { ...next, remainingMs: workshopRemaining(state, now), endsAt: null };
  if (command === 'timer.reset') return { ...next, remainingMs: workshopSteps[index].minutes * 60000, endsAt: null };
  throw Error('Unknown workshop command.');
}
