// WebSocket connection management
import { appState } from './state.js';
import { renderTable, prefetchSubItems, showAutoAddedNotice, refreshStale } from './render.js';
import { checkForNotifiableChanges } from './notifications.js';
import { refreshOpenDetail } from './detail.js';
import { handleClaudeStatus } from './claude.js';
import { handleStandupStatus, displayStandupClaudeReport } from './standup.js';
import { updateSessionStats } from './session.js';
import { initChangelogSnapshot, diffSinceLastVisit, showChangelogBanner, updateLatestItems } from './changelog.js';
import { updateTabTitle } from './tabtitle.js';

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

let reconnectCountdownInterval = null;
let reconnectTimeoutId = null;
let pingIntervalId = null;
let lastPongAt = 0;

const PING_INTERVAL_MS = 30000;
const PONG_TIMEOUT_MS = 45000;

function stopPinging() {
  if (pingIntervalId !== null) {
    clearInterval(pingIntervalId);
    pingIntervalId = null;
  }
}

function startPinging() {
  stopPinging();
  lastPongAt = Date.now();
  pingIntervalId = setInterval(() => {
    if (!appState.ws || appState.ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastPongAt > PONG_TIMEOUT_MS) {
      // Server hasn't responded to a ping — connection is dead. Force close
      // so onclose fires and the reconnect loop kicks in.
      try { appState.ws.close(); } catch {}
      return;
    }
    try {
      appState.ws.send(JSON.stringify({ type: 'ping' }));
    } catch {
      // Send failed — connection is broken. onclose will handle reconnect.
    }
  }, PING_INTERVAL_MS);
}

function forceReconnectIfDead() {
  if (appState.ws && appState.ws.readyState === WebSocket.OPEN) return;
  if (reconnectTimeoutId !== null) {
    clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
  }
  appState.reconnectAttempts = 0;
  if (appState.ws && appState.ws.readyState !== WebSocket.CLOSED) {
    try { appState.ws.close(); } catch {}
  } else {
    connectWebSocket();
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') forceReconnectIfDead();
  });
}
if (typeof window !== 'undefined') {
  window.addEventListener('focus', forceReconnectIfDead);
  window.addEventListener('online', forceReconnectIfDead);
}

function setConnectionStatus(state, label) {
  const el = document.getElementById('connection-status');
  const labelEl = document.getElementById('connection-label');
  if (el) el.className = 'status-indicator ' + state;
  if (labelEl) labelEl.textContent = label || '';
}

function startReconnectCountdown(delayMs) {
  clearInterval(reconnectCountdownInterval);
  let remaining = Math.ceil(delayMs / 1000);
  setConnectionStatus('disconnected', `Reconnecting in ${remaining}s`);
  reconnectCountdownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(reconnectCountdownInterval);
      setConnectionStatus('disconnected', 'Reconnecting…');
    } else {
      setConnectionStatus('disconnected', `Reconnecting in ${remaining}s`);
    }
  }, 1000);
}

export function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  appState.ws = new WebSocket(`${protocol}//${location.host}/ws`);

  appState.ws.onopen = () => {
    clearInterval(reconnectCountdownInterval);
    setConnectionStatus('connected', '');
    appState.reconnectAttempts = 0;
    startPinging();
  };

  appState.ws.onclose = () => {
    stopPinging();
    if (reconnectTimeoutId !== null) clearTimeout(reconnectTimeoutId);
    const delay = Math.min(1000 * Math.pow(2, appState.reconnectAttempts++), 30000);
    startReconnectCountdown(delay);
    reconnectTimeoutId = setTimeout(() => {
      reconnectTimeoutId = null;
      connectWebSocket();
    }, delay);
  };

  appState.ws.onerror = () => {}; // onclose fires after onerror

  appState.ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'pong') {
      lastPongAt = Date.now();
      return;
    }
    if (msg.type === 'state') {
      if (msg.data.detailIds) appState.detailIds = new Set(msg.data.detailIds);
      appState.subItemCache.clear();
      appState.items = msg.data.items;
      appState.rawMarkdown = msg.data.rawMarkdown;
      appState.lastModified = msg.data.lastModified;
      if (!appState.dataLoaded) {
        // First load: diff against last-visit snapshot before overwriting it
        const diff = diffSinceLastVisit(appState.items);
        showChangelogBanner(diff);
        initChangelogSnapshot(appState.items);
      }
      appState.dataLoaded = true;
      updateLatestItems(appState.items);
      updateTabTitle(appState.items);
      refreshStale();
      checkForNotifiableChanges(appState.items);
      updateSessionStats(appState.items);
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
