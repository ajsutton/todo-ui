// "What changed since last visit" — diff item states against a localStorage snapshot
// Snapshot is saved on beforeunload and compared on first WebSocket state load.

const STORAGE_KEY = 'todo-last-visit-snapshot';
const MAX_SHOWN = 6;

/**
 * Snapshot format: { ts: number, items: { [id]: { status, priority, doneDate, description } } }
 */
function saveSnapshot(items) {
  const snapshot = {
    ts: Date.now(),
    items: {},
  };
  for (const item of items) {
    snapshot.items[item.id] = {
      status: item.status || '',
      priority: item.priority || '',
      doneDate: item.doneDate || '',
      description: (item.description || '').replace(/^\[.*?\]\(.*?\)\s*/, '').trim().slice(0, 80),
    };
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch { /* storage full — ignore */ }
}

export function initChangelogSnapshot(items) {
  // Call this the first time data arrives; register beforeunload to save future state
  saveSnapshot(items);
  window.addEventListener('beforeunload', () => {
    if (window._latestItems) saveSnapshot(window._latestItems);
  });
}

export function updateLatestItems(items) {
  window._latestItems = items;
}

/**
 * Compare current items against the saved snapshot.
 * Returns { newItems, statusChanged, priorityChanged, completed } arrays.
 */
export function diffSinceLastVisit(currentItems) {
  let snapshot;
  try {
    snapshot = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch { return null; }
  if (!snapshot) return null;

  const prev = snapshot.items;
  const newItems = [];
  const statusChanged = [];
  const priorityChanged = [];
  const completed = [];

  for (const item of currentItems) {
    if (item.doneDate) continue; // skip already-done items from current view changes
    const old = prev[item.id];
    const desc = (item.description || item.id).replace(/^\[.*?\]\(.*?\)\s*/, '').trim().slice(0, 60);

    if (!old) {
      newItems.push({ id: item.id, desc });
      continue;
    }

    if (old.status !== (item.status || '') && item.status) {
      statusChanged.push({ id: item.id, desc, from: old.status, to: item.status });
    }
    if (old.priority !== (item.priority || '') && old.priority) {
      priorityChanged.push({ id: item.id, desc, from: old.priority, to: item.priority });
    }
  }

  // Items that got completed since last visit
  for (const item of currentItems) {
    if (!item.doneDate) continue;
    const old = prev[item.id];
    if (old && !old.doneDate) {
      const desc = (item.description || item.id).replace(/^\[.*?\]\(.*?\)\s*/, '').trim().slice(0, 60);
      completed.push({ id: item.id, desc });
    }
  }

  const total = newItems.length + statusChanged.length + priorityChanged.length + completed.length;
  if (total === 0) return null;

  return { newItems, statusChanged, priorityChanged, completed, total, snapshotAge: Date.now() - snapshot.ts };
}

function formatAge(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function showChangelogBanner(diff) {
  document.getElementById('changelog-banner')?.remove();
  if (!diff) return;

  const banner = document.createElement('div');
  banner.id = 'changelog-banner';
  banner.className = 'changelog-banner';

  const parts = [];
  if (diff.newItems.length) parts.push(`${diff.newItems.length} new`);
  if (diff.statusChanged.length) parts.push(`${diff.statusChanged.length} status update${diff.statusChanged.length > 1 ? 's' : ''}`);
  if (diff.priorityChanged.length) parts.push(`${diff.priorityChanged.length} reprioritized`);
  if (diff.completed.length) parts.push(`${diff.completed.length} completed`);

  const summary = parts.join(', ');

  banner.innerHTML = `
    <span class="cl-icon">📬</span>
    <span class="cl-summary"><strong>${summary}</strong> since ${formatAge(diff.snapshotAge)}</span>
    <button class="cl-details-btn">Details</button>
    <button class="cl-close">✕</button>
  `;

  banner.querySelector('.cl-close').addEventListener('click', () => banner.remove());
  banner.querySelector('.cl-details-btn').addEventListener('click', () => showChangelogDetails(diff, banner));

  // Insert after header
  const header = document.querySelector('header');
  if (header && header.nextSibling) {
    header.parentNode.insertBefore(banner, header.nextSibling);
  } else {
    document.body.prepend(banner);
  }

  // Auto-dismiss after 15 seconds
  setTimeout(() => banner.remove(), 15000);
}

function showChangelogDetails(diff, anchorEl) {
  document.getElementById('changelog-details')?.remove();

  const pop = document.createElement('div');
  pop.id = 'changelog-details';
  pop.className = 'changelog-details';

  const sections = [];

  if (diff.newItems.length) {
    sections.push(`<div class="cld-section">
      <div class="cld-heading">✨ New items (${diff.newItems.length})</div>
      ${diff.newItems.slice(0, MAX_SHOWN).map(i =>
        `<div class="cld-row"><span class="cld-id">${escHtml(i.id)}</span><span class="cld-desc">${escHtml(i.desc)}</span></div>`
      ).join('')}
      ${diff.newItems.length > MAX_SHOWN ? `<div class="cld-more">+${diff.newItems.length - MAX_SHOWN} more</div>` : ''}
    </div>`);
  }

  if (diff.statusChanged.length) {
    sections.push(`<div class="cld-section">
      <div class="cld-heading">🔄 Status changes (${diff.statusChanged.length})</div>
      ${diff.statusChanged.slice(0, MAX_SHOWN).map(i =>
        `<div class="cld-row"><span class="cld-id">${escHtml(i.id)}</span><span class="cld-desc">${escHtml(i.desc)}</span><span class="cld-change">${escHtml(i.from)} → ${escHtml(i.to)}</span></div>`
      ).join('')}
    </div>`);
  }

  if (diff.priorityChanged.length) {
    sections.push(`<div class="cld-section">
      <div class="cld-heading">⬆️ Reprioritized (${diff.priorityChanged.length})</div>
      ${diff.priorityChanged.slice(0, MAX_SHOWN).map(i =>
        `<div class="cld-row"><span class="cld-id">${escHtml(i.id)}</span><span class="cld-desc">${escHtml(i.desc)}</span><span class="cld-change">${escHtml(i.from)} → ${escHtml(i.to)}</span></div>`
      ).join('')}
    </div>`);
  }

  if (diff.completed.length) {
    sections.push(`<div class="cld-section">
      <div class="cld-heading">✅ Completed (${diff.completed.length})</div>
      ${diff.completed.slice(0, MAX_SHOWN).map(i =>
        `<div class="cld-row"><span class="cld-id">${escHtml(i.id)}</span><span class="cld-desc">${escHtml(i.desc)}</span></div>`
      ).join('')}
    </div>`);
  }

  pop.innerHTML = `
    <div class="cld-header">Changes since last visit</div>
    ${sections.join('')}
  `;

  document.body.appendChild(pop);

  const rect = anchorEl.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.top = (rect.bottom + 4) + 'px';
  pop.style.left = rect.left + 'px';

  // Keep in viewport
  requestAnimationFrame(() => {
    const pw = pop.offsetWidth;
    const vw = window.innerWidth;
    if (rect.left + pw > vw - 8) {
      pop.style.left = Math.max(8, vw - pw - 8) + 'px';
    }
  });

  setTimeout(() => {
    document.addEventListener('click', function h(e) {
      if (!pop.contains(e.target) && e.target !== anchorEl) {
        pop.remove();
        document.removeEventListener('click', h, true);
      }
    }, { capture: true });
  }, 0);
}
