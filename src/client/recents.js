// Track recently viewed items in localStorage
import { appState } from './state.js';

const STORAGE_KEY = 'todo-recents';
const MAX_RECENTS = 10;

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function save(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function recordView(id) {
  let recents = load().filter(r => r !== id);
  recents.unshift(id);
  if (recents.length > MAX_RECENTS) recents = recents.slice(0, MAX_RECENTS);
  save(recents);
}

export function getRecents() {
  return load();
}

let popoverEl = null;

export function showRecentsPopover(anchorEl, onSelect) {
  closeRecentsPopover();
  const recents = getRecents();
  if (!recents.length) return;

  popoverEl = document.createElement('div');
  popoverEl.id = 'recents-popover';
  popoverEl.className = 'recents-popover';

  const priColors = { P0: 'var(--p0)', P1: 'var(--p1)', P2: 'var(--p2)', P3: 'var(--p3)' };

  popoverEl.innerHTML = `
    <div class="recents-header">
      <span>Recently viewed</span>
      <button class="recents-clear">Clear</button>
    </div>
    ${recents.map(id => {
      const item = appState.items.find(i => i.id === id);
      const desc = item ? (item.description || id).replace(/^\[.*?\]\(.*?\)\s*/, '') : id;
      const short = desc.length > 55 ? desc.slice(0, 54) + '…' : desc;
      const pri = item?.priority || '';
      const color = priColors[pri] || 'var(--muted)';
      return `<div class="recents-item" data-id="${id}">
        ${pri ? `<span class="recents-pri" style="color:${color}">${pri}</span>` : ''}
        <span class="recents-desc">${escHtml(short)}</span>
      </div>`;
    }).join('')}
  `;

  document.body.appendChild(popoverEl);

  const rect = anchorEl.getBoundingClientRect();
  popoverEl.style.position = 'fixed';
  popoverEl.style.top = (rect.bottom + 4) + 'px';
  popoverEl.style.left = rect.left + 'px';
  popoverEl.style.minWidth = Math.max(rect.width, 220) + 'px';

  popoverEl.querySelector('.recents-clear').addEventListener('click', (e) => {
    e.stopPropagation();
    save([]);
    closeRecentsPopover();
  });

  popoverEl.querySelectorAll('.recents-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onSelect(el.dataset.id);
      closeRecentsPopover();
    });
  });

  setTimeout(() => {
    document.addEventListener('click', onOutside, { once: true, capture: true });
  }, 0);
}

function onOutside(e) {
  if (popoverEl && !popoverEl.contains(e.target)) closeRecentsPopover();
  else if (popoverEl) document.addEventListener('click', onOutside, { once: true, capture: true });
}

export function closeRecentsPopover() {
  popoverEl?.remove();
  popoverEl = null;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
