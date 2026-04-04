// Right-click context menu for table rows
import { appState } from './state.js';

let menuEl = null;

function closeMenu() {
  menuEl?.remove();
  menuEl = null;
}

// Close on any outside click or scroll (guarded for non-browser environments)
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('mousedown', (e) => {
    if (menuEl && !menuEl.contains(e.target)) closeMenu();
  }, true);
  document.addEventListener('scroll', closeMenu, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); }, true);
}

function menuItem(icon, label, action, danger = false) {
  const li = document.createElement('li');
  li.className = 'ctx-item' + (danger ? ' ctx-item-danger' : '');
  li.innerHTML = `<span class="ctx-icon">${icon}</span><span class="ctx-label">${label}</span>`;
  li.addEventListener('mousedown', (e) => {
    e.preventDefault();
    closeMenu();
    action();
  });
  return li;
}

function menuDivider() {
  const li = document.createElement('li');
  li.className = 'ctx-divider';
  return li;
}

export function showContextMenu(e, item, row) {
  e.preventDefault();
  closeMenu();

  menuEl = document.createElement('ul');
  menuEl.className = 'ctx-menu';

  const isDone = !!item.doneDate;
  const isSnoozedNow = (() => {
    try {
      const snoozed = JSON.parse(localStorage.getItem('todo-snoozed') || '{}');
      const until = snoozed[item.id];
      return until && until >= new Date().toISOString().slice(0, 10);
    } catch { return false; }
  })();

  const isPinnedNow = (() => {
    try {
      const pins = JSON.parse(localStorage.getItem('todo-pinned') || '[]');
      return pins.includes(item.id);
    } catch { return false; }
  })();

  // Mark done / undone
  menuEl.appendChild(menuItem(
    isDone ? '↩' : '✓',
    isDone ? 'Mark active' : 'Mark done',
    () => import('./actions.js').then(({ markComplete, markIncomplete }) => {
      if (isDone) {
        markIncomplete(item.id);
      } else {
        markComplete(item.id);
      }
    })
  ));

  menuEl.appendChild(menuDivider());

  // Priority submenu — flat list
  const priorities = ['P0', 'P1', 'P2', 'P3', 'P4'];
  priorities.forEach(p => {
    const isCurrent = item.priority === p;
    const li = menuItem('', `Set ${p}${isCurrent ? ' ✓' : ''}`, () => {
      import('./actions.js').then(({ setPriority }) => setPriority(item.id, p));
    });
    li.querySelector('.ctx-icon').textContent = getPriorityDot(p);
    if (isCurrent) li.classList.add('ctx-item-current');
    menuEl.appendChild(li);
  });

  menuEl.appendChild(menuDivider());

  // Due date
  menuEl.appendChild(menuItem('📅', 'Set due date', () => {
    const dueCell = row.querySelector('[data-col="due"]');
    if (dueCell) {
      import('./pickers.js').then(({ showDatePicker }) => showDatePicker(dueCell, item));
    }
  }));

  // Snooze
  menuEl.appendChild(menuItem(
    isSnoozedNow ? '🔔' : '💤',
    isSnoozedNow ? 'Unsnooze' : 'Snooze until tomorrow',
    () => import('./snooze.js').then(({ snoozeItem, unsnoozeItem }) => {
      if (isSnoozedNow) {
        unsnoozeItem(item.id);
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        snoozeItem(item.id, tomorrow.toISOString().slice(0, 10));
      }
      import('./render.js').then(m => m.renderTable());
    })
  ));

  // Pin
  menuEl.appendChild(menuItem(
    isPinnedNow ? '📌' : '📍',
    isPinnedNow ? 'Unpin' : 'Pin to top',
    () => {
      import('./pinned.js').then(({ togglePin }) => togglePin(item.id));
      import('./render.js').then(m => m.renderTable());
    }
  ));

  menuEl.appendChild(menuDivider());

  // Copy
  menuEl.appendChild(menuItem('📋', 'Copy to clipboard', () => {
    let text;
    if (item.githubUrl && item.repo && item.prNumber) {
      const title = (item.description || '').replace(/^\[.*?\]\(.*?\)\s*/, '').trim();
      const status = item.status ? ` — ${item.status}` : '';
      text = `${item.repo}#${item.prNumber}: ${title}${status} [${item.priority}]`;
    } else {
      const desc = (item.description || item.id).replace(/^\[.*?\]\(.*?\)\s*/, '').trim();
      text = `${item.id}: ${desc} [${item.priority}]`;
    }
    navigator.clipboard?.writeText(text).then(() => {
      import('./render.js').then(({ showCopyToast }) => showCopyToast(item.id));
    }).catch(() => {});
  }));

  // Open GitHub
  if (item.githubUrl) {
    menuEl.appendChild(menuItem('🔗', 'Open on GitHub', () => {
      window.open(item.githubUrl, '_blank', 'noopener');
    }));
  }

  // Open detail
  menuEl.appendChild(menuItem('🔍', 'Open detail', () => {
    import('./detail.js').then(({ showDetail }) => showDetail(item.id));
  }));

  document.body.appendChild(menuEl);

  // Position: near cursor, keep in viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mw = 200; // approx menu width
  const mh = menuEl.scrollHeight || 300;

  let x = e.clientX;
  let y = e.clientY;
  if (x + mw > vw - 8) x = vw - mw - 8;
  if (y + mh > vh - 8) y = vh - mh - 8;
  if (y < 4) y = 4;

  menuEl.style.left = x + 'px';
  menuEl.style.top = y + 'px';
}

function getPriorityDot(p) {
  const dots = { P0: '🔴', P1: '🟠', P2: '🟡', P3: '🔵', P4: '⚪' };
  return dots[p] || '';
}
