// Filtering and sorting functions — all accept params so they are testable

/**
 * Parse a search query string into structured filters.
 * Supports: p:0, p:0-2, type:pr, status:failing, blocked, overdue
 * Remaining terms match description.
 */
export function parseSearchQuery(query) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const result = {
    priorityMin: null,  // number
    priorityMax: null,  // number
    typeFilter: null,   // string
    statusFilter: null, // string
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
    result.textTerms.push(token);
  }

  return result;
}

export function filterItems(items, { filterType, filterStatus, searchQuery }) {
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

    // Text terms — must all match description
    for (const term of parsed.textTerms) {
      const searchable = [item.id, item.description, item.type, item.status, item.priority, item.due].join(' ').toLowerCase();
      if (!searchable.includes(term)) return false;
    }

    return true;
  });
}

export function sortItems(items, sortColumn, sortDirection) {
  return items.sort((a, b) => {
    let aVal, bVal;
    if (sortColumn === 'priority') {
      const aNum = parseInt((a.priority || '').replace('P', ''));
      const bNum = parseInt((b.priority || '').replace('P', ''));
      aVal = Number.isNaN(aNum) ? 99 : aNum;
      bVal = Number.isNaN(bNum) ? 99 : bNum;
    } else if (sortColumn === 'id') {
      aVal = parseInt((a.id || '').replace('TODO-', '')) || 0;
      bVal = parseInt((b.id || '').replace('TODO-', '')) || 0;
    } else {
      aVal = (a[sortColumn] || '').toLowerCase();
      bVal = (b[sortColumn] || '').toLowerCase();
    }
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDirection === 'asc' ? cmp : -cmp;
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
