// Use relative level IDs so a move preserves levels added by collaborators.
export function levelTabDragging({host, getLevels, isPlay, move, announce}) {
  let drag = null, frame = null, ghost = null, suppressUntil = 0;
  const tabs = () => [...host.querySelectorAll('[data-level]')];
  const clearMarkers = () => tabs().forEach(tab => tab.classList.remove('level-dragging', 'level-drop-before', 'level-drop-after'));
  function cancel() {
    if (drag?.active) suppressUntil = performance.now() + 300;
    drag = null;
    cancelAnimationFrame(frame); frame = null;
    ghost?.remove(); ghost = null;
    clearMarkers();
  }
  function destination(x, y) {
    const rect = host.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return undefined;
    const remaining = tabs().filter(tab => tab.dataset.level !== drag.id);
    const next = remaining.find(tab => {const r = tab.getBoundingClientRect(); return x < r.left + r.width / 2;});
    return next?.dataset.level ?? null;
  }
  function commit(id, beforeId) {
    if (isPlay()) return;
    const levels = getLevels(), index = levels.findIndex(l => l.id === id);
    if (index < 0 || beforeId === id || (levels[index + 1]?.id ?? null) === beforeId) return;
    if (move(id, beforeId) === false) return;
    const tab = tabs().find(tab => tab.dataset.level === id);
    tab?.focus({preventScroll:true});
    tab?.scrollIntoView({block:'nearest', inline:'nearest'});
    const updated = getLevels(), position = updated.findIndex(l => l.id === id);
    announce(`${updated[position].name} moved to position ${position + 1} of ${updated.length}.`);
  }
  function update() {
    if (!drag?.active) return;
    if (isPlay() || !getLevels().some(l => l.id === drag.id)) return cancel();
    const rect = host.getBoundingClientRect();
    if (drag.y >= rect.top && drag.y <= rect.bottom && drag.x >= rect.left && drag.x <= rect.right) {
      if (drag.x < rect.left + 28) host.scrollLeft -= 10;
      else if (drag.x > rect.right - 28) host.scrollLeft += 10;
    }
    clearMarkers();
    tabs().find(tab => tab.dataset.level === drag.id)?.classList.add('level-dragging');
    const beforeId = destination(drag.x, drag.y);
    const marker = beforeId === null ? tabs().filter(tab => tab.dataset.level !== drag.id).at(-1) : tabs().find(tab => tab.dataset.level === beforeId);
    marker?.classList.add(beforeId === null ? 'level-drop-after' : 'level-drop-before');
    ghost.style.left = drag.x + 12 + 'px'; ghost.style.top = drag.y + 12 + 'px';
    frame = requestAnimationFrame(update);
  }
  host.addEventListener('pointerdown', e => {
    const tab = e.target.closest('[data-level]');
    if (!tab || e.button !== 0 || e.isPrimary === false || isPlay() || getLevels().length < 2) return;
    drag = {id:tab.dataset.level, label:tab.textContent, pointerId:e.pointerId, startX:e.clientX, startY:e.clientY, x:e.clientX, y:e.clientY, active:false};
  });
  document.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 5) return;
    if (!drag.active) {
      drag.active = true;
      ghost = document.createElement('div'); ghost.className = 'level-drag-ghost'; ghost.textContent = drag.label;
      ghost.setAttribute('aria-hidden', 'true'); document.body.append(ghost);
      update();
    }
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  document.addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const {id, active} = drag, beforeId = active ? destination(e.clientX, e.clientY) : undefined;
    cancel();
    if (active) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (beforeId !== undefined) commit(id, beforeId);
    }
  }, true);
  document.addEventListener('pointercancel', e => {if (e.pointerId === drag?.pointerId) cancel();}, true);
  window.addEventListener('blur', cancel);
  host.addEventListener('dragstart', e => e.preventDefault());
  host.addEventListener('click', e => {
    if (performance.now() < suppressUntil) {e.preventDefault(); e.stopImmediatePropagation();}
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drag) {cancel(); e.preventDefault(); e.stopImmediatePropagation(); return;}
    const tab = e.target.closest('[data-level]');
    if (!tab || !host.contains(tab) || !e.altKey || e.ctrlKey || e.metaKey || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (isPlay()) return;
    const levels = getLevels(), index = levels.findIndex(l => l.id === tab.dataset.level);
    if (e.key === 'ArrowLeft' && index > 0) commit(tab.dataset.level, levels[index - 1].id);
    if (e.key === 'ArrowRight' && index >= 0 && index < levels.length - 1) commit(tab.dataset.level, levels[index + 2]?.id ?? null);
  }, true);
}
