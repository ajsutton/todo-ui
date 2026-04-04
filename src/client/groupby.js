// Group-by mode: renders the table with collapsible sections
// Cycles: off → by priority → by type → off

import { appState } from './state.js';

const STORAGE_KEY = 'todo-groupby-collapsed';

// Which groups are collapsed: Set<string> — lazily loaded on first use
let _collapsed = null;
function getCollapsed() {
  if (_collapsed === null) {
    try {
      _collapsed = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    } catch {
      _collapsed = new Set();
    }
  }
  return _collapsed;
}

function saveCollapsed() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...getCollapsed()]));
}

// groupByMode: false | 'priority' | 'type'
export function isGroupByMode() {
  return !!appState.groupByMode;
}

export function getGroupByField() {
  return appState.groupByMode || null;
}

export function toggleGroupBy() {
  if (!appState.groupByMode) {
    appState.groupByMode = 'priority';
  } else if (appState.groupByMode === 'priority') {
    appState.groupByMode = 'type';
  } else {
    appState.groupByMode = false;
  }
  // Update button label
  const btn = document.getElementById('groupby-toggle');
  if (btn) {
    if (!appState.groupByMode) btn.textContent = 'Group';
    else if (appState.groupByMode === 'priority') btn.textContent = 'Group: P';
    else btn.textContent = 'Group: T';
  }
}

export function isGroupCollapsed(group) {
  return getCollapsed().has(group);
}

export function toggleGroupCollapse(group) {
  const c = getCollapsed();
  if (c.has(group)) c.delete(group);
  else c.add(group);
  saveCollapsed();
}

// Priority display info
const PRIORITY_META = {
  P0: { label: 'P0 — Critical',   color: 'var(--p0)', emoji: '🔴' },
  P1: { label: 'P1 — High',       color: 'var(--p1)', emoji: '🟠' },
  P2: { label: 'P2 — Medium',     color: 'var(--p2)', emoji: '🟡' },
  P3: { label: 'P3 — Normal',     color: 'var(--p3)', emoji: '🔵' },
  P4: { label: 'P4 — Low',        color: 'var(--p4)', emoji: '⚪' },
  P5: { label: 'P5 — Someday',    color: 'var(--p5)', emoji: '⬜' },
};
const PRIORITY_ORDER = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];

const TYPE_META = {
  Review:      { label: 'Reviews',      color: 'var(--accent)', emoji: '👀' },
  PR:          { label: 'Pull Requests', color: 'var(--status-pass)', emoji: '🔀' },
  Issue:       { label: 'Issues',        color: 'var(--p2)', emoji: '📋' },
  Workstream:  { label: 'Workstreams',   color: 'var(--p3)', emoji: '🏗️' },
};
const TYPE_ORDER = ['Review', 'PR', 'Issue', 'Workstream'];

export function groupItems(items) {
  const field = getGroupByField() || 'priority';
  const groups = {};
  for (const item of items) {
    const key = field === 'type' ? (item.type || 'Other') : (item.priority || 'P3');
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  if (field === 'type') {
    const knownKeys = TYPE_ORDER.filter(t => groups[t]?.length);
    const otherKeys = Object.keys(groups).filter(k => !TYPE_ORDER.includes(k) && groups[k].length);
    return [...knownKeys, ...otherKeys].map(t => ({
      key: t,
      meta: TYPE_META[t] || { label: t, color: 'var(--muted)', emoji: '' },
      items: groups[t],
    }));
  }
  return PRIORITY_ORDER
    .filter(p => groups[p]?.length)
    .map(p => ({ key: p, meta: PRIORITY_META[p] || { label: p, color: 'var(--muted)', emoji: '' }, items: groups[p] }));
}

// Build a group header row element
export function buildGroupHeaderRow(group, count, colSpan) {
  const tr = document.createElement('tr');
  tr.className = 'group-header-row';
  tr.dataset.groupKey = group.key;

  const td = document.createElement('td');
  td.colSpan = colSpan;
  td.className = 'group-header-cell';

  const isCollapsed = getCollapsed().has(group.key);
  td.innerHTML = `
    <div class="group-header-inner" style="--group-color: ${group.meta.color}">
      <span class="group-chevron">${isCollapsed ? '▶' : '▼'}</span>
      <span class="group-emoji">${group.meta.emoji}</span>
      <span class="group-label">${group.meta.label}</span>
      <span class="group-count">${count} ${count === 1 ? 'item' : 'items'}</span>
    </div>
  `;

  td.addEventListener('click', () => {
    toggleGroupCollapse(group.key);
    import('./render.js').then(m => m.renderTable());
  });

  tr.appendChild(td);
  return tr;
}
