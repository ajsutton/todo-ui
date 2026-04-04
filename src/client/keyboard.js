// Keyboard navigation and shortcut overlay
import { appState } from './state.js';
import { showDetail } from './detail.js';
import { enterDetailEditMode } from './detail.js';
import { renderTable } from './render.js';
import { syncUrl } from './url.js';
import { showPriorityPicker, showDatePicker, showTypePicker } from './pickers.js';
import { openNewItemForm, isFormOpen, closeNewItemForm } from './newitem.js';
import { showWeekView, closeWeekView, isWeekViewOpen } from './weekview.js';
import { showDigest, closeDigest, isDigestOpen } from './digest.js';

function getVisibleRows() {
  return Array.from(document.querySelectorAll('#todo-body tr[data-item-id]'));
}

function isInInput() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

function isDialogOpen() {
  const dialogs = ['standup-dialog', 'log-dialog', 'update-dialog', 'shortcut-overlay'];
  return dialogs.some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });
}

function updateSelectedRow() {
  document.querySelectorAll('#todo-body tr.row-selected').forEach(r => r.classList.remove('row-selected'));
  const rows = getVisibleRows();
  if (appState.selectedRowIndex >= 0 && appState.selectedRowIndex < rows.length) {
    const row = rows[appState.selectedRowIndex];
    row.classList.add('row-selected');
    row.scrollIntoView({ block: 'nearest' });
  }
}

function selectNext() {
  const rows = getVisibleRows();
  if (rows.length === 0) return;
  appState.selectedRowIndex = Math.min(appState.selectedRowIndex + 1, rows.length - 1);
  updateSelectedRow();
}

function selectPrev() {
  const rows = getVisibleRows();
  if (rows.length === 0) return;
  if (appState.selectedRowIndex <= 0) {
    appState.selectedRowIndex = 0;
  } else {
    appState.selectedRowIndex--;
  }
  updateSelectedRow();
}

function openSelected() {
  const rows = getVisibleRows();
  if (appState.selectedRowIndex < 0 || appState.selectedRowIndex >= rows.length) return;
  const row = rows[appState.selectedRowIndex];
  const id = row.dataset.itemId;
  if (id) showDetail(id);
}

function doneSelected() {
  const rows = getVisibleRows();
  if (appState.selectedRowIndex < 0 || appState.selectedRowIndex >= rows.length) return;
  const row = rows[appState.selectedRowIndex];
  const id = row.dataset.itemId;
  if (!id) return;
  const item = appState.items.find(i => i.id === id);
  if (!item) return;
  import('./actions.js').then(({ markComplete, markIncomplete }) => {
    if (item.doneDate) {
      markIncomplete(id);
      import('./sounds.js').then(({ playSound }) => playSound('undo'));
    } else {
      markComplete(id).then(() => {
        import('./confetti.js').then(({ triggerConfetti }) => triggerConfetti(item.priority));
        import('./sounds.js').then(({ playSound }) => playSound('done'));
      });
    }
  });
}

function openGithub() {
  const rows = getVisibleRows();
  if (appState.selectedRowIndex < 0 || appState.selectedRowIndex >= rows.length) return;
  const row = rows[appState.selectedRowIndex];
  const id = row.dataset.itemId;
  if (!id) return;
  const item = appState.items.find(i => i.id === id);
  if (item && item.githubUrl) {
    window.open(item.githubUrl, '_blank', 'noopener');
  }
}

let focusMode = false;

function toggleFocusMode() {
  focusMode = !focusMode;
  const claudePanel = document.getElementById('claude-panel');
  if (focusMode) {
    // Show only P0-P1 items
    appState.searchQuery = (appState.searchQuery + ' p:0-1').trim();
    const input = document.getElementById('filter-search');
    if (input) input.value = appState.searchQuery;
    if (claudePanel) claudePanel.style.display = 'none';
  } else {
    // Restore — remove p:0-1 from search
    appState.searchQuery = appState.searchQuery.replace(/\s*p:0-1\s*/g, '').trim();
    const input = document.getElementById('filter-search');
    if (input) input.value = appState.searchQuery;
    if (claudePanel) claudePanel.style.display = '';
  }
  renderTable();
  syncUrl();
}

export function showShortcutOverlay() {
  const overlay = document.getElementById('shortcut-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

export function closeShortcutOverlay() {
  const overlay = document.getElementById('shortcut-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function isShortcutOverlayOpen() {
  const overlay = document.getElementById('shortcut-overlay');
  return overlay && !overlay.classList.contains('hidden');
}

export function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Escape always closes things
    if (e.key === 'Escape') {
      if (isDigestOpen()) { closeDigest(); return; }
      if (isWeekViewOpen()) { closeWeekView(); return; }
      if (isShortcutOverlayOpen()) {
        closeShortcutOverlay();
        return;
      }
      const standupDialog = document.getElementById('standup-dialog');
      if (!standupDialog.classList.contains('hidden')) {
        standupDialog.classList.add('hidden');
        return;
      }
      const logDialog = document.getElementById('log-dialog');
      if (!logDialog.classList.contains('hidden')) {
        logDialog.classList.add('hidden');
        return;
      }
      const updateDialog = document.getElementById('update-dialog');
      if (!updateDialog.classList.contains('hidden')) {
        updateDialog.classList.add('hidden');
        return;
      }
      const detailPanel = document.getElementById('detail-panel');
      if (detailPanel.classList.contains('visible')) {
        detailPanel.classList.remove('visible');
        syncUrl();
        return;
      }
      return;
    }

    // ? to toggle shortcut overlay
    if (e.key === '?') {
      if (isShortcutOverlayOpen()) {
        closeShortcutOverlay();
      } else {
        showShortcutOverlay();
      }
      return;
    }

    // Ignore shortcuts when in input or dialog is open
    if (isInInput()) return;
    if (isDialogOpen()) return;

    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault();
        selectNext();
        break;
      case 'k':
      case 'ArrowUp':
        e.preventDefault();
        selectPrev();
        break;
      case 'Enter':
      case 'o':
        e.preventDefault();
        openSelected();
        break;
      case 'd':
        e.preventDefault();
        doneSelected();
        break;
      case 'e':
        e.preventDefault();
        enterDetailEditMode();
        break;
      case 'g':
        e.preventDefault();
        openGithub();
        break;
      case '/':
        e.preventDefault();
        document.getElementById('filter-search')?.focus();
        break;
      case 'f':
        e.preventDefault();
        toggleFocusMode();
        break;
      case 'w':
        e.preventDefault();
        if (isWeekViewOpen()) closeWeekView();
        else showWeekView();
        break;
      case 'n':
        // Shift+N: quick note on selected; N alone: new item form
        if (e.shiftKey) {
          e.preventDefault();
          const rowsN = getVisibleRows();
          if (appState.selectedRowIndex >= 0 && appState.selectedRowIndex < rowsN.length) {
            const row = rowsN[appState.selectedRowIndex];
            const id = row.dataset.itemId;
            if (id) {
              import('./notes.js').then(({ showNoteEditor }) => {
                showNoteEditor(row, id, () => import('./render.js').then(m => m.renderTable()));
              });
            }
          }
        } else {
          e.preventDefault();
          if (isFormOpen()) closeNewItemForm();
          else openNewItemForm();
        }
        break;
      case 'r': {
        // Refresh GitHub status of selected row
        const rows4 = getVisibleRows();
        if (appState.selectedRowIndex >= 0 && appState.selectedRowIndex < rows4.length) {
          e.preventDefault();
          const row = rows4[appState.selectedRowIndex];
          const id = row.dataset.itemId;
          const item = appState.items.find(i => i.id === id);
          if (item?.githubUrl) {
            // Flash the row
            row.classList.add('row-refreshing');
            fetch('/api/refresh/' + id, { method: 'POST' })
              .catch(() => {})
              .finally(() => row.classList.remove('row-refreshing'));
          }
        }
        break;
      }
      case 'c': {
        // Copy item to clipboard — rich format for PRs, plain for others
        const rows3 = getVisibleRows();
        if (appState.selectedRowIndex >= 0 && appState.selectedRowIndex < rows3.length) {
          e.preventDefault();
          const row = rows3[appState.selectedRowIndex];
          const id = row.dataset.itemId;
          const item = appState.items.find(i => i.id === id);
          if (item) {
            let text;
            if (item.githubUrl && item.repo && item.prNumber) {
              // PR/Review: org/repo#N — Title (Status) [Priority]
              const title = item.description.replace(/^\[.*?\]\(.*?\)\s*/, '').trim();
              const status = item.status ? ` — ${item.status}` : '';
              text = `${item.repo}#${item.prNumber}: ${title}${status} [${item.priority}]`;
            } else {
              // Regular item: TODO-N: Description [Priority]
              const desc = (item.description || id).replace(/^\[.*?\]\(.*?\)\s*/, '').trim();
              text = `${id}: ${desc} [${item.priority}]`;
            }
            navigator.clipboard?.writeText(text).then(() => {
              import('./render.js').then(({ showCopyToast }) => showCopyToast(id));
            }).catch(() => {});
          }
        }
        break;
      }
      case 'p': {
        // Quick-set priority on selected row
        const rows2 = getVisibleRows();
        if (appState.selectedRowIndex >= 0 && appState.selectedRowIndex < rows2.length) {
          e.preventDefault();
          const row = rows2[appState.selectedRowIndex];
          const id = row.dataset.itemId;
          const item = appState.items.find(i => i.id === id);
          if (item) {
            // Priority cell: col 3 normally, col 4 in bulk mode (checkbox prepended)
            import('./bulk.js').then(({ isSelectionMode }) => {
              const offset = isSelectionMode() ? 1 : 0;
              const priCell = row.cells[3 + offset];
              if (priCell) showPriorityPicker(priCell, item);
            });
          }
        }
        break;
      }
      case 's': {
        // Snooze selected item until tomorrow
        const rowsS = getVisibleRows();
        if (appState.selectedRowIndex >= 0 && appState.selectedRowIndex < rowsS.length) {
          e.preventDefault();
          const id = rowsS[appState.selectedRowIndex].dataset.itemId;
          if (id) {
            import('./snooze.js').then(({ snoozeItem, isSnoozed, unsnoozeItem }) => {
              if (isSnoozed(id)) {
                unsnoozeItem(id);
              } else {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                snoozeItem(id, tomorrow.toISOString().slice(0, 10));
              }
              import('./render.js').then(m => m.renderTable());
            });
          }
        }
        break;
      }
      case 'u': {
        // Quick-set due date on selected row
        const rowsU = getVisibleRows();
        if (appState.selectedRowIndex >= 0 && appState.selectedRowIndex < rowsU.length) {
          e.preventDefault();
          const row = rowsU[appState.selectedRowIndex];
          const id = row.dataset.itemId;
          const item = appState.items.find(i => i.id === id);
          if (item) {
            const dueCell = row.querySelector('[data-col="due"]');
            if (dueCell) showDatePicker(dueCell, item);
          }
        }
        break;
      }
      case '+':
      case '=': {
        // Bump due date forward by 1 day
        const rowsPlus = getVisibleRows();
        if (appState.selectedRowIndex >= 0 && appState.selectedRowIndex < rowsPlus.length) {
          e.preventDefault();
          const id = rowsPlus[appState.selectedRowIndex].dataset.itemId;
          const item = appState.items.find(i => i.id === id);
          if (item) {
            const base = item.due || new Date().toISOString().slice(0, 10);
            const d = new Date(base + 'T12:00:00Z');
            d.setUTCDate(d.getUTCDate() + 1);
            import('./actions.js').then(({ updateDue }) => updateDue(id, d.toISOString().slice(0, 10)));
          }
        }
        break;
      }
      case '-': {
        // Bump due date back by 1 day
        const rowsMinus = getVisibleRows();
        if (appState.selectedRowIndex >= 0 && appState.selectedRowIndex < rowsMinus.length) {
          e.preventDefault();
          const id = rowsMinus[appState.selectedRowIndex].dataset.itemId;
          const item = appState.items.find(i => i.id === id);
          if (item && item.due) {
            const d = new Date(item.due + 'T12:00:00Z');
            d.setUTCDate(d.getUTCDate() - 1);
            import('./actions.js').then(({ updateDue }) => updateDue(id, d.toISOString().slice(0, 10)));
          }
        }
        break;
      }
      case 't': {
        // Quick-set type on selected row
        const rowsT = getVisibleRows();
        if (appState.selectedRowIndex >= 0 && appState.selectedRowIndex < rowsT.length) {
          e.preventDefault();
          const row = rowsT[appState.selectedRowIndex];
          const id = row.dataset.itemId;
          const item = appState.items.find(i => i.id === id);
          if (item) {
            showTypePicker(row, item);
          }
        }
        break;
      }
    }
  });
}
