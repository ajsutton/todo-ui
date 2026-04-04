// Remembers recent searches in localStorage and shows them as a dropdown
// when focusing the search input.
import { appState } from './state.js';
import { getAllTags } from './tags.js';

const STORAGE_KEY = 'todo-search-history';
const MAX_ENTRIES = 10;

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function save(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function recordSearch(query) {
  const q = query.trim();
  if (!q || q.length < 2) return;
  let entries = load().filter(e => e !== q);
  entries.unshift(q);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(0, MAX_ENTRIES);
  save(entries);
}

export function getSearchHistory() {
  return load();
}

export function clearSearchHistory() {
  save([]);
}

let dropdownEl = null;
let currentInput = null;

function createDropdown() {
  dropdownEl = document.createElement('div');
  dropdownEl.id = 'search-history-dropdown';
  dropdownEl.className = 'search-history-dropdown hidden';
  document.body.appendChild(dropdownEl);

  // Global mousedown to close
  document.addEventListener('mousedown', (e) => {
    if (!dropdownEl.contains(e.target) && e.target !== currentInput) {
      hideDropdown();
    }
  });
}

function positionDropdown(inputEl) {
  const rect = inputEl.getBoundingClientRect();
  dropdownEl.style.top = (rect.bottom + 2) + 'px';
  dropdownEl.style.left = rect.left + 'px';
  dropdownEl.style.minWidth = rect.width + 'px';
}

function showDropdown(inputEl, onSelect) {
  const history = getSearchHistory();
  if (!history.length) return;

  if (!dropdownEl) createDropdown();
  currentInput = inputEl;

  dropdownEl.innerHTML = `
    <div class="sh-header">
      <span>Recent searches</span>
      <button class="sh-clear">Clear</button>
    </div>
    ${history.map(q =>
      `<div class="sh-item" data-query="${escAttr(q)}">
        <span class="sh-icon">🕐</span>
        <span class="sh-text">${escHtml(q)}</span>
      </div>`
    ).join('')}
  `;

  dropdownEl.querySelector('.sh-clear').addEventListener('click', (e) => {
    e.stopPropagation();
    clearSearchHistory();
    hideDropdown();
  });

  dropdownEl.querySelectorAll('.sh-item').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Don't blur input
      onSelect(item.dataset.query);
      hideDropdown();
    });
  });

  positionDropdown(inputEl);
  dropdownEl.classList.remove('hidden');
}

export function hideDropdown() {
  dropdownEl?.classList.add('hidden');
  currentInput = null;
}

// Syntax-aware suggestions when typing prefixes
function getSyntaxSuggestions(value) {
  const val = value.trim();
  const suggestions = [];

  if (val === 'p' || val === 'p:') {
    ['p:0', 'p:1', 'p:0-1', 'p:0-2', 'p:2-3'].forEach(s => suggestions.push({ icon: '#', text: s, insert: s }));
  } else if (val === 'type' || val === 'type:') {
    ['type:pr', 'type:review', 'type:issue', 'type:workstream'].forEach(s => suggestions.push({ icon: '📂', text: s, insert: s }));
  } else if (val === 'status' || val === 'status:') {
    ['status:failing', 'status:approved', 'status:draft', 'status:open'].forEach(s => suggestions.push({ icon: '🔖', text: s, insert: s }));
  } else if (val === 'due' || val === 'due:') {
    ['due:today', 'due:week', 'due:3', 'due:7'].forEach(s => suggestions.push({ icon: '📅', text: s, insert: s }));
  } else if (val.startsWith('tag:')) {
    const prefix = val.slice(4).toLowerCase();
    getAllTags().filter(t => t.startsWith(prefix)).slice(0, 6).forEach(t =>
      suggestions.push({ icon: '🏷', text: `tag:${t}`, insert: `tag:${t}` })
    );
  } else if (val.startsWith('@')) {
    // Repo suggestions from items
    const prefix = val.slice(1).toLowerCase();
    const repos = [...new Set((appState.items || []).filter(i => i.repo).map(i => i.repo))];
    repos.filter(r => r.toLowerCase().includes(prefix)).slice(0, 6).forEach(r =>
      suggestions.push({ icon: '📦', text: `@${r}`, insert: `@${r}` })
    );
  }

  return suggestions;
}

export function initSearchHistory(inputEl, onSelect) {
  inputEl.addEventListener('focus', () => {
    if (!inputEl.value) showDropdown(inputEl, onSelect);
  });
  inputEl.addEventListener('input', () => {
    const val = inputEl.value;
    if (!val) {
      showDropdown(inputEl, onSelect);
      return;
    }
    // Show syntax suggestions for known prefixes
    const suggestions = getSyntaxSuggestions(val);
    if (suggestions.length > 0) {
      showSyntaxSuggestions(inputEl, suggestions, onSelect);
    } else {
      hideDropdown();
    }
  });
  // Re-show on clear
  inputEl.addEventListener('search', () => {
    if (!inputEl.value) setTimeout(() => showDropdown(inputEl, onSelect), 50);
  });
}

function showSyntaxSuggestions(inputEl, suggestions, onSelect) {
  if (!dropdownEl) createDropdown();
  currentInput = inputEl;

  dropdownEl.innerHTML = suggestions.map(s =>
    `<div class="sh-item sh-syntax" data-insert="${escAttr(s.insert)}">
      <span class="sh-icon">${s.icon}</span>
      <span class="sh-text">${escHtml(s.text)}</span>
    </div>`
  ).join('');

  dropdownEl.querySelectorAll('.sh-syntax').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onSelect(item.dataset.insert);
      hideDropdown();
    });
  });

  positionDropdown(inputEl);
  dropdownEl.classList.remove('hidden');
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
