// Keyboard navigation and shortcut overlay
import { appState } from './state.js';
import { showDetail } from './detail.js';
import { enterDetailEditMode } from './detail.js';
import { renderTable } from './render.js';
import { syncUrl } from './url.js';
import { showPriorityPicker } from './pickers.js';
import { openNewItemForm, isFormOpen, closeNewItemForm } from './newitem.js';

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
    } else {
      markComplete(id).then(() => {
        import('./confetti.js').then(({ triggerConfetti }) => triggerConfetti());
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
      case 'n':
        e.preventDefault();
        if (isFormOpen()) closeNewItemForm();
        else openNewItemForm();
        break;
      case 'c': {
        // Copy item ID + description to clipboard
        const rows3 = getVisibleRows();
        if (appState.selectedRowIndex >= 0 && appState.selectedRowIndex < rows3.length) {
          e.preventDefault();
          const row = rows3[appState.selectedRowIndex];
          const id = row.dataset.itemId;
          const item = appState.items.find(i => i.id === id);
          if (item) {
            const text = `${id}: ${item.description || id}`;
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
    }
  });
}
