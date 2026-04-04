// Table rendering and stats
import { appState } from './state.js';
import { syncUrl } from './url.js';
import { typeLabel, priorityIcon, statusEmoji, TYPE_EMOJI } from './icons.js';
import { filterItems, sortItems, filterSubItem } from './filters.js';
import { showPriorityPicker, showSubPriorityPicker, showDatePicker } from './pickers.js';
import { updateStaleTracker, staleDays } from './stale.js';
import { selection, isSelectionMode, toggleSelected } from './bulk.js';
import { computeUrgency, urgencyColor } from './urgency.js';
import { recordSnapshot, renderSparkline } from './history.js';
import { renderTimerBtn, showTimerPicker, getTimerItemId } from './timer.js';
import { isGroupByMode, groupItems, buildGroupHeaderRow, isGroupCollapsed } from './groupby.js';
import { pushUndo } from './undo.js';

// Stale IDs maintained across renders
let staleIds = new Set();

function truncateDesc(item) {
  const d = item.description || item.id;
  return d.length > 40 ? d.slice(0, 39) + '…' : d;
}

function applyStatusClass(el, status) {
  if (!status) return;
  const s = status.toLowerCase();
  if (s.includes('failing') || s.includes('ci fail') || s.includes('error')) el.classList.add('status-failing');
  else if (s.includes('passing') || s.includes('ci pass')) el.classList.add('status-passing');
  if (s.includes('approved')) el.classList.add('status-approved');
  if (s.includes('changes requested')) el.classList.add('status-changes-requested');
  if (s.includes('draft')) el.classList.add('status-draft');
  if (s.includes('merge queue') || s.includes('merge conflict')) el.classList.add('status-merge-issue');
  if (s === 'merged') el.classList.add('status-merged');
  if (s === 'closed') el.classList.add('status-closed');
  if (s.includes('blocked')) el.classList.add('status-blocked-text');
  if (s.includes('pending')) el.classList.add('status-pending');
}

// Lazy-loaded to avoid circular dependency (detail.js imports render.js indirectly)
function getShowDetail() {
  return import('./detail.js').then(m => m.showDetail);
}

const today = () => new Date().toISOString().slice(0, 10);

// Format a YYYY-MM-DD date as a human-friendly relative string
export function formatDueDate(due) {
  if (!due) return '';
  const now = new Date();
  const t = new Date(due + 'T00:00:00');
  const diffDays = Math.round((t - now) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 0 && diffDays <= 6) return `${diffDays}d`;
  if (diffDays > 6 && diffDays <= 13) return `${Math.round(diffDays / 7)}w`;
  if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
  // Further out: show Mon DD
  return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function refreshStale() {
  staleIds = updateStaleTracker(appState.items);
}

function updateSearchBadge(shown, total) {
  let badge = document.getElementById('search-count');
  const searchEl = document.getElementById('filter-search');
  if (!searchEl) return;
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'search-count';
    badge.className = 'search-count';
    searchEl.parentElement?.insertBefore(badge, searchEl.nextSibling);
  }
  const isFiltered = shown < total || appState.filterType || appState.filterStatus !== 'active' || appState.searchQuery;
  badge.textContent = isFiltered ? `${shown} / ${total}` : '';
  badge.classList.toggle('hidden', !isFiltered || (shown === total && !appState.searchQuery && !appState.filterType));
}

export function renderTable() {
  const allItems = [...appState.items];
  let items = filterItems(allItems, {
    filterType: appState.filterType,
    filterStatus: appState.filterStatus,
    searchQuery: appState.searchQuery,
  });
  items = sortItems(items, appState.sortColumn, appState.sortDirection, appState.sortKeys);

  updateSearchBadge(items.length, allItems.length);
  renderStats();

  const tbody = document.getElementById('todo-body');
  tbody.innerHTML = '';

  syncUrl();

  // Re-index selected row
  appState.selectedRowIndex = -1;

  // Determine column count for group header colspan
  const colSpan = isSelectionMode() ? 7 : 6;

  function appendItem(item) {
    const hasSubItems = appState.subItemCache.has(item.id);
    const isExpanded = appState.expandedItems.has(item.id);
    const tr = buildItemRow(item, { hasSubItems, isExpanded });
    tbody.appendChild(tr);
    if (isExpanded && appState.subItemCache.has(item.id)) {
      const subs = appState.subItemCache.get(item.id);
      for (const sub of subs) {
        if (!filterSubItem(sub, {
          filterStatus: appState.filterStatus,
          searchQuery: appState.searchQuery,
        })) continue;
        tbody.appendChild(buildSubItemRow(sub, item.id));
      }
    }
  }

  if (isGroupByMode()) {
    const groups = groupItems(items);
    for (const group of groups) {
      tbody.appendChild(buildGroupHeaderRow(group, group.items.length, colSpan));
      if (!isGroupCollapsed(group.key)) {
        for (const item of group.items) appendItem(item);
      }
    }
  } else {
    for (const item of items) appendItem(item);
  }
}

export function buildItemRow(item, { hasSubItems, isExpanded }) {
  const tr = document.createElement('tr');
  const isDone = !!item.doneDate;
  if (isDone) tr.classList.add('status-done');
  if (item.blocked) tr.classList.add('status-blocked');
  if (!isDone && staleIds.has(item.id)) {
    const days = staleDays(item.id);
    tr.classList.add('row-stale');
    if (days >= 30) tr.classList.add('row-stale-30');
    else if (days >= 14) tr.classList.add('row-stale-14');
  }
  tr.dataset.itemId = item.id;
  tr.onclick = async () => {
    const showDetail = await getShowDetail();
    showDetail(item.id);
  };

  // Checkbox cell (bulk mode only)
  if (isSelectionMode()) {
    const tdCheck = document.createElement('td');
    tdCheck.className = 'check-cell';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selection.has(item.id);
    cb.onclick = (e) => { e.stopPropagation(); toggleSelected(item.id); cb.checked = selection.has(item.id); };
    tdCheck.appendChild(cb);
    tr.appendChild(tdCheck);
  }

  // Type cell
  const tdType = document.createElement('td');
  tdType.classList.add('type-cell');
  tdType.innerHTML = `<span class="type-icon" title="${item.type}">${typeLabel(item.type)}</span>`;
  tr.appendChild(tdType);

  // Description cell
  const tdDesc = document.createElement('td');
  tdDesc.classList.add('desc-cell');
  const toggle = document.createElement('span');
  toggle.className = 'expand-toggle';
  if (hasSubItems) {
    toggle.textContent = isExpanded ? '\u25BC' : '\u25B6';
    toggle.onclick = (e) => {
      e.stopPropagation();
      toggleExpand(item.id);
    };
  }
  tdDesc.appendChild(toggle);

  // Urgency badge (only for active, non-blocked items)
  if (!isDone && !item.blocked) {
    const score = computeUrgency(item);
    const badge = document.createElement('span');
    badge.className = 'urgency-badge';
    badge.textContent = score;
    badge.title = `Urgency score: ${score}/100`;
    badge.style.color = urgencyColor(score);
    tdDesc.appendChild(badge);
  }

  const descSpan = document.createElement('span');
  descSpan.innerHTML = item.descriptionHtml;
  descSpan.querySelectorAll('a').forEach(a => {
    a.target = '_blank';
    a.rel = 'noopener';
    a.onclick = (e) => e.stopPropagation();
  });
  tdDesc.appendChild(descSpan);
  tr.appendChild(tdDesc);

  // Status cell with rich color coding
  const tdStatus = document.createElement('td');
  tdStatus.className = 'status-cell';
  const sEmoji = statusEmoji(item);
  tdStatus.textContent = (sEmoji ? sEmoji + ' ' : '') + item.status;
  applyStatusClass(tdStatus, item.status);
  tr.appendChild(tdStatus);

  // Priority cell
  const tdPriority = document.createElement('td');
  tdPriority.innerHTML = priorityIcon(item.priority) + ' ' + item.priority;
  tdPriority.classList.add('priority-' + item.priority.toLowerCase());
  tdPriority.classList.add('editable');
  tdPriority.onclick = (e) => {
    e.stopPropagation();
    showPriorityPicker(tdPriority, item);
  };
  tr.appendChild(tdPriority);

  // Due cell with relative display and overdue/today highlighting
  const tdDue = document.createElement('td');
  tdDue.classList.add('editable');
  if (item.due) {
    tdDue.textContent = formatDueDate(item.due);
    tdDue.title = item.due; // show raw date on hover
    if (!item.doneDate) {
      const t = today();
      if (item.due < t) {
        tdDue.classList.add('due-overdue');
      } else if (item.due === t) {
        tdDue.classList.add('due-today');
      }
    }
  }
  tdDue.onclick = (e) => {
    e.stopPropagation();
    showDatePicker(tdDue, item);
  };
  tr.appendChild(tdDue);

  // Actions cell
  const tdActions = document.createElement('td');
  tdActions.classList.add('actions-cell');
  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'actions-wrap';

  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = isDone ? 'Undo' : 'Done';
  toggleBtn.className = 'btn-small';
  toggleBtn.onclick = (e) => {
    e.stopPropagation();
    import('./actions.js').then(({ markComplete, markIncomplete }) => {
      if (isDone) {
        markIncomplete(item.id);
        pushUndo(`Marked "${truncateDesc(item)}" active`, () => markComplete(item.id));
      } else {
        markComplete(item.id).then(() => {
          import('./confetti.js').then(({ triggerConfetti }) => triggerConfetti());
        });
        pushUndo(`Marked "${truncateDesc(item)}" done`, () => markIncomplete(item.id));
      }
    });
  };
  actionsWrap.appendChild(toggleBtn);

  // Refresh button for items with a GitHub URL (PRs/Reviews)
  if (item.githubUrl && !isDone) {
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '↻';
    refreshBtn.className = 'btn-small btn-icon-inline';
    refreshBtn.title = 'Refresh PR status';
    refreshBtn.onclick = async (e) => {
      e.stopPropagation();
      refreshBtn.disabled = true;
      refreshBtn.textContent = '…';
      try {
        const res = await fetch('/api/refresh/' + item.id, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text());
      } catch (err) {
        console.error('Refresh failed:', err);
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '↻';
      }
    };
    actionsWrap.appendChild(refreshBtn);
  }

  // Focus timer button
  if (!isDone) {
    const timerBtn = document.createElement('button');
    const isActive = getTimerItemId() === item.id;
    timerBtn.textContent = '🍅';
    timerBtn.className = 'btn-small btn-icon-inline timer-btn' + (isActive ? ' timer-active' : '');
    timerBtn.title = isActive ? 'Stop focus timer' : 'Start focus timer';
    timerBtn.onclick = (e) => {
      e.stopPropagation();
      import('./timer.js').then(({ showTimerPicker, stopTimer, getTimerItemId }) => {
        if (getTimerItemId() === item.id) {
          stopTimer();
          import('./render.js').then(m => m.renderTable());
        } else {
          showTimerPicker(item.id, item.description || item.id, timerBtn);
        }
      });
    };
    actionsWrap.appendChild(timerBtn);
  }

  tdActions.appendChild(actionsWrap);
  tr.appendChild(tdActions);
  return tr;
}

export function buildSubItemRow(sub, parentId) {
  const tr = document.createElement('tr');
  tr.classList.add('sub-item-row');

  const tdType = document.createElement('td');
  tdType.classList.add('type-cell');
  tdType.innerHTML = `<span class="type-icon" title="PR">${TYPE_EMOJI.PR}</span>`;
  tr.appendChild(tdType);

  const tdDesc = document.createElement('td');
  tdDesc.classList.add('sub-item-desc');
  const link = document.createElement('a');
  link.href = sub.githubUrl;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = sub.repo.replace('ethereum-optimism/', '') + '#' + sub.number;
  link.onclick = (e) => e.stopPropagation();
  tdDesc.appendChild(link);
  if (sub.title) {
    tdDesc.appendChild(document.createTextNode(' ' + sub.title));
  }
  tr.appendChild(tdDesc);

  const tdStatus = document.createElement('td');
  tdStatus.className = 'status-cell';
  const status = sub.currentStatus;
  tdStatus.textContent = status;
  applyStatusClass(tdStatus, status);
  if (status.toLowerCase().includes('merged')) tdStatus.classList.add('sub-item-merged');
  tr.appendChild(tdStatus);

  const tdPriority = document.createElement('td');
  const p = sub.currentPriority || '';
  if (p) {
    tdPriority.innerHTML = priorityIcon(p) + ' ' + p;
    tdPriority.classList.add('priority-' + p.toLowerCase());
  }
  tdPriority.classList.add('editable');
  tdPriority.onclick = (e) => {
    e.stopPropagation();
    showSubPriorityPicker(tdPriority, sub, parentId);
  };
  tr.appendChild(tdPriority);

  const tdDue = document.createElement('td');
  tr.appendChild(tdDue);

  const tdActions = document.createElement('td');
  tr.appendChild(tdActions);

  tr.onclick = async () => {
    const showDetail = await getShowDetail();
    showDetail(parentId);
  };

  return tr;
}

function toggleExpand(id) {
  if (appState.expandedItems.has(id)) {
    appState.expandedItems.delete(id);
  } else {
    appState.expandedItems.add(id);
  }
  renderTable();
  syncUrl();
}

export async function prefetchSubItems() {
  if (appState.detailIds.size === 0) return;
  const fetches = [...appState.detailIds].map(async (id) => {
    try {
      const res = await fetch('/api/sub-items/' + id);
      if (!res.ok) return;
      const data = await res.json();
      const subs = data.subItems || [];
      if (subs.length > 0) appState.subItemCache.set(id, subs);
    } catch {}
  });
  await Promise.all(fetches);
  renderTable();
}

export function renderStats() {
  const bar = document.getElementById('stats-bar');
  if (!bar) return;

  const all = appState.items;
  const active = all.filter(i => !i.doneDate);
  const done = all.filter(i => !!i.doneDate);
  const blocked = active.filter(i => i.blocked);
  const t = today();
  const overdue = active.filter(i => i.due && i.due < t);
  const highPriority = active.filter(i => i.priority === 'P0' || i.priority === 'P1');

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const doneThisWeek = done.filter(i => i.doneDate >= weekAgo);

  const totalCount = all.length;
  const donePercent = totalCount > 0 ? Math.round((done.length / totalCount) * 100) : 0;

  const typeOrder = ['Review', 'PR', 'Issue', 'Workstream'];
  const typeCounts = {};
  for (const i of active) {
    const t2 = i.type || 'Other';
    typeCounts[t2] = (typeCounts[t2] || 0) + 1;
  }
  const typeEntries = typeOrder.filter(t2 => typeCounts[t2]).map(t2 => [t2, typeCounts[t2]]);
  for (const [t2, n] of Object.entries(typeCounts)) {
    if (!typeOrder.includes(t2)) typeEntries.push([t2, n]);
  }

  const priorityOrder = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
  const priCounts = {};
  for (const i of active) {
    const p = i.priority || 'None';
    priCounts[p] = (priCounts[p] || 0) + 1;
  }
  const priEntries = priorityOrder.filter(p => priCounts[p]).map(p => [p, priCounts[p]]);
  if (priCounts['None']) priEntries.push(['None', priCounts['None']]);

  const typeColors = { Review: 'var(--accent)', PR: 'var(--status-pass)', Issue: 'var(--p2)', Workstream: 'var(--p3)' };
  const priColors = { P0: 'var(--p0)', P1: 'var(--p1)', P2: 'var(--p2)', P3: 'var(--p3)', P4: 'var(--p4)', P5: 'var(--p5)' };

  function segmentedBar(entries, total, colorFn, filterKey, filterVal) {
    if (total === 0) return '<div class="seg-bar"></div>';
    return '<div class="seg-bar">' + entries.map(([label, count]) => {
      const pct = (count / total) * 100;
      const dataAttr = filterKey ? `data-filter-key="${filterKey}" data-filter-val="${label}"` : '';
      return `<div class="seg" style="width:${pct}%;background:${colorFn(label)}" ${dataAttr} role="button" tabindex="0">
        <span class="seg-label">${count} ${label}</span>
      </div>`;
    }).join('') + '</div>';
  }

  const p0Count = priCounts['P0'] || 0;
  const p1Count = priCounts['P1'] || 0;

  // Ambient urgency: pulse page border when P0s are active
  document.body.classList.toggle('has-p0', p0Count > 0);

  const history = recordSnapshot(active.length, p0Count, p1Count);
  const sparkSvg = renderSparkline(history, 60, 16);

  const alerts = [];
  if (blocked.length > 0) alerts.push(`<span class="stat-alert stat-blocked" data-filter-key="search" data-filter-val="blocked" role="button">${blocked.length} blocked</span>`);
  if (overdue.length > 0) alerts.push(`<span class="stat-alert stat-overdue" data-filter-key="search" data-filter-val="overdue" role="button">${overdue.length} overdue</span>`);
  alerts.push(`<span class="stat-alert stat-done">${doneThisWeek.length} done this week</span>`);
  alerts.push(`<span class="stat-alert-muted">${donePercent}% complete</span>`);
  if (sparkSvg) alerts.push(`<span class="stat-sparkline" title="Active item count over time (last ${history.length} snapshots)">${sparkSvg}</span>`);

  bar.innerHTML = `
    <div class="stats-row">
      <span class="stats-row-label">${active.length} active</span>
      ${segmentedBar(typeEntries, active.length, t2 => typeColors[t2] || 'var(--fg-secondary)', 'type', null)}
    </div>
    <div class="stats-row">
      <span class="stats-row-label">Priority</span>
      ${segmentedBar(priEntries, active.length, p => priColors[p] || 'var(--fg-secondary)', 'priority', null)}
    </div>
    <div class="stats-alerts">${alerts.join('')}</div>
  `;

  // Wire up segment click filtering
  bar.querySelectorAll('[data-filter-key]').forEach(el => {
    el.style.cursor = 'pointer';
    el.onclick = () => {
      const key = el.dataset.filterKey;
      const val = el.dataset.filterVal;
      if (key === 'type') {
        const select = document.getElementById('filter-type');
        if (select) {
          select.value = appState.filterType === val ? '' : val;
          appState.filterType = select.value;
          renderTable();
        }
      } else if (key === 'search') {
        const input = document.getElementById('filter-search');
        if (input) {
          const current = appState.searchQuery;
          input.value = current === val ? '' : val;
          appState.searchQuery = input.value;
          renderTable();
        }
      }
    };
  });
}

export function setLastUpdate(isoString) {
  const el = document.getElementById('last-update');
  if (!el) return;
  if (!isoString) { el.textContent = ''; return; }
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  let text;
  if (diffMin < 1) text = 'just now';
  else if (diffMin < 60) text = diffMin + 'm ago';
  else if (diffMin < 1440) text = Math.floor(diffMin / 60) + 'h ago';
  else text = d.toLocaleDateString();
  el.textContent = 'Updated ' + text;
  el.title = d.toLocaleString();
}

export async function fetchLastUpdateTime() {
  try {
    const res = await fetch('/api/log?limit=1&offset=0');
    if (!res.ok) return;
    const data = await res.json();
    if (data.entries.length > 0) setLastUpdate(data.entries[0].timestamp);
  } catch {}
}

export function showCopyToast(id) {
  const existing = document.getElementById('copy-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'copy-toast';
  t.className = 'copy-toast';
  t.textContent = `Copied ${id}`;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('copy-toast-visible'));
  setTimeout(() => {
    t.classList.remove('copy-toast-visible');
    setTimeout(() => t.remove(), 250);
  }, 1500);
}

export function showAutoAddedNotice(data) {
  // Simple banner notification for auto-added items
  const existing = document.getElementById('auto-added-notice');
  if (existing) existing.remove();

  const notice = document.createElement('div');
  notice.id = 'auto-added-notice';
  notice.className = 'auto-added-notice';
  notice.textContent = `${data.count} new item${data.count !== 1 ? 's' : ''} auto-added`;
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 5000);
}
