// Snooze: hide items temporarily until a specific date/time
// Snoozes are stored in localStorage as { [id]: isoDate }
// Items re-appear automatically after the snooze expires.

const STORAGE_KEY = 'todo-snooze';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function today() { return new Date().toISOString().slice(0, 10); }
function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function nextWeek() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}
function nextMonday() {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return d.toISOString().slice(0, 10);
}

export function snoozeItem(id, until) {
  const data = load();
  data[id] = until;
  save(data);
}

export function unsnoozeItem(id) {
  const data = load();
  delete data[id];
  save(data);
}

export function isSnoozed(id) {
  const data = load();
  const until = data[id];
  if (!until) return false;
  if (until <= today()) {
    // Expired — auto-remove
    delete data[id];
    save(data);
    return false;
  }
  return true;
}

export function getSnoozedUntil(id) {
  const data = load();
  return data[id] || null;
}

export function getSnoozedIds() {
  const data = load();
  const t = today();
  const active = {};
  let changed = false;
  for (const [id, until] of Object.entries(data)) {
    if (until > t) {
      active[id] = until;
    } else {
      changed = true;
    }
  }
  if (changed) save(active);
  return new Set(Object.keys(active));
}

const SNOOZE_OPTIONS = [
  { label: 'Tomorrow',   value: () => tomorrow() },
  { label: 'Next Monday',value: () => nextMonday() },
  { label: 'Next week',  value: () => nextWeek() },
];

// Show a snooze picker popover near anchorEl
export function showSnoozePicker(id, anchorEl, onSnoozed) {
  document.getElementById('snooze-picker')?.remove();

  const picker = document.createElement('div');
  picker.id = 'snooze-picker';
  picker.className = 'snooze-picker';

  const snoozedUntil = getSnoozedUntil(id);

  picker.innerHTML = `
    <div class="snooze-title">Snooze until…</div>
    ${SNOOZE_OPTIONS.map(opt =>
      `<button class="snooze-opt btn-small" data-date="${opt.value()}">${opt.label} (${opt.value()})</button>`
    ).join('')}
    ${snoozedUntil ? `<button class="snooze-unsnooze btn-small btn-secondary">Remove snooze (${snoozedUntil})</button>` : ''}
  `;

  document.body.appendChild(picker);

  const rect = anchorEl.getBoundingClientRect();
  picker.style.position = 'fixed';
  picker.style.top = (rect.bottom + 4) + 'px';
  picker.style.right = (window.innerWidth - rect.right) + 'px';

  picker.querySelectorAll('.snooze-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      snoozeItem(id, btn.dataset.date);
      picker.remove();
      onSnoozed?.();
    });
  });

  picker.querySelector('.snooze-unsnooze')?.addEventListener('click', () => {
    unsnoozeItem(id);
    picker.remove();
    onSnoozed?.();
  });

  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!picker.contains(e.target)) {
        picker.remove();
        document.removeEventListener('click', handler, true);
      }
    }, { capture: true, once: false });
  }, 50);
}
