// Undo toast: brief "Undo" button at the bottom after reversible actions.
// Stores one pending undo action at a time.

let undoState = null;  // { label, undo: () => void, timeoutId, toastEl }

export function triggerUndo() {
  if (!undoState) return false;
  clearTimeout(undoState.timeoutId);
  undoState.toastEl?.remove();
  const fn = undoState.undo;
  undoState = null;
  fn();
  return true;
}

export function pushUndo(label, undoFn) {
  // Cancel any previous undo
  if (undoState) {
    clearTimeout(undoState.timeoutId);
    undoState.toastEl?.remove();
  }

  const toast = createToast(label, () => {
    clearTimeout(undoState?.timeoutId);
    undoState?.toastEl?.remove();
    undoState = null;
    undoFn();
  });

  const timeoutId = setTimeout(() => {
    toast.classList.add('undo-toast-hiding');
    setTimeout(() => toast.remove(), 300);
    if (undoState?.timeoutId === timeoutId) undoState = null;
  }, 5000);

  undoState = { label, undo: undoFn, timeoutId, toastEl: toast };
}

function createToast(label, onUndo) {
  const existing = document.getElementById('undo-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'undo-toast';
  toast.className = 'undo-toast';
  toast.innerHTML = `
    <span class="undo-label">${escHtml(label)}</span>
    <button class="undo-btn btn-small">Undo</button>
  `;
  document.body.appendChild(toast);

  // Trigger enter animation on next frame
  requestAnimationFrame(() => toast.classList.add('undo-toast-visible'));

  toast.querySelector('.undo-btn').addEventListener('click', onUndo);
  return toast;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
