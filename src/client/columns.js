// Column visibility: show/hide individual table columns
// Persisted in localStorage.

const STORAGE_KEY = 'todo-hidden-cols';

// Columns that can be toggled: { id, label, selector }
// id matches th[data-sort] or a special marker on th
export const TOGGLEABLE_COLUMNS = [
  { id: 'type',        label: 'Type',        nth: 1 },
  { id: 'status',      label: 'Status',      nth: 3 },
  { id: 'priority',    label: 'Priority',    nth: 4 },
  { id: 'due',         label: 'Due',         nth: 5 },
  { id: 'urgency',     label: 'Urgency',     nth: 6 },
  { id: 'actions',     label: 'Actions',     nth: 7 },
];

function load() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return new Set(); }
}

function save(hidden) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
}

export function getHiddenColumns() { return load(); }

export function isColumnHidden(id) { return load().has(id); }

export function toggleColumn(id) {
  const hidden = load();
  if (hidden.has(id)) hidden.delete(id);
  else hidden.add(id);
  save(hidden);
  applyColumnVisibility();
}

export function applyColumnVisibility() {
  const hidden = load();
  const table = document.getElementById('todo-table');
  if (!table) return;

  TOGGLEABLE_COLUMNS.forEach(col => {
    const visible = !hidden.has(col.id);
    // Apply to header
    const th = table.querySelector(`th[data-sort="${col.id}"]`) ||
               table.querySelectorAll('thead th')[col.nth - 1];
    if (th) th.style.display = visible ? '' : 'none';
    // Apply to all body cells in that column position
    const nthChild = col.nth;
    table.querySelectorAll(`tbody tr`).forEach(row => {
      const cell = row.cells[col.nth - 1];
      if (cell) cell.style.display = visible ? '' : 'none';
    });
  });
}

let popoverEl = null;

export function showColumnPicker(anchorEl) {
  popoverEl?.remove();

  const hidden = load();
  const pop = document.createElement('div');
  pop.id = 'column-picker';
  pop.className = 'column-picker';

  pop.innerHTML = `
    <div class="cp-header">Visible columns</div>
    ${TOGGLEABLE_COLUMNS.map(col => `
      <label class="cp-row">
        <input type="checkbox" class="cp-check" data-col="${col.id}" ${hidden.has(col.id) ? '' : 'checked'}>
        <span class="cp-label">${col.label}</span>
      </label>
    `).join('')}
    <div class="cp-footer">
      <button class="cp-reset">Reset</button>
    </div>
  `;

  pop.querySelectorAll('.cp-check').forEach(cb => {
    cb.addEventListener('change', () => {
      toggleColumn(cb.dataset.col);
    });
  });

  pop.querySelector('.cp-reset').addEventListener('click', () => {
    save(new Set());
    applyColumnVisibility();
    // Re-render popover with all checked
    pop.querySelectorAll('.cp-check').forEach(cb => { cb.checked = true; });
  });

  document.body.appendChild(pop);
  popoverEl = pop;

  const rect = anchorEl.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.top = (rect.bottom + 4) + 'px';
  pop.style.right = (window.innerWidth - rect.right) + 'px';

  setTimeout(() => {
    document.addEventListener('mousedown', function h(e) {
      if (!pop.contains(e.target) && e.target !== anchorEl) {
        pop.remove();
        popoverEl = null;
        document.removeEventListener('mousedown', h, true);
      }
    }, { capture: true });
  }, 0);
}
