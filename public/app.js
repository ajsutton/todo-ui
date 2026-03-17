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
    } else if (msg.type === 'claude-status') {
      handleClaudeStatus(msg.data);
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

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = isDone ? 'Undo' : 'Done';
    toggleBtn.className = 'btn-small';
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      if (isDone) markIncomplete(item.id); else markComplete(item.id);
    };
    tdActions.appendChild(toggleBtn);

    if (item.githubUrl) {
      const refreshBtn = document.createElement('button');
      refreshBtn.textContent = 'Refresh';
      refreshBtn.className = 'btn-small';
      refreshBtn.id = 'refresh-' + item.id;
      refreshBtn.onclick = (e) => { e.stopPropagation(); refreshItem(item.id); };
      tdActions.appendChild(refreshBtn);
    }

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
    if (query && !item.description.toLowerCase().includes(query)) return false;
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

async function refreshAll() {
  const btn = document.getElementById('refresh-all');
  btn.classList.add('loading');
  btn.disabled = true;
  try {
    const res = await fetch('/api/refresh', { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
  } catch (err) {
    console.error('Failed to refresh all:', err);
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
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

  // Refresh all
  document.getElementById('refresh-all').onclick = refreshAll;

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

  // Escape to close detail
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('detail-panel').classList.remove('visible');
      syncUrl();
    }
  });
});
