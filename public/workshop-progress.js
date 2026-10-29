import { workshopSteps, initialWorkshop, workshopRemaining } from './workshop-programme.js';
import { workshopControls } from './workshop-controls.js';

export function initWorkshopProgress({ endpoint, toast }) {
  const $ = selector => document.querySelector(selector);
  const strip = $('#workshop-progress'), dialog = $('#workshop-step-dialog');
  let state = initialWorkshop(), ready = false;
  let serverTime = Date.now(), receivedAt = performance.now(), displayedStep, announcement = '', finishedKey;
  const now = () => serverTime + performance.now() - receivedAt;
  const format = ms => { const seconds = Math.ceil(ms / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; };
  const controls = workshopControls({
    now: () => Math.round(now()), error: toast,
    changed: (next, connected) => { state = next; ready = connected; render(); },
    send: async (command, expectedRevision) => {
      const response = await fetch(`${endpoint}/workshop`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, expectedRevision }), signal: AbortSignal.timeout(10000)
      });
      const data = await response.json();
      if (!response.ok) throw Object.assign(Error(data.error || 'The workshop update could not be saved.'), { data });
      return data;
    }
  });
  const text = (selector, value) => { const node = $(selector); if (node.textContent !== value) node.textContent = value; };
  let lastRender = '';

  function render() {
    const index = workshopSteps.findIndex(step => step.id === state.stepId), step = workshopSteps[index];
    const remaining = workshopRemaining(state, now()), running = state.endsAt !== null && remaining > 0;
    const finished = remaining === 0, paused = !running && !finished && remaining < step.minutes * 60000;
    const action = running ? 'Pause' : finished ? 'Restart' : paused ? 'Resume' : 'Start';
    const signature = `${state.stepId}:${ready}:${action}:${format(remaining)}`;
    if (signature === lastRender) return;
    lastRender = signature;
    text('#workshop-step-number', String(index + 1).padStart(2, '0'));
    text('#workshop-step-title', step.title);
    $('#workshop-step-open').setAttribute('aria-label', `Step ${index + 1} of ${workshopSteps.length}: ${step.title}. Open step details.`);
    $('#workshop-previous').disabled = !ready || index === 0;
    $('#workshop-next').disabled = !ready || index === workshopSteps.length - 1;
    $('#workshop-timer').disabled = !ready;
    $('#workshop-timer-reset').disabled = !ready;
    $('#workshop-timer').setAttribute('aria-label', `${action} the ${step.minutes}-minute timer for everyone. ${format(remaining)} remaining.`);
    $('#workshop-timer').title = `${action} timer for everyone`;
    text('#workshop-timer-action', ready ? action : 'Connecting');
    text('#workshop-timer-icon', running ? 'Ⅱ' : '▷');
    text('#workshop-time', format(remaining));
    strip.dataset.timer = finished ? 'finished' : running ? 'running' : paused ? 'paused' : 'ready';
    strip.style.setProperty('--step-progress', `${(1 - remaining / (step.minutes * 60000)) * 100}%`);
    const status = `${step.title}. ${finished ? 'Time is up. Wrap up when ready.' : running ? 'Timer running.' : paused ? 'Timer paused.' : 'Ready when you are.'}`;
    if (ready && status !== announcement) { $('#workshop-announcement').textContent = status; announcement = status; }
    const key = `${state.stepId}:${state.endsAt}`;
    if (ready && finished && state.endsAt !== null && finishedKey !== key) { toast(`Time for a little wrap-up: ${step.title}.`); finishedKey = key; }
    if (dialog.open && displayedStep !== step.id) renderDialog();
  }

  function renderDialog() {
    const index = workshopSteps.findIndex(step => step.id === state.stepId), step = workshopSteps[index];
    displayedStep = step.id;
    $('#workshop-dialog-position').textContent = `STEP ${String(index + 1).padStart(2, '0')} OF ${workshopSteps.length}`;
    $('#workshop-dialog-chapter').textContent = step.chapter;
    $('#workshop-dialog-duration').textContent = `${step.minutes} minutes`;
    $('#workshop-dialog-title').textContent = step.title;
    $('#workshop-dialog-description').textContent = step.description;
    $('#workshop-dialog-tasks').replaceChildren(...step.tasks.map(task => { const item = document.createElement('li'); item.textContent = task; return item; }));
    $('#workshop-dialog-outcome').textContent = step.outcome;
  }

  function receive(data) {
    if (!data.workshop) return;
    if (Number.isFinite(data.serverNow)) { serverTime = data.serverNow; receivedAt = performance.now(); }
    controls.receive(data);
  }

  const command = value => controls.command(value);

  $('#workshop-previous').onclick = () => command('step.previous');
  $('#workshop-next').onclick = () => command('step.next');
  $('#workshop-timer').onclick = () => command(state.endsAt !== null && workshopRemaining(state, now()) > 0 ? 'timer.pause' : 'timer.start');
  $('#workshop-timer-reset').onclick = () => command('timer.reset');
  $('#workshop-step-open').onclick = () => { renderDialog(); dialog.showModal(); };
  dialog.querySelectorAll('[data-close-step]').forEach(button => { button.onclick = () => dialog.close(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
  render();
  // Presence can wrap the header onto two lines; keep the editor fitted below it.
  const fitHeader = () => {
    const top = $('.topbar').getBoundingClientRect().height;
    document.documentElement.style.setProperty('--workshop-topbar-height', `${top}px`);
    document.documentElement.style.setProperty('--workshop-header-height', `${top + strip.getBoundingClientRect().height}px`);
  };
  const headerObserver = new ResizeObserver(fitHeader);
  headerObserver.observe($('.topbar')); headerObserver.observe(strip); fitHeader();
  const toggle = $('#workshop-strip-toggle');
  let collapsed = true;
  try { collapsed = localStorage.getItem('workshop-strip-collapsed') !== 'false'; } catch {}
  function collapse() {
    strip.hidden = collapsed;
    toggle.textContent = collapsed ? '✧' : '⌃';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Show workshop step strip' : 'Collapse workshop step strip');
    toggle.title = collapsed ? 'Show workshop steps' : 'Collapse workshop steps';
    document.body.classList.toggle('workshop-strip-collapsed', collapsed);
    fitHeader();
  }
  toggle.onclick = () => { collapsed = !collapsed; collapse(); try { localStorage.setItem('workshop-strip-collapsed', String(collapsed)); } catch {} };
  collapse();
  setInterval(render, 250);
  return { receive };
}
