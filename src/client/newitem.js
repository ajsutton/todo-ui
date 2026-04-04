// Quick-add new todo item form
// Press 'n' or click the + button to open an inline form above the table.

let formEl = null;

export function isFormOpen() {
  return formEl && !formEl.classList.contains('hidden');
}

export function openNewItemForm() {
  if (!formEl) createForm();
  formEl.classList.remove('hidden');
  formEl.querySelector('.new-item-desc').focus();
  formEl.querySelector('.new-item-desc').value = '';
}

export function closeNewItemForm() {
  formEl?.classList.add('hidden');
}

function createForm() {
  formEl = document.createElement('div');
  formEl.id = 'new-item-form';
  formEl.className = 'new-item-form hidden';
  formEl.innerHTML = `
    <div class="new-item-row">
      <span class="new-item-icon">＋</span>
      <input type="text" class="new-item-desc" placeholder="New item description…" maxlength="200" autocomplete="off">
      <select class="new-item-type">
        <option value="Issue">Issue</option>
        <option value="PR">PR</option>
        <option value="Review">Review</option>
        <option value="Workstream">Workstream</option>
      </select>
      <select class="new-item-priority">
        <option value="P3">P3</option>
        <option value="P0">P0</option>
        <option value="P1">P1</option>
        <option value="P2">P2</option>
        <option value="P4">P4</option>
        <option value="P5">P5</option>
      </select>
      <button class="btn-small new-item-submit">Add</button>
      <button class="btn-small btn-secondary new-item-cancel">Cancel</button>
    </div>
    <div class="new-item-status hidden"></div>
  `;

  // Insert above the table
  const table = document.getElementById('todo-table');
  if (table) table.before(formEl);
  else document.body.prepend(formEl);

  const desc = formEl.querySelector('.new-item-desc');
  const statusEl = formEl.querySelector('.new-item-status');

  formEl.querySelector('.new-item-submit').addEventListener('click', submit);
  formEl.querySelector('.new-item-cancel').addEventListener('click', closeNewItemForm);

  desc.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') closeNewItemForm();
  });

  async function submit() {
    const description = desc.value.trim();
    if (!description) { desc.focus(); return; }

    const type = formEl.querySelector('.new-item-type').value;
    const priority = formEl.querySelector('.new-item-priority').value;
    const submitBtn = formEl.querySelector('.new-item-submit');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding…';
    statusEl.classList.add('hidden');

    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, type, priority }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add item');
      statusEl.textContent = `Added ${data.id}`;
      statusEl.className = 'new-item-status new-item-ok';
      statusEl.classList.remove('hidden');
      desc.value = '';
      desc.focus();
      setTimeout(() => { statusEl.classList.add('hidden'); }, 2000);
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'new-item-status new-item-error';
      statusEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add';
    }
  }
}

export function initNewItem() {
  // Wire keyboard shortcut 'n' — handled in keyboard.js
  // Also add a + button near the filters
  const btn = document.createElement('button');
  btn.id = 'new-item-btn';
  btn.className = 'btn-small';
  btn.title = 'Add new item (n)';
  btn.textContent = '+ New';
  const filters = document.querySelector('.filters');
  if (filters) filters.prepend(btn);
  btn.addEventListener('click', () => {
    if (isFormOpen()) closeNewItemForm();
    else openNewItemForm();
  });
}
