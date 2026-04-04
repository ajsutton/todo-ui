// URL state — read initial values from URL params
function getUrlParams() {
  const p = new URLSearchParams(location.search);
  return {
    filterType: p.get('type') || '',
    filterStatus: p.has('status') ? (p.get('status') === 'all' ? '' : p.get('status')) : 'active',
    searchQuery: p.get('search') || '',
    sortColumn: p.get('sort') || 'priority',
    sortDirection: p.get('dir') || 'asc',
    detailId: p.get('detail') || '',
    expanded: p.get('expanded') ? p.get('expanded').split(',') : [],
  };
}

function syncUrl() {
  const p = new URLSearchParams();
  if (filterType) p.set('type', filterType);
  if (filterStatus !== 'active') p.set('status', filterStatus || 'all');
  if (searchQuery) p.set('search', searchQuery);
  if (sortColumn !== 'priority') p.set('sort', sortColumn);
  if (sortDirection !== 'asc') p.set('dir', sortDirection);
  const detailPanel = document.getElementById('detail-panel');
  const detailIdEl = document.getElementById('detail-id');
  if (detailPanel && detailPanel.classList.contains('visible') && detailIdEl.textContent) {
    p.set('detail', detailIdEl.textContent);
  }
  if (expandedItems.size > 0) p.set('expanded', [...expandedItems].join(','));
  const qs = p.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

// State
const urlParams = getUrlParams();
let state = { items: [], rawMarkdown: '', lastModified: 0 };
let sortColumn = urlParams.sortColumn;
let sortDirection = urlParams.sortDirection;
let filterType = urlParams.filterType;
let filterStatus = urlParams.filterStatus;
let searchQuery = urlParams.searchQuery;
let ws = null;
let reconnectAttempts = 0;
let currentDetailRaw = null;
let currentDetailHtml = null;
let detailEditMode = false;
let detailIds = new Set();          // IDs that have detail files
let expandedItems = new Set(urlParams.expanded); // IDs currently expanded to show sub-items
let subItemCache = new Map();       // id -> sub-items array

// Prompt history (persisted in localStorage)
const HISTORY_KEY = 'claude-prompt-history';
const MAX_HISTORY = 100;
let promptHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
let historyIndex = -1;
let savedInput = '';

function pushHistory(prompt) {
  if (!prompt.trim()) return;
  // Avoid consecutive duplicates
  if (promptHistory.length > 0 && promptHistory[promptHistory.length - 1] === prompt) return;
  promptHistory.push(prompt);
  if (promptHistory.length > MAX_HISTORY) promptHistory.shift();
  localStorage.setItem(HISTORY_KEY, JSON.stringify(promptHistory));
}

function resetHistoryNav() {
  historyIndex = -1;
  savedInput = '';
}

// WebSocket
function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => {
    document.getElementById('connection-status').className = 'status-indicator connected';
    reconnectAttempts = 0;
  };

  ws.onclose = () => {
    document.getElementById('connection-status').className = 'status-indicator disconnected';
    setTimeout(connectWebSocket, Math.min(1000 * Math.pow(2, reconnectAttempts++), 30000));
  };

  ws.onerror = () => {}; // onclose fires after onerror

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'state') {
      if (msg.data.detailIds) detailIds = new Set(msg.data.detailIds);
      subItemCache.clear(); // detail files may have changed
      state = msg.data;
      renderTable();
      prefetchSubItems();
      refreshOpenDetail();
    } else if (msg.type === 'update-progress') {
      handleUpdateProgress(msg.data);
    } else if (msg.type === 'claude-status') {
      handleClaudeStatus(msg.data);
    } else if (msg.type === 'standup-status') {
      handleStandupStatus(msg.data);
    } else if (msg.type === 'items-auto-added') {
      showAutoAddedNotice(msg.data);
    } else if (msg.type === 'reload') {
      // Debounce reload — wait 30s after last change to allow all pending writes to complete
      clearTimeout(window._reloadTimer);
      window._reloadTimer = setTimeout(() => location.reload(), 10000);
    }
  };
}

// Display name helper — strips markdown link prefix to show human-readable description
function itemDisplayName(item) {
  const title = (item.description || '').replace(/^\[.*?\]\(.*?\)\s*/, '');
  if (title) return title;
  if (item.repo && item.prNumber) return item.repo.replace('ethereum-optimism/', '') + '#' + item.prNumber;
  return item.id || 'Unknown';
}

// Stats
function renderStats() {
  const bar = document.getElementById('stats-bar');
  if (!bar) return;

  const all = state.items;
  const active = all.filter(i => !i.doneDate);
  const done = all.filter(i => !!i.doneDate);
  const blocked = active.filter(i => i.blocked);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = active.filter(i => i.due && i.due < today);
  const highPriority = active.filter(i => i.priority === 'P0' || i.priority === 'P1');

  // Done in last 7 days
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const doneThisWeek = done.filter(i => i.doneDate >= weekAgo);

  // Completion rate
  const totalCount = all.length;
  const donePercent = totalCount > 0 ? Math.round((done.length / totalCount) * 100) : 0;

  // Type breakdown
  const typeOrder = ['Review', 'PR', 'Issue', 'Workstream'];
  const typeCounts = {};
  for (const i of active) {
    const t = i.type || 'Other';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const typeEntries = typeOrder.filter(t => typeCounts[t]).map(t => [t, typeCounts[t]]);
  for (const [t, n] of Object.entries(typeCounts)) {
    if (!typeOrder.includes(t)) typeEntries.push([t, n]);
  }

  // Priority breakdown
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

  function segmentedBar(entries, total, colorFn) {
    if (total === 0) return '<div class="seg-bar"></div>';
    return '<div class="seg-bar">' + entries.map(([label, count]) => {
      const pct = (count / total) * 100;
      return `<div class="seg" style="width:${pct}%;background:${colorFn(label)}">
        <span class="seg-label">${count} ${label}</span>
      </div>`;
    }).join('') + '</div>';
  }

  // Alerts as inline items
  const alerts = [];
  if (blocked.length > 0) alerts.push(`<span class="stat-alert stat-blocked">${blocked.length} blocked</span>`);
  if (overdue.length > 0) alerts.push(`<span class="stat-alert stat-overdue">${overdue.length} overdue</span>`);
  alerts.push(`<span class="stat-alert stat-done">${doneThisWeek.length} done this week</span>`);
  alerts.push(`<span class="stat-alert-muted">${donePercent}% complete</span>`);

  bar.innerHTML = `
    <div class="stats-row">
      <span class="stats-row-label">${active.length} active</span>
      ${segmentedBar(typeEntries, active.length, t => typeColors[t] || 'var(--fg-secondary)')}
    </div>
    <div class="stats-row">
      <span class="stats-row-label">Priority</span>
      ${segmentedBar(priEntries, active.length, p => priColors[p] || 'var(--fg-secondary)')}
    </div>
    <div class="stats-alerts">${alerts.join('')}</div>
  `;
}

// Icon helpers
const TYPE_EMOJI = { Review: '👀', PR: '🔀', Workstream: '🏗️', Issue: '📋' };

function typeLabel(t) {
  return TYPE_EMOJI[t] || '📌';
}

// Priority icons — SVG urgency indicators (shape + color, like Linear/Jira)
const PRIORITY_ICONS = {
  P0: `<svg class="priority-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M8 1l1.5 3.5L13 5l-2.5 2.5L11 11.5 8 9.5 5 11.5l.5-4L3 5l3.5-.5z" fill="#e53e3e" stroke="#e53e3e" stroke-width=".5"/><line x1="3" y1="13" x2="13" y2="13" stroke="#e53e3e" stroke-width="2" stroke-linecap="round"/></svg>`,
  P1: `<svg class="priority-icon" viewBox="0 0 16 16" width="16" height="16"><rect x="2" y="3" width="12" height="10" rx="2" fill="none" stroke="#dd6b20" stroke-width="1.5"/><path d="M5 6.5h6M5 9.5h4" stroke="#dd6b20" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="3" r="2.5" fill="#dd6b20"/></svg>`,
  P2: `<svg class="priority-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M4 12V4l4 2.5L4 9" fill="none" stroke="#d69e2e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="4" y1="12" x2="4" y2="4" stroke="#d69e2e" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  P3: `<svg class="priority-icon" viewBox="0 0 16 16" width="16" height="16"><line x1="4" y1="8" x2="12" y2="8" stroke="#718096" stroke-width="2" stroke-linecap="round"/></svg>`,
  P4: `<svg class="priority-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l4 4-4 4" fill="none" stroke="#a0aec0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  P5: `<svg class="priority-icon" viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="2" fill="#cbd5e0"/></svg>`,
};

function priorityIcon(p) {
  return PRIORITY_ICONS[p] || '';
}

function statusEmoji(item) {
  const s = item.status.toLowerCase();
  if (item.blocked) return '🚫';
  if (item.doneDate) {
    if (s.includes('merged')) return '✅';
    if (s.includes('closed')) return '🗑️';
    if (s.includes('approved')) return '👍';
    return '✅';
  }
  // Merge queue
  if (s.includes('merge queue')) return '🚂';
  // Ready to merge: approved + CI passing, not draft
  if (s.includes('approved') && s.includes('ci passing')) return '🚀';
  if (s.includes('approved')) return '👍';
  if (s.includes('draft')) return '📝';
  if (s.includes('failing')) return '❌';
  if (s.includes('ci passing')) return '✅';
  if (s.includes('conflict')) return '⚠️';
  if (s.includes('changes requested')) return '🔄';
  return '';
}

// Rendering
function renderTable() {
  let items = [...state.items];
  items = filterItems(items);
  items = sortItems(items);

  renderStats();

  const tbody = document.getElementById('todo-body');
  tbody.innerHTML = '';

  syncUrl();

  for (const item of items) {
    const hasSubItems = subItemCache.has(item.id);
    const isExpanded = expandedItems.has(item.id);

    const tr = buildItemRow(item, { hasSubItems, isExpanded });
    tbody.appendChild(tr);

    // Render sub-items if expanded
    if (isExpanded && subItemCache.has(item.id)) {
      const subs = subItemCache.get(item.id);
      for (const sub of subs) {
        if (!filterSubItem(sub)) continue;
        const subTr = buildSubItemRow(sub, item.id);
        tbody.appendChild(subTr);
      }
    }
  }
}

function buildItemRow(item, { hasSubItems, isExpanded }) {
  const tr = document.createElement('tr');
  const isDone = !!item.doneDate;
  if (isDone) tr.classList.add('status-done');
  if (item.blocked) tr.classList.add('status-blocked');
  tr.onclick = () => showDetail(item.id);

  // Type cell (first)
  const tdType = document.createElement('td');
  tdType.classList.add('type-cell');
  tdType.innerHTML = `<span class="type-icon" title="${item.type}">${typeLabel(item.type)}</span>`;
  tr.appendChild(tdType);

  // Description cell — with expand toggle if has sub-items
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
  const descSpan = document.createElement('span');
  descSpan.innerHTML = item.descriptionHtml;
  descSpan.querySelectorAll('a').forEach(a => {
    a.target = '_blank';
    a.rel = 'noopener';
    a.onclick = (e) => e.stopPropagation();
  });
  tdDesc.appendChild(descSpan);
  tr.appendChild(tdDesc);

  // Status cell
  const tdStatus = document.createElement('td');
  const sEmoji = statusEmoji(item);
  tdStatus.textContent = (sEmoji ? sEmoji + ' ' : '') + item.status;
  if (item.status.toLowerCase().includes('failing')) tdStatus.classList.add('status-failing');
  if (item.status.toLowerCase().includes('passing')) tdStatus.classList.add('status-passing');
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

  // Due cell
  const tdDue = document.createElement('td');
  tdDue.textContent = item.due;
  tdDue.classList.add('editable');
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
    if (isDone) markIncomplete(item.id); else markComplete(item.id);
  };
  actionsWrap.appendChild(toggleBtn);
  tdActions.appendChild(actionsWrap);
  tr.appendChild(tdActions);
  return tr;
}

function buildSubItemRow(sub, parentId) {
  const tr = document.createElement('tr');
  tr.classList.add('sub-item-row');

  // Type cell (first) — PR icon
  const tdType = document.createElement('td');
  tdType.classList.add('type-cell');
  tdType.innerHTML = `<span class="type-icon" title="PR">${TYPE_EMOJI.PR}</span>`;
  tr.appendChild(tdType);

  // Description cell — indented, with link to the PR/issue
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

  // Status cell
  const tdStatus = document.createElement('td');
  const status = sub.currentStatus;
  tdStatus.textContent = status;
  if (status.toLowerCase().includes('failing')) tdStatus.classList.add('status-failing');
  if (status.toLowerCase().includes('passing')) tdStatus.classList.add('status-passing');
  if (status.toLowerCase().includes('merged')) tdStatus.classList.add('sub-item-merged');
  tr.appendChild(tdStatus);

  // Priority cell — editable
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

  // Due cell — empty
  const tdDue = document.createElement('td');
  tr.appendChild(tdDue);

  // Actions cell — empty
  const tdActions = document.createElement('td');
  tr.appendChild(tdActions);

  // Click row to open parent detail
  tr.onclick = () => showDetail(parentId);

  return tr;
}

function showSubPriorityPicker(cell, sub, parentId) {
  document.querySelectorAll('.priority-picker').forEach(el => el.remove());
  const picker = document.createElement('div');
  picker.className = 'priority-picker';
  const priorities = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
  for (const p of priorities) {
    const btn = document.createElement('button');
    btn.textContent = p;
    btn.className = 'btn-small priority-' + p.toLowerCase();
    if (p === sub.currentPriority) btn.classList.add('current');
    btn.onclick = (e) => {
      e.stopPropagation();
      picker.remove();
      if (p !== sub.currentPriority) updateSubPriority(parentId, sub.repo, sub.number, p);
    };
    picker.appendChild(btn);
  }
  cell.style.position = 'relative';
  cell.appendChild(picker);
  const close = (e) => {
    if (!picker.contains(e.target)) {
      picker.remove();
      document.removeEventListener('click', close, true);
    }
  };
  setTimeout(() => document.addEventListener('click', close, true), 0);
}

async function updateSubPriority(parentId, repo, number, priority) {
  try {
    const res = await fetch('/api/sub-priority/' + parentId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, number, priority }),
    });
    if (!res.ok) throw new Error(await res.text());
  } catch (err) {
    console.error('Failed to set sub-item priority:', err);
  }
}

function toggleExpand(id) {
  if (expandedItems.has(id)) {
    expandedItems.delete(id);
  } else {
    expandedItems.add(id);
  }
  renderTable();
  syncUrl();
}

async function prefetchSubItems() {
  if (detailIds.size === 0) return;
  const fetches = [...detailIds].map(async (id) => {
    try {
      const res = await fetch('/api/sub-items/' + id);
      if (!res.ok) return;
      const data = await res.json();
      const subs = data.subItems || [];
      if (subs.length > 0) subItemCache.set(id, subs);
    } catch {}
  });
  await Promise.all(fetches);
  renderTable();
}

// Sorting
function sortItems(items) {
  return items.sort((a, b) => {
    let aVal, bVal;
    if (sortColumn === 'priority') {
      const aNum = parseInt(a.priority.replace('P', ''));
      const bNum = parseInt(b.priority.replace('P', ''));
      aVal = Number.isNaN(aNum) ? 99 : aNum;
      bVal = Number.isNaN(bNum) ? 99 : bNum;
    } else if (sortColumn === 'id') {
      aVal = parseInt(a.id.replace('TODO-', '')) || 0;
      bVal = parseInt(b.id.replace('TODO-', '')) || 0;
    } else {
      aVal = (a[sortColumn] || '').toLowerCase();
      bVal = (b[sortColumn] || '').toLowerCase();
    }
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDirection === 'asc' ? cmp : -cmp;
  });
}

// Filtering
function filterItems(items) {
  const query = searchQuery.trim().toLowerCase();
  return items.filter(item => {
    if (filterType && item.type !== filterType) return false;
    if (filterStatus === 'active' && item.doneDate) return false;
    if (filterStatus === 'done' && !item.doneDate) return false;
    if (query) {
      const searchable = [item.id, item.description, item.type, item.status, item.priority, item.due].join(' ').toLowerCase();
      if (!searchable.includes(query)) return false;
    }
    return true;
  });
}

function isSubItemDone(sub) {
  const s = sub.currentStatus.toLowerCase();
  return s.includes('merged') || s.includes('closed');
}

function filterSubItem(sub) {
  if (filterStatus === 'active' && isSubItemDone(sub)) return false;
  if (filterStatus === 'done' && !isSubItemDone(sub)) return false;
  if (searchQuery) {
    const searchable = [sub.repo, '#' + sub.number, sub.title, sub.currentStatus, sub.currentPriority].join(' ').toLowerCase();
    if (!searchable.includes(searchQuery.trim().toLowerCase())) return false;
  }
  return true;
}

// Detail panel
async function showDetail(id) {
  const panel = document.getElementById('detail-panel');
  const title = document.getElementById('detail-title');
  const content = document.getElementById('detail-content');

  if (detailEditMode) exitDetailEditMode(false);
  currentDetailRaw = null;
  currentDetailHtml = null;
  document.getElementById('detail-edit').classList.add('hidden');

  const item = state.items.find(i => i.id === id);
  const descText = item ? item.description.replace(/^\[.*?\]\(.*?\)\s*/, '') : id;
  title.textContent = descText || id;
  document.getElementById('detail-id').textContent = id;
  content.innerHTML = '<p>Loading...</p>';
  panel.classList.add('visible');
  syncUrl();

  try {
    const res = await fetch('/api/detail/' + id);
    if (res.ok) {
      const detail = await res.json();
      currentDetailRaw = detail.content;
      currentDetailHtml = detail.contentHtml;
      content.innerHTML = detail.contentHtml;
    } else {
      currentDetailRaw = '';
      currentDetailHtml = '';
      content.innerHTML = '';
    }
    document.getElementById('detail-edit').classList.remove('hidden');
  } catch (err) {
    content.innerHTML = '<p>Error loading details.</p>';
  }
}

function refreshOpenDetail() {
  const panel = document.getElementById('detail-panel');
  if (!panel.classList.contains('visible')) return;
  if (detailEditMode) return; // Don't refresh while editing
  const id = document.getElementById('detail-id').textContent;
  if (id) showDetail(id);
}

// Split markdown into alternating table/text segments
function splitDetailSegments(markdown) {
  const lines = markdown.split('\n');
  const segments = [];
  let currentType = null;
  let currentLines = [];

  for (const line of lines) {
    const type = line.trimStart().startsWith('|') ? 'table' : 'text';
    if (type !== currentType) {
      if (currentLines.length > 0) {
        segments.push({ type: currentType, lines: currentLines });
      }
      currentType = type;
      currentLines = [];
    }
    currentLines.push(line);
  }
  if (currentLines.length > 0) {
    segments.push({ type: currentType, lines: currentLines });
  }
  return segments;
}

function enterDetailEditMode() {
  if (!currentDetailRaw) return;
  detailEditMode = true;

  document.getElementById('detail-edit').classList.add('hidden');
  document.getElementById('detail-save').classList.remove('hidden');
  document.getElementById('detail-cancel').classList.remove('hidden');

  const content = document.getElementById('detail-content');
  const segments = splitDetailSegments(currentDetailRaw);

  // Find the index after the last table segment — only content after it is editable
  let lastTableIdx = -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].type === 'table') { lastTableIdx = i; break; }
  }

  // Everything up to and including the last table stays as rendered HTML
  const lockedLines = [];
  const editableLines = [];
  for (let i = 0; i < segments.length; i++) {
    if (i <= lastTableIdx) {
      lockedLines.push(...segments[i].lines);
    } else {
      editableLines.push(...segments[i].lines);
    }
  }

  // Remove everything after the last table from the rendered content, replace with textarea
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = currentDetailHtml;
  const tables = tempDiv.querySelectorAll('table');
  if (tables.length > 0) {
    const lastTable = tables[tables.length - 1];
    let node = lastTable.nextSibling;
    while (node) {
      const next = node.nextSibling;
      node.remove();
      node = next;
    }
  }
  content.innerHTML = tempDiv.innerHTML;

  const textarea = document.createElement('textarea');
  textarea.className = 'detail-edit-textarea';
  textarea.value = editableLines.join('\n');
  content.appendChild(textarea);
}

function exitDetailEditMode(restoreContent) {
  detailEditMode = false;
  document.getElementById('detail-save').classList.add('hidden');
  document.getElementById('detail-cancel').classList.add('hidden');
  if (currentDetailRaw !== null) {
    document.getElementById('detail-edit').classList.remove('hidden');
  }
  if (restoreContent && currentDetailHtml) {
    document.getElementById('detail-content').innerHTML = currentDetailHtml;
  }
}

async function saveDetailContent() {
  const id = document.getElementById('detail-id').textContent;
  if (!id || !currentDetailRaw) return;

  const content = document.getElementById('detail-content');
  const segments = splitDetailSegments(currentDetailRaw);
  const textarea = content.querySelector('textarea.detail-edit-textarea');

  // Reconstruct: everything up to and including the last table stays unchanged,
  // then replace the rest with the textarea content
  let lastTableIdx = -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].type === 'table') { lastTableIdx = i; break; }
  }

  const allLines = [];
  for (let i = 0; i <= lastTableIdx; i++) {
    allLines.push(...segments[i].lines);
  }
  if (textarea) {
    allLines.push(...textarea.value.split('\n'));
  }
  const newMarkdown = allLines.join('\n');

  const saveBtn = document.getElementById('detail-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const res = await fetch('/api/detail/' + id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: newMarkdown }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Save failed');
    }
    currentDetailRaw = newMarkdown;
    exitDetailEditMode(false);
    showDetail(id);
  } catch (err) {
    console.error('Failed to save detail:', err);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

// Actions
async function markComplete(id) {
  try {
    const res = await fetch('/api/complete/' + id, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
  } catch (err) {
    console.error('Failed to mark complete:', err);
  }
}

async function markIncomplete(id) {
  try {
    const res = await fetch('/api/incomplete/' + id, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
  } catch (err) {
    console.error('Failed to mark incomplete:', err);
  }
}


function handleUpdateProgress(data) {
  const progress = document.getElementById('update-progress');
  const fill = document.getElementById('progress-fill');
  const label = document.getElementById('progress-label');
  progress.classList.remove('hidden');
  const pct = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
  fill.style.width = pct + '%';
  if (data.phase === 'Scanning for new items') {
    label.textContent = 'Scanning for new items...';
    fill.style.width = '100%';
  } else {
    label.textContent = data.current + '/' + data.total;
  }
}

async function refreshAll() {
  const btn = document.getElementById('refresh-all');
  const progress = document.getElementById('update-progress');
  const fill = document.getElementById('progress-fill');
  btn.classList.add('loading');
  btn.disabled = true;
  fill.style.width = '0%';
  progress.classList.remove('hidden');
  try {
    const res = await fetch('/api/refresh', { method: 'POST', signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setLastUpdate(new Date().toISOString());
    showUpdateDialog(data.results || [], data.discovered || [], data.errors || []);
  } catch (err) {
    console.error('Failed to update all:', err);
    alert('Update failed: ' + (err.message || err));
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
    progress.classList.add('hidden');
  }
}

function showUpdateDialog(results, discovered, errors) {
  errors = errors || [];
  const dialog = document.getElementById('update-dialog');
  const content = document.getElementById('update-dialog-content');
  const actions = document.getElementById('update-dialog-actions');
  const title = document.getElementById('update-dialog-title');
  content.innerHTML = '';

  const hasChanges = results.length > 0;
  const hasDiscovered = discovered.length > 0;

  title.textContent = hasDiscovered ? 'Update Results' : 'Update Results';

  // Changes section
  if (hasChanges) {
    const section = document.createElement('div');
    section.className = 'discovery-section';
    const h3 = document.createElement('h3');
    h3.textContent = 'Changes';
    section.appendChild(h3);

    const ul = document.createElement('ul');
    ul.className = 'changes-list';
    for (const r of results) {
      const li = document.createElement('li');
      if (r.githubUrl) {
        const link = document.createElement('a');
        link.href = r.githubUrl;
        link.target = '_blank';
        link.className = 'change-ref';
        link.textContent = itemDisplayName(r);
        li.appendChild(link);
      } else {
        const nameSpan = document.createElement('span');
        nameSpan.className = 'change-id';
        nameSpan.textContent = itemDisplayName(r);
        li.appendChild(nameSpan);
      }

      if (r.oldStatus !== r.newStatus) {
        const oldSpan = document.createElement('span');
        oldSpan.className = 'change-old';
        oldSpan.textContent = r.oldStatus;
        li.appendChild(oldSpan);

        const arrow = document.createElement('span');
        arrow.className = 'change-arrow';
        arrow.textContent = '\u2192';
        li.appendChild(arrow);

        li.appendChild(document.createTextNode(r.newStatus));
      }

      if (r.oldPriority !== r.newPriority) {
        li.appendChild(document.createTextNode(' (' + r.oldPriority + ' \u2192 ' + r.newPriority + ')'));
      }

      if (r.doneDateSet) {
        const badge = document.createElement('span');
        badge.className = 'change-done-badge';
        badge.textContent = 'Done';
        li.appendChild(badge);
      }

      ul.appendChild(li);
    }
    section.appendChild(ul);
    content.appendChild(section);
  } else if (errors.length === 0) {
    const p = document.createElement('p');
    p.className = 'no-changes';
    p.textContent = 'All items up to date.';
    content.appendChild(p);
  }

  // Errors section
  if (errors.length > 0) {
    const section = document.createElement('div');
    section.className = 'discovery-section errors-section';
    const h3 = document.createElement('h3');
    h3.textContent = 'Errors (' + errors.length + ')';
    h3.style.color = 'var(--color-danger, #e53e3e)';
    section.appendChild(h3);

    const ul = document.createElement('ul');
    ul.className = 'changes-list';
    for (const e of errors) {
      const li = document.createElement('li');
      const nameSpan = document.createElement('span');
      nameSpan.className = 'change-id';
      nameSpan.textContent = itemDisplayName(e);
      li.appendChild(nameSpan);
      const errSpan = document.createElement('span');
      errSpan.style.color = 'var(--color-danger, #e53e3e)';
      errSpan.textContent = e.error;
      li.appendChild(errSpan);
      ul.appendChild(li);
    }
    section.appendChild(ul);
    content.appendChild(section);
  }

  // Auto-added items section (items are added automatically now)
  if (hasDiscovered) {
    const section = document.createElement('div');
    section.className = 'discovery-section';
    const h3 = document.createElement('h3');
    h3.textContent = 'Auto-Added (' + discovered.length + ')';
    section.appendChild(h3);

    const ul = document.createElement('ul');
    ul.className = 'changes-list';
    for (const d of discovered) {
      const li = document.createElement('li');
      const typeSpan = document.createElement('span');
      typeSpan.className = 'change-id';
      typeSpan.textContent = d.type;
      li.appendChild(typeSpan);
      const link = document.createElement('a');
      link.href = d.url;
      link.target = '_blank';
      link.textContent = d.repo.replace('ethereum-optimism/', '') + '#' + d.prNumber;
      li.appendChild(link);
      li.appendChild(document.createTextNode(' ' + d.title));
      ul.appendChild(li);
    }
    section.appendChild(ul);
    content.appendChild(section);
    actions.classList.add('hidden');
    dialog._discovered = [];
  } else {
    actions.classList.add('hidden');
    dialog._discovered = [];
  }

  dialog.classList.remove('hidden');
}

function closeUpdateDialog() {
  document.getElementById('update-dialog').classList.add('hidden');
}

// Priority picker
function showPriorityPicker(cell, item) {
  // Remove any existing picker
  document.querySelectorAll('.priority-picker').forEach(el => el.remove());

  const picker = document.createElement('div');
  picker.className = 'priority-picker';
  const priorities = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
  for (const p of priorities) {
    const btn = document.createElement('button');
    btn.textContent = p;
    btn.className = 'btn-small priority-' + p.toLowerCase();
    if (p === item.priority) btn.classList.add('current');
    btn.onclick = (e) => {
      e.stopPropagation();
      picker.remove();
      if (p !== item.priority) updatePriority(item.id, p);
    };
    picker.appendChild(btn);
  }

  cell.style.position = 'relative';
  cell.appendChild(picker);

  // Close on click outside
  const close = (e) => {
    if (!picker.contains(e.target)) {
      picker.remove();
      document.removeEventListener('click', close, true);
    }
  };
  setTimeout(() => document.addEventListener('click', close, true), 0);
}

async function updatePriority(id, priority) {
  try {
    const res = await fetch('/api/priority/' + id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority }),
    });
    if (!res.ok) throw new Error(await res.text());
  } catch (err) {
    console.error('Failed to set priority:', err);
  }
}

// Date picker
function showDatePicker(cell, item) {
  // Remove any existing picker
  document.querySelectorAll('.date-picker').forEach(el => el.remove());

  const picker = document.createElement('div');
  picker.className = 'date-picker';

  const input = document.createElement('input');
  input.type = 'date';
  input.value = item.due || '';
  picker.appendChild(input);

  const setBtn = document.createElement('button');
  setBtn.textContent = 'Set';
  setBtn.className = 'btn-small';
  setBtn.onclick = (e) => {
    e.stopPropagation();
    picker.remove();
    updateDue(item.id, input.value);
  };
  picker.appendChild(setBtn);

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.className = 'btn-small';
  clearBtn.onclick = (e) => {
    e.stopPropagation();
    picker.remove();
    if (item.due) updateDue(item.id, '');
  };
  picker.appendChild(clearBtn);

  cell.style.position = 'relative';
  cell.appendChild(picker);

  input.focus();

  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      picker.remove();
      updateDue(item.id, input.value);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      picker.remove();
    }
  };

  // Close on click outside
  const close = (e) => {
    if (!picker.contains(e.target)) {
      picker.remove();
      document.removeEventListener('click', close, true);
    }
  };
  setTimeout(() => document.addEventListener('click', close, true), 0);
}

async function updateDue(id, due) {
  try {
    const res = await fetch('/api/due/' + id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due }),
    });
    if (!res.ok) throw new Error(await res.text());
  } catch (err) {
    console.error('Failed to set due date:', err);
  }
}

// Claude prompt
async function sendClaudePrompt(prompt) {
  if (!prompt.trim()) return;

  const output = document.getElementById('claude-output');
  const spinner = document.getElementById('claude-spinner');
  const sendBtn = document.getElementById('claude-send');
  output.classList.add('hidden');
  output.textContent = '';
  spinner.classList.remove('hidden');
  sendBtn.disabled = true;

  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    if (!res.ok) {
      spinner.classList.add('hidden');
      output.classList.remove('hidden');
      output.textContent = 'Error: ' + (await res.text());
      output.classList.add('claude-error');
      sendBtn.disabled = false;
    }
    // Output streams via WebSocket claude-status messages; button re-enabled on done/error
  } catch (err) {
    spinner.classList.add('hidden');
    output.classList.remove('hidden');
    output.textContent = 'Error: ' + err.message;
    output.classList.add('claude-error');
    sendBtn.disabled = false;
  }
}

const TOOL_LABELS = {
  Bash: 'Running command',
  Read: 'Reading file',
  Write: 'Writing file',
  Edit: 'Editing file',
  Glob: 'Searching files',
  Grep: 'Searching code',
  Agent: 'Running sub-agent',
  WebFetch: 'Fetching URL',
  WebSearch: 'Searching web',
};

function handleClaudeStatus(data) {
  const output = document.getElementById('claude-output');
  const spinner = document.getElementById('claude-spinner');
  if (data.status === 'running') {
    if (data.activity) {
      const label = TOOL_LABELS[data.activity] || ('Using ' + data.activity);
      spinner.innerHTML = '<span class="spinner"></span> ' + label + '...';
      spinner.classList.remove('hidden');
    }
    if (data.output) {
      output.classList.remove('hidden');
      output.textContent += data.output;
    }
  } else if (data.status === 'done') {
    spinner.classList.add('hidden');
    document.getElementById('claude-send').disabled = false;
  } else if (data.status === 'error') {
    spinner.classList.add('hidden');
    output.classList.remove('hidden');
    output.classList.add('claude-error');
    output.textContent += (output.textContent ? '\n' : '') + 'Error: ' + data.output;
    document.getElementById('claude-send').disabled = false;
  }
}

// Last update time
function setLastUpdate(isoString) {
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

// Fetch last update time from log on startup
async function fetchLastUpdateTime() {
  try {
    const res = await fetch('/api/log?limit=1&offset=0');
    if (!res.ok) return;
    const data = await res.json();
    if (data.entries.length > 0) setLastUpdate(data.entries[0].timestamp);
  } catch {}
}

// Auto-added items notice


// Update log
let logOffset = 0;
let logTotal = 0;
const LOG_PAGE_SIZE = 50;

async function showLogDialog() {
  logOffset = 0;
  const dialog = document.getElementById('log-dialog');
  const content = document.getElementById('log-dialog-content');
  content.innerHTML = '<p>Loading...</p>';
  dialog.classList.remove('hidden');
  await loadLogPage(true);
}

async function loadLogPage(reset) {
  const content = document.getElementById('log-dialog-content');
  const loadMore = document.getElementById('log-load-more');
  try {
    const res = await fetch('/api/log?limit=' + LOG_PAGE_SIZE + '&offset=' + logOffset);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    logTotal = data.total;

    if (reset) content.innerHTML = '';

    if (data.entries.length === 0 && logOffset === 0) {
      content.innerHTML = '<p class="no-changes">No update log entries.</p>';
      loadMore.classList.add('hidden');
      return;
    }

    for (const entry of data.entries) {
      content.appendChild(renderLogEntry(entry));
    }

    logOffset += data.entries.length;
    if (logOffset < logTotal) {
      loadMore.classList.remove('hidden');
    } else {
      loadMore.classList.add('hidden');
    }
  } catch (err) {
    content.innerHTML = '<p>Error loading log: ' + err.message + '</p>';
  }
}

function renderLogEntry(entry) {
  const div = document.createElement('div');
  div.className = 'log-entry';

  const header = document.createElement('div');
  header.className = 'log-entry-header';

  const time = document.createElement('span');
  time.className = 'log-entry-time';
  const d = new Date(entry.timestamp);
  time.textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  header.appendChild(time);

  const source = document.createElement('span');
  source.className = 'log-entry-source log-source-' + entry.source;
  source.textContent = entry.source;
  header.appendChild(source);

  const summary = document.createElement('span');
  summary.className = 'log-entry-summary';
  const parts = [];
  if (entry.results.length > 0) parts.push(entry.results.length + ' changed');
  if (entry.discoveredCount > 0) parts.push(entry.discoveredCount + ' discovered');
  if (entry.errors.length > 0) parts.push(entry.errors.length + ' errors');
  if (parts.length === 0) parts.push('no changes');
  summary.textContent = parts.join(', ');
  header.appendChild(summary);

  div.appendChild(header);

  // Collapsible details
  if (entry.results.length > 0 || entry.errors.length > 0) {
    const toggle = document.createElement('button');
    toggle.className = 'btn-small log-toggle';
    toggle.textContent = 'Details';

    const details = document.createElement('div');
    details.className = 'log-details hidden';

    if (entry.results.length > 0) {
      const ul = document.createElement('ul');
      ul.className = 'log-changes';
      for (const r of entry.results) {
        const li = document.createElement('li');
        li.textContent = itemDisplayName(r) + ': ' + r.oldStatus + ' \u2192 ' + r.newStatus;
        if (r.oldPriority !== r.newPriority) li.textContent += ' (' + r.oldPriority + ' \u2192 ' + r.newPriority + ')';
        if (r.doneDateSet) li.textContent += ' [Done]';
        ul.appendChild(li);
      }
      details.appendChild(ul);
    }

    if (entry.errors.length > 0) {
      const errTitle = document.createElement('div');
      errTitle.className = 'log-errors-title';
      errTitle.textContent = 'Errors:';
      details.appendChild(errTitle);
      const ul = document.createElement('ul');
      ul.className = 'log-errors';
      for (const e of entry.errors) {
        const li = document.createElement('li');
        li.textContent = itemDisplayName(e) + ': ' + e.error;
        ul.appendChild(li);
      }
      details.appendChild(ul);
    }

    toggle.onclick = () => {
      details.classList.toggle('hidden');
      toggle.textContent = details.classList.contains('hidden') ? 'Details' : 'Hide';
    };

    header.appendChild(toggle);
    div.appendChild(details);
  }

  return div;
}

function closeLogDialog() {
  document.getElementById('log-dialog').classList.add('hidden');
}

// Standup dialog
let activeStandupTab = 'report';
let currentStandupReport = null;

async function showStandupDialog() {
  const dialog = document.getElementById('standup-dialog');
  // Reset Claude tab state
  standupClaudeRawOutput = '';
  document.getElementById('standup-claude-output').textContent = '';
  document.getElementById('standup-claude-output').classList.add('hidden');
  document.getElementById('standup-claude-output').classList.remove('claude-error');
  document.getElementById('standup-claude-rendered').innerHTML = '';
  document.getElementById('standup-claude-rendered').classList.add('hidden');
  dialog.classList.remove('hidden');
  switchStandupTab('report');
  await loadStandupReport();
}

function closeStandupDialog() {
  document.getElementById('standup-dialog').classList.add('hidden');
}

function switchStandupTab(tab) {
  activeStandupTab = tab;
  document.querySelectorAll('#standup-dialog .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.getElementById('standup-tab-report').classList.toggle('hidden', tab !== 'report');
  document.getElementById('standup-tab-claude').classList.toggle('hidden', tab !== 'claude');
}

async function loadStandupReport() {
  const content = document.getElementById('standup-tab-report');
  content.innerHTML = '<p style="padding:16px;color:var(--muted)">Loading...</p>';
  try {
    const res = await fetch('/api/standup');
    if (!res.ok) throw new Error(await res.text());
    const report = await res.json();
    currentStandupReport = report;
    content.innerHTML = '';
    content.appendChild(renderStandupReport(report));
  } catch (err) {
    currentStandupReport = null;
    content.innerHTML = '<p style="padding:16px;color:var(--status-fail)">Error loading report: ' + err.message + '</p>';
  }
}

function formatReportAsMarkdown(report) {
  const lines = [];

  lines.push(`*Yesterday (${report.yesterdayDate})*`);

  if (report.yesterday.done.length > 0) {
    lines.push('');
    lines.push('*Completed*');
    for (const item of report.yesterday.done) {
      lines.push(`• ${descWithRefSlack(item.description)}`);
    }
  }

  if (report.yesterday.statusChanges.length > 0) {
    lines.push('');
    lines.push('*Status Changes*');
    for (const c of report.yesterday.statusChanges) {
      lines.push(`• ${descWithRefSlack(c.description)} (${c.oldStatus} → ${c.newStatus})`);
    }
  }

  if (report.yesterday.githubActivity.length > 0) {
    lines.push('');
    lines.push('*GitHub Activity*');
    for (const a of report.yesterday.githubActivity) {
      lines.push(`• ${a.action} <${a.url}|${a.repo}>: ${a.title}`);
    }
  }

  if (report.yesterday.done.length === 0 && report.yesterday.statusChanges.length === 0 && report.yesterday.githubActivity.length === 0) {
    lines.push('');
    lines.push('_Nothing recorded_');
  }

  lines.push('');
  lines.push(`*Today (${report.date})*`);

  if (report.today.highPriority.length > 0) {
    lines.push('');
    lines.push('*High Priority*');
    for (const item of report.today.highPriority) {
      lines.push(`• ${item.priority} ${descWithRefSlack(item.description)} — ${item.status}`);
    }
  }

  if (report.today.overdue.length > 0) {
    lines.push('');
    lines.push('*Overdue*');
    for (const item of report.today.overdue) {
      lines.push(`• ${descWithRefSlack(item.description)} (due ${item.due})`);
    }
  }

  if (report.today.dueToday.length > 0) {
    lines.push('');
    lines.push('*Due Today*');
    for (const item of report.today.dueToday) {
      lines.push(`• ${descWithRefSlack(item.description)}`);
    }
  }

  if (report.today.blocked.length > 0) {
    lines.push('');
    lines.push('*Blocked*');
    for (const item of report.today.blocked) {
      lines.push(`• ${descWithRefSlack(item.description)}`);
    }
  }

  if (report.today.highPriority.length === 0 && report.today.overdue.length === 0 && report.today.dueToday.length === 0 && report.today.blocked.length === 0) {
    lines.push('');
    lines.push('_Nothing high priority_');
  }

  return lines.join('\n');
}

async function copyStandupReport() {
  const btn = document.getElementById('standup-copy-btn');
  let text = '';

  if (activeStandupTab === 'report') {
    if (!currentStandupReport) return;
    text = formatReportAsMarkdown(currentStandupReport);
  } else {
    text = standupClaudeRawOutput;
    if (!text.trim()) return;
  }

  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  } catch {
    // Fallback for environments without clipboard API
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }
}

function descText(description) {
  // Strip leading markdown link prefix [text](url) from description for display
  return description.replace(/^\[.*?\]\(.*?\)\s*/, '').trim() || description;
}

// Render description as HTML, showing "[org/repo#N](url) rest" as a linked ref + text
function descWithRefHtml(description) {
  const match = description.match(/^\[([^\]]+)\]\(([^)]+)\)\s*(.*)/);
  if (match) {
    const ref = escHtml(match[1]);
    const url = escHtml(match[2]);
    const rest = escHtml(match[3]);
    return `<a href="${url}" target="_blank" rel="noopener">${ref}</a>${rest ? ' ' + rest : ''}`;
  }
  return escHtml(description);
}

// Format description for Slack: "<url|org/repo#N> rest text"
function descWithRefSlack(description) {
  const match = description.match(/^\[([^\]]+)\]\(([^)]+)\)\s*(.*)/);
  if (match) {
    const ref = match[1];
    const url = match[2];
    const rest = match[3];
    return `<${url}|${ref}>${rest ? ' ' + rest : ''}`;
  }
  return description;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderStandupReport(report) {
  const root = document.createElement('div');

  // Yesterday section
  const ySection = document.createElement('div');
  ySection.className = 'standup-section';

  const yHeading = document.createElement('h3');
  yHeading.className = 'standup-day-heading';
  yHeading.textContent = `Yesterday (${report.yesterdayDate})`;
  ySection.appendChild(yHeading);

  // Done items
  const doneSection = document.createElement('div');
  doneSection.className = 'standup-section';
  const doneTitle = document.createElement('div');
  doneTitle.className = 'standup-section-title';
  doneTitle.textContent = 'Completed';
  doneSection.appendChild(doneTitle);

  if (report.yesterday.done.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'standup-empty';
    empty.textContent = 'No items completed';
    doneSection.appendChild(empty);
  } else {
    const ul = document.createElement('ul');
    ul.className = 'standup-list';
    for (const item of report.yesterday.done) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="standup-item-desc">${descWithRefHtml(item.description)}</span>` +
        `<span class="standup-item-badge">${escHtml(item.type)}</span>`;
      ul.appendChild(li);
    }
    doneSection.appendChild(ul);
  }
  ySection.appendChild(doneSection);

  // Status changes
  if (report.yesterday.statusChanges.length > 0) {
    const changesSection = document.createElement('div');
    changesSection.className = 'standup-section';
    const changesTitle = document.createElement('div');
    changesTitle.className = 'standup-section-title';
    changesTitle.textContent = 'Status Changes';
    changesSection.appendChild(changesTitle);
    const ul = document.createElement('ul');
    ul.className = 'standup-list';
    for (const c of report.yesterday.statusChanges) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="standup-item-desc">${descWithRefHtml(c.description)}</span>` +
        `<span class="standup-arrow">${escHtml(c.oldStatus)} → ${escHtml(c.newStatus)}</span>`;
      ul.appendChild(li);
    }
    changesSection.appendChild(ul);
    ySection.appendChild(changesSection);
  }

  // GitHub activity
  if (report.yesterday.githubActivity.length > 0) {
    const ghSection = document.createElement('div');
    ghSection.className = 'standup-section';
    const ghTitle = document.createElement('div');
    ghTitle.className = 'standup-section-title';
    ghTitle.textContent = 'GitHub Activity';
    ghSection.appendChild(ghTitle);
    const ul = document.createElement('ul');
    ul.className = 'standup-list';
    for (const a of report.yesterday.githubActivity) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="standup-item-badge">${escHtml(a.action)}</span>` +
        `<span class="standup-item-desc"><a href="${escHtml(a.url)}" target="_blank" rel="noopener">${escHtml(a.title)}</a></span>` +
        `<span class="standup-item-id">${escHtml(a.repo)}</span>`;
      ul.appendChild(li);
    }
    ghSection.appendChild(ul);
    ySection.appendChild(ghSection);
  }

  root.appendChild(ySection);

  // Today section
  const tSection = document.createElement('div');
  tSection.className = 'standup-section';

  const tHeading = document.createElement('h3');
  tHeading.className = 'standup-day-heading';
  tHeading.textContent = `Today (${report.date})`;
  tSection.appendChild(tHeading);

  // High priority
  const hpSection = document.createElement('div');
  hpSection.className = 'standup-section';
  const hpTitle = document.createElement('div');
  hpTitle.className = 'standup-section-title';
  hpTitle.textContent = 'High Priority (P0/P1)';
  hpSection.appendChild(hpTitle);

  if (report.today.highPriority.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'standup-empty';
    empty.textContent = 'No high priority items';
    hpSection.appendChild(empty);
  } else {
    const ul = document.createElement('ul');
    ul.className = 'standup-list';
    for (const item of report.today.highPriority) {
      const li = document.createElement('li');
      const priorityCls = item.priority.toLowerCase();
      li.innerHTML = `<span class="standup-item-badge ${priorityCls}">${escHtml(item.priority)}</span>` +
        `<span class="standup-item-desc">${descWithRefHtml(item.description)}</span>` +
        `<span class="standup-arrow">${escHtml(item.status)}</span>`;
      ul.appendChild(li);
    }
    hpSection.appendChild(ul);
  }
  tSection.appendChild(hpSection);

  // Overdue
  if (report.today.overdue.length > 0) {
    const odSection = document.createElement('div');
    odSection.className = 'standup-section';
    const odTitle = document.createElement('div');
    odTitle.className = 'standup-section-title';
    odTitle.textContent = 'Overdue';
    odSection.appendChild(odTitle);
    const ul = document.createElement('ul');
    ul.className = 'standup-list';
    for (const item of report.today.overdue) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="standup-item-desc">${descWithRefHtml(item.description)}</span>` +
        `<span class="standup-item-badge" style="color:var(--status-fail)">due ${escHtml(item.due)}</span>`;
      ul.appendChild(li);
    }
    odSection.appendChild(ul);
    tSection.appendChild(odSection);
  }

  // Due today
  if (report.today.dueToday.length > 0) {
    const dtSection = document.createElement('div');
    dtSection.className = 'standup-section';
    const dtTitle = document.createElement('div');
    dtTitle.className = 'standup-section-title';
    dtTitle.textContent = 'Due Today';
    dtSection.appendChild(dtTitle);
    const ul = document.createElement('ul');
    ul.className = 'standup-list';
    for (const item of report.today.dueToday) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="standup-item-desc">${descWithRefHtml(item.description)}</span>` +
        `<span class="standup-item-badge">${escHtml(item.priority)}</span>`;
      ul.appendChild(li);
    }
    dtSection.appendChild(ul);
    tSection.appendChild(dtSection);
  }

  // Blocked
  if (report.today.blocked.length > 0) {
    const blSection = document.createElement('div');
    blSection.className = 'standup-section';
    const blTitle = document.createElement('div');
    blTitle.className = 'standup-section-title';
    blTitle.textContent = 'Blocked';
    blSection.appendChild(blTitle);
    const ul = document.createElement('ul');
    ul.className = 'standup-list';
    for (const item of report.today.blocked) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="standup-item-desc">${descWithRefHtml(item.description)}</span>`;
      ul.appendChild(li);
    }
    blSection.appendChild(ul);
    tSection.appendChild(blSection);
  }

  root.appendChild(tSection);
  return root;
}

// Simple markdown renderer for Claude standup output
function inlineMarkdown(text) {
  const parts = [];
  let i = 0;
  let plain = '';

  while (i < text.length) {
    if (text[i] === '[') {
      const closeB = text.indexOf(']', i);
      if (closeB !== -1 && text[closeB + 1] === '(') {
        const closeP = text.indexOf(')', closeB + 2);
        if (closeP !== -1) {
          if (plain) { parts.push(escHtml(plain)); plain = ''; }
          const linkText = text.slice(i + 1, closeB);
          const url = text.slice(closeB + 2, closeP);
          parts.push(`<a href="${escHtml(url)}" target="_blank" rel="noopener">${escHtml(linkText)}</a>`);
          i = closeP + 1;
          continue;
        }
      }
    }
    if (text.slice(i, i + 2) === '**') {
      const end = text.indexOf('**', i + 2);
      if (end !== -1) {
        if (plain) { parts.push(escHtml(plain)); plain = ''; }
        parts.push(`<strong>${escHtml(text.slice(i + 2, end))}</strong>`);
        i = end + 2;
        continue;
      }
    }
    if (text[i] === '*' && text[i - 1] !== '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1);
      if (end !== -1 && text[end - 1] !== '*' && text[end + 1] !== '*') {
        if (plain) { parts.push(escHtml(plain)); plain = ''; }
        parts.push(`<em>${escHtml(text.slice(i + 1, end))}</em>`);
        i = end + 1;
        continue;
      }
    }
    plain += text[i];
    i++;
  }
  if (plain) parts.push(escHtml(plain));
  return parts.join('');
}

function renderSimpleMarkdown(text) {
  const lines = text.split('\n');
  const blocks = [];
  let listItems = [];
  let paraLines = [];

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push('<ul class="standup-md-list">' + listItems.map(i => `<li>${i}</li>`).join('') + '</ul>');
    listItems = [];
  }

  function flushPara() {
    if (paraLines.length === 0) return;
    const content = paraLines.join(' ').trim();
    if (content) blocks.push(`<p>${inlineMarkdown(content)}</p>`);
    paraLines = [];
  }

  for (const line of lines) {
    const hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      flushList(); flushPara();
      const level = hMatch[1].length;
      blocks.push(`<h${level} class="standup-md-h">${inlineMarkdown(hMatch[2])}</h${level}>`);
      continue;
    }
    const listMatch = line.match(/^[•\-\*]\s+(.*)/);
    if (listMatch) {
      flushPara();
      listItems.push(inlineMarkdown(listMatch[1]));
      continue;
    }
    if (line.trim() === '') {
      flushList(); flushPara();
      continue;
    }
    flushList();
    paraLines.push(line);
  }
  flushList(); flushPara();
  return blocks.join('\n');
}

let standupClaudeRawOutput = '';

async function generateStandupWithClaude() {
  const output = document.getElementById('standup-claude-output');
  const rendered = document.getElementById('standup-claude-rendered');
  const spinner = document.getElementById('standup-claude-spinner');
  const btn = document.getElementById('standup-claude-generate');

  standupClaudeRawOutput = '';
  output.textContent = '';
  output.classList.remove('hidden');
  output.classList.remove('claude-error');
  rendered.classList.add('hidden');
  rendered.innerHTML = '';
  spinner.classList.remove('hidden');
  btn.disabled = true;

  try {
    const res = await fetch('/api/standup/claude', { method: 'POST' });
    if (!res.ok) {
      spinner.classList.add('hidden');
      output.classList.add('claude-error');
      output.textContent = 'Error: ' + (await res.text());
      btn.disabled = false;
    }
    // Output streams via WebSocket standup-status messages
  } catch (err) {
    spinner.classList.add('hidden');
    output.classList.add('claude-error');
    output.textContent = 'Error: ' + err.message;
    btn.disabled = false;
  }
}

function handleStandupStatus(data) {
  const output = document.getElementById('standup-claude-output');
  const rendered = document.getElementById('standup-claude-rendered');
  const spinner = document.getElementById('standup-claude-spinner');
  const spinnerLabel = document.getElementById('standup-claude-spinner-label');
  const btn = document.getElementById('standup-claude-generate');

  if (data.status === 'running') {
    if (data.activity) {
      const label = TOOL_LABELS[data.activity] || ('Using ' + data.activity);
      spinnerLabel.textContent = label + '...';
    }
    if (data.output) {
      standupClaudeRawOutput += data.output;
      output.textContent = standupClaudeRawOutput;
      output.scrollTop = output.scrollHeight;
    }
  } else if (data.status === 'done') {
    spinner.classList.add('hidden');
    btn.disabled = false;
    // Switch from raw pre to rendered markdown
    if (standupClaudeRawOutput.trim()) {
      rendered.innerHTML = renderSimpleMarkdown(standupClaudeRawOutput);
      rendered.classList.remove('hidden');
      output.classList.add('hidden');
    }
  } else if (data.status === 'error') {
    spinner.classList.add('hidden');
    output.classList.add('claude-error');
    output.textContent += (output.textContent ? '\n' : '') + 'Error: ' + data.output;
    btn.disabled = false;
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();
  fetchLastUpdateTime();

  // Sort headers
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.onclick = () => {
      const col = th.dataset.sort;
      if (sortColumn === col) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = col;
        sortDirection = 'asc';
      }
      // Update header indicators
      document.querySelectorAll('th[data-sort]').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
      renderTable();
    };
  });

  // Set initial sort indicator
  const initialTh = document.querySelector('th[data-sort="priority"]');
  if (initialTh) initialTh.classList.add('sort-asc');

  // Restore filter dropdowns from URL state
  document.getElementById('filter-search').value = searchQuery;
  document.getElementById('filter-type').value = filterType;
  document.getElementById('filter-status').value = filterStatus;

  // Restore sort indicator from URL state
  if (sortColumn !== 'priority' || sortDirection !== 'asc') {
    if (initialTh) initialTh.classList.remove('sort-asc');
    const restored = document.querySelector(`th[data-sort="${sortColumn}"]`);
    if (restored) restored.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
  }

  // Restore detail panel from URL state
  if (urlParams.detailId) {
    showDetail(urlParams.detailId);
  }

  // Filters
  document.getElementById('filter-search').oninput = (e) => { searchQuery = e.target.value; renderTable(); };
  document.getElementById('filter-type').onchange = (e) => { filterType = e.target.value; renderTable(); };
  document.getElementById('filter-status').onchange = (e) => { filterStatus = e.target.value; renderTable(); };

  // Update log
  document.getElementById('show-log').onclick = (e) => { e.preventDefault(); showLogDialog(); };
  document.getElementById('log-dialog-close').onclick = closeLogDialog;
  document.getElementById('log-close-btn').onclick = closeLogDialog;
  document.getElementById('log-load-more').onclick = () => loadLogPage(false);

  // Standup dialog
  document.getElementById('show-standup').onclick = () => showStandupDialog();
  document.getElementById('standup-dialog-close').onclick = closeStandupDialog;
  document.getElementById('standup-close-btn').onclick = closeStandupDialog;
  document.getElementById('standup-copy-btn').onclick = copyStandupReport;
  document.getElementById('standup-claude-generate').onclick = generateStandupWithClaude;
  document.querySelectorAll('#standup-dialog .tab-btn').forEach(btn => {
    btn.onclick = () => switchStandupTab(btn.dataset.tab);
  });

  // Refresh/update all
  document.getElementById('refresh-all').onclick = refreshAll;

  // Update dialog
  document.getElementById('discovery-skip').onclick = closeUpdateDialog;
  document.getElementById('update-dialog-close').onclick = () => {
    closeUpdateDialog();
  };
  document.getElementById('discovery-add').onclick = closeUpdateDialog;

  // Claude prompt
  const claudeInput = document.getElementById('claude-prompt');
  function submitPrompt() {
    const value = claudeInput.value;
    if (!value.trim()) return;
    pushHistory(value);
    resetHistoryNav();
    sendClaudePrompt(value);
    claudeInput.value = '';
  }
  document.getElementById('claude-send').onclick = submitPrompt;
  claudeInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      submitPrompt();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex === -1) savedInput = claudeInput.value;
      if (historyIndex < promptHistory.length - 1) {
        historyIndex++;
        claudeInput.value = promptHistory[promptHistory.length - 1 - historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        claudeInput.value = promptHistory[promptHistory.length - 1 - historyIndex];
      } else if (historyIndex === 0) {
        historyIndex = -1;
        claudeInput.value = savedInput;
      }
    }
  };

  // Quick actions
  document.querySelectorAll('.quick-action').forEach(btn => {
    btn.onclick = () => sendClaudePrompt(btn.dataset.prompt);
  });

  // Detail panel edit/save/cancel
  document.getElementById('detail-edit').onclick = () => enterDetailEditMode();
  document.getElementById('detail-save').onclick = () => saveDetailContent();
  document.getElementById('detail-cancel').onclick = () => exitDetailEditMode(true);

  // Detail panel close
  document.getElementById('detail-close').onclick = () => {
    if (detailEditMode) exitDetailEditMode(false);
    document.getElementById('detail-panel').classList.remove('visible');
    syncUrl();
  };

  // Click outside detail panel to close it
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('detail-panel');
    if (!panel.classList.contains('visible')) return;
    if (!panel.contains(e.target) && !e.target.closest('#todo-body')) {
      panel.classList.remove('visible');
      syncUrl();
    }
  });

  // Escape to close panels/dialogs
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const standupDialog = document.getElementById('standup-dialog');
      if (!standupDialog.classList.contains('hidden')) {
        closeStandupDialog();
        return;
      }
      const logDialog = document.getElementById('log-dialog');
      if (!logDialog.classList.contains('hidden')) {
        closeLogDialog();
        return;
      }
      const dialog = document.getElementById('update-dialog');
      if (!dialog.classList.contains('hidden')) {
        closeUpdateDialog();
        return;
      }
      document.getElementById('detail-panel').classList.remove('visible');
      syncUrl();
    }
  });
});
