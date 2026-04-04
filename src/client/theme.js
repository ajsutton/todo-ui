// Theme follows system preference automatically
function syncShoelaceTheme() {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('sl-theme-dark', isDark);
}

export function initTheme() {
  // Remove any stale override from localStorage
  localStorage.removeItem('todo-theme');
  delete document.documentElement.dataset.theme;
  syncShoelaceTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncShoelaceTheme);
}
