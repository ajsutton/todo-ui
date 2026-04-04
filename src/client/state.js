// Shared mutable application state — all modules import { appState } from './state.js'

function parseUrlParams(search) {
  const p = new URLSearchParams(search !== undefined ? search : (typeof location !== 'undefined' ? location.search : ''));
  return {
    filterType: p.get('type') || '',
    filterStatus: p.has('status') ? (p.get('status') === 'all' ? '' : p.get('status')) : 'active',
    searchQuery: p.get('search') || '',
    sortColumn: p.get('sort') || 'priority',
    sortDirection: p.get('dir') || 'asc',
    detailId: p.get('detail') || '',
    expanded: p.get('expanded') ? p.get('expanded').split(',') : [],
    groupBy: p.get('groupby') || '',
  };
}

const urlParams = parseUrlParams();

export const appState = {
  // Server state
  items: [],
  rawMarkdown: '',
  lastModified: 0,

  // Detail file tracking
  detailIds: new Set(),
  subItemCache: new Map(),
  expandedItems: new Set(urlParams.expanded),

  // UI filter/sort state (initialized from URL)
  sortColumn: urlParams.sortColumn,
  sortDirection: urlParams.sortDirection,
  sortKeys: [],  // multi-sort: array of { col, dir } — overrides sortColumn/sortDirection when non-empty
  filterType: urlParams.filterType,
  filterStatus: urlParams.filterStatus,
  searchQuery: urlParams.searchQuery,
  groupByMode: urlParams.groupBy || false,

  // Detail panel state
  currentDetailRaw: null,
  currentDetailHtml: null,
  detailEditMode: false,

  // Loading state
  dataLoaded: false,

  // Connection state
  ws: null,
  reconnectAttempts: 0,

  // Keyboard navigation
  selectedRowIndex: -1,

  // Standup state
  activeStandupTab: 'report',
  currentStandupReport: null,
  standupReportLoaded: false,
  standupClaudeLoaded: false,
  standupClaudeRawOutput: '',

  // Parsed URL params (for initial setup)
  urlParams,
};
