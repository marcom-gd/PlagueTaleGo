import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { validateTestFeedback } from './public/user-test-schema.js';
import { validProfile } from './public/avatars.js';

// Each unguessable tester ID is a private resume key. No listing endpoint exposes it.
export function userTestStore(directory) {
  const queues = new Map();
  function serial(key, work) {
    const result = (queues.get(key) || Promise.resolve()).catch(() => {}).then(work);
    queues.set(key, result);
    result.finally(() => { if (queues.get(key) === result) queues.delete(key); }).catch(() => {});
    return result;
  }
  return async function request({ room, id, command, body, project, revision }) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id || '')) throw Error('Invalid tester resume key.');
    const folder = path.join(directory, room), target = path.join(folder, `${id}.json`);
    return serial(target, async () => {
      let session;
      try { session = JSON.parse(await readFile(target, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const persist = async next => {
        await mkdir(folder, { recursive: true });
        await writeFile(target + '.tmp', JSON.stringify(next, null, 2) + '\n');
        await rename(target + '.tmp', target);
        return next;
      };
      if (command === 'start') {
        if (session) return session;
        const snapshot=structuredClone(project);
        snapshot.levels=snapshot.levels.filter(level=>level.hideFromPlaytest!==true);
        if(!snapshot.levels.length)throw Error('No levels are available for User Test. Uncheck “Hide from Playtest” in Level settings, then restart the User Test launcher.');
        return persist({ version: 1, id, room, startedAt: new Date().toISOString(), sourceRevision: revision,
          project: snapshot, profile: null, results: [] });
      }
      if (!session) throw Error('Start your test before saving feedback.');
      if (command !== 'feedback') throw Error('Unknown User Test command.');
      if (typeof body.submissionId !== 'string' || !/^[\w-]{16,80}$/.test(body.submissionId)) throw Error('Missing feedback receipt ID.');
      // An interrupted response may be retried, including after a server restart.
      const previous = session.results.find(result => result.submissionId === body.submissionId);
      if (previous) {
        if (previous.levelId !== body.levelId) throw Error('This receipt belongs to a different level.');
        return session;
      }
      const next = session.project.levels[session.results.length];
      if (!next || next.id !== body.levelId) throw Error('Complete the current level’s feedback before moving on. Refresh to resume your latest progress.');
      if (!validProfile(body.profile)) throw Error('Choose your nickname and avatar before saving.');
      const feedback = validateTestFeedback(body.feedback);
      const profile = { nickname: body.profile.nickname.trim(), avatar: body.profile.avatar, color: body.profile.color };
      return persist({ ...session, profile, results: [...session.results, {
        submissionId: body.submissionId, levelId: next.id, levelName: next.name,
        levelNumber: session.results.length + 1, savedAt: new Date().toISOString(), profile, ...feedback
      }] });
    });
  };
}
