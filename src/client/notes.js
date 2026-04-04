// Quick personal notes on items — stored in localStorage, never modifies files
const STORAGE_KEY = 'todo-item-notes';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function save(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export function getNote(itemId) {
  return load()[itemId] || '';
}

export function setNote(itemId, text) {
  const notes = load();
  const trimmed = text.trim();
  if (trimmed) {
    notes[itemId] = trimmed;
  } else {
    delete notes[itemId];
  }
  save(notes);
}

export function hasNote(itemId) {
  const notes = load();
  return !!notes[itemId];
}

export function getAllNotes() {
  return load();
}

// Show a popover to edit the note for an item
export function showNoteEditor(anchorEl, itemId, onSave) {
  document.getElementById('note-editor-pop')?.remove();

  const current = getNote(itemId);
  const pop = document.createElement('div');
  pop.id = 'note-editor-pop';
  pop.className = 'note-editor-pop';

  pop.innerHTML = `
    <div class="ne-header">
      <span class="ne-title">📝 Note for ${escHtml(itemId)}</span>
    </div>
    <textarea class="ne-textarea" placeholder="Add a personal note…" maxlength="500">${escHtml(current)}</textarea>
    <div class="ne-footer">
      <span class="ne-hint">Ctrl+Enter to save · Esc to cancel</span>
      <div class="ne-actions">
        ${current ? '<button class="ne-btn ne-clear">Clear</button>' : ''}
        <button class="ne-btn ne-save">Save</button>
      </div>
    </div>
  `;

  const ta = pop.querySelector('.ne-textarea');
  const saveBtn = pop.querySelector('.ne-save');
  const clearBtn = pop.querySelector('.ne-clear');

  function doSave() {
    setNote(itemId, ta.value);
    pop.remove();
    if (onSave) onSave();
  }

  saveBtn.addEventListener('click', doSave);

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      setNote(itemId, '');
      pop.remove();
      if (onSave) onSave();
    });
  }

  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doSave(); }
    if (e.key === 'Escape') { e.stopPropagation(); pop.remove(); }
  });

  document.body.appendChild(pop);

  // Position near anchor
  const rect = anchorEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = rect.bottom + 4;
  let left = rect.left;

  pop.style.position = 'fixed';
  pop.style.left = '0px'; // temp to measure
  pop.style.top = '-9999px';

  requestAnimationFrame(() => {
    const pw = pop.offsetWidth || 300;
    const ph = pop.offsetHeight || 160;
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (left < 8) left = 8;
    if (top + ph > vh - 8) top = rect.top - ph - 4;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('mousedown', function h(e) {
      if (!pop.contains(e.target) && e.target !== anchorEl) {
        pop.remove();
        document.removeEventListener('mousedown', h, true);
      }
    }, { capture: true });
  }, 0);
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
