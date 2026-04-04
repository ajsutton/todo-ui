// Session tracking: items completed since page load, session duration
// Purely in-memory — resets on page refresh.
import { recordCompletion, renderStreakBadge } from './streak.js';

const sessionStart = Date.now();
const completedThisSession = []; // { id, description, completedAt }
let prevDoneSet = null; // Set of item IDs that were done on last update

export function updateSessionStats(items) {
  if (prevDoneSet === null) {
    // First call: initialize without recording anything as "newly done"
    prevDoneSet = new Set(items.filter(i => i.doneDate).map(i => i.id));
    return;
  }

  for (const item of items) {
    if (item.doneDate && !prevDoneSet.has(item.id)) {
      // Newly completed this session
      const desc = (item.description || item.id).replace(/^\[.*?\]\(.*?\)\s*/, '').trim();
      completedThisSession.push({ id: item.id, description: desc, completedAt: Date.now() });
      const today = new Date().toISOString().slice(0, 10);
      recordCompletion(today);
      renderStreakBadge();
    }
  }
  // Update done set
  prevDoneSet = new Set(items.filter(i => i.doneDate).map(i => i.id));

  renderSessionBadge();
}

function sessionDuration() {
  const elapsed = Date.now() - sessionStart;
  const mins = Math.floor(elapsed / 60000);
  if (mins < 1) return '< 1m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function renderSessionBadge() {
  let badge = document.getElementById('session-badge');
  if (!badge) return;
  const count = completedThisSession.length;
  if (count === 0) {
    badge.classList.add('hidden');
    return;
  }
  badge.classList.remove('hidden');
  badge.textContent = `✓ ${count} done this session`;
  badge.title = `Session: ${sessionDuration()}\n${completedThisSession.map(c => `• ${c.description}`).join('\n')}`;
}

export function initSessionBadge() {
  const badge = document.createElement('span');
  badge.id = 'session-badge';
  badge.className = 'session-badge hidden';
  badge.addEventListener('click', showSessionPopover);
  // Append to header-right
  const headerRight = document.querySelector('.header-right');
  if (headerRight) headerRight.insertBefore(badge, headerRight.firstChild);
}

function showSessionPopover() {
  document.getElementById('session-popover')?.remove();

  const pop = document.createElement('div');
  pop.id = 'session-popover';
  pop.className = 'session-popover';

  const count = completedThisSession.length;
  const itemsHtml = completedThisSession
    .slice().reverse() // most recent first
    .slice(0, 10)
    .map(c => `<div class="sp-item">
      <span class="sp-check">✓</span>
      <span class="sp-desc">${escHtml(c.description)}</span>
    </div>`)
    .join('');

  pop.innerHTML = `
    <div class="sp-header">
      <strong>${count} completed this session</strong>
      <span class="sp-duration">${sessionDuration()}</span>
    </div>
    <div class="sp-items">${itemsHtml}</div>
    ${count > 10 ? `<div class="sp-more">+${count - 10} more</div>` : ''}
  `;

  document.body.appendChild(pop);

  const badge = document.getElementById('session-badge');
  if (badge) {
    const rect = badge.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    pop.style.left = Math.min(rect.left, window.innerWidth - 280) + 'px';
  }

  setTimeout(() => {
    document.addEventListener('click', function h(e) {
      if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', h, true); }
    }, { capture: true });
  }, 0);
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
