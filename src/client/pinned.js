// Pin items to always appear at the top of the list (max 3)
const STORAGE_KEY = 'todo-pinned';
const MAX_PINNED = 3;

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function save(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function getPinnedIds() {
  return load();
}

export function isPinned(id) {
  return load().includes(id);
}

export function togglePin(id) {
  let pinned = load();
  if (pinned.includes(id)) {
    pinned = pinned.filter(p => p !== id);
  } else {
    if (pinned.length >= MAX_PINNED) {
      // Remove oldest pinned item
      pinned.shift();
    }
    pinned.push(id);
  }
  save(pinned);
  return pinned.includes(id);
}

export function sortWithPinned(items) {
  const pinned = load();
  if (pinned.length === 0) return items;
  const pinnedItems = [];
  const rest = [];
  // Maintain pin order from storage
  for (const id of pinned) {
    const item = items.find(i => i.id === id);
    if (item) pinnedItems.push(item);
  }
  for (const item of items) {
    if (!pinned.includes(item.id)) rest.push(item);
  }
  return [...pinnedItems, ...rest];
}
