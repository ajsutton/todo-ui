// Week view: mini calendar overlay showing items due this week
import { appState } from './state.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getWeekDays(referenceDate) {
  const d = new Date(referenceDate);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7)); // Start on Monday
  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    days.push(day);
  }
  return days;
}

function toIso(d) {
  return d.toISOString().slice(0, 10);
}

export function showWeekView() {
  const existing = document.getElementById('week-view-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'week-view-overlay';
  overlay.className = 'week-view-overlay';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = toIso(today);
  const days = getWeekDays(today);

  // Group active items by due date
  const active = appState.items.filter(i => !i.doneDate && i.due);
  const byDate = {};
  for (const item of active) {
    if (!byDate[item.due]) byDate[item.due] = [];
    byDate[item.due].push(item);
  }

  // Items with no due date but overdue or due this week
  const weekStart = toIso(days[0]);
  const weekEnd = toIso(days[6]);

  const priColors = { P0: 'var(--p0)', P1: 'var(--p1)', P2: 'var(--p2)', P3: 'var(--p3)', P4: 'var(--p4)' };

  function renderItem(item) {
    const color = priColors[item.priority] || 'var(--muted)';
    const desc = (item.description || item.id).replace(/^\[.*?\]\(.*?\)\s*/, '');
    return `<div class="wv-item" data-id="${item.id}" style="border-left-color:${color}">
      <span class="wv-item-pri" style="color:${color}">${item.priority}</span>
      <span class="wv-item-desc">${escHtml(desc.length > 50 ? desc.slice(0, 49) + '…' : desc)}</span>
    </div>`;
  }

  const cols = days.map(day => {
    const iso = toIso(day);
    const items = byDate[iso] || [];
    const isToday = iso === todayIso;
    const isPast = iso < todayIso;
    const dayLabel = isToday ? 'Today' : DAY_NAMES[day.getDay()];
    const dateLabel = `${day.getMonth() + 1}/${day.getDate()}`;
    const cls = ['wv-day', isToday ? 'wv-today' : '', isPast ? 'wv-past' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}">
      <div class="wv-day-header">
        <span class="wv-day-name">${dayLabel}</span>
        <span class="wv-day-date">${dateLabel}</span>
        ${items.length > 0 ? `<span class="wv-day-count">${items.length}</span>` : ''}
      </div>
      <div class="wv-day-items">
        ${items.length > 0 ? items.map(renderItem).join('') : '<span class="wv-empty">—</span>'}
      </div>
    </div>`;
  }).join('');

  // Items overdue (due before this week)
  const overdueItems = active.filter(i => i.due && i.due < weekStart);
  const overdueHtml = overdueItems.length > 0
    ? `<div class="wv-overdue-section">
        <div class="wv-overdue-header">⚠ Overdue (${overdueItems.length})</div>
        ${overdueItems.map(renderItem).join('')}
      </div>`
    : '';

  overlay.innerHTML = `
    <div class="wv-backdrop"></div>
    <div class="wv-panel">
      <div class="wv-header">
        <h2 class="wv-title">This Week</h2>
        <button class="btn-icon wv-close">&times;</button>
      </div>
      ${overdueHtml}
      <div class="wv-grid">${cols}</div>
      <div class="wv-footer">
        <span class="wv-hint">Click an item to open it • <kbd class="shortcut-key">w</kbd> to close</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close handlers
  overlay.querySelector('.wv-backdrop').addEventListener('click', closeWeekView);
  overlay.querySelector('.wv-close').addEventListener('click', closeWeekView);

  // Click items
  overlay.addEventListener('click', async (e) => {
    const item = e.target.closest('.wv-item');
    if (!item) return;
    const id = item.dataset.id;
    closeWeekView();
    const { showDetail } = await import('./detail.js');
    showDetail(id);
  });
}

export function closeWeekView() {
  document.getElementById('week-view-overlay')?.remove();
}

export function isWeekViewOpen() {
  return !!document.getElementById('week-view-overlay');
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
