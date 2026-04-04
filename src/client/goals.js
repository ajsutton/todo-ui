// Weekly completion goals: set a target, track progress
// Goal resets each Monday. Progress counts items completed in the current week.

const GOAL_KEY = 'todo-weekly-goal';
const DEFAULT_GOAL = 5;

function getWeekStart(date) {
  // Returns YYYY-MM-DD of the Monday of the week containing `date`
  const d = new Date(date + 'T12:00:00Z');
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function getCurrentWeekStart() {
  return getWeekStart(new Date().toISOString().slice(0, 10));
}

export function loadGoal() {
  try {
    const raw = JSON.parse(localStorage.getItem(GOAL_KEY) || 'null');
    if (raw && typeof raw.target === 'number') return raw;
  } catch {}
  return { target: DEFAULT_GOAL };
}

function saveGoal(data) {
  try { localStorage.setItem(GOAL_KEY, JSON.stringify(data)); } catch {}
}

export function setGoal(target) {
  const data = loadGoal();
  data.target = Math.max(1, Math.min(100, target));
  saveGoal(data);
}

/**
 * Count items completed this week (Monday to now).
 * Items must have a doneDate in the current week.
 */
export function countCompletedThisWeek(items) {
  const weekStart = getCurrentWeekStart();
  const today = new Date().toISOString().slice(0, 10);
  return items.filter(i => i.doneDate && i.doneDate >= weekStart && i.doneDate <= today).length;
}

export function getGoalProgress(items) {
  const { target } = loadGoal();
  const completed = countCompletedThisWeek(items);
  return { target, completed, pct: Math.min(100, Math.round((completed / target) * 100)) };
}

export function initGoalWidget(items) {
  // Remove existing
  document.getElementById('goal-widget')?.remove();

  const widget = document.createElement('div');
  widget.id = 'goal-widget';
  widget.className = 'goal-widget';
  widget.addEventListener('click', showGoalEditor);
  document.body.appendChild(widget);

  updateGoalWidget(items);
}

export function updateGoalWidget(items) {
  const widget = document.getElementById('goal-widget');
  if (!widget) return;

  const { target, completed, pct } = getGoalProgress(items);
  const done = completed >= target;
  const weekEnd = getNextSunday();

  widget.innerHTML = `
    <div class="gw-label">
      <span class="gw-icon">${done ? '🏆' : '🎯'}</span>
      <span class="gw-text">Week: <strong>${completed}/${target}</strong></span>
    </div>
    <div class="gw-bar-track">
      <div class="gw-bar-fill${done ? ' gw-done' : ''}" style="width:${pct}%"></div>
    </div>
    <div class="gw-ends">ends ${weekEnd}</div>
  `;
  widget.title = `${completed} of ${target} items completed this week — click to change goal`;
  widget.classList.toggle('gw-achieved', done);
}

function getNextSunday() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = day === 0 ? 0 : 7 - day;
  const sun = new Date(now);
  sun.setDate(now.getDate() + diff);
  return sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showGoalEditor() {
  document.getElementById('goal-editor-pop')?.remove();

  const { target, completed } = getGoalProgress(window._latestItems || []);
  const pop = document.createElement('div');
  pop.id = 'goal-editor-pop';
  pop.className = 'goal-editor-pop';

  pop.innerHTML = `
    <div class="ge-header">Weekly completion goal</div>
    <div class="ge-body">
      <span class="ge-status">${completed} completed so far this week</span>
      <div class="ge-input-row">
        <label class="ge-label">Target:</label>
        <input class="ge-input" type="number" min="1" max="100" value="${target}">
        <span class="ge-unit">items</span>
      </div>
    </div>
    <div class="ge-presets">
      ${[3, 5, 10, 15, 20].map(n => `<button class="ge-preset${n === target ? ' ge-preset-active' : ''}" data-val="${n}">${n}</button>`).join('')}
    </div>
    <div class="ge-footer">
      <button class="ge-save">Save</button>
      <button class="ge-cancel">Cancel</button>
    </div>
  `;

  const input = pop.querySelector('.ge-input');

  pop.querySelectorAll('.ge-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.val;
      pop.querySelectorAll('.ge-preset').forEach(b => b.classList.remove('ge-preset-active'));
      btn.classList.add('ge-preset-active');
    });
  });

  pop.querySelector('.ge-save').addEventListener('click', () => {
    const val = parseInt(input.value);
    if (!isNaN(val) && val > 0) {
      setGoal(val);
      updateGoalWidget(window._latestItems || []);
    }
    pop.remove();
  });

  pop.querySelector('.ge-cancel').addEventListener('click', () => pop.remove());

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { pop.querySelector('.ge-save').click(); }
    if (e.key === 'Escape') { pop.remove(); }
  });

  document.body.appendChild(pop);

  const widget = document.getElementById('goal-widget');
  if (widget) {
    const rect = widget.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    pop.style.left = Math.min(rect.left, window.innerWidth - 260) + 'px';
  }

  setTimeout(() => {
    document.addEventListener('click', function h(e) {
      if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', h, true); }
    }, { capture: true });
  }, 0);

  input.focus();
  input.select();
}
