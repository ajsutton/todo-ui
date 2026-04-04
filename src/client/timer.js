// Pomodoro-style focus timer — attach to any item, shows countdown in header
import { canNotify } from './notifications.js';

// Time tracking: store completed sessions per item in localStorage
const TIME_KEY = 'todo-time-tracked';

function loadTimeData() {
  try { return JSON.parse(localStorage.getItem(TIME_KEY) || '{}'); } catch { return {}; }
}

function recordTimerSession(itemId, minutes) {
  const data = loadTimeData();
  if (!data[itemId]) data[itemId] = { totalMinutes: 0, sessions: [] };
  data[itemId].totalMinutes += minutes;
  data[itemId].sessions.push({ date: new Date().toISOString().slice(0, 10), minutes });
  // Keep only last 50 sessions per item
  if (data[itemId].sessions.length > 50) data[itemId].sessions = data[itemId].sessions.slice(-50);
  localStorage.setItem(TIME_KEY, JSON.stringify(data));
}

export function getTimeTracked(itemId) {
  const data = loadTimeData();
  return data[itemId]?.totalMinutes ?? 0;
}

export function formatMinutes(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const DURATIONS = [
  { label: '5m',  minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '25m', minutes: 25 },
  { label: '45m', minutes: 45 },
];

let timerState = null;  // { itemId, itemLabel, endsAt, intervalId, barEl }

function createTimerBar() {
  const bar = document.createElement('div');
  bar.id = 'focus-timer-bar';
  bar.className = 'focus-timer-bar hidden';
  bar.innerHTML = `
    <span class="timer-icon">🍅</span>
    <span class="timer-label"></span>
    <span class="timer-countdown"></span>
    <div class="timer-progress-track"><div class="timer-progress-fill"></div></div>
    <button class="timer-stop btn-icon" title="Stop timer">✕</button>
  `;
  bar.querySelector('.timer-stop').addEventListener('click', stopTimer);
  // Insert after header
  const header = document.querySelector('header');
  if (header) header.after(bar);
  else document.body.prepend(bar);
  return bar;
}

function getBar() {
  return document.getElementById('focus-timer-bar') || createTimerBar();
}

function tick() {
  if (!timerState) return;
  const bar = getBar();
  const remaining = timerState.endsAt - Date.now();
  if (remaining <= 0) {
    // Timer done
    clearInterval(timerState.intervalId);
    const { itemId, itemLabel, totalMs } = timerState;
    timerState = null;
    bar.classList.add('hidden');
    bar.classList.remove('timer-urgent');
    onTimerComplete(itemId, itemLabel, Math.round(totalMs / 60000));
    return;
  }
  const totalMs = timerState.totalMs;
  const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100));
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  bar.querySelector('.timer-countdown').textContent =
    `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  bar.querySelector('.timer-progress-fill').style.width = pct + '%';
  bar.classList.toggle('timer-urgent', remaining < 60000);
}

function onTimerComplete(itemId, label, minutes) {
  recordTimerSession(itemId, minutes);
  if (canNotify()) {
    new Notification('Focus timer complete!', {
      body: `Time's up for: ${label}`,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍅</text></svg>',
      tag: 'focus-timer-done',
    });
  }
  // Flash the tab title briefly
  const orig = document.title;
  let flashes = 0;
  const flashInterval = setInterval(() => {
    document.title = flashes % 2 === 0 ? '⏰ Time\'s up!' : orig;
    flashes++;
    if (flashes >= 8) { clearInterval(flashInterval); document.title = orig; }
  }, 600);
}

export function startTimer(itemId, itemLabel, minutes) {
  stopTimer();
  const totalMs = minutes * 60000;
  const bar = getBar();
  bar.querySelector('.timer-label').textContent = truncate(itemLabel, 40);
  bar.classList.remove('hidden', 'timer-urgent');

  timerState = {
    itemId, itemLabel,
    totalMs,
    endsAt: Date.now() + totalMs,
    intervalId: setInterval(tick, 500),
  };
  tick();
}

export function stopTimer() {
  if (!timerState) return;
  clearInterval(timerState.intervalId);
  timerState = null;
  const bar = document.getElementById('focus-timer-bar');
  if (bar) { bar.classList.add('hidden'); bar.classList.remove('timer-urgent'); }
}

export function isTimerRunning() {
  return timerState !== null;
}

export function getTimerItemId() {
  return timerState?.itemId ?? null;
}

// Render a timer button for a table row (called from render.js)
export function renderTimerBtn(itemId) {
  const active = timerState?.itemId === itemId;
  if (active) {
    return `<button class="btn-icon-inline timer-btn timer-active" data-timer-id="${itemId}" title="Stop focus timer">🍅</button>`;
  }
  return `<button class="btn-icon-inline timer-btn" data-timer-id="${itemId}" title="Start focus timer">🍅</button>`;
}

// Show duration picker popover near a button
export function showTimerPicker(itemId, itemLabel, anchorEl) {
  closePicker();
  const picker = document.createElement('div');
  picker.id = 'timer-picker';
  picker.className = 'timer-picker';
  picker.innerHTML = `
    <div class="timer-picker-title">Focus on: <strong>${truncate(itemLabel, 30)}</strong></div>
    <div class="timer-picker-btns">
      ${DURATIONS.map(d => `<button class="btn-small timer-pick-btn" data-minutes="${d.minutes}">${d.label}</button>`).join('')}
    </div>
  `;
  picker.querySelectorAll('.timer-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      startTimer(itemId, itemLabel, parseInt(btn.dataset.minutes, 10));
      closePicker();
    });
  });
  document.body.appendChild(picker);

  // Position near anchor
  const rect = anchorEl.getBoundingClientRect();
  picker.style.position = 'fixed';
  picker.style.top = (rect.bottom + 6) + 'px';
  picker.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', onOutsideClick, { once: true, capture: true });
  }, 0);
}

function onOutsideClick(e) {
  const picker = document.getElementById('timer-picker');
  if (picker && !picker.contains(e.target)) closePicker();
  else if (picker) document.addEventListener('click', onOutsideClick, { once: true, capture: true });
}

function closePicker() {
  document.getElementById('timer-picker')?.remove();
}

function truncate(s, max) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
