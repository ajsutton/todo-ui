// Bulk selection and batch actions
import { appState } from './state.js';
import { addTag, getAllTags } from './tags.js';

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

export function showBulkTagPicker(anchorEl) {
  if (selection.size === 0) return;
  document.getElementById('bulk-tag-picker')?.remove();

  const picker = document.createElement('div');
  picker.id = 'bulk-tag-picker';
  picker.className = 'tag-picker';

  const existing = getAllTags();
  picker.innerHTML = `
    <div class="tag-picker-title">Tag ${selection.size} item${selection.size === 1 ? '' : 's'}</div>
    <div class="tag-picker-input-row">
      <input type="text" class="tag-picker-input" placeholder="tag name…" maxlength="30" autocomplete="off">
      <button class="btn-small tag-picker-add">Add</button>
    </div>
    ${existing.length > 0 ? `<div class="tag-picker-suggestions">
      ${existing.slice(0, 8).map(t => `<span class="tag-suggestion" data-tag="${escAttr(t)}">${escHtml(t)}</span>`).join('')}
    </div>` : ''}
  `;

  document.body.appendChild(picker);
  positionNear(picker, anchorEl);

  const input = picker.querySelector('.tag-picker-input');
  input.focus();

  const doTag = () => {
    const val = input.value.trim();
    if (!val) return;
    for (const id of selection) addTag(id, val);
    picker.remove();
    import('./render.js').then(m => m.renderTable());
  };

  picker.querySelector('.tag-picker-add').addEventListener('click', doTag);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doTag();
    if (e.key === 'Escape') picker.remove();
  });
  picker.querySelectorAll('.tag-suggestion').forEach(s => {
    s.addEventListener('click', () => {
      for (const id of selection) addTag(id, s.dataset.tag);
      picker.remove();
      import('./render.js').then(m => m.renderTable());
    });
  });

  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!picker.contains(e.target) && e.target !== anchorEl) {
        picker.remove();
        document.removeEventListener('click', handler, true);
      }
    }, { capture: true });
  }, 50);
}

function positionNear(el, anchor) {
  const rect = anchor.getBoundingClientRect();
  el.style.position = 'fixed';
  el.style.top = (rect.bottom + 4) + 'px';
  el.style.left = Math.min(rect.left, window.innerWidth - 240) + 'px';
}

function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escAttr(s) { return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
