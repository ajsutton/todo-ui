// Entry point — wires up all modules on DOMContentLoaded
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
import { initTheme, toggleTheme, initAccentPicker, showAccentPicker } from './theme.js';
import { initSessionBadge } from './session.js';
import { initStreakBadge } from './streak.js';
import { requestNotificationPermission, canNotify } from './notifications.js';
import { toggleBulkMode, bulkMarkDone, bulkMarkActive, bulkSetPriority, clearSelection, renderBulkToolbar, showBulkTagPicker } from './bulk.js';
import { showSuggestionBanner } from './suggestion.js';
import { copyExport, downloadCsv } from './export.js';
import { initHoverCards } from './hovercard.js';
import { initQuickAdd } from './quickadd.js';
import { initPalette } from './palette.js';
import { toggleGroupBy, isGroupByMode } from './groupby.js';
import { renderPresetsBar, showSavePresetDialog } from './presets.js';
import { initSearchHistory, recordSearch, hideDropdown } from './searchhistory.js';
import { initNewItem } from './newitem.js';
import { showWeekView } from './weekview.js';
import { showDigest } from './digest.js';
import { showRecentsPopover } from './recents.js';

function showUpdateDialog(results, discovered, errors) {
  errors = errors || [];
  const dialog = document.getElementById('update-dialog');
  const content = document.getElementById('update-dialog-content');
  const actions = document.getElementById('update-dialog-actions');
  const title = document.getElementById('update-dialog-title');
  content.innerHTML = '';

  const hasChanges = results.length > 0;
  const hasDiscovered = discovered.length > 0;

  title.textContent = 'Update Results';

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
  dialog._discovered = [];
  dialog.classList.remove('hidden');
}

function closeUpdateDialog() {
  document.getElementById('update-dialog').classList.add('hidden');
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

document.addEventListener('DOMContentLoaded', () => {
  // Initialize theme, accent color, and session tracking
  initTheme();
  initAccentPicker();
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
  document.getElementById('filter-type').value = appState.filterType;
  document.getElementById('filter-status').value = appState.filterStatus;

  // Set initial sort indicator
  updateSortIndicators();

  // Restore detail panel from URL state
  if (appState.urlParams.detailId) {
    showDetail(appState.urlParams.detailId);
  }

  // Filters
  const searchEl = document.getElementById('filter-search');
  searchEl.oninput = (e) => {
    appState.searchQuery = e.target.value;
    renderTable();
  };
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
  document.getElementById('filter-type').onchange = (e) => {
    appState.filterType = e.target.value;
    renderTable();
  };
  document.getElementById('filter-status').onchange = (e) => {
    appState.filterStatus = e.target.value;
    renderTable();
  };

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
  // Keep chips in sync when search changes via text input
  const _origSearchInput = searchEl.oninput;
  searchEl.oninput = (e) => {
    appState.searchQuery = e.target.value;
    syncQuickFilterChips();
    renderTable();
  };
  // Initial chip sync on load and when search is changed externally (e.g. preset apply)
  syncQuickFilterChips();
  document.addEventListener('search-changed', syncQuickFilterChips);

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
  document.getElementById('update-dialog-close').onclick = closeUpdateDialog;
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

  // Focus mode
  const FOCUS_KEY = 'todo-focus-mode';
  if (localStorage.getItem(FOCUS_KEY) === '1') document.body.classList.add('focus-mode');
  document.getElementById('focus-mode-btn')?.addEventListener('click', () => {
    const isNow = document.body.classList.toggle('focus-mode');
    localStorage.setItem(FOCUS_KEY, isNow ? '1' : '0');
  });

  // Row density toggle
  const DENSITY_KEY = 'todo-density';
  const savedDensity = localStorage.getItem(DENSITY_KEY) || 'normal';
  document.documentElement.dataset.density = savedDensity;
  document.querySelectorAll('.density-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.density === savedDensity);
    btn.addEventListener('click', () => {
      const d = btn.dataset.density;
      document.documentElement.dataset.density = d;
      localStorage.setItem(DENSITY_KEY, d);
      document.querySelectorAll('.density-btn').forEach(b => b.classList.toggle('active', b.dataset.density === d));
    });
  });

  // Share URL
  const shareBtn = document.getElementById('share-url');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(location.href).then(() => {
        const orig = shareBtn.textContent;
        shareBtn.textContent = 'Copied!';
        setTimeout(() => { shareBtn.textContent = orig; }, 1500);
      }).catch(() => {
        prompt('Copy this URL:', location.href);
      });
    });
  }

  // Export as Markdown
  const exportBtn = document.getElementById('export-md');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      await copyExport();
      const orig = exportBtn.textContent;
      exportBtn.textContent = 'Copied!';
      setTimeout(() => { exportBtn.textContent = orig; }, 1500);
    });
  }

  // CSV download button
  document.getElementById('export-csv')?.addEventListener('click', downloadCsv);

  // "What's next?" suggestion
  document.getElementById('show-next')?.addEventListener('click', showSuggestionBanner);

  // Week view
  document.getElementById('show-week')?.addEventListener('click', showWeekView);

  // Daily brief digest
  document.getElementById('show-digest')?.addEventListener('click', showDigest);

  // Recent items button
  const recentBtn = document.getElementById('recent-btn');
  if (recentBtn) {
    recentBtn.addEventListener('click', () => {
      showRecentsPopover(recentBtn, (id) => showDetail(id));
    });
  }

  // Saved filter presets
  renderPresetsBar();
  document.getElementById('save-preset-btn')?.addEventListener('click', showSavePresetDialog);

  // Group-by toggle
  const groupbyBtn = document.getElementById('groupby-toggle');
  if (groupbyBtn) {
    groupbyBtn.addEventListener('click', () => {
      toggleGroupBy();
      groupbyBtn.classList.toggle('active', isGroupByMode());
      renderTable();
    });
  }

  // Bulk mode
  document.getElementById('bulk-mode-toggle')?.addEventListener('click', toggleBulkMode);
  document.getElementById('bulk-mode-exit')?.addEventListener('click', toggleBulkMode);
  document.querySelectorAll('[data-bulk-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.bulkAction;
      if (action === 'done') bulkMarkDone();
      else if (action === 'active') bulkMarkActive();
      else if (action === 'priority') bulkSetPriority(btn.dataset.priority);
      else if (action === 'clear') clearSelection();
      else if (action === 'tag') { showBulkTagPicker(btn); return; }
      renderBulkToolbar();
    });
  });

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

  // Theme toggle
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.onclick = toggleTheme;

  // Accent color picker
  const accentBtn = document.getElementById('accent-btn');
  if (accentBtn) accentBtn.onclick = () => showAccentPicker(accentBtn);

  // Keyboard shortcut overlay close button
  const overlayClose = document.getElementById('shortcut-overlay-close');
  if (overlayClose) overlayClose.onclick = closeShortcutOverlay;

  // Help button
  const helpBtn = document.getElementById('show-shortcuts');
  if (helpBtn) helpBtn.onclick = showShortcutOverlay;

  // Initialize keyboard shortcuts (includes Escape handler)
  initKeyboard();

  // Initialize hover cards
  initHoverCards();

  // Quick-add via paste
  initQuickAdd();

  // Command palette (Cmd+K / Ctrl+K)
  initPalette();

  // Quick-add new item form
  initNewItem();
});
