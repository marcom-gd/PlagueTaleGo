import {activeDescendants, assetIsActive, isState} from './model.js';
import {placementBehaviours} from './behaviour-areas.js';

export const outcomeMessages = {
  gameOver: "Amicia was Go'ed. Clear Sequence to Restart",
  levelComplete: "Amicia is good to GO! Level Complete."
};

// Outcomes belong to the level being played, even though turns resolve all levels.
export function gameOutcome(project, graveyard = [], levelId = project.levels[0]?.id) {
  const level = project.levels.find(l => l.id === levelId);
  if (!level) return null;
  if (!project.assets.some(a => a.name.trim().toLowerCase() === 'amicia' || a.behaviours?.some(b => b.enabled && ['gameOver','levelComplete'].includes(b.type)))) return null;
  const result = type => ({type, levelId});
  const isAmicia = instance => project.assets.find(a => a.id === instance.assetId)?.name.trim().toLowerCase() === 'amicia';
  const dead = instance => activeDescendants(project, instance.assetId, instance).some(a => isState(a) && a.name.trim().toLowerCase() === 'dead');
  if (graveyard.some(stack => stack.items.some(i => (i.sourceLevelId == null || i.sourceLevelId === levelId) && isAmicia(i)))) return result('gameOver');
  let complete = false;
  for (const owner of level.instances) {
    if (!assetIsActive(project, owner.assetId, owner)) continue;
    if (isAmicia(owner) && dead(owner)) return result('gameOver');
    for (const {behaviour: b} of placementBehaviours(project, owner)) {
      if (b.type === 'gameOver') return result('gameOver');
      if (b.type === 'levelComplete' && level.instances.some(i => i.id !== owner.id && i.x === owner.x && i.y === owner.y && i.assetId === b.targetAssetId && assetIsActive(project, i.assetId, i))) complete = true;
    }
  }
  // A death on the same turn takes precedence over reaching the exit.
  return complete ? result('levelComplete') : null;
}

export function validateOutcome(outcome, project) {
  if (outcome !== undefined && outcome !== null && (!Object.hasOwn(outcomeMessages, outcome.type) || !project.levels.some(l => l.id === outcome.levelId))) throw Error('Invalid turn outcome.');
}
