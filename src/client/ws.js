// WebSocket connection management
import { appState } from './state.js';
import { renderTable, prefetchSubItems, showAutoAddedNotice, refreshStale } from './render.js';
import { refreshOpenDetail } from './detail.js';
import { handleClaudeStatus } from './claude.js';
import { handleStandupStatus, displayStandupClaudeReport } from './standup.js';

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

export function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  appState.ws = new WebSocket(`${protocol}//${location.host}/ws`);

  appState.ws.onopen = () => {
    document.getElementById('connection-status').className = 'status-indicator connected';
    appState.reconnectAttempts = 0;
  };

  appState.ws.onclose = () => {
    document.getElementById('connection-status').className = 'status-indicator disconnected';
    setTimeout(connectWebSocket, Math.min(1000 * Math.pow(2, appState.reconnectAttempts++), 30000));
  };

  appState.ws.onerror = () => {}; // onclose fires after onerror

  appState.ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'state') {
      if (msg.data.detailIds) appState.detailIds = new Set(msg.data.detailIds);
      appState.subItemCache.clear();
      appState.items = msg.data.items;
      appState.rawMarkdown = msg.data.rawMarkdown;
      appState.lastModified = msg.data.lastModified;
      refreshStale();
      renderTable();
      prefetchSubItems();
      refreshOpenDetail();
    } else if (msg.type === 'update-progress') {
      handleUpdateProgress(msg.data);
    } else if (msg.type === 'claude-status') {
      handleClaudeStatus(msg.data);
    } else if (msg.type === 'standup-status') {
      handleStandupStatus(msg.data);
    } else if (msg.type === 'standup-cache-updated') {
      const dialog = document.getElementById('standup-dialog');
      if (!dialog.classList.contains('hidden') && appState.activeStandupTab === 'claude') {
        displayStandupClaudeReport(msg.data.output, msg.data.generatedAt);
      }
    } else if (msg.type === 'items-auto-added') {
      showAutoAddedNotice(msg.data);
    } else if (msg.type === 'reload') {
      clearTimeout(window._reloadTimer);
      window._reloadTimer = setTimeout(() => location.reload(), 500);
    }
  };
}
