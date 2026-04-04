// Entry point — wires up all modules on DOMContentLoaded
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/tab-group/tab-group.js';
import '@shoelace-style/shoelace/dist/components/tab/tab.js';
import '@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js';
setBasePath('/sl/');

import { appState } from './state.js';
import { syncUrl } from './url.js';
import { renderTable, fetchLastUpdateTime, setLastUpdate } from './render.js';
import { connectWebSocket } from './ws.js';
import { showDetail } from './detail.js';
import { enterDetailEditMode, exitDetailEditMode, saveDetailContent, toggleNoteForm, appendNote } from './detail.js';
import { showLogDialog, closeLogDialog, loadLogPage } from './log.js';
import { showStandupDialog, closeStandupDialog, switchStandupTab, copyStandupReport, generateStandupWithClaude } from './standup.js';
import { sendClaudePrompt, handleClaudeStatus, pushHistory, resetHistoryNav, navigateHistory } from './claude.js';
import { initKeyboard, showShortcutOverlay, closeShortcutOverlay } from './keyboard.js';
import { initTheme } from './theme.js';
import { initSessionBadge } from './session.js';
import { initStreakBadge } from './streak.js';
import { applyColumnVisibility, showColumnPicker } from './columns.js';
import { initSoundBtn } from './sounds.js';
import { initTagCloud, showTagCloud } from './tagcloud.js';
import { requestNotificationPermission, canNotify } from './notifications.js';
import { initQuickAdd } from './quickadd.js';
import { initPalette } from './palette.js';
import { initSearchHistory, recordSearch, hideDropdown } from './searchhistory.js';
import { initNewItem } from './newitem.js';

function showUpdateDialog(results, discovered, errors) {
  errors = errors || [];
  const dialog = document.getElementById('update-dialog');
  const content = document.getElementById('update-dialog-content');
  const actions = document.getElementById('update-dialog-actions');
  content.innerHTML = '';

  const hasChanges = results.length > 0;
  const hasDiscovered = discovered.length > 0;

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
        link.textContent = r.description || r.id;
        li.appendChild(link);
      } else {
        const nameSpan = document.createElement('span');
        nameSpan.className = 'change-id';
        nameSpan.textContent = r.description || r.id;
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
      nameSpan.textContent = e.description || e.id;
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
  }

  actions.classList.add('hidden');
  // Show close footer, hide actions footer
  const closeFtr = document.getElementById('update-dialog-close-footer');
  if (closeFtr) closeFtr.style.display = '';
  dialog._discovered = [];
  dialog.show();
}

function closeUpdateDialog() {
  document.getElementById('update-dialog').hide();
}

async function refreshAll() {
  const btn = document.getElementById('refresh-all');
  const progress = document.getElementById('update-progress');
  const fill = document.getElementById('progress-fill');
  btn.setAttribute('loading', '');
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
    btn.removeAttribute('loading');
    btn.disabled = false;
    progress.classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Initialize theme and session tracking
  initTheme();
  initSoundBtn();
  applyColumnVisibility();
  initTagCloud();
  initSessionBadge();
  initStreakBadge();

  // Connect WebSocket
  connectWebSocket();
  fetchLastUpdateTime();

  // Sort headers — Shift+click adds secondary sort key
  function updateSortIndicators() {
    document.querySelectorAll('th[data-sort]').forEach(h => {
      h.classList.remove('sort-asc', 'sort-desc', 'sort-secondary');
      h.removeAttribute('data-sort-index');
    });
    if (appState.sortKeys.length > 0) {
      appState.sortKeys.forEach((key, i) => {
        const h = document.querySelector(`th[data-sort="${key.col}"]`);
        if (h) {
          h.classList.add(key.dir === 'asc' ? 'sort-asc' : 'sort-desc');
          if (i > 0) h.classList.add('sort-secondary');
          h.dataset.sortIndex = i + 1;
        }
      });
    } else {
      const h = document.querySelector(`th[data-sort="${appState.sortColumn}"]`);
      if (h) h.classList.add(appState.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  }

  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', (e) => {
      const col = th.dataset.sort;
      if (e.shiftKey) {
        // Add/toggle secondary sort key
        const existing = appState.sortKeys.findIndex(k => k.col === col);
        if (existing === 0) {
          // Toggle primary direction
          appState.sortKeys[0].dir = appState.sortKeys[0].dir === 'asc' ? 'desc' : 'asc';
        } else if (existing > 0) {
          // Toggle or remove secondary key
          appState.sortKeys[existing].dir = appState.sortKeys[existing].dir === 'asc' ? 'desc' : 'asc';
        } else {
          // Add as new secondary key
          if (appState.sortKeys.length === 0) {
            // Promote current sort to keys array first
            appState.sortKeys = [{ col: appState.sortColumn, dir: appState.sortDirection }];
          }
          appState.sortKeys.push({ col, dir: 'asc' });
        }
      } else {
        // Normal click: clear multi-sort, do primary sort
        appState.sortKeys = [];
        if (appState.sortColumn === col) {
          appState.sortDirection = appState.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          appState.sortColumn = col;
          appState.sortDirection = 'asc';
        }
      }
      updateSortIndicators();
      syncUrl();
      renderTable();
    });
  });

  // Restore filter dropdowns from URL state
  document.getElementById('filter-search').value = appState.searchQuery;
  // sl-select value must be set after element is defined
  const typeEl = document.getElementById('filter-type');
  const statusEl = document.getElementById('filter-status');
  customElements.whenDefined('sl-select').then(() => {
    typeEl.value = appState.filterType;
    statusEl.value = appState.filterStatus || 'active';
  });

  // Set initial sort indicator
  updateSortIndicators();

  // Restore detail panel from URL state
  if (appState.urlParams.detailId) {
    showDetail(appState.urlParams.detailId);
  }

  // Filters
  const searchEl = document.getElementById('filter-search');
  searchEl.addEventListener('sl-input', () => {
    appState.searchQuery = searchEl.value;
    syncQuickFilterChips();
    renderTable();
  });
  searchEl.addEventListener('sl-clear', () => {
    appState.searchQuery = '';
    syncQuickFilterChips();
    syncUrl();
    renderTable();
  });
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && searchEl.value.trim().length >= 2) {
      recordSearch(searchEl.value.trim());
      hideDropdown();
    }
  });
  initSearchHistory(searchEl, (query) => {
    searchEl.value = query;
    appState.searchQuery = query;
    syncUrl();
    document.dispatchEvent(new Event('search-changed'));
    renderTable();
  });
  document.getElementById('filter-type').addEventListener('sl-change', (e) => {
    appState.filterType = e.target.value;
    renderTable();
  });
  document.getElementById('filter-status').addEventListener('sl-change', (e) => {
    appState.filterStatus = e.target.value;
    renderTable();
  });

  // Quick filter chips
  function syncQuickFilterChips() {
    document.querySelectorAll('.qf-chip').forEach(btn => {
      btn.classList.toggle('active', appState.searchQuery === btn.dataset.query);
    });
  }
  document.querySelectorAll('.qf-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.query;
      appState.searchQuery = appState.searchQuery === q ? '' : q;
      searchEl.value = appState.searchQuery;
      syncQuickFilterChips();
      syncUrl();
      renderTable();
    });
  });
  // Initial chip sync on load and when search is changed externally (e.g. preset apply)
  syncQuickFilterChips();
  document.addEventListener('search-changed', syncQuickFilterChips);

  // Update log
  document.getElementById('show-log').onclick = (e) => { e.preventDefault(); showLogDialog(); };
  document.getElementById('log-close-btn').onclick = closeLogDialog;
  document.getElementById('log-load-more').onclick = () => loadLogPage(false);

  // Standup dialog
  document.getElementById('show-standup').addEventListener('click', () => showStandupDialog());
  document.getElementById('standup-close-btn').onclick = closeStandupDialog;
  document.getElementById('standup-copy-btn').onclick = copyStandupReport;
  document.getElementById('standup-claude-generate').addEventListener('click', generateStandupWithClaude);
  document.getElementById('standup-tab-group')?.addEventListener('sl-tab-show', (e) => switchStandupTab(e.detail.name));

  // Refresh/update all
  document.getElementById('refresh-all').addEventListener('click', refreshAll);

  // Update dialog
  document.getElementById('discovery-skip').onclick = closeUpdateDialog;
  document.getElementById('update-dialog-close-btn').onclick = closeUpdateDialog;
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
      const next = navigateHistory('up', claudeInput.value);
      if (next !== null) claudeInput.value = next;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = navigateHistory('down', claudeInput.value);
      if (next !== null) claudeInput.value = next;
    }
  };

  // Quick actions
  document.querySelectorAll('.quick-action').forEach(btn => {
    btn.onclick = () => sendClaudePrompt(btn.dataset.prompt);
  });

  // Detail panel
  document.getElementById('detail-edit').onclick = () => enterDetailEditMode();
  document.getElementById('detail-save').onclick = () => saveDetailContent();
  document.getElementById('detail-cancel').onclick = () => exitDetailEditMode(true);
  document.getElementById('detail-note')?.addEventListener('click', toggleNoteForm);
  document.getElementById('detail-note-save')?.addEventListener('click', appendNote);
  document.getElementById('detail-note-cancel')?.addEventListener('click', toggleNoteForm);
  document.getElementById('detail-note-text')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); appendNote(); }
    if (e.key === 'Escape') toggleNoteForm();
  });
  document.getElementById('detail-close').onclick = () => {
    if (appState.detailEditMode) exitDetailEditMode(false);
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


  // Group-by select
  const groupbySelect = document.getElementById('groupby-select');
  if (groupbySelect) {
    customElements.whenDefined('sl-select').then(() => {
      groupbySelect.value = appState.groupByMode || '';
    });
    groupbySelect.addEventListener('sl-change', () => {
      appState.groupByMode = groupbySelect.value || false;
      syncUrl();
      renderTable();
    });
  }

  // Column visibility
  document.getElementById('columns-btn')?.addEventListener('click', (e) => showColumnPicker(e.currentTarget ?? e.target));

  // Notification toggle
  const notifBtn = document.getElementById('notif-toggle');
  function updateNotifBtn() {
    if (!notifBtn) return;
    if (!('Notification' in window)) { notifBtn.classList.add('hidden'); return; }
    notifBtn.textContent = canNotify() ? '🔔' : '🔕';
    notifBtn.title = canNotify() ? 'Notifications enabled' : 'Enable notifications';
  }
  if (notifBtn) {
    notifBtn.onclick = async () => {
      await requestNotificationPermission();
      updateNotifBtn();
    };
    updateNotifBtn();
  }


  // Keyboard shortcut overlay close button
  const overlayClose = document.getElementById('shortcut-overlay-close');
  if (overlayClose) overlayClose.onclick = closeShortcutOverlay;

  // Help button
  const helpBtn = document.getElementById('show-shortcuts');
  if (helpBtn) helpBtn.onclick = showShortcutOverlay;

  // Initialize keyboard shortcuts (includes Escape handler)
  initKeyboard();

  // Initialize hover cards

  // Quick-add via paste
  initQuickAdd();

  // Command palette (Cmd+K / Ctrl+K)
  initPalette();

  // Quick-add new item form
  initNewItem();
});

// trigger
