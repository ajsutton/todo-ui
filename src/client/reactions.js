// Emoji reactions on items — stored in localStorage, purely decorative / personal
const STORAGE_KEY = 'todo-reactions';

const REACTION_SET = ['🔥', '⚡', '😬', '🚀', '✨', '⚠️', '💡', '🤔', '👍', '❤️'];

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getReactions(itemId) {
  return load()[itemId] || [];
}

export function toggleReaction(itemId, emoji) {
  const data = load();
  const reactions = data[itemId] || [];
  const idx = reactions.indexOf(emoji);
  if (idx >= 0) {
    reactions.splice(idx, 1);
  } else {
    reactions.push(emoji);
  }
  if (reactions.length === 0) {
    delete data[itemId];
  } else {
    data[itemId] = reactions;
  }
  save(data);
}

export function hasReactions(itemId) {
  const reactions = getReactions(itemId);
  return reactions.length > 0;
}

export function getAllReactions() {
  return load();
}

/**
 * Render reaction badges for an item.
 * Returns a DOM element (span) with clickable emoji.
 * onToggle: callback(emoji) fired after toggling.
 */
export function renderReactionBadges(itemId, onToggle) {
  const reactions = getReactions(itemId);
  if (reactions.length === 0) return null;

  const container = document.createElement('span');
  container.className = 'reaction-badges';

  for (const emoji of reactions) {
    const badge = document.createElement('span');
    badge.className = 'reaction-badge';
    badge.textContent = emoji;
    badge.title = `Remove ${emoji} reaction`;
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleReaction(itemId, emoji);
      if (onToggle) onToggle(emoji);
    });
    container.appendChild(badge);
  }

  return container;
}

/**
 * Show a reaction picker near anchorEl.
 * onSelect: callback(emoji) fired after picking.
 */
export function showReactionPicker(anchorEl, itemId, onSelect) {
  document.getElementById('reaction-picker')?.remove();

  const current = getReactions(itemId);
  const picker = document.createElement('div');
  picker.id = 'reaction-picker';
  picker.className = 'reaction-picker';

  picker.innerHTML = REACTION_SET.map(emoji =>
    `<button class="rp-btn${current.includes(emoji) ? ' rp-active' : ''}" data-emoji="${emoji}" title="${emoji}">${emoji}</button>`
  ).join('');

  picker.querySelectorAll('.rp-btn').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const emoji = btn.dataset.emoji;
      toggleReaction(itemId, emoji);
      if (onSelect) onSelect(emoji);
      picker.remove();
    });
  });

  document.body.appendChild(picker);

  const rect = anchorEl.getBoundingClientRect();
  const vw = window.innerWidth;
  let left = rect.left;
  picker.style.position = 'fixed';
  picker.style.top = (rect.bottom + 4) + 'px';

  requestAnimationFrame(() => {
    const pw = picker.offsetWidth || 240;
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (left < 4) left = 4;
    picker.style.left = left + 'px';
  });

  setTimeout(() => {
    document.addEventListener('mousedown', function h(e) {
      if (!picker.contains(e.target)) {
        picker.remove();
        document.removeEventListener('mousedown', h, true);
      }
    }, { capture: true });
  }, 0);
}
