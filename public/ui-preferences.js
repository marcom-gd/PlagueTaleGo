export function textScale(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(200, Math.max(50, number)) : 100;
}

export function applyTextScale(value) {
  const scale = textScale(value);
  document.documentElement.style.setProperty('--ui-text-scale', scale / 100);
  document.documentElement.classList.toggle('large-text', scale > 100);
  window.dispatchEvent(new Event('resize'));
  return scale;
}
