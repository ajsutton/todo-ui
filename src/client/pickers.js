// Inline pickers: priority picker, date picker
import { updatePriority, updateSubPriority, updateDue } from './actions.js';
import { pushUndo } from './undo.js';

/**
 * Parse a natural language date shortcut into an ISO date string (YYYY-MM-DD).
 * Supports: today, tomorrow, monday..sunday, +Nd (days), +Nw (weeks).
 * Returns null if not recognized.
 */
export function parseNaturalDate(input, referenceDate) {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  // Normalize to midnight local time
  ref.setHours(0, 0, 0, 0);
  const s = input.trim().toLowerCase();

  if (s === 'today') return toIso(ref);
  if (s === 'tomorrow') { ref.setDate(ref.getDate() + 1); return toIso(ref); }

  // +Nd or +Nw
  const relMatch = s.match(/^\+(\d+)([dw])$/);
  if (relMatch) {
    const n = parseInt(relMatch[1], 10);
    const unit = relMatch[2];
    ref.setDate(ref.getDate() + (unit === 'w' ? n * 7 : n));
    return toIso(ref);
  }

  // Weekday names: next occurrence from tomorrow
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const dayIdx = days.indexOf(s);
  if (dayIdx !== -1) {
    const current = ref.getDay();
    let delta = dayIdx - current;
    if (delta <= 0) delta += 7; // always next occurrence
    ref.setDate(ref.getDate() + delta);
    return toIso(ref);
  }

  return null;
}

function toIso(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

export function showPriorityPicker(cell, item) {
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
      if (p !== item.priority) {
        const oldPriority = item.priority;
        updatePriority(item.id, p);
        pushUndo(`Priority changed to ${p}`, () => updatePriority(item.id, oldPriority));
      }
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

export function showSubPriorityPicker(cell, sub, parentId) {
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

export function showDatePicker(cell, item) {
  document.querySelectorAll('.date-picker').forEach(el => el.remove());

  const picker = document.createElement('div');
  picker.className = 'date-picker';

  // Quick-pick shortcut buttons
  const shortcuts = [
    { label: 'Today', value: 'today' },
    { label: 'Tomorrow', value: 'tomorrow' },
    { label: '+3d', value: '+3d' },
    { label: '+1w', value: '+1w' },
    { label: '+2w', value: '+2w' },
  ];
  const quickRow = document.createElement('div');
  quickRow.className = 'date-picker-shortcuts';
  for (const { label, value } of shortcuts) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = 'btn-small date-shortcut-btn';
    btn.title = value;
    btn.onclick = (e) => {
      e.stopPropagation();
      const iso = parseNaturalDate(value);
      if (iso) {
        picker.remove();
        updateDue(item.id, iso);
      }
    };
    quickRow.appendChild(btn);
  }
  picker.appendChild(quickRow);

  const inputRow = document.createElement('div');
  inputRow.className = 'date-picker-input-row';

  const input = document.createElement('input');
  input.type = 'date';
  input.value = item.due || '';
  inputRow.appendChild(input);

  const setBtn = document.createElement('button');
  setBtn.textContent = 'Set';
  setBtn.className = 'btn-small';
  setBtn.onclick = (e) => {
    e.stopPropagation();
    picker.remove();
    updateDue(item.id, input.value);
  };
  inputRow.appendChild(setBtn);

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.className = 'btn-small';
  clearBtn.onclick = (e) => {
    e.stopPropagation();
    picker.remove();
    if (item.due) updateDue(item.id, '');
  };
  inputRow.appendChild(clearBtn);
  picker.appendChild(inputRow);

  cell.style.position = 'relative';
  cell.appendChild(picker);

  input.focus();

  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      const natural = parseNaturalDate(input.value);
      picker.remove();
      updateDue(item.id, natural || input.value);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      picker.remove();
    }
  };

  const close = (e) => {
    if (!picker.contains(e.target)) {
      picker.remove();
      document.removeEventListener('click', close, true);
    }
  };
  setTimeout(() => document.addEventListener('click', close, true), 0);
}
