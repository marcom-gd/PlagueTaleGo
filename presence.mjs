import { validProfile } from './public/avatars.js';
import { randomUUID } from 'node:crypto';

export function createPresence({ now = Date.now, ttl = 35000 } = {}) {
  const members = new Map(), listeners = new Set();
  const sessionId = randomUUID();
  let revision = 0;
  function snapshot() {
    return { sessionId, revision, participants: [...members.values()].map(({ seen, ...member }) => member) };
  }
  function changed() { revision++; for (const listener of [...listeners]) listener(snapshot()); }
  function prune() {
    let removed = false;
    for (const [id, member] of members) if (now() - member.seen > ttl) { members.delete(id); removed = true; }
    if (removed) changed();
  }
  function update(data) {
    if (!data || typeof data.id !== 'string' || !/^[\w-]{16,80}$/.test(data.id)) throw new Error('Invalid participant ID.');
    if (data.leave === true) { if (members.delete(data.id)) changed(); return snapshot(); }
    if (!validProfile(data)) throw new Error('Choose a nickname, avatar, and color.');
    let cursor = null;
    if (data.cursor !== null && data.cursor !== undefined) {
      const c = data.cursor;
      if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || c.x < 0 || c.x > 1 || c.y < 0 || c.y > 1 || typeof c.levelId !== 'string' || c.levelId.length > 80) throw new Error('Invalid cursor.');
      cursor = { x: c.x, y: c.y, levelId: c.levelId };
    }
    const member = { id: data.id, nickname: data.nickname.trim(), avatar: data.avatar, color: data.color, cursor };
    const previous = members.get(data.id);
    const different = !previous || JSON.stringify({ ...previous, seen: undefined }) !== JSON.stringify(member);
    members.set(data.id, { ...member, seen: now() });
    if (different) changed();
    return snapshot();
  }
  return { snapshot, update, prune, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}
