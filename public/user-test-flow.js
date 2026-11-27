import { testEmotions, validateTestFeedback } from './user-test-schema.js';
import { avatarSvg } from './avatars.js';
import { uid } from './model.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export function userTestFlow({ endpoint, room, onLevel, onComplete, getProfile, react, getRun }) {
  const key = `user-test-resume:${room}`;
  let id;
  try { id = localStorage.getItem(key); } catch {}
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id || '')) id = uid();
  try { localStorage.setItem(key, id); } catch {}
  let session = null, starting = false, pending = false, draft = null;
  const dialog = document.createElement('dialog');
  dialog.className = 'test-feedback-dialog';
  dialog.setAttribute('aria-labelledby', 'test-feedback-title');
  dialog.addEventListener('cancel', event => event.preventDefault());
  document.body.append(dialog);
  const banner = document.createElement('div');
  banner.className = 'test-loading';
  banner.innerHTML = '<p>Waking up your little adventure…</p><button hidden>Try again</button>';
  document.body.append(banner);
  banner.querySelector('button').onclick = () => start();
  const draftKey = () => `${key}:${id}:feedback`;
  const storeDraft = () => { try { localStorage.setItem(draftKey(), JSON.stringify(draft)); } catch {} };
  async function request(command, body = {}) {
    const response = await fetch(`${endpoint}/user-test/${id}/${command}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Your feedback could not be saved. Please try again.');
    return data;
  }
  function resume() {
    const next = session.project.levels[session.results.length];
    if (!next) { onComplete(session); showThanks(); return; }
    onLevel(session.project, next.id);
    try { draft = JSON.parse(localStorage.getItem(draftKey())); } catch { draft = null; }
    if (draft?.levelId === next.id) { pending = true; showFeedback(); }
    else draft = null;
  }
  async function start() {
    if (starting || session) return;
    starting = true;
    banner.querySelector('button').hidden = true;
    try { session = await request('start'); banner.remove(); resume(); }
    catch (error) { banner.querySelector('p').textContent = error.message; banner.querySelector('button').hidden = false; }
    finally { starting = false; }
  }
  function showThanks() {
    if (!getProfile()) return;
    dialog.innerHTML = `<section class="test-feedback test-thanks"><div class="test-mascot">${avatarSvg('rat')}</div><div class="eyebrow">EVERY LITTLE THOUGHT COUNTS</div><h2 id="test-feedback-title">That’s a wrap, brave little explorer!</h2><p>You played ${session.results.length} level${session.results.length === 1 ? '' : 's'}, shared your thoughts, and made one very small rat very proud.</p><p class="test-saved">✓ All your feedback is safely saved on the host computer.</p><p>You can close this tab. Thank you for playing.</p></section>`;
    if (!dialog.open) dialog.showModal();
  }
  function showFeedback() {
    if (!getProfile()) return;
    const number = session.results.length + 1, total = session.project.levels.length;
    const level = session.project.levels[number - 1];
    const radios = (name, max, star) => Array.from({ length: max }, (_, i) => `<label class="test-rating-choice"><input type="radio" name="${name}" value="${i + 1}" required ${draft[name] === i + 1 ? 'checked' : ''}><span>${star ? '★' : i + 1}</span><span class="visually-hidden">${i + 1}${star ? ' stars' : ''}</span></label>`).join('');
    dialog.innerHTML = `<form class="test-feedback">
      <div class="test-feedback-intro"><div class="test-mascot" aria-hidden="true">${avatarSvg('rat')}</div><div><div class="eyebrow">A TINY PIT STOP · ${number} / ${total}</div><h2 id="test-feedback-title">You did the thing. Now spill the beans!</h2><p><strong>${escape(level.name)}</strong> is in the bag. Our tiny feedback rat is all ears.</p></div></div>
      <p class="test-privacy">Your answers are saved privately on the host computer with your nickname. Only your emoji reactions are shared live. Answer each question to continue.</p>
      <fieldset><legend>How was the experience?</legend><div class="test-rating test-stars">${radios('experience', 5, true)}</div><div class="test-scale-ends"><span>1 · Dreadful!</span><span>5 · Superb!</span></div></fieldset>
      <fieldset><legend>How difficult was this level?</legend><div class="test-rating">${radios('difficulty', 5, false)}</div><div class="test-scale-ends"><span>1 · Very easy</span><span>5 · Very hard</span></div></fieldset>
      <fieldset><legend>With what you know about the game’s rules so far, how challenging did it feel?</legend><label class="visually-hidden" for="test-personal-challenge">Challenge for you, from 1 to 10</label><input id="test-personal-challenge" name="personalChallenge" type="range" min="1" max="10" step="1" value="${draft.personalChallenge || 5}"><div class="test-scale-ends"><span>1 · Too easy for me</span><output id="test-challenge-value">${draft.personalChallenge || 'Move the slider to answer'}</output><span>10 · Too hard for me</span></div></fieldset>
      <fieldset><legend>What feelings came along for the ride?</legend><small>Pick as many as you like. Your crew will see these float above your avatar.</small><div class="test-emotions">${testEmotions.map(([id, emoji, label]) => `<label><input type="checkbox" name="emotions" value="${id}" ${draft.emotions.includes(id) ? 'checked' : ''}><span><b aria-hidden="true">${emoji}</b>${label}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>Any bumps in the road?</legend><label for="test-friction">What felt frustrating, unclear, or got in your way?</label><textarea id="test-friction" name="friction" rows="3" maxlength="8000" placeholder="A rule that puzzled you? A click that didn’t do what you expected?" ${draft.noFriction ? 'disabled' : 'required'}>${escape(draft.friction)}</textarea><label class="check-row"><input name="noFriction" type="checkbox" ${draft.noFriction ? 'checked' : ''}> Nothing got in my way this time</label></fieldset>
      <div class="field"><label for="test-thoughts">Anything else you’d like to share? <small>Optional</small></label><textarea id="test-thoughts" name="thoughts" rows="2" maxlength="8000" placeholder="Wild ideas, lovely moments, tiny rants… all welcome.">${escape(draft.thoughts)}</textarea></div>
      <p class="test-feedback-error" role="alert" hidden></p><button type="submit" class="primary test-submit">${number === total ? 'Save feedback & finish ✨' : 'Save feedback & next level →'}</button><small class="test-save-hint">Your next level unlocks once your answers are safely saved.</small>
    </form>`;
    const form = dialog.querySelector('form');
    const read = () => {
      const values = new FormData(form);
      draft.experience = Number(values.get('experience')) || null;
      draft.difficulty = Number(values.get('difficulty')) || null;
      draft.emotions = values.getAll('emotions');
      draft.noFriction = values.has('noFriction');
      draft.friction = form.elements.friction.value;
      draft.thoughts = form.elements.thoughts.value;
      storeDraft();
    };
    form.addEventListener('input', event => {
      if (event.target.name === 'personalChallenge') {
        draft.personalChallenge = Number(event.target.value);
        form.querySelector('output').textContent = draft.personalChallenge;
      }
      if (event.target.name === 'noFriction') {
        form.elements.friction.disabled = event.target.checked;
        form.elements.friction.required = !event.target.checked;
      }
      read();
    });
    // Keyboard users can deliberately confirm the midpoint without changing it.
    form.elements.personalChallenge.addEventListener('pointerdown', () => {
      draft.personalChallenge = Number(form.elements.personalChallenge.value);
      form.querySelector('output').textContent = draft.personalChallenge; storeDraft();
    });
    form.elements.personalChallenge.addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        draft.personalChallenge = Number(form.elements.personalChallenge.value); storeDraft();
      }
    });
    form.addEventListener('change', event => {
      if (event.target.name === 'emotions' && event.target.checked) react(event.target.value);
    });
    form.onsubmit = async event => {
      event.preventDefault(); read();
      const error = form.querySelector('[role=alert]'), button = form.querySelector('[type=submit]');
      try {
        const feedback = validateTestFeedback(draft);
        button.disabled = true; button.textContent = 'Tucking your thoughts away…'; error.hidden = true;
        const saved = await request('feedback', { levelId: draft.levelId, submissionId: draft.submissionId, profile: getProfile(), feedback });
        // Only a server acknowledgement can advance the tester.
        session = saved; pending = false; draft = null;
        try { localStorage.removeItem(draftKey()); } catch {}
        dialog.close(); resume();
      } catch (problem) {
        error.textContent = problem.message; error.hidden = false; error.scrollIntoView({ block: 'nearest' });
        button.disabled = false; button.textContent = number === total ? 'Save feedback & finish ✨' : 'Save feedback & next level →';
      }
    };
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }
  document.addEventListener('workshop-profile-ready', () => {
    if (pending) showFeedback();
    else if (session && session.results.length === session.project.levels.length) showThanks();
  });
  return {
    start,
    get ready() { return !!session; },
    get blocked() { return !session || pending || session.results.length === session.project.levels.length; },
    get complete() { return !!session && session.results.length === session.project.levels.length; },
    tabState(levelId) {
      if (!session) return 'locked';
      const index = session.project.levels.findIndex(l => l.id === levelId);
      return index < session.results.length ? 'completed' : index === session.results.length ? 'current' : 'locked';
    },
    finish(completion = 'automatic') {
      if (!session || pending || session.results.length === session.project.levels.length) return;
      pending = true;
      draft = { ...getRun(), levelId: session.project.levels[session.results.length].id, submissionId: uid(), completion,
        experience: null, difficulty: null, personalChallenge: null, emotions: [], noFriction: false, friction: '', thoughts: '' };
      storeDraft(); showFeedback();
    }
  };
}
