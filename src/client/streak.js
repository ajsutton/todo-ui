// Completion streak: tracks consecutive days with at least one item completed
const STORAGE_KEY = 'todo-streak';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') ||
      { currentStreak: 0, lastCompletedDate: null, longestStreak: 0, totalCompleted: 0 };
  } catch {
    return { currentStreak: 0, lastCompletedDate: null, longestStreak: 0, totalCompleted: 0 };
  }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function prevDay(dateStr) {
  // Returns the YYYY-MM-DD string for the day before dateStr
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Record a completion on the given date (YYYY-MM-DD).
 * Returns updated streak data. Pure-ish — accepts date so it's testable.
 */
export function recordCompletion(date) {
  const data = load();

  if (data.lastCompletedDate === date) {
    // Already credited today — just bump total
    data.totalCompleted += 1;
    save(data);
    return data;
  }

  const yesterday = prevDay(date);
  if (data.lastCompletedDate === yesterday) {
    data.currentStreak += 1;
  } else {
    // Streak broken or first ever
    data.currentStreak = 1;
  }

  data.lastCompletedDate = date;
  data.longestStreak = Math.max(data.longestStreak, data.currentStreak);
  data.totalCompleted = (data.totalCompleted || 0) + 1;
  save(data);
  return data;
}

export function getStreak() {
  const data = load();
  // If last completion wasn't today or yesterday, streak is effectively broken on display
  // (we don't reset storage, just communicate to UI that it's stale)
  return data;
}

export function isStreakActive(data, today) {
  if (!data.lastCompletedDate) return false;
  return data.lastCompletedDate === today || data.lastCompletedDate === prevDay(today);
}

export function initStreakBadge() {
  const badge = document.createElement('button');
  badge.id = 'streak-badge';
  badge.className = 'streak-badge';
  badge.title = 'Completion streak';
  badge.addEventListener('click', showStreakPopover);
  const headerRight = document.querySelector('.header-right');
  if (headerRight) headerRight.insertBefore(badge, headerRight.firstChild);
  renderStreakBadge();
}

export function renderStreakBadge() {
  const badge = document.getElementById('streak-badge');
  if (!badge) return;
  const data = getStreak();
  const today = new Date().toISOString().slice(0, 10);
  const active = isStreakActive(data, today);
  const streak = data.currentStreak;

  if (streak === 0) {
    badge.classList.add('hidden');
    return;
  }

  badge.classList.remove('hidden');
  const icon = active ? '🔥' : '💤';
  badge.textContent = `${icon} ${streak}`;
  badge.title = active
    ? `${streak}-day streak! Keep it up.`
    : `Streak paused at ${streak} days — complete something today to continue!`;
  badge.classList.toggle('streak-active', active);
  badge.classList.toggle('streak-paused', !active);
}

function showStreakPopover() {
  document.getElementById('streak-popover')?.remove();

  const data = getStreak();
  const today = new Date().toISOString().slice(0, 10);
  const active = isStreakActive(data, today);

  const pop = document.createElement('div');
  pop.id = 'streak-popover';
  pop.className = 'streak-popover';

  const statusMsg = active
    ? `<span class="streak-status-active">🔥 Streak is active!</span>`
    : `<span class="streak-status-paused">💤 Complete something today to keep your streak alive.</span>`;

  pop.innerHTML = `
    <div class="streak-pop-header">Completion Streak</div>
    <div class="streak-pop-body">
      <div class="streak-stat"><span class="streak-stat-val">${data.currentStreak}</span><span class="streak-stat-label">current</span></div>
      <div class="streak-stat"><span class="streak-stat-val">${data.longestStreak}</span><span class="streak-stat-label">best</span></div>
      <div class="streak-stat"><span class="streak-stat-val">${data.totalCompleted || 0}</span><span class="streak-stat-label">all-time</span></div>
    </div>
    <div class="streak-pop-status">${statusMsg}</div>
    <button class="streak-reset-btn">Reset streak</button>
  `;

  pop.querySelector('.streak-reset-btn').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    pop.remove();
    renderStreakBadge();
  });

  document.body.appendChild(pop);

  const badge = document.getElementById('streak-badge');
  if (badge) {
    const rect = badge.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.top = (rect.bottom + 6) + 'px';
    pop.style.right = (window.innerWidth - rect.right) + 'px';
  }

  setTimeout(() => {
    document.addEventListener('click', function h(e) {
      if (!pop.contains(e.target) && e.target.id !== 'streak-badge') {
        pop.remove();
        document.removeEventListener('click', h, true);
      }
    }, { capture: true });
  }, 0);
}
