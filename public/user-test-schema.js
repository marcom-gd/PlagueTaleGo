export const testEmotions = [
  ['frustrated', '😤', 'Frustrated'], ['excited', '🤩', 'Excited'],
  ['eureka', '💡', 'Eureka!'], ['surprised', '😮', 'Surprised'],
  ['confused', '😵‍💫', 'Confused'], ['goodTime', '😊', 'Good time'],
  ['proud', '🥹', 'Proud'], ['relaxed', '😌', 'Relaxed'], ['bored', '🥱', 'Bored']
];

export function validateTestFeedback(input) {
  if (!input || typeof input !== 'object') throw Error('Please complete your feedback.');
  const rating = (key, max) => {
    if (!Number.isInteger(input[key]) || input[key] < 1 || input[key] > max) throw Error('Please answer all three rating questions.');
    return input[key];
  };
  if (!Array.isArray(input.emotions) || !input.emotions.length || input.emotions.length > testEmotions.length ||
      new Set(input.emotions).size !== input.emotions.length || input.emotions.some(id => !testEmotions.some(e => e[0] === id))) throw Error('Choose at least one feeling.');
  if (typeof input.friction !== 'string' || input.friction.length > 8000 ||
      (input.noFriction !== true && !input.friction.trim())) throw Error('Tell us what got in your way, or choose “Nothing got in my way”.');
  if (typeof input.thoughts !== 'string' || input.thoughts.length > 8000) throw Error('Keep extra thoughts under 8,000 characters.');
  if (!['sandbox', 'userTest'].includes(input.mode)) throw Error('Invalid playtest mode.');
  if (!['automatic', 'manual'].includes(input.completion)) throw Error('Invalid completion.');
  return {
    experience: rating('experience', 5), difficulty: rating('difficulty', 5), personalChallenge: rating('personalChallenge', 10),
    emotions: [...input.emotions], noFriction: input.noFriction === true,
    friction: input.noFriction === true ? '' : input.friction.trim(), thoughts: input.thoughts.trim(),
    mode: input.mode, usedSandbox: input.usedSandbox === true, completion: input.completion,
    turns: Number.isSafeInteger(input.turns) && input.turns >= 0 ? input.turns : null,
    elapsedSeconds: Number.isFinite(input.elapsedSeconds) && input.elapsedSeconds >= 0 ? Math.round(input.elapsedSeconds) : null
  };
}
