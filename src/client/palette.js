// Command palette — Cmd+K or Ctrl+K to open, fuzzy-search items and actions
import { appState } from './state.js';
import { syncUrl } from './url.js';

let paletteEl = null;
let inputEl = null;
let listEl = null;
let selectedIndex = 0;
let currentItems = [];

// --- Built-in commands ---
const COMMANDS = [
  { label: 'Filter: Active items',    icon: '🟢', action: () => setFilter('active') },
  { label: 'Filter: Done items',      icon: '✅', action: () => setFilter('done') },
  { label: 'Filter: All items',       icon: '📋', action: () => setFilter('all') },
  { label: 'Filter: P0 items',        icon: '🔴', action: () => setSearch('p:0') },
  { label: 'Filter: P0-P1 items',     icon: '🟠', action: () => setSearch('p:0-1') },
  { label: 'Filter: Blocked items',   icon: '🚫', action: () => setSearch('blocked') },
  { label: 'Filter: Overdue items',   icon: '⚠️',  action: () => setSearch('overdue') },
  { label: 'Filter: Review type',     icon: '👀', action: () => setType('Review') },
  { label: 'Filter: PR type',         icon: '🔀', action: () => setType('PR') },
  { label: 'Filter: Issue type',      icon: '🐛', action: () => setType('Issue') },
  { label: 'Sort: By priority',       icon: '🔃', action: () => setSort('priority') },
  { label: 'Sort: By due date',       icon: '📅', action: () => setSort('due') },
  { label: 'Sort: By status',         icon: '🏷️',  action: () => setSort('status') },
  { label: 'Toggle: Dark/light theme',icon: '🌙', action: () => document.getElementById('theme-toggle')?.click() },
  { label: 'Toggle: Focus mode',      icon: '🎯', action: () => document.getElementById('focus-mode-btn')?.click() },
  { label: 'Open: Standup dialog',    icon: '📊', action: () => document.getElementById('show-standup')?.click() },
  { label: 'Open: Log dialog',        icon: '📜', action: () => document.getElementById('show-log')?.click() },
  { label: 'Open: Keyboard shortcuts',icon: '⌨️',  action: () => document.getElementById('show-shortcuts')?.click() },
  { label: 'Action: Export as Markdown', icon: '📤', action: () => document.getElementById('export-md')?.click() },
  { label: 'Action: Update all',      icon: '🔄', action: () => document.getElementById('refresh-all')?.click() },
  { label: "Action: What's next?",    icon: '💡', action: () => document.getElementById('show-next')?.click() },
  { label: 'Clear filters',           icon: '❌', action: () => clearFilters() },
];

function setFilter(status) {
  appState.filterStatus = status;
  document.getElementById('filter-status').value = status;
  syncUrl();
  import('./render.js').then(m => m.renderTable());
}

function setSearch(q) {
  appState.searchQuery = q;
  document.getElementById('filter-search').value = q;
  syncUrl();
  import('./render.js').then(m => m.renderTable());
}

function setType(t) {
  appState.filterType = t;
  document.getElementById('filter-type').value = t;
  syncUrl();
  import('./render.js').then(m => m.renderTable());
}

function setSort(col) {
  appState.sortColumn = col;
  appState.sortDirection = 'asc';
  syncUrl();
  import('./render.js').then(m => m.renderTable());
}

function clearFilters() {
  appState.filterType = '';
  appState.filterStatus = 'active';
  appState.searchQuery = '';
  document.getElementById('filter-type').value = '';
  document.getElementById('filter-status').value = 'active';
  document.getElementById('filter-search').value = '';
  syncUrl();
  import('./render.js').then(m => m.renderTable());
}

// Fuzzy score: returns >0 if all query chars appear in order in text
function fuzzyScore(text, query) {
  if (!query) return 1;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0, qi = 0, score = 0, consecutive = 0;
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) {
      score += 1 + consecutive;
      consecutive++;
      qi++;
    } else {
      consecutive = 0;
    }
    ti++;
  }
  return qi === q.length ? score : 0;
}

function highlightMatch(text, query) {
  if (!query) return escHtml(text);
  const t = text;
  const q = query.toLowerCase();
  let result = '';
  let ti = 0, qi = 0;
  const matchedIndices = new Set();

  // Find matched indices
  let tempTi = 0, tempQi = 0;
  while (tempTi < t.length && tempQi < q.length) {
    if (t[tempTi].toLowerCase() === q[tempQi]) {
      matchedIndices.add(tempTi);
      tempQi++;
    }
    tempTi++;
  }

  for (let i = 0; i < t.length; i++) {
    if (matchedIndices.has(i)) {
      result += `<mark>${escHtml(t[i])}</mark>`;
    } else {
      result += escHtml(t[i]);
    }
  }
  return result;
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildResults(query) {
  const results = [];
  const q = query.trim();

  // Match todo items
  const items = appState.items || [];
  for (const item of items) {
    const text = item.description || item.id;
    const score = fuzzyScore(text, q) + fuzzyScore(item.id, q);
    if (!q || score > 0) {
      results.push({
        type: 'item',
        item,
        label: text,
        score: score + (item.priority === 'P0' ? 10 : item.priority === 'P1' ? 5 : 0),
      });
    }
  }

  // Match commands
  for (const cmd of COMMANDS) {
    const score = fuzzyScore(cmd.label, q);
    if (!q || score > 0) {
      results.push({ type: 'command', cmd, label: cmd.label, score });
    }
  }

  // Sort: items first when query matches, commands first when no query
  results.sort((a, b) => {
    if (!q) {
      // No query: commands first, then items
      if (a.type !== b.type) return a.type === 'command' ? -1 : 1;
    }
    return b.score - a.score;
  });

  return results.slice(0, 12);
}

function renderList(query) {
  currentItems = buildResults(query);
  selectedIndex = Math.min(selectedIndex, Math.max(0, currentItems.length - 1));

  listEl.innerHTML = currentItems.map((result, i) => {
    const sel = i === selectedIndex ? ' palette-item-selected' : '';
    if (result.type === 'item') {
      const { item } = result;
      const priClass = `pri-${(item.priority || 'P3').toLowerCase()}`;
      const statusDot = item.status === 'done' ? '✅' : (item.status || '');
      const label = highlightMatch(result.label, query);
      return `<div class="palette-item${sel}" data-index="${i}">
        <span class="palette-item-icon ${priClass}">${item.priority || ''}</span>
        <span class="palette-item-label">${label}</span>
        <span class="palette-item-hint">${item.status || ''}</span>
      </div>`;
    } else {
      const label = highlightMatch(result.label, query);
      return `<div class="palette-item${sel}" data-index="${i}">
        <span class="palette-item-icon">${result.cmd.icon}</span>
        <span class="palette-item-label">${label}</span>
        <span class="palette-item-hint">cmd</span>
      </div>`;
    }
  }).join('') || '<div class="palette-empty">No results</div>';
}

function executeSelected() {
  const result = currentItems[selectedIndex];
  if (!result) return;
  closePalette();
  if (result.type === 'item') {
    import('./detail.js').then(m => m.showDetail(result.item.id));
  } else {
    result.cmd.action();
  }
}

function move(dir) {
  selectedIndex = Math.max(0, Math.min(currentItems.length - 1, selectedIndex + dir));
  renderList(inputEl.value);
  // Scroll selected into view
  const sel = listEl.querySelector('.palette-item-selected');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

export function openPalette() {
  if (!paletteEl) createPalette();
  selectedIndex = 0;
  inputEl.value = '';
  renderList('');
  paletteEl.classList.remove('hidden');
  inputEl.focus();
}

export function closePalette() {
  paletteEl?.classList.add('hidden');
}

export function isPaletteOpen() {
  return paletteEl && !paletteEl.classList.contains('hidden');
}

function createPalette() {
  paletteEl = document.createElement('div');
  paletteEl.id = 'command-palette';
  paletteEl.className = 'command-palette';
  paletteEl.innerHTML = `
    <div class="palette-backdrop"></div>
    <div class="palette-box">
      <div class="palette-input-row">
        <span class="palette-search-icon">⌘</span>
        <input type="text" class="palette-input" placeholder="Search items and commands…" autocomplete="off" spellcheck="false">
        <kbd class="palette-esc-hint">Esc</kbd>
      </div>
      <div class="palette-list"></div>
    </div>
  `;
  document.body.appendChild(paletteEl);

  inputEl = paletteEl.querySelector('.palette-input');
  listEl = paletteEl.querySelector('.palette-list');

  // Close on backdrop click
  paletteEl.querySelector('.palette-backdrop').addEventListener('click', closePalette);

  // Input events
  inputEl.addEventListener('input', () => {
    selectedIndex = 0;
    renderList(inputEl.value);
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); executeSelected(); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });

  // Click on item
  listEl.addEventListener('click', (e) => {
    const item = e.target.closest('.palette-item');
    if (item) {
      selectedIndex = parseInt(item.dataset.index, 10);
      executeSelected();
    }
  });

  // Hover to highlight
  listEl.addEventListener('mousemove', (e) => {
    const item = e.target.closest('.palette-item');
    if (item) {
      selectedIndex = parseInt(item.dataset.index, 10);
      listEl.querySelectorAll('.palette-item').forEach((el, i) => {
        el.classList.toggle('palette-item-selected', i === selectedIndex);
      });
    }
  });
}

export function initPalette() {
  document.addEventListener('keydown', (e) => {
    // Cmd+K or Ctrl+K
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (isPaletteOpen()) closePalette();
      else openPalette();
    }
  });
}
