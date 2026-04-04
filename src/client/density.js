// Table row density: compact | comfortable | spacious
// Persisted in localStorage, applied as a class on the table element.

const STORAGE_KEY = 'todo-density';
const MODES = ['comfortable', 'compact', 'spacious'];
const ICONS = { comfortable: '☰', compact: '≡', spacious: '⊟' };
const LABELS = { comfortable: 'Comfortable', compact: 'Compact', spacious: 'Spacious' };

export function getDensity() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return MODES.includes(v) ? v : 'comfortable';
  } catch { return 'comfortable'; }
}

function setDensity(mode) {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
  applyDensity(mode);
  updateBtn(mode);
}

export function applyDensity(mode) {
  const table = document.getElementById('todo-table');
  if (!table) return;
  MODES.forEach(m => table.classList.remove('density-' + m));
  table.classList.add('density-' + (mode || getDensity()));
}

function updateBtn(mode) {
  const btn = document.getElementById('density-btn');
  if (!btn) return;
  btn.textContent = ICONS[mode] || '☰';
  btn.title = `Row density: ${LABELS[mode]} (click to change)`;
}

export function cycleDensity() {
  const current = getDensity();
  const next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
  setDensity(next);
}

export function initDensity() {
  const mode = getDensity();
  applyDensity(mode);

  // Create density button
  const btn = document.createElement('button');
  btn.id = 'density-btn';
  btn.className = 'btn-icon';
  btn.addEventListener('click', cycleDensity);
  updateBtn(mode);

  // Insert before theme toggle
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.parentNode.insertBefore(btn, themeBtn);
  }
}
