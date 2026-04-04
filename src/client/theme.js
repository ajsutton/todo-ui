// Theme follows system preference automatically
export function initTheme() {
  // Remove any stale override from localStorage
  localStorage.removeItem('todo-theme');
  delete document.documentElement.dataset.theme;
}
