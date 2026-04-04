// Custom tags per item — stored in localStorage as { [itemId]: string[] }
// Tags are shown as pills in the description cell and searchable.
const STORAGE_KEY = 'todo-tags';

// Predefined color palette for tags
const TAG_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4',
];

function colorForTag(tag) {
  let hash = 0;
  for (const ch of tag) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getTagsForItem(id) {
  return load()[id] || [];
}

export function addTag(id, tag) {
  const data = load();
  const tags = data[id] || [];
  const normalized = tag.trim().toLowerCase().replace(/\s+/g, '-');
  if (!normalized || tags.includes(normalized)) return;
  data[id] = [...tags, normalized];
  save(data);
}

export function removeTag(id, tag) {
  const data = load();
  if (!data[id]) return;
  data[id] = data[id].filter(t => t !== tag);
  if (data[id].length === 0) delete data[id];
  save(data);
}

export function getAllTags() {
  const data = load();
  const all = new Set();
  for (const tags of Object.values(data)) {
    for (const tag of tags) all.add(tag);
  }
  return [...all].sort();
}

// Render tags as HTML pills for a given item
export function renderTagPills(id, interactive) {
  const tags = getTagsForItem(id);
  if (tags.length === 0) return '';
  return tags.map(tag => {
    const color = colorForTag(tag);
    const del = interactive
      ? `<button class="tag-del" data-id="${id}" data-tag="${escAttr(tag)}" title="Remove tag">×</button>`
      : '';
    return `<span class="tag-pill" style="background:${color}20;color:${color};border-color:${color}40">${escHtml(tag)}${del}</span>`;
  }).join('');
}

// Show the tag input popover near anchorEl
export function showTagPicker(id, anchorEl, onChanged) {
  document.getElementById('tag-picker')?.remove();

  const currentTags = getTagsForItem(id);
  const allTags = getAllTags().filter(t => !currentTags.includes(t));

  const picker = document.createElement('div');
  picker.id = 'tag-picker';
  picker.className = 'tag-picker';
  picker.innerHTML = `
    <div class="tag-picker-title">Add tag to item</div>
    <div class="tag-picker-input-row">
      <input type="text" class="tag-picker-input" placeholder="tag name…" maxlength="30" autocomplete="off">
      <button class="btn-small tag-picker-add">Add</button>
    </div>
    ${currentTags.length > 0 ? `
      <div class="tag-picker-current">
        ${currentTags.map(t => `<span class="tag-pill tag-pill-rm" data-tag="${escAttr(t)}" style="background:${colorForTag(t)}20;color:${colorForTag(t)};border-color:${colorForTag(t)}40">
          ${escHtml(t)} <span class="tag-rm-x">×</span>
        </span>`).join('')}
      </div>
    ` : ''}
    ${allTags.length > 0 ? `
      <div class="tag-picker-suggestions">
        ${allTags.slice(0, 8).map(t => `<span class="tag-suggestion" data-tag="${escAttr(t)}">${escHtml(t)}</span>`).join('')}
      </div>
    ` : ''}
  `;

  document.body.appendChild(picker);
  positionNear(picker, anchorEl);

  const input = picker.querySelector('.tag-picker-input');
  input.focus();

  const doAdd = () => {
    const val = input.value.trim();
    if (val) { addTag(id, val); input.value = ''; onChanged?.(); }
  };

  picker.querySelector('.tag-picker-add').addEventListener('click', doAdd);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAdd();
    if (e.key === 'Escape') picker.remove();
  });

  picker.querySelectorAll('.tag-pill-rm').forEach(pill => {
    pill.addEventListener('click', () => {
      removeTag(id, pill.dataset.tag);
      onChanged?.();
      picker.remove();
    });
  });

  picker.querySelectorAll('.tag-suggestion').forEach(s => {
    s.addEventListener('click', () => {
      addTag(id, s.dataset.tag);
      onChanged?.();
      picker.remove();
    });
  });

  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!picker.contains(e.target) && e.target !== anchorEl) {
        picker.remove();
        document.removeEventListener('click', handler, true);
      }
    }, { capture: true, once: false });
  }, 50);
}

function positionNear(el, anchor) {
  const rect = anchor.getBoundingClientRect();
  el.style.position = 'fixed';
  el.style.top = (rect.bottom + 4) + 'px';
  el.style.left = Math.min(rect.left, window.innerWidth - 240) + 'px';
}

function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escAttr(s) { return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
