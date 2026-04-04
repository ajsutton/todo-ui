// Remembers recent searches in localStorage and shows them as a dropdown
// when focusing the search input.

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

export function initSearchHistory(inputEl, onSelect) {
  inputEl.addEventListener('focus', () => {
    if (!inputEl.value) showDropdown(inputEl, onSelect);
  });
  inputEl.addEventListener('input', () => {
    // Hide dropdown when user types
    if (inputEl.value) hideDropdown();
    else showDropdown(inputEl, onSelect);
  });
  // Re-show on clear
  inputEl.addEventListener('search', () => {
    if (!inputEl.value) setTimeout(() => showDropdown(inputEl, onSelect), 50);
  });
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
