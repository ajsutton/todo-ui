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
  const detailTitle = document.getElementById('detail-title');
  if (detailPanel && detailPanel.classList.contains('visible') && detailTitle.textContent) {
    p.set('detail', detailTitle.textContent);
  }
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
      state = msg.data;
      renderTable();
    } else if (msg.type === 'update-progress') {
      handleUpdateProgress(msg.data);
    } else if (msg.type === 'claude-status') {
      handleClaudeStatus(msg.data);
    } else if (msg.type === 'pending-discovered') {
      handlePendingDiscovered(msg.data);
    } else if (msg.type === 'reload') {
      // Debounce reload — wait 30s after last change to allow all pending writes to complete
      clearTimeout(window._reloadTimer);
      window._reloadTimer = setTimeout(() => location.reload(), 10000);
    }
  };
}

// Rendering
function renderTable() {
  let items = [...state.items];
  items = filterItems(items);
  items = sortItems(items);

  const tbody = document.getElementById('todo-body');
  tbody.innerHTML = '';

  syncUrl();

  for (const item of items) {
    const tr = document.createElement('tr');
    const isDone = !!item.doneDate;
    if (isDone) tr.classList.add('status-done');
    if (item.blocked) tr.classList.add('status-blocked');
    tr.onclick = () => showDetail(item.id);

    // ID cell
    const tdId = document.createElement('td');
    tdId.textContent = item.id;
    tr.appendChild(tdId);

    // Description cell - use descriptionHtml which has <a> tags
    const tdDesc = document.createElement('td');
    tdDesc.innerHTML = item.descriptionHtml;
    // Make links open in new tab and stop propagation
    tdDesc.querySelectorAll('a').forEach(a => {
      a.target = '_blank';
      a.rel = 'noopener';
      a.onclick = (e) => e.stopPropagation();
    });
    tr.appendChild(tdDesc);

    // Type cell
    const tdType = document.createElement('td');
    tdType.textContent = item.type;
    tr.appendChild(tdType);

    // Status cell
    const tdStatus = document.createElement('td');
    tdStatus.textContent = item.status;
    if (item.status.toLowerCase().includes('failing')) tdStatus.classList.add('status-failing');
    if (item.status.toLowerCase().includes('passing')) tdStatus.classList.add('status-passing');
    tr.appendChild(tdStatus);

    // Priority cell — click to cycle
    const tdPriority = document.createElement('td');
    tdPriority.textContent = item.priority;
    tdPriority.classList.add('priority-' + item.priority.toLowerCase());
    tdPriority.classList.add('editable');
    tdPriority.onclick = (e) => {
      e.stopPropagation();
      showPriorityPicker(tdPriority, item);
    };
    tr.appendChild(tdPriority);

    // Due cell — click to edit
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

    if (item.githubUrl) {
      const refreshBtn = document.createElement('button');
      refreshBtn.textContent = 'Refresh';
      refreshBtn.className = 'btn-small';
      refreshBtn.id = 'refresh-' + item.id;
      refreshBtn.onclick = (e) => { e.stopPropagation(); refreshItem(item.id); };
      actionsWrap.appendChild(refreshBtn);
    }

    tdActions.appendChild(actionsWrap);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }
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

// Detail panel
async function showDetail(id) {
  const panel = document.getElementById('detail-panel');
  const title = document.getElementById('detail-title');
  const content = document.getElementById('detail-content');

  title.textContent = id;
  content.innerHTML = '<p>Loading...</p>';
  panel.classList.add('visible');
  syncUrl();

  try {
    const res = await fetch('/api/detail/' + id);
    if (res.ok) {
      const detail = await res.json();
      content.innerHTML = detail.contentHtml;
    } else {
      // No detail file — show item info
      const item = state.items.find(i => i.id === id);
      if (item) {
        const statusEl = document.createElement('p');
        statusEl.innerHTML = '<strong>Status:</strong> ';
        statusEl.appendChild(document.createTextNode(item.status));
        const priorityEl = document.createElement('p');
        priorityEl.innerHTML = '<strong>Priority:</strong> ';
        priorityEl.appendChild(document.createTextNode(item.priority));
        content.innerHTML = '';
        const descEl = document.createElement('p');
        descEl.innerHTML = item.descriptionHtml;
        content.appendChild(descEl);
        content.appendChild(statusEl);
        content.appendChild(priorityEl);
      } else {
        content.innerHTML = '<p>No details available.</p>';
      }
    }
  } catch (err) {
    content.innerHTML = '<p>Error loading details.</p>';
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

async function refreshItem(id) {
  const btn = document.getElementById('refresh-' + id);
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }
  try {
    const res = await fetch('/api/refresh/' + id, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
  } catch (err) {
    console.error('Failed to refresh:', err);
  } finally {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
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
      const idSpan = document.createElement('span');
      idSpan.className = 'change-id';
      idSpan.textContent = r.id;
      li.appendChild(idSpan);

      if (r.githubUrl && r.repo && r.prNumber) {
        const link = document.createElement('a');
        link.href = r.githubUrl;
        link.target = '_blank';
        link.className = 'change-ref';
        link.textContent = r.repo.replace('ethereum-optimism/', '') + '#' + r.prNumber;
        li.appendChild(link);
        // Extract title from description (strip the link prefix if present)
        const title = r.description.replace(/^\[.*?\]\(.*?\)\s*/, '');
        if (title) {
          const titleSpan = document.createElement('span');
          titleSpan.className = 'change-title';
          titleSpan.textContent = title;
          li.appendChild(titleSpan);
        }
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
      const idSpan = document.createElement('span');
      idSpan.className = 'change-id';
      idSpan.textContent = e.id;
      li.appendChild(idSpan);
      const errSpan = document.createElement('span');
      errSpan.style.color = 'var(--color-danger, #e53e3e)';
      errSpan.textContent = e.error;
      li.appendChild(errSpan);
      ul.appendChild(li);
    }
    section.appendChild(ul);
    content.appendChild(section);
  }

  // Discovered items section
  if (hasDiscovered) {
    const reviews = discovered.filter(d => d.type === 'Review');
    const prs = discovered.filter(d => d.type === 'PR');

    renderDiscoverySection(content, 'Review Requests', reviews);
    renderDiscoverySection(content, 'Your PRs', prs);

    // Show actions bar with select-all and add button
    actions.classList.remove('hidden');
    const selectAll = document.getElementById('discovery-select-all');
    selectAll.checked = true;
    selectAll.onchange = () => {
      content.querySelectorAll('.discovery-item input[type="checkbox"]').forEach(cb => { cb.checked = selectAll.checked; });
    };
    content.addEventListener('change', (e) => {
      if (e.target === selectAll) return;
      if (!e.target.closest('.discovery-item')) return;
      const all = content.querySelectorAll('.discovery-item input[type="checkbox"]');
      selectAll.checked = [...all].every(cb => cb.checked);
    });
    dialog._discovered = discovered;
  } else {
    actions.classList.add('hidden');
    dialog._discovered = [];
  }

  dialog._isPending = false;
  dialog.classList.remove('hidden');
}

function renderDiscoverySection(container, title, items) {
  if (items.length === 0) return;
  const section = document.createElement('div');
  section.className = 'discovery-section';
  const h3 = document.createElement('h3');
  h3.textContent = title;
  section.appendChild(h3);

  for (const item of items) {
    const row = document.createElement('label');
    row.className = 'discovery-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.repo = item.repo;
    cb.dataset.prNumber = item.prNumber;
    row.appendChild(cb);

    const info = document.createElement('div');
    info.className = 'discovery-item-info';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'discovery-item-title';
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = item.repo.replace('ethereum-optimism/', '') + '#' + item.prNumber;
    link.onclick = (e) => e.stopPropagation();
    titleSpan.appendChild(link);
    titleSpan.appendChild(document.createTextNode(' ' + item.title));
    info.appendChild(titleSpan);

    const meta = document.createElement('span');
    meta.className = 'discovery-item-meta';
    meta.textContent = item.type === 'Review' ? item.author + ' \u00b7 ' + item.suggestedPriority : item.suggestedPriority;
    info.appendChild(meta);

    row.appendChild(info);
    section.appendChild(row);
  }
  container.appendChild(section);
}

function closeUpdateDialog() {
  document.getElementById('update-dialog').classList.add('hidden');
}

async function addDiscoveredItems() {
  const dialog = document.getElementById('update-dialog');
  const content = document.getElementById('update-dialog-content');
  const discovered = dialog._discovered || [];

  const checked = new Set();
  content.querySelectorAll('.discovery-item input[type="checkbox"]:checked').forEach(cb => {
    checked.add(cb.dataset.repo + '#' + cb.dataset.prNumber);
  });

  const selected = discovered.filter(d => checked.has(d.repo + '#' + d.prNumber));
  closeUpdateDialog();

  if (selected.length === 0) return;

  try {
    const res = await fetch('/api/add-discovered', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: selected }),
    });
    if (!res.ok) throw new Error(await res.text());
  } catch (err) {
    console.error('Failed to add discovered items:', err);
  }
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

// Pending discovered items (from auto-updates)
let pendingItems = [];
let pendingTimestamp = '';

function handlePendingDiscovered(data) {
  pendingItems = data.items || [];
  pendingTimestamp = data.timestamp || '';
  const badge = document.getElementById('pending-badge');
  const count = document.getElementById('pending-count');
  if (pendingItems.length > 0) {
    count.textContent = pendingItems.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function showPendingDialog() {
  if (pendingItems.length === 0) return;
  showUpdateDialog([], pendingItems, []);
  const dialog = document.getElementById('update-dialog');
  dialog._isPending = true;
}

async function addPendingItems() {
  const dialog = document.getElementById('update-dialog');
  const content = document.getElementById('update-dialog-content');
  const discovered = dialog._discovered || [];

  const checked = new Set();
  content.querySelectorAll('.discovery-item input[type="checkbox"]:checked').forEach(cb => {
    checked.add(cb.dataset.repo + '#' + cb.dataset.prNumber);
  });

  const selected = discovered.filter(d => checked.has(d.repo + '#' + d.prNumber));
  closeUpdateDialog();

  if (selected.length === 0) {
    // Dismiss all
    await fetch('/api/pending/dismiss', { method: 'POST' });
    return;
  }

  try {
    const res = await fetch('/api/pending/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: selected }),
    });
    if (!res.ok) throw new Error(await res.text());
  } catch (err) {
    console.error('Failed to add pending items:', err);
  }
}

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
        li.textContent = r.id + ': ' + r.oldStatus + ' \u2192 ' + r.newStatus;
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
        li.textContent = e.id + ': ' + e.error;
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

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();

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

  // Pending items badge
  document.getElementById('pending-badge').onclick = showPendingDialog;

  // Update log
  document.getElementById('show-log').onclick = (e) => { e.preventDefault(); showLogDialog(); };
  document.getElementById('log-dialog-close').onclick = closeLogDialog;
  document.getElementById('log-close-btn').onclick = closeLogDialog;
  document.getElementById('log-load-more').onclick = () => loadLogPage(false);

  // Refresh/update all
  document.getElementById('refresh-all').onclick = refreshAll;

  // Update dialog
  document.getElementById('discovery-skip').onclick = () => {
    const dialog = document.getElementById('update-dialog');
    if (dialog._isPending) {
      fetch('/api/pending/dismiss', { method: 'POST' });
    }
    closeUpdateDialog();
  };
  document.getElementById('update-dialog-close').onclick = () => {
    closeUpdateDialog();
  };
  document.getElementById('discovery-add').onclick = () => {
    const dialog = document.getElementById('update-dialog');
    if (dialog._isPending) {
      addPendingItems();
    } else {
      addDiscoveredItems();
    }
  };

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

  // Detail panel close
  document.getElementById('detail-close').onclick = () => {
    document.getElementById('detail-panel').classList.remove('visible');
    syncUrl();
  };

  // Escape to close panels/dialogs
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
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
