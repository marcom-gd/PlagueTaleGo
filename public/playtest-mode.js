import { isState, isParameter, nodesConnected } from './model.js';

export const playtestModes = { sandbox: 'Sandbox Mode', userTest: 'User Test Mode' };

export function canMoveInPlaytest(project, instance, mode = 'sandbox') {
  if (mode !== 'userTest') return true;
  const object = project.assets.find(a => a.id === instance?.assetId);
  return !!object && !isState(object) && !isParameter(object) && object.canBeMovedInUserTest === true;
}

// Called only for manual edits. Turn resolution and Use behaviours stay unrestricted.
// Compare the whole result so group edits and tray transfers cannot bypass the mode.
export function checkPlaytestMovement(before, after, mode = 'sandbox') {
  if (mode !== 'userTest') return;
  const requireMovable = instance => {
    if (!canMoveInPlaytest(before, instance, mode)) {
      const name = before.assets.find(a => a.id === instance.assetId)?.name || 'This object';
      throw Error(`${name} cannot be moved in User Test Mode. Enable “Can Be Moved in User Test” in its object definition.`);
    }
  };
  for (const level of before.levels) {
    const next = after.levels.find(l => l.id === level.id);
    for (const instance of level.instances) {
      const moved = next?.instances.find(i => i.id === instance.id);
      if (!moved || ['x', 'y', 'rotation', 'direction'].some(key => moved[key] !== instance[key])) requireMovable(instance);
      if (moved && (moved.x !== instance.x || moved.y !== instance.y) &&
          !nodesConnected(level, `${instance.x},${instance.y}`, `${moved.x},${moved.y}`)) {
        throw Error('In User Test Mode, move objects one step to an adjacent connected node.');
      }
    }
  }
  for (const level of after.levels) {
    const previous = before.levels.find(l => l.id === level.id);
    for (const instance of level.instances) {
      if (!previous?.instances.some(i => i.id === instance.id)) requireMovable(instance);
    }
  }
}
