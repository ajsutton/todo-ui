import { describe, test, expect, beforeEach } from 'bun:test';

// Mock localStorage
const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};

// Mock appState
const state = { groupByMode: false };
const mockModule = { appState: state };

// Inline the logic under test to avoid DOM-heavy imports
function groupItems(items) {
  const PRIORITY_ORDER = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
  const groups = {};
  for (const item of items) {
    const key = item.priority || 'P3';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return PRIORITY_ORDER
    .filter(p => groups[p]?.length)
    .map(p => ({ key: p, items: groups[p] }));
}

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
});

describe('groupItems', () => {
  test('groups items by priority', () => {
    const items = [
      { id: 'a', priority: 'P1' },
      { id: 'b', priority: 'P0' },
      { id: 'c', priority: 'P1' },
      { id: 'd', priority: 'P2' },
    ];
    const groups = groupItems(items);
    expect(groups).toHaveLength(3);
    expect(groups[0].key).toBe('P0');
    expect(groups[0].items).toHaveLength(1);
    expect(groups[1].key).toBe('P1');
    expect(groups[1].items).toHaveLength(2);
    expect(groups[2].key).toBe('P2');
  });

  test('returns groups in priority order', () => {
    const items = [
      { id: 'a', priority: 'P3' },
      { id: 'b', priority: 'P0' },
      { id: 'c', priority: 'P2' },
    ];
    const groups = groupItems(items);
    expect(groups.map(g => g.key)).toEqual(['P0', 'P2', 'P3']);
  });

  test('omits empty priority buckets', () => {
    const items = [{ id: 'a', priority: 'P2' }];
    const groups = groupItems(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('P2');
  });

  test('defaults missing priority to P3', () => {
    const items = [{ id: 'a' }];
    const groups = groupItems(items);
    expect(groups[0].key).toBe('P3');
  });

  test('handles empty items array', () => {
    expect(groupItems([])).toEqual([]);
  });
});
