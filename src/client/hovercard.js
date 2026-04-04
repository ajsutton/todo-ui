// Hover card: shows rich item details on row hover after a short delay
import { appState } from './state.js';
import { statusEmoji } from './icons.js';
import { computeUrgency } from './urgency.js';
import { formatDueDate } from './render.js';
import { getTimeTracked, formatMinutes } from './timer.js';

let hoverTimer = null;
let activeCard = null;

function removeCard() {
  if (activeCard) { activeCard.remove(); activeCard = null; }
  clearTimeout(hoverTimer);
}

function createCard(item, anchorEl) {
  const card = document.createElement('div');
  card.className = 'hover-card';

  const sEmoji = statusEmoji(item);
  const score = computeUrgency(item);
  const dueStr = item.due ? formatDueDate(item.due) : '';

  const name = item.description.replace(/^\[.*?\]\(.*?\)\s*/, '') || item.id;
  const ghLink = item.githubUrl
    ? `<a href="${item.githubUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${item.repo ? item.repo.split('/').pop() + '#' + item.prNumber : 'Open'} ↗</a>`
    : '';

  card.innerHTML = `
    <div class="hc-header">
      <span class="hc-name">${escHtml(name)}</span>
      ${ghLink}
    </div>
    <div class="hc-meta">
      <span class="hc-badge priority-${item.priority.toLowerCase()}">${item.priority}</span>
      <span class="hc-badge">${escHtml(item.type)}</span>
      ${item.blocked ? '<span class="hc-badge hc-blocked">🚫 Blocked</span>' : ''}
    </div>
    <div class="hc-status">${sEmoji ? sEmoji + ' ' : ''}${escHtml(item.status)}</div>
    ${dueStr ? `<div class="hc-due">Due: <strong>${escHtml(dueStr)}</strong></div>` : ''}
    <div class="hc-score">Urgency: <strong>${score}</strong>/100</div>
    ${getTimeTracked(item.id) > 0 ? `<div class="hc-time">⏱ ${formatMinutes(getTimeTracked(item.id))} tracked</div>` : ''}
    ${item.id ? `<div class="hc-id">${escHtml(item.id)}</div>` : ''}
  `;

  // Position near anchor
  document.body.appendChild(card);
  const rect = anchorEl.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  let top = rect.bottom + 4 + window.scrollY;
  let left = rect.left + window.scrollX;
  if (left + cardRect.width > window.innerWidth - 20) {
    left = window.innerWidth - cardRect.width - 20;
  }
  if (top + cardRect.height > window.innerHeight + window.scrollY - 20) {
    top = rect.top - cardRect.height - 4 + window.scrollY;
  }
  card.style.top = top + 'px';
  card.style.left = left + 'px';

  return card;
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function initHoverCards() {
  const tbody = document.getElementById('todo-body');
  if (!tbody) return;

  // Use event delegation on tbody
  tbody.addEventListener('mouseenter', (e) => {
    const tr = e.target.closest('tr[data-item-id]');
    if (!tr) return;
    removeCard();
    hoverTimer = setTimeout(() => {
      const id = tr.dataset.itemId;
      const item = appState.items.find(i => i.id === id);
      if (!item || item.doneDate) return;
      activeCard = createCard(item, tr);
    }, 600); // 600ms delay to avoid flicker
  }, true);

  tbody.addEventListener('mouseleave', (e) => {
    const tr = e.target.closest('tr[data-item-id]');
    if (tr) removeCard();
  }, true);

  document.addEventListener('scroll', removeCard, { passive: true });
  document.addEventListener('keydown', removeCard, { passive: true });
}
