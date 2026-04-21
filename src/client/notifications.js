// Browser notification support for important PR status changes.
// Asks for permission on first call, then sends native notifications.

const NOTIF_KEY = 'todo-notif-perm';

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function canNotify() {
  return 'Notification' in window && Notification.permission === 'granted';
}

function notify(title, body, tag) {
  if (!canNotify()) return;
  const n = new Notification(title, {
    body,
    tag, // deduplicate: same tag replaces previous notification
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📋</text></svg>",
  });
  n.onclick = () => { window.focus(); n.close(); };
}

// Watch for high-signal status transitions and notify
const PREV_STATUSES = new Map(); // id → status string

export function checkForNotifiableChanges(newItems) {
  if (!canNotify()) { PREV_STATUSES.clear(); return; }

  for (const item of newItems) {
    const prev = PREV_STATUSES.get(item.id);
    const curr = item.status;
    PREV_STATUSES.set(item.id, curr);

    if (prev === undefined || prev === curr) continue; // first load or no change

    const name = item.description.replace(/^\[.*?\]\(.*?\)\s*/, '').slice(0, 60);
    const sl = curr.toLowerCase();
    const pl = prev.toLowerCase();

    // PR approved
    if (!pl.includes('approved') && sl.includes('approved')) {
      notify('✅ PR Approved', name, item.id + '-approved');
    }
    // CI went red
    if (!pl.includes('failing') && sl.includes('failing')) {
      notify('❌ CI Failing', name, item.id + '-failing');
    }
    // CI recovered
    if (pl.includes('failing') && sl.includes('ci passing')) {
      notify('✅ CI Passing', name, item.id + '-passing');
    }
    // Changes requested
    if (!pl.includes('changes requested') && sl.includes('changes requested')) {
      notify('🔄 Changes Requested', name, item.id + '-changes');
    }
    // Merged
    if (!pl.includes('merged') && sl.includes('merged')) {
      notify('🎉 Merged!', name, item.id + '-merged');
    }
    // Closed (without merging)
    if (!pl.includes('closed') && sl.includes('closed')) {
      notify('🗑️ Closed', name, item.id + '-closed');
    }
    // Ready to merge (approved + CI passing)
    if (sl.includes('approved') && sl.includes('ci passing') &&
        !(pl.includes('approved') && pl.includes('ci passing'))) {
      notify('🚀 Ready to Merge', name, item.id + '-ready');
    }
  }
}
