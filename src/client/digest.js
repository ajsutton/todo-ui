// Daily digest: instant offline summary of the most important items
import { appState } from './state.js';

function toIso(d) { return d.toISOString().slice(0, 10); }

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function shortDesc(item) {
  const d = (item.description || item.id).replace(/^\[.*?\]\(.*?\)\s*/, '');
  return d.length > 70 ? d.slice(0, 69) + '…' : d;
}

function priorityBadge(p) {
  const colors = { P0: 'var(--p0)', P1: 'var(--p1)', P2: 'var(--p2)', P3: 'var(--p3)' };
  const color = colors[p] || 'var(--muted)';
  return `<span class="digest-badge" style="color:${color};border-color:${color}">${escHtml(p)}</span>`;
}

function renderSection(title, items, emptyMsg) {
  if (items.length === 0) {
    return `<section class="digest-section">
      <h3 class="digest-section-title">${title}</h3>
      <p class="digest-empty">${emptyMsg}</p>
    </section>`;
  }
  return `<section class="digest-section">
    <h3 class="digest-section-title">${title} <span class="digest-count">${items.length}</span></h3>
    <ul class="digest-list">
      ${items.map(item => `
        <li class="digest-item" data-id="${item.id}">
          ${priorityBadge(item.priority)}
          <span class="digest-item-desc">${escHtml(shortDesc(item))}</span>
          ${item.status ? `<span class="digest-item-status">${escHtml(item.status)}</span>` : ''}
          ${item.due ? `<span class="digest-item-due">Due ${escHtml(item.due)}</span>` : ''}
        </li>
      `).join('')}
    </ul>
  </section>`;
}

export function showDigest() {
  const existing = document.getElementById('digest-overlay');
  if (existing) { existing.remove(); return; }

  const today = toIso(new Date());
  const tomorrow = toIso(new Date(Date.now() + 86400000));
  const active = appState.items.filter(i => !i.doneDate);
  const done = appState.items.filter(i => i.doneDate);

  const critical = active.filter(i => i.priority === 'P0' || i.priority === 'P1');
  const dueToday = active.filter(i => i.due === today);
  const dueTomorrow = active.filter(i => i.due === tomorrow);
  const overdue = active.filter(i => i.due && i.due < today);
  const blocked = active.filter(i => i.blocked);
  const weekAgo = toIso(new Date(Date.now() - 7 * 86400000));
  const recentlyDone = done.filter(i => i.doneDate >= weekAgo)
    .sort((a, b) => b.doneDate < a.doneDate ? -1 : 1)
    .slice(0, 5);

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const overlay = document.createElement('div');
  overlay.id = 'digest-overlay';
  overlay.className = 'digest-overlay';
  overlay.innerHTML = `
    <div class="digest-backdrop"></div>
    <div class="digest-panel">
      <div class="digest-header">
        <div>
          <h2 class="digest-title">Daily Brief</h2>
          <div class="digest-date">${escHtml(dateStr)}</div>
        </div>
        <div class="digest-header-actions">
          <button class="btn-small digest-copy-btn" title="Copy as text">Copy</button>
          <button class="btn-icon digest-close">&times;</button>
        </div>
      </div>
      <div class="digest-body">
        ${overdue.length > 0 ? renderSection('⚠ Overdue', overdue, '') : ''}
        ${renderSection('🔴 Critical (P0/P1)', critical, 'No critical items — great!')}
        ${dueToday.length > 0 ? renderSection('📅 Due today', dueToday, '') : ''}
        ${dueTomorrow.length > 0 ? renderSection('📅 Due tomorrow', dueTomorrow, '') : ''}
        ${blocked.length > 0 ? renderSection('🚫 Blocked', blocked, '') : ''}
        ${renderSection('✅ Recently completed', recentlyDone, 'Nothing completed this week yet.')}
      </div>
      <div class="digest-footer">
        <span class="digest-stats">${active.length} active · ${done.length} total done · ${critical.length} critical</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('.digest-backdrop').addEventListener('click', closeDigest);
  overlay.querySelector('.digest-close').addEventListener('click', closeDigest);

  // Click item to open detail
  overlay.addEventListener('click', async (e) => {
    const item = e.target.closest('.digest-item');
    if (!item) return;
    const id = item.dataset.id;
    closeDigest();
    const { showDetail } = await import('./detail.js');
    showDetail(id);
  });

  // Copy as plain text
  overlay.querySelector('.digest-copy-btn').addEventListener('click', () => {
    const lines = [
      `Daily Brief — ${dateStr}`,
      '',
    ];
    if (overdue.length) {
      lines.push(`⚠ OVERDUE (${overdue.length})`);
      overdue.forEach(i => lines.push(`  [${i.priority}] ${shortDesc(i)}`));
      lines.push('');
    }
    if (critical.length) {
      lines.push(`🔴 CRITICAL (${critical.length})`);
      critical.forEach(i => lines.push(`  [${i.priority}] ${shortDesc(i)}${i.due ? ` — Due ${i.due}` : ''}`));
      lines.push('');
    }
    if (blocked.length) {
      lines.push(`🚫 BLOCKED (${blocked.length})`);
      blocked.forEach(i => lines.push(`  [${i.priority}] ${shortDesc(i)}`));
      lines.push('');
    }
    if (recentlyDone.length) {
      lines.push(`✅ RECENTLY DONE (${recentlyDone.length})`);
      recentlyDone.forEach(i => lines.push(`  ${shortDesc(i)}`));
    }
    navigator.clipboard?.writeText(lines.join('\n')).then(() => {
      const btn = overlay.querySelector('.digest-copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  });
}

export function closeDigest() {
  document.getElementById('digest-overlay')?.remove();
}

export function isDigestOpen() {
  return !!document.getElementById('digest-overlay');
}
