// Saved filter presets — users can bookmark their current filter state
// and recall it with one click.
import { appState } from './state.js';
import { syncUrl } from './url.js';

const STORAGE_KEY = 'todo-filter-presets';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function save(presets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function getPresets() { return load(); }

export function savePreset(name) {
  const preset = {
    id: Date.now().toString(36),
    name: name.trim(),
    filterType: appState.filterType,
    filterStatus: appState.filterStatus,
    searchQuery: appState.searchQuery,
    sortColumn: appState.sortColumn,
    sortDirection: appState.sortDirection,
  };
  const presets = load().filter(p => p.name !== preset.name); // replace same name
  presets.unshift(preset);
  save(presets.slice(0, 12)); // max 12 presets
  return preset;
}

export function deletePreset(id) {
  save(load().filter(p => p.id !== id));
}

export function applyPreset(preset) {
  appState.filterType = preset.filterType || '';
  appState.filterStatus = preset.filterStatus || 'active';
  appState.searchQuery = preset.searchQuery || '';
  appState.sortColumn = preset.sortColumn || 'priority';
  appState.sortDirection = preset.sortDirection || 'asc';

  const typeEl = document.getElementById('filter-type');
  const statusEl = document.getElementById('filter-status');
  const searchEl = document.getElementById('filter-search');
  if (typeEl) typeEl.value = appState.filterType;
  if (statusEl) statusEl.value = appState.filterStatus;
  if (searchEl) searchEl.value = appState.searchQuery;

  syncUrl();
  import('./render.js').then(m => m.renderTable());
}

// Render the presets bar
export function renderPresetsBar() {
  let bar = document.getElementById('presets-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'presets-bar';
    bar.className = 'presets-bar';
    const filters = document.querySelector('.filters');
    if (filters) filters.after(bar);
    else document.querySelector('header')?.after(bar);
  }

  const presets = load();
  if (presets.length === 0) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  bar.innerHTML = `
    <span class="presets-label">Saved:</span>
    ${presets.map(p => `
      <span class="preset-chip" data-preset-id="${p.id}" title="${escHtml(describePreset(p))}">
        <span class="preset-name">${escHtml(p.name)}</span>
        <button class="preset-del" data-del-id="${p.id}" title="Delete preset">×</button>
      </span>
    `).join('')}
  `;

  bar.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('preset-del')) return;
      const preset = load().find(p => p.id === chip.dataset.presetId);
      if (preset) applyPreset(preset);
    });
  });

  bar.querySelectorAll('.preset-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePreset(btn.dataset.delId);
      renderPresetsBar();
    });
  });
}

function describePreset(p) {
  const parts = [];
  if (p.filterStatus && p.filterStatus !== 'all') parts.push(p.filterStatus);
  if (p.filterType) parts.push(p.filterType);
  if (p.searchQuery) parts.push(`"${p.searchQuery}"`);
  if (p.sortColumn && p.sortColumn !== 'priority') parts.push(`sort: ${p.sortColumn}`);
  return parts.join(', ') || 'all items';
}

// Show the "save preset" dialog
export function showSavePresetDialog() {
  document.getElementById('preset-save-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.id = 'preset-save-dialog';
  dialog.className = 'preset-dialog';
  dialog.innerHTML = `
    <div class="preset-dialog-inner">
      <label class="preset-dialog-label">Save current filter as:</label>
      <div class="preset-dialog-row">
        <input type="text" class="preset-name-input" placeholder="Preset name…" maxlength="40" autocomplete="off">
        <button class="btn-small preset-save-ok">Save</button>
        <button class="btn-small btn-secondary preset-save-cancel">Cancel</button>
      </div>
    </div>
  `;

  const filterBar = document.querySelector('.filters');
  if (filterBar) filterBar.after(dialog);
  else document.body.prepend(dialog);

  const input = dialog.querySelector('.preset-name-input');
  input.focus();

  const doSave = () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    savePreset(name);
    dialog.remove();
    renderPresetsBar();
  };

  dialog.querySelector('.preset-save-ok').addEventListener('click', doSave);
  dialog.querySelector('.preset-save-cancel').addEventListener('click', () => dialog.remove());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSave();
    if (e.key === 'Escape') dialog.remove();
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!dialog.contains(e.target)) {
        dialog.remove();
        document.removeEventListener('click', handler, true);
      }
    }, { capture: true, once: false });
  }, 50);
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
