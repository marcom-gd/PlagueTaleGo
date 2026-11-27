import { avatars, avatarSvg, profileColors, validProfile } from './avatars.js';
import { testEmotions } from './user-test-schema.js';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export function initPresence({ endpoint, getView, uid, userTest = false }) {
  const id = uid(), strip = document.querySelector('#participants'), layer = document.querySelector('#live-cursors');
  const dialog = document.querySelector('#welcome-dialog'), toggle = document.querySelector('#cursor-toggle');
  let profile, cursor = null, participants = [], revision = -1, sending = false, dirty = false, joined = false, sessionId;
  let hidden = false, lastSent = 0, retryTimer, pointer = null, rosterKey = ''; 
  let reaction = null, lastView = '';
  try { hidden = localStorage.getItem('workshop-hide-cursors') === 'true'; } catch {}
  function setToggle() {
    toggle.setAttribute('aria-pressed', String(!hidden));
    toggle.textContent = hidden ? '↖ Show cursors' : '↖ Hide cursors';
    layer.hidden = hidden || userTest;
    toggle.hidden = userTest;
  }
  setToggle();
  toggle.onclick = () => { hidden = !hidden; setToggle(); try { localStorage.setItem('workshop-hide-cursors', String(hidden)); } catch {} };

  function accept(data) {
    if (data.sessionId !== sessionId) { sessionId = data.sessionId; revision = -1; }
    if (data.revision < revision) return;
    revision = data.revision; participants = data.participants;
    document.querySelector('#peer-count').textContent = participants.length;
    const nextRosterKey = JSON.stringify(participants.map(({id,nickname,avatar,color}) => ({id,nickname,avatar,color})));
    if (nextRosterKey !== rosterKey) {
    rosterKey = nextRosterKey;
    strip.innerHTML = participants.map(p => `<button class="participant-avatar ${p.id === id ? 'is-you' : ''}" style="--person-color:${p.color}" title="${escape(p.nickname)}${p.id === id ? ' (you) · Edit profile' : ''}" aria-label="${escape(p.nickname)}${p.id === id ? ', you. Edit profile' : ''}" ${p.id === id ? 'data-my-profile' : 'aria-disabled="true"'}>${avatarSvg(p.avatar)}<span class="participant-tooltip">${escape(p.nickname)}${p.id === id ? ' · you' : ''}</span></button>`).join('');
    strip.querySelector('[data-my-profile]')?.addEventListener('click', () => welcome(profile));
    }
    const keep = new Set();
    for (const p of participants) {
      if (p.id === id) continue;
      keep.add(p.id);
      let element = [...layer.children].find(el => el.dataset.person === p.id);
      if (!element) {
        element = document.createElement('div'); element.className = 'remote-cursor'; element.dataset.person = p.id;
        element.innerHTML = '<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M2 2L21 17L12 18L8 26Z"/></svg><span></span>';
        layer.append(element);
      }
      element.style.setProperty('--person-color', p.color);
      element.querySelector('span').textContent = p.nickname;
    }
    for (const child of [...layer.children]) if (!keep.has(child.dataset.person)) child.remove();
    positionCursors();
    renderLevelAvatars();
  }
  function renderLevelAvatars() {
    for (const tab of document.querySelectorAll('#level-tabs [data-level]')) {
      const host = tab.querySelector('.level-avatars');
      if (!host) continue;
      const here = participants.filter(p => p.play && p.levelId === tab.dataset.level);
      const visibleReaction = p => p.reaction?.expiresAt > Date.now() ? p.reaction : null;
      const key = JSON.stringify(here.map(p => [p.id, p.nickname, p.avatar, p.color, visibleReaction(p)?.eventId]));
      if (host.dataset.roster === key) continue;
      host.dataset.roster = key;
      host.innerHTML = here.map(p => {
        const emotion = testEmotions.find(e => e[0] === visibleReaction(p)?.emotion);
        return `<span class="level-player" style="--person-color:${p.color}" title="${escape(p.nickname)}${p.id === id ? ' (you)' : ''}" aria-label="${escape(p.nickname)} playing here">${avatarSvg(p.avatar)}${emotion ? `<span class="level-reaction" role="img" aria-label="${emotion[2]}" style="animation-delay:-${Math.max(0,3500-(p.reaction.expiresAt-Date.now()))}ms">${emotion[1]}</span>` : ''}</span>`;
      }).join('');
    }
  }
  async function watch() {
    while (joined) {
      try {
        const response = await fetch(`${endpoint}/presence?since=${revision}`, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('Presence unavailable');
        accept(await response.json());
      } catch { await new Promise(resolve => setTimeout(resolve, 2000)); }
    }
  }
  async function send() {
    if (!joined || sending || !dirty) return;
    const delay = 120 - (Date.now() - lastSent);
    if (delay > 0) { clearTimeout(retryTimer); retryTimer = setTimeout(send, delay); return; }
    sending = true; dirty = false; lastSent = Date.now();
    try {
      const view = getView();
      const response = await fetch(`${endpoint}/presence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...profile, cursor: userTest ? null : cursor, levelId: view.finished ? null : view.levelId, play: view.play && !view.finished, reaction }), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Presence unavailable');
      accept(await response.json());
    } catch { dirty = true; lastSent = Date.now() + 1800; }
    finally { sending = false; if (dirty) send(); }
  }
  function update() { dirty = true; send(); }

  function welcome(saved) {
    const draft = validProfile(saved) ? { ...saved } : { nickname: '', avatar: 'rat', color: profileColors[Math.floor(Math.random() * profileColors.length)] };
    dialog.innerHTML = `<form class="welcome-card"><div class="welcome-sparkles" aria-hidden="true">✧ · ✦ · ✧</div><div class="welcome-preview" style="--person-color:${draft.color}">${avatarSvg(draft.avatar)}</div><div class="eyebrow">A LITTLE INTRODUCTION</div><h2>${joined ? 'Your workshop face.' : 'Hello, little game designer.'}</h2><p>${joined ? 'Make yourself at home. Your crew will see your new look.' : 'Every good idea starts with a curious creature.<br>Pick yours, then come build with us.'}</p><label class="field-label" for="welcome-nickname">What should we call you?</label><input id="welcome-nickname" name="nickname" maxlength="32" required placeholder="Your nickname" autocomplete="nickname" value="${escape(draft.nickname)}"><fieldset><legend>Choose your companion</legend><div class="avatar-choices">${avatars.map(([key, label]) => `<label class="avatar-choice" style="--person-color:${draft.color}"><input type="radio" name="avatar" value="${key}" ${key === draft.avatar ? 'checked' : ''}><span class="avatar-choice-icon">${avatarSvg(key)}</span><span>${label}</span></label>`).join('')}</div></fieldset><fieldset><legend>And a splash of color</legend><div class="profile-colors">${profileColors.map(color => `<label style="--swatch:${color}"><input type="radio" name="color" aria-label="Avatar color ${color}" value="${color}" ${color === draft.color ? 'checked' : ''}><span></span></label>`).join('')}<label class="custom-profile-color" title="Pick a custom color"><input type="color" aria-label="Custom avatar color" value="${draft.color}"></label></div></fieldset><button class="primary welcome-join" type="submit">${joined ? 'Save my look' : 'Let’s make something'} <span aria-hidden="true">↗</span></button><small>Your nickname and look are shared with this room.</small>${joined ? '<button class="subtle welcome-cancel" type="button">Keep my look</button>' : ''}</form>`;
    const form = dialog.querySelector('form');
    if (userTest && !joined) {
      dialog.querySelector('h2').textContent = 'Hello, little explorer.';
      dialog.querySelector('h2 + p').textContent = 'Pick your companion, play at your own pace, and tell us how it felt. Your crew’s companions will keep you company along the way.';
      dialog.querySelector('.welcome-join').textContent = 'Let’s play →';
    }
    form.addEventListener('input', event => {
      if (event.target.name === 'avatar') draft.avatar = event.target.value;
      if (event.target.name === 'color' || event.target.type === 'color') {
        draft.color = event.target.value;
        form.querySelector('input[type=color]').value = draft.color;
        if (event.target.type === 'color') form.querySelectorAll('[name=color]').forEach(input => { input.checked = input.value === draft.color; });
      }
      dialog.querySelector('.welcome-preview').innerHTML = avatarSvg(draft.avatar);
      dialog.querySelectorAll('[style*="--person-color"]').forEach(el => el.style.setProperty('--person-color', draft.color));
    });
    form.onsubmit = event => {
      event.preventDefault(); draft.nickname = form.elements.nickname.value.trim();
      if (!validProfile(draft)) { form.elements.nickname.setCustomValidity('Please enter a nickname.'); form.elements.nickname.reportValidity(); return; }
      profile = draft;
      try { localStorage.setItem('workshop-profile', JSON.stringify(profile)); } catch {}
      const first = !joined; joined = true; dialog.close(); update(); if (first) watch();
      document.dispatchEvent(new Event('workshop-profile-ready'));
    };
    form.elements.nickname.oninput = () => form.elements.nickname.setCustomValidity('');
    dialog.querySelector('.welcome-cancel')?.addEventListener('click', () => dialog.close());
    if (!dialog.open) dialog.showModal();
  }
  dialog.addEventListener('cancel', event => { if (!joined) event.preventDefault(); });

  function positionCursors() {
    const view = getView(), rect = document.querySelector('#board').getBoundingClientRect(), clip = document.querySelector('#board-viewport').getBoundingClientRect();
    for (const element of layer.children) {
      const c = participants.find(p => p.id === element.dataset.person)?.cursor;
      const x = c ? rect.left + c.x * rect.width : 0, y = c ? rect.top + c.y * rect.height : 0;
      element.hidden = !c || view.play || c.levelId !== view.levelId || x < clip.left || x > clip.right || y < clip.top || y > clip.bottom || document.querySelector('dialog[open]') !== null;
      if (!element.hidden) element.style.transform = `translate(${x}px,${y}px)`;
    }
  }
  function track() {
    positionCursors();
    renderLevelAvatars();
    if (!joined) return;
    const view = getView(), rect = document.querySelector('#board').getBoundingClientRect(), clip = document.querySelector('#board-viewport').getBoundingClientRect();
    const nextView = JSON.stringify([view.levelId, view.play, view.finished]);
    if (nextView !== lastView) { lastView = nextView; update(); }
    if (reaction && Date.now() - reaction.sentAt > 3500) { reaction = null; update(); }
    const inside = !userTest && pointer && !view.play && !document.hidden && !document.querySelector('dialog[open]') && pointer.x >= Math.max(rect.left, clip.left) && pointer.x <= Math.min(rect.right, clip.right) && pointer.y >= Math.max(rect.top, clip.top) && pointer.y <= Math.min(rect.bottom, clip.bottom);
    const next = inside ? { x: Math.round((pointer.x - rect.left) / rect.width * 10000) / 10000, y: Math.round((pointer.y - rect.top) / rect.height * 10000) / 10000, levelId: view.levelId } : null;
    if (JSON.stringify(next) !== JSON.stringify(cursor)) { cursor = next; update(); }
  }
  document.addEventListener('pointermove', event => { pointer = { x: event.clientX, y: event.clientY }; });
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) pointer = null; });
  window.addEventListener('blur', () => { pointer = null; });
  setInterval(track, 80);
  setInterval(() => { if (joined) update(); }, 10000);
  window.addEventListener('pagehide', () => { if (joined) navigator.sendBeacon(`${endpoint}/presence`, new Blob([JSON.stringify({ id, leave: true })], { type: 'application/json' })); });
  window.addEventListener('pageshow', () => { if (joined) update(); });
  let saved;
  try { saved = JSON.parse(localStorage.getItem('workshop-profile')); } catch {}
  welcome(saved);
  return { getProfile: () => profile, renderLevelAvatars,
    react(emotion) {
      if (!testEmotions.some(e => e[0] === emotion)) return;
      reaction = { emotion, eventId: uid(), sentAt: Date.now() }; update();
    }
  };
}
