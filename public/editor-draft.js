// Compare current values, so changing a field back also clears the warning.
// Read from the editor root even while a nested dialog has detached it.
export function editorDraft(root, save, extra = () => null) {
  const snapshot = () => JSON.stringify({
    fields: [...root.querySelectorAll('input, textarea, select')]
      .filter(field => !field.matches('[data-draft-ignore]'))
      .map(field => [field.id || field.name || field.getAttribute('aria-label'),
        field.type === 'checkbox' || field.type === 'radio' ? field.checked : field.value]),
    extra: extra()
  });
  const initial = snapshot();
  return { dirty: () => snapshot() !== initial, save };
}
