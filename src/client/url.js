import { appState } from './state.js';

export function getUrlParams(search) {
  const s = search !== undefined ? search : (typeof location !== 'undefined' ? location.search : '');
  const p = new URLSearchParams(s);
  return {
    filterType: p.get('type') || '',
    filterStatus: p.has('status') ? (p.get('status') === 'all' ? '' : p.get('status')) : 'active',
    searchQuery: p.get('search') || '',
    sortColumn: p.get('sort') || 'priority',
    sortDirection: p.get('dir') || 'asc',
    detailId: p.get('detail') || '',
    expanded: p.get('expanded') ? p.get('expanded').split(',') : [],
  };
}

export function syncUrl() {
  const p = new URLSearchParams();
  if (appState.filterType) p.set('type', appState.filterType);
  if (appState.filterStatus !== 'active') p.set('status', appState.filterStatus || 'all');
  if (appState.searchQuery) p.set('search', appState.searchQuery);
  if (appState.sortColumn !== 'priority') p.set('sort', appState.sortColumn);
  if (appState.sortDirection !== 'asc') p.set('dir', appState.sortDirection);
  const detailPanel = document.getElementById('detail-panel');
  const detailIdEl = document.getElementById('detail-id');
  if (detailPanel && detailPanel.classList.contains('visible') && detailIdEl.textContent) {
    p.set('detail', detailIdEl.textContent);
  }
  if (appState.groupByMode) p.set('groupby', appState.groupByMode);
  if (appState.expandedItems.size > 0) p.set('expanded', [...appState.expandedItems].join(','));
  const qs = p.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}
