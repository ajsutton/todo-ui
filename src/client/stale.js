// Stale item detection
// Tracks when each item last changed status/priority using localStorage.
// Items that have been unchanged for >STALE_DAYS are marked stale.

const STALE_KEY = 'todo-stale-tracker';
const STALE_DAYS = 7;

function loadTracker() {
  try {
    return JSON.parse(localStorage.getItem(STALE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveTracker(tracker) {
  localStorage.setItem(STALE_KEY, JSON.stringify(tracker));
}

// Call on each state update with the full items array.
// Returns a Set of item IDs considered stale.
export function updateStaleTracker(items) {
  const tracker = loadTracker();
  const now = Date.now();
  const staleMs = STALE_DAYS * 86400000;
  const staleIds = new Set();
  let dirty = false;

  for (const item of items) {
    if (item.doneDate) {
      // Done items: remove from tracker to keep it clean
      if (tracker[item.id]) { delete tracker[item.id]; dirty = true; }
      continue;
    }

    const fingerprint = item.status + '|' + item.priority;
    const existing = tracker[item.id];

    if (!existing) {
      tracker[item.id] = { fingerprint, since: now };
      dirty = true;
    } else if (existing.fingerprint !== fingerprint) {
      tracker[item.id] = { fingerprint, since: now };
      dirty = true;
    } else if (now - existing.since > staleMs) {
      staleIds.add(item.id);
    }
  }

  if (dirty) saveTracker(tracker);
  return staleIds;
}

// Returns the number of days an item has been unchanged, or 0 if fresh
export function staleDays(id) {
  const tracker = loadTracker();
  const entry = tracker[id];
  if (!entry) return 0;
  return Math.floor((Date.now() - entry.since) / 86400000);
}
