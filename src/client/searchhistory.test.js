import { describe, test, expect, beforeEach } from 'bun:test';

// Mock localStorage
const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};

const { recordSearch, getSearchHistory, clearSearchHistory } = await import('./searchhistory.js');

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
});

describe('recordSearch', () => {
  test('records a query', () => {
    recordSearch('blocked');
    expect(getSearchHistory()).toEqual(['blocked']);
  });

  test('ignores short queries', () => {
    recordSearch('a');
    expect(getSearchHistory()).toEqual([]);
  });

  test('ignores empty queries', () => {
    recordSearch('');
    recordSearch('  ');
    expect(getSearchHistory()).toEqual([]);
  });

  test('moves duplicates to top', () => {
    recordSearch('p:0');
    recordSearch('overdue');
    recordSearch('p:0');
    expect(getSearchHistory()[0]).toBe('p:0');
    expect(getSearchHistory()).toHaveLength(2);
  });

  test('caps at 10 entries', () => {
    for (let i = 0; i < 15; i++) recordSearch(`query-${i}`);
    expect(getSearchHistory()).toHaveLength(10);
  });

  test('most recent is first', () => {
    recordSearch('first');
    recordSearch('second');
    expect(getSearchHistory()[0]).toBe('second');
  });
});

describe('clearSearchHistory', () => {
  test('clears all entries', () => {
    recordSearch('p:0');
    recordSearch('blocked');
    clearSearchHistory();
    expect(getSearchHistory()).toEqual([]);
  });
});

describe('getSearchHistory', () => {
  test('returns empty array initially', () => {
    expect(getSearchHistory()).toEqual([]);
  });

  test('handles corrupted storage', () => {
    store['todo-search-history'] = 'not-json';
    expect(getSearchHistory()).toEqual([]);
  });
});
