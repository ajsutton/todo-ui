import { describe, it, expect } from 'bun:test';
import { filterItems, sortItems, filterSubItem, parseSearchQuery } from './filters.js';

const makeItem = (overrides = {}) => ({
  id: 'TODO-1',
  description: 'Test item',
  descriptionHtml: 'Test item',
  type: 'PR',
  status: 'Open',
  blocked: false,
  priority: 'P2',
  due: '',
  doneDate: '',
  ...overrides,
});

const makeSub = (overrides = {}) => ({
  repo: 'ethereum-optimism/optimism',
  number: 123,
  title: 'Fix bug',
  currentStatus: 'Open',
  currentPriority: 'P2',
  githubUrl: 'https://github.com/ethereum-optimism/optimism/pull/123',
  ...overrides,
});

// ---- parseSearchQuery ----

describe('parseSearchQuery', () => {
  it('returns empty result for empty string', () => {
    const r = parseSearchQuery('');
    expect(r.priorityMin).toBe(null);
    expect(r.typeFilter).toBe(null);
    expect(r.statusFilter).toBe(null);
    expect(r.blocked).toBe(false);
    expect(r.overdue).toBe(false);
    expect(r.textTerms).toEqual([]);
  });

  it('parses p:0 correctly', () => {
    const r = parseSearchQuery('p:0');
    expect(r.priorityMin).toBe(0);
    expect(r.priorityMax).toBe(0);
  });

  it('parses p:0-2 range', () => {
    const r = parseSearchQuery('p:0-2');
    expect(r.priorityMin).toBe(0);
    expect(r.priorityMax).toBe(2);
  });

  it('parses type:pr', () => {
    const r = parseSearchQuery('type:pr');
    expect(r.typeFilter).toBe('pr');
  });

  it('parses status:failing', () => {
    const r = parseSearchQuery('status:failing');
    expect(r.statusFilter).toBe('failing');
  });

  it('parses blocked keyword', () => {
    const r = parseSearchQuery('blocked');
    expect(r.blocked).toBe(true);
  });

  it('parses overdue keyword', () => {
    const r = parseSearchQuery('overdue');
    expect(r.overdue).toBe(true);
  });

  it('puts remaining terms in textTerms', () => {
    const r = parseSearchQuery('foo bar baz');
    expect(r.textTerms).toEqual(['foo', 'bar', 'baz']);
  });

  it('mixes field filters and text terms', () => {
    const r = parseSearchQuery('p:0 review type:pr');
    expect(r.priorityMin).toBe(0);
    expect(r.typeFilter).toBe('pr');
    expect(r.textTerms).toEqual(['review']);
  });

  it('parses tag:name', () => {
    const r = parseSearchQuery('tag:bug');
    expect(r.tagFilter).toBe('bug');
  });

  it('parses tag:multi-word-tag', () => {
    const r = parseSearchQuery('tag:needs-review');
    expect(r.tagFilter).toBe('needs-review');
  });

  it('returns null tagFilter when not present', () => {
    const r = parseSearchQuery('p:0');
    expect(r.tagFilter).toBe(null);
  });

  it('parses due:today', () => {
    const r = parseSearchQuery('due:today');
    expect(r.dueFilter).toBe('today');
  });

  it('parses due:week', () => {
    const r = parseSearchQuery('due:week');
    expect(r.dueFilter).toBe('week');
  });

  it('parses due:3 as number', () => {
    const r = parseSearchQuery('due:3');
    expect(r.dueFilter).toBe(3);
  });

  it('returns null dueFilter when not present', () => {
    const r = parseSearchQuery('p:0');
    expect(r.dueFilter).toBe(null);
  });

  it('parses @repo filter', () => {
    const r = parseSearchQuery('@optimism');
    expect(r.repoFilter).toBe('optimism');
  });

  it('parses @org/repo filter', () => {
    const r = parseSearchQuery('@ethereum-optimism/optimism');
    expect(r.repoFilter).toBe('ethereum-optimism/optimism');
  });

  it('returns null repoFilter when not present', () => {
    const r = parseSearchQuery('p:0');
    expect(r.repoFilter).toBe(null);
  });
});

// ---- filterItems ----

describe('filterItems - type filter', () => {
  const items = [
    makeItem({ type: 'PR', id: 'TODO-1' }),
    makeItem({ type: 'Review', id: 'TODO-2' }),
    makeItem({ type: 'Issue', id: 'TODO-3' }),
  ];

  it('returns all items when no type filter', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: '' });
    expect(res.length).toBe(3);
  });

  it('filters by PR type', () => {
    const res = filterItems(items, { filterType: 'PR', filterStatus: '', searchQuery: '' });
    expect(res.length).toBe(1);
    expect(res[0].type).toBe('PR');
  });
});

describe('filterItems - status filter', () => {
  const items = [
    makeItem({ id: 'TODO-1', doneDate: '2024-01-01' }),
    makeItem({ id: 'TODO-2', doneDate: '' }),
  ];

  it('filters active items', () => {
    const res = filterItems(items, { filterType: '', filterStatus: 'active', searchQuery: '' });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('TODO-2');
  });

  it('filters done items', () => {
    const res = filterItems(items, { filterType: '', filterStatus: 'done', searchQuery: '' });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('TODO-1');
  });

  it('returns all items when no status filter', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: '' });
    expect(res.length).toBe(2);
  });
});

describe('filterItems - text search', () => {
  const items = [
    makeItem({ id: 'TODO-1', description: 'Fix the login bug' }),
    makeItem({ id: 'TODO-2', description: 'Update dashboard UI' }),
  ];

  it('filters by description text', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'login' });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('TODO-1');
  });

  it('is case insensitive', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'DASHBOARD' });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('TODO-2');
  });
});

describe('filterItems - field-specific search', () => {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const items = [
    makeItem({ id: 'TODO-1', priority: 'P0', type: 'PR', status: 'CI failing', blocked: false, due: '', doneDate: '' }),
    makeItem({ id: 'TODO-2', priority: 'P1', type: 'Review', status: 'Approved', blocked: true, due: '', doneDate: '' }),
    makeItem({ id: 'TODO-3', priority: 'P3', type: 'Issue', status: 'Open', blocked: false, due: yesterday, doneDate: '' }),
    makeItem({ id: 'TODO-4', priority: 'P2', type: 'Workstream', status: 'Draft', blocked: false, due: '', doneDate: '' }),
  ];

  it('filters by p:0', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'p:0' });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('TODO-1');
  });

  it('filters by p:0-2 range', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'p:0-2' });
    const ids = res.map(i => i.id);
    expect(ids).toContain('TODO-1');
    expect(ids).toContain('TODO-2');
    expect(ids).toContain('TODO-4');
    expect(ids).not.toContain('TODO-3');
  });

  it('filters by type:review', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'type:review' });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('TODO-2');
  });

  it('filters by status:failing', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'status:failing' });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('TODO-1');
  });

  it('filters blocked items', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'blocked' });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('TODO-2');
  });

  it('filters overdue items', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'overdue' });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('TODO-3');
  });

  it('combines p:0 and type filter as AND', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'p:0 failing' });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('TODO-1');
  });
});

// ---- filterItems - tag filter ----

describe('filterItems - tag filter', () => {
  const items = [
    makeItem({ id: 'TODO-1' }),
    makeItem({ id: 'TODO-2' }),
    makeItem({ id: 'TODO-3' }),
  ];
  const tagMap = {
    'TODO-1': ['bug', 'urgent'],
    'TODO-2': ['feature'],
    'TODO-3': [],
  };
  const getItemTags = (id) => tagMap[id] || [];

  it('filters items with a specific tag', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'tag:bug' }, getItemTags);
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('TODO-1');
  });

  it('returns multiple items sharing the same tag', () => {
    const items2 = [
      makeItem({ id: 'TODO-1' }),
      makeItem({ id: 'TODO-2' }),
    ];
    const tags2 = { 'TODO-1': ['bug'], 'TODO-2': ['bug'] };
    const res = filterItems(items2, { filterType: '', filterStatus: '', searchQuery: 'tag:bug' }, (id) => tags2[id] || []);
    expect(res.length).toBe(2);
  });

  it('excludes items without the tag', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'tag:feature' }, getItemTags);
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('TODO-2');
  });

  it('returns no items when no item has the tag', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'tag:nonexistent' }, getItemTags);
    expect(res.length).toBe(0);
  });

  it('ignores tagFilter when getItemTags is not provided', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'tag:bug' });
    expect(res.length).toBe(3);
  });
});

// ---- filterItems - due date filter ----

describe('filterItems - due filter', () => {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const in5days = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const in10days = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

  const items = [
    makeItem({ id: 'TODAY', due: today, doneDate: '' }),
    makeItem({ id: 'TOMORROW', due: tomorrow, doneDate: '' }),
    makeItem({ id: 'IN5', due: in5days, doneDate: '' }),
    makeItem({ id: 'IN10', due: in10days, doneDate: '' }),
    makeItem({ id: 'NODUE', due: '', doneDate: '' }),
    makeItem({ id: 'DONE', due: today, doneDate: '2026-01-01' }),
  ];

  it('due:today only returns items due today', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'due:today' });
    const ids = res.map(i => i.id);
    expect(ids).toContain('TODAY');
    expect(ids).not.toContain('TOMORROW');
    expect(ids).not.toContain('DONE');
    expect(ids).not.toContain('NODUE');
  });

  it('due:week returns items due within 7 days', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'due:week' });
    const ids = res.map(i => i.id);
    expect(ids).toContain('TODAY');
    expect(ids).toContain('TOMORROW');
    expect(ids).toContain('IN5');
    expect(ids).not.toContain('IN10');
    expect(ids).not.toContain('NODUE');
  });

  it('due:3 returns items due within 3 days', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'due:3' });
    const ids = res.map(i => i.id);
    expect(ids).toContain('TODAY');
    expect(ids).toContain('TOMORROW');
    expect(ids).not.toContain('IN5');
  });

  it('due:week excludes done items', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: 'due:week' });
    expect(res.map(i => i.id)).not.toContain('DONE');
  });
});

// ---- filterItems - repo filter ----

describe('filterItems - repo filter', () => {
  const items = [
    makeItem({ id: 'TODO-1', description: '[optimism/op-node#1](https://github.com) Fix bug' }),
    makeItem({ id: 'TODO-2', description: '[base/base-node#5](https://github.com) Add feature' }),
    makeItem({ id: 'TODO-3', description: 'No repo item' }),
  ];
  // Simulate items with repo field
  items[0].repo = 'org/optimism';
  items[1].repo = 'org/monorail';
  items[2].repo = '';

  it('filters by partial repo name', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: '@optimism' });
    expect(res.map(i => i.id)).toContain('TODO-1');
    expect(res.map(i => i.id)).not.toContain('TODO-2');
    expect(res.map(i => i.id)).not.toContain('TODO-3');
  });

  it('returns items with no repo when @filter is absent', () => {
    const res = filterItems(items, { filterType: '', filterStatus: '', searchQuery: '' });
    expect(res.length).toBe(3);
  });
});

// ---- sortItems ----

describe('sortItems', () => {
  const items = [
    makeItem({ id: 'TODO-3', priority: 'P2', description: 'Bravo' }),
    makeItem({ id: 'TODO-1', priority: 'P0', description: 'Alpha' }),
    makeItem({ id: 'TODO-2', priority: 'P1', description: 'Charlie' }),
  ];

  it('sorts by priority ascending', () => {
    const res = sortItems([...items], 'priority', 'asc');
    expect(res[0].priority).toBe('P0');
    expect(res[1].priority).toBe('P1');
    expect(res[2].priority).toBe('P2');
  });

  it('sorts by priority descending', () => {
    const res = sortItems([...items], 'priority', 'desc');
    expect(res[0].priority).toBe('P2');
    expect(res[2].priority).toBe('P0');
  });

  it('sorts by description ascending', () => {
    const res = sortItems([...items], 'description', 'asc');
    expect(res[0].description).toBe('Alpha');
    expect(res[1].description).toBe('Bravo');
    expect(res[2].description).toBe('Charlie');
  });

  it('sorts by description descending', () => {
    const res = sortItems([...items], 'description', 'desc');
    expect(res[0].description).toBe('Charlie');
  });

  it('sorts by due date ascending', () => {
    const dueItems = [
      makeItem({ due: '2024-03-01' }),
      makeItem({ due: '2024-01-01' }),
      makeItem({ due: '2024-02-01' }),
    ];
    const res = sortItems(dueItems, 'due', 'asc');
    expect(res[0].due).toBe('2024-01-01');
    expect(res[2].due).toBe('2024-03-01');
  });
});

// ---- sortItems multi-sort ----

describe('sortItems multi-sort', () => {
  const items = [
    makeItem({ id: 'TODO-1', priority: 'P1', due: '2024-02-01' }),
    makeItem({ id: 'TODO-2', priority: 'P1', due: '2024-01-01' }),
    makeItem({ id: 'TODO-3', priority: 'P0', due: '2024-03-01' }),
  ];

  it('sorts by multiple keys', () => {
    const res = sortItems([...items], 'priority', 'asc', [
      { col: 'priority', dir: 'asc' },
      { col: 'due', dir: 'asc' },
    ]);
    expect(res[0].id).toBe('TODO-3'); // P0 first
    expect(res[1].id).toBe('TODO-2'); // P1 + earlier due
    expect(res[2].id).toBe('TODO-1'); // P1 + later due
  });

  it('falls back to primary sort when no sortKeys provided', () => {
    const res = sortItems([...items], 'priority', 'asc');
    expect(res[0].priority).toBe('P0');
  });

  it('uses sortKeys over primary sort when provided', () => {
    const res = sortItems([...items], 'priority', 'desc', [{ col: 'due', dir: 'asc' }]);
    expect(res[0].due).toBe('2024-01-01');
  });
});

// ---- sortItems urgency ----

describe('sortItems urgency sort', () => {
  const urgencyFn = (item) => ({ 'TODO-1': 90, 'TODO-2': 50, 'TODO-3': 70 }[item.id] ?? 0);
  const items = [
    makeItem({ id: 'TODO-1', priority: 'P0' }),
    makeItem({ id: 'TODO-2', priority: 'P2' }),
    makeItem({ id: 'TODO-3', priority: 'P1' }),
  ];

  it('sorts by urgency descending', () => {
    const res = sortItems([...items], 'urgency', 'desc', null, urgencyFn);
    expect(res[0].id).toBe('TODO-1'); // score 90
    expect(res[1].id).toBe('TODO-3'); // score 70
    expect(res[2].id).toBe('TODO-2'); // score 50
  });

  it('sorts by urgency ascending', () => {
    const res = sortItems([...items], 'urgency', 'asc', null, urgencyFn);
    expect(res[0].id).toBe('TODO-2'); // score 50
    expect(res[2].id).toBe('TODO-1'); // score 90
  });

  it('returns 0 for urgency when no urgencyFn provided', () => {
    const res = sortItems([...items], 'urgency', 'desc');
    // All scores are 0 so order is stable-ish — just check no error
    expect(res.length).toBe(3);
  });
});

// ---- filterSubItem ----

describe('filterSubItem', () => {
  const activeSub = makeSub({ currentStatus: 'Open' });
  const mergedSub = makeSub({ currentStatus: 'Merged' });
  const closedSub = makeSub({ currentStatus: 'Closed' });

  it('shows active sub items when filterStatus is active', () => {
    expect(filterSubItem(activeSub, { filterStatus: 'active', searchQuery: '' })).toBe(true);
  });

  it('hides merged sub items when filterStatus is active', () => {
    expect(filterSubItem(mergedSub, { filterStatus: 'active', searchQuery: '' })).toBe(false);
  });

  it('shows merged/closed items when filterStatus is done', () => {
    expect(filterSubItem(mergedSub, { filterStatus: 'done', searchQuery: '' })).toBe(true);
    expect(filterSubItem(closedSub, { filterStatus: 'done', searchQuery: '' })).toBe(true);
  });

  it('filters by search query in title', () => {
    const sub = makeSub({ title: 'Fix login issue' });
    expect(filterSubItem(sub, { filterStatus: '', searchQuery: 'login' })).toBe(true);
    expect(filterSubItem(sub, { filterStatus: '', searchQuery: 'dashboard' })).toBe(false);
  });

  it('filters by repo name', () => {
    expect(filterSubItem(activeSub, { filterStatus: '', searchQuery: 'optimism' })).toBe(true);
  });
});
