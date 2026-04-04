// Theme toggle with localStorage persistence
const THEME_KEY = 'todo-theme';
const ACCENT_KEY = 'todo-accent';

const ACCENT_COLORS = [
  { name: 'Blue',   light: '#2563eb', dark: '#3b82f6' },
  { name: 'Purple', light: '#7c3aed', dark: '#8b5cf6' },
  { name: 'Pink',   light: '#db2777', dark: '#ec4899' },
  { name: 'Teal',   light: '#0d9488', dark: '#14b8a6' },
  { name: 'Green',  light: '#16a34a', dark: '#22c55e' },
  { name: 'Orange', light: '#ea580c', dark: '#f97316' },
  { name: 'Red',    light: '#dc2626', dark: '#ef4444' },
];

function isDarkMode() {
  const current = document.documentElement.dataset.theme;
  if (current === 'dark') return true;
  if (current === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyAccent(name) {
  const entry = ACCENT_COLORS.find(c => c.name === name);
  if (!entry) {
    document.documentElement.style.removeProperty('--accent');
    document.documentElement.style.removeProperty('--accent-hover');
    return;
  }
  const color = isDarkMode() ? entry.dark : entry.light;
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-hover', color);
  // Also update P3 which defaults to accent
  document.documentElement.style.setProperty('--p3', color);
}

export function initAccentPicker() {
  const saved = localStorage.getItem(ACCENT_KEY);
  if (saved) applyAccent(saved);
}

export function showAccentPicker(anchorEl) {
  document.getElementById('accent-picker')?.remove();

  const picker = document.createElement('div');
  picker.id = 'accent-picker';
  picker.className = 'accent-picker';

  const saved = localStorage.getItem(ACCENT_KEY) || 'Blue';

  for (const entry of ACCENT_COLORS) {
    const swatch = document.createElement('button');
    swatch.className = 'accent-swatch' + (entry.name === saved ? ' active' : '');
    swatch.title = entry.name;
    swatch.style.background = isDarkMode() ? entry.dark : entry.light;
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      localStorage.setItem(ACCENT_KEY, entry.name);
      applyAccent(entry.name);
      picker.remove();
      // Update active state immediately
      picker.querySelectorAll('.accent-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
    });
    picker.appendChild(swatch);
  }

  // Reset button
  const reset = document.createElement('button');
  reset.className = 'accent-swatch accent-swatch-reset';
  reset.title = 'Reset to default';
  reset.textContent = '↺';
  reset.addEventListener('click', (e) => {
    e.stopPropagation();
    localStorage.removeItem(ACCENT_KEY);
    applyAccent(null);
    picker.remove();
  });
  picker.appendChild(reset);

  document.body.appendChild(picker);

  // Position near anchor
  const rect = anchorEl.getBoundingClientRect();
  picker.style.position = 'fixed';
  picker.style.top = (rect.bottom + 4) + 'px';
  picker.style.right = (window.innerWidth - rect.right) + 'px';

  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!picker.contains(e.target)) {
        picker.remove();
        document.removeEventListener('click', handler, true);
      }
    }, { capture: true });
  }, 0);
}

function syncShoelaceTheme() {
  document.documentElement.classList.toggle('sl-theme-dark', isDarkMode());
}

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) document.documentElement.dataset.theme = saved;
  updateThemeButton();
  syncShoelaceTheme();
}

export function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  let next;
  if (current === 'light') {
    next = 'dark';
  } else if (current === 'dark') {
    next = 'light';
  } else {
    next = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark';
  }

  // Circular reveal animation from the theme button
  const btn = document.getElementById('theme-toggle');
  if (btn && document.startViewTransition) {
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy));

    document.documentElement.style.setProperty('--theme-cx', cx + 'px');
    document.documentElement.style.setProperty('--theme-cy', cy + 'px');
    document.documentElement.style.setProperty('--theme-r', maxR + 'px');

    document.startViewTransition(() => {
      document.documentElement.dataset.theme = next;
      localStorage.setItem(THEME_KEY, next);
      updateThemeButton();
      syncShoelaceTheme();
    });
  } else {
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    updateThemeButton();
    syncShoelaceTheme();
  }
}

function updateThemeButton() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const current = document.documentElement.dataset.theme;
  let isDark;
  if (current === 'dark') isDark = true;
  else if (current === 'light') isDark = false;
  else isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  btn.textContent = isDark ? '☀️' : '🌙';
  btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
}
