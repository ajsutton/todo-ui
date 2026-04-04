// Bulk selection and batch actions
import { appState } from './state.js';

export const selection = new Set(); // selected item IDs

export function isSelectionMode() {
  return appState.bulkMode === true;
}

export function toggleBulkMode() {
  appState.bulkMode = !appState.bulkMode;
  if (!appState.bulkMode) selection.clear();
  renderBulkToolbar();
  // Re-render table to show/hide checkboxes
  import('./render.js').then(m => m.renderTable());
}

export function toggleSelected(id) {
  if (selection.has(id)) {
    selection.delete(id);
  } else {
    selection.add(id);
  }
  renderBulkToolbar();
}

export function selectAll(ids) {
  for (const id of ids) selection.add(id);
  renderBulkToolbar();
}

export function clearSelection() {
  selection.clear();
  renderBulkToolbar();
}

export function renderBulkToolbar() {
  const toolbar = document.getElementById('bulk-toolbar');
  if (!toolbar) return;

  if (!appState.bulkMode) {
    toolbar.classList.add('hidden');
    return;
  }

  toolbar.classList.remove('hidden');
  const countEl = toolbar.querySelector('.bulk-count');
  if (countEl) countEl.textContent = selection.size === 0
    ? 'Select rows to act on them'
    : `${selection.size} item${selection.size === 1 ? '' : 's'} selected`;

  const buttons = toolbar.querySelectorAll('[data-bulk-action]');
  buttons.forEach(btn => {
    btn.disabled = selection.size === 0;
  });
}

export async function bulkMarkDone() {
  if (selection.size === 0) return;
  const ids = [...selection];
  const { markComplete } = await import('./actions.js');
  await Promise.all(ids.map(id => markComplete(id)));
  selection.clear();
  renderBulkToolbar();
}

export async function bulkMarkActive() {
  if (selection.size === 0) return;
  const ids = [...selection];
  const { markIncomplete } = await import('./actions.js');
  await Promise.all(ids.map(id => markIncomplete(id)));
  selection.clear();
  renderBulkToolbar();
}

export async function bulkSetPriority(priority) {
  if (selection.size === 0) return;
  const ids = [...selection];
  const { updatePriority } = await import('./actions.js');
  await Promise.all(ids.map(id => updatePriority(id, priority)));
  selection.clear();
  renderBulkToolbar();
}
