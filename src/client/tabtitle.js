// Dynamic browser tab title: shows urgent item counts
// Format: "(N overdue · M P0) TODOs" or just "TODOs" when nothing urgent.

const BASE_TITLE = 'TODOs';

/**
 * Update the document title based on current item state.
 * Called after each data refresh.
 */
export function updateTabTitle(items) {
  if (!items || items.length === 0) {
    document.title = BASE_TITLE;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const active = items.filter(i => !i.doneDate);

  const overdue = active.filter(i => i.due && i.due < today);
  const p0 = active.filter(i => i.priority === 'P0' && !(i.due && i.due < today)); // P0 not already counted as overdue
  const blocked = active.filter(i => i.blocked && !overdue.includes(i));

  const parts = [];
  if (overdue.length > 0) parts.push(`${overdue.length} overdue`);
  if (p0.length > 0) parts.push(`${p0.length} P0`);
  if (blocked.length > 0 && parts.length === 0) parts.push(`${blocked.length} blocked`);

  document.title = parts.length > 0
    ? `(${parts.join(' · ')}) ${BASE_TITLE}`
    : BASE_TITLE;
}

/**
 * Count items for title badge (testable, no side effects).
 */
export function getTitleBadgeParts(items) {
  if (!items || items.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);
  const active = items.filter(i => !i.doneDate);
  const overdue = active.filter(i => i.due && i.due < today);
  const p0 = active.filter(i => i.priority === 'P0' && !(i.due && i.due < today));
  const blocked = active.filter(i => i.blocked && !overdue.includes(i));

  const parts = [];
  if (overdue.length > 0) parts.push(`${overdue.length} overdue`);
  if (p0.length > 0) parts.push(`${p0.length} P0`);
  if (blocked.length > 0 && parts.length === 0) parts.push(`${blocked.length} blocked`);
  return parts;
}
