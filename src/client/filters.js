// Filtering and sorting functions — all accept params so they are testable

/**
 * Parse a search query string into structured filters.
 * Supports: p:0, p:0-2, type:pr, status:failing, blocked, overdue, tag:name
 * Remaining terms match description.
 */
export function parseSearchQuery(query) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const result = {
    priorityMin: null,  // number
    priorityMax: null,  // number
    typeFilter: null,   // string
    statusFilter: null, // string
    tagFilter: null,    // string
    blocked: false,
    overdue: false,
    textTerms: [],
  };

  for (const token of tokens) {
    if (token === 'blocked') {
      result.blocked = true;
      continue;
    }
    if (token === 'overdue') {
      result.overdue = true;
      continue;
    }
    const pMatch = token.match(/^p:(\d+)(?:-(\d+))?$/);
    if (pMatch) {
      result.priorityMin = parseInt(pMatch[1], 10);
      result.priorityMax = pMatch[2] !== undefined ? parseInt(pMatch[2], 10) : result.priorityMin;
      continue;
    }
    const typeMatch = token.match(/^type:(.+)$/);
    if (typeMatch) {
      result.typeFilter = typeMatch[1];
      continue;
    }
    const statusMatch = token.match(/^status:(.+)$/);
    if (statusMatch) {
      result.statusFilter = statusMatch[1];
      continue;
    }
    const tagMatch = token.match(/^tag:(.+)$/);
    if (tagMatch) {
      result.tagFilter = tagMatch[1];
      continue;
    }
    result.textTerms.push(token);
  }

  return result;
}

export function filterItems(items, { filterType, filterStatus, searchQuery }, getItemTags) {
  const query = (searchQuery || '').trim();
  const parsed = parseSearchQuery(query);
  const today = new Date().toISOString().slice(0, 10);

  return items.filter(item => {
    // Type filter (dropdown)
    if (filterType && item.type !== filterType) return false;
    // Status filter (dropdown)
    if (filterStatus === 'active' && item.doneDate) return false;
    if (filterStatus === 'done' && !item.doneDate) return false;

    // Field-specific search filters
    if (parsed.blocked && !item.blocked) return false;
    if (parsed.overdue) {
      if (!item.due || item.due >= today || item.doneDate) return false;
    }
    if (parsed.priorityMin !== null) {
      const pNum = parseInt((item.priority || '').replace('P', ''), 10);
      if (isNaN(pNum)) return false;
      if (pNum < parsed.priorityMin || pNum > parsed.priorityMax) return false;
    }
    if (parsed.typeFilter) {
      const itemType = (item.type || '').toLowerCase();
      if (!itemType.includes(parsed.typeFilter)) return false;
    }
    if (parsed.statusFilter) {
      const itemStatus = (item.status || '').toLowerCase();
      if (!itemStatus.includes(parsed.statusFilter)) return false;
    }
    if (parsed.tagFilter && getItemTags) {
      const tags = getItemTags(item.id);
      if (!tags.includes(parsed.tagFilter)) return false;
    }

    // Text terms — must all match description
    for (const term of parsed.textTerms) {
      const searchable = [item.id, item.description, item.type, item.status, item.priority, item.due].join(' ').toLowerCase();
      if (!searchable.includes(term)) return false;
    }

    return true;
  });
}

function getColValue(item, col) {
  if (col === 'priority') {
    const n = parseInt((item.priority || '').replace('P', ''));
    return Number.isNaN(n) ? 99 : n;
  }
  if (col === 'id') return parseInt((item.id || '').replace('TODO-', '')) || 0;
  return (item[col] || '').toLowerCase();
}

export function sortItems(items, sortColumn, sortDirection, sortKeys) {
  // sortKeys: optional array of { col, dir } for multi-sort
  const keys = sortKeys && sortKeys.length > 0
    ? sortKeys
    : [{ col: sortColumn, dir: sortDirection }];

  return items.sort((a, b) => {
    for (const { col, dir } of keys) {
      const aVal = getColValue(a, col);
      const bVal = getColValue(b, col);
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
}

export function isSubItemDone(sub) {
  const s = (sub.currentStatus || '').toLowerCase();
  return s.includes('merged') || s.includes('closed');
}

export function filterSubItem(sub, { filterStatus, searchQuery }) {
  if (filterStatus === 'active' && isSubItemDone(sub)) return false;
  if (filterStatus === 'done' && !isSubItemDone(sub)) return false;
  if (searchQuery) {
    const searchable = [sub.repo, '#' + sub.number, sub.title, sub.currentStatus, sub.currentPriority].join(' ').toLowerCase();
    if (!searchable.includes(searchQuery.trim().toLowerCase())) return false;
  }
  return true;
}
