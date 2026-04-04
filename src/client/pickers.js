// Inline pickers: priority picker, date picker
import { updatePriority, updateSubPriority, updateDue } from './actions.js';

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
      if (p !== item.priority) updatePriority(item.id, p);
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

  const close = (e) => {
    if (!picker.contains(e.target)) {
      picker.remove();
      document.removeEventListener('click', close, true);
    }
  };
  setTimeout(() => document.addEventListener('click', close, true), 0);
}
