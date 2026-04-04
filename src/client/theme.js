// Theme toggle with localStorage persistence
const THEME_KEY = 'todo-theme';

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) document.documentElement.dataset.theme = saved;
  updateThemeButton();
}

export function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  let next;
  if (current === 'light') {
    next = 'dark';
  } else if (current === 'dark') {
    next = 'light';
  } else {
    // No explicit theme set — toggle from system preference
    next = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  updateThemeButton();
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
