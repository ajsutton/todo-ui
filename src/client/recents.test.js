import { describe, test, expect, beforeEach } from 'bun:test';

// Mock localStorage
const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};

// Mock document to avoid DOM errors on import
globalThis.document = { createElement: () => ({}), body: { appendChild: () => {} }, getElementById: () => null, querySelector: () => null };

const { recordView, getRecents } = await import('./recents.js');

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
});

describe('recordView', () => {
  test('records a viewed item', () => {
    recordView('TODO-1');
    expect(getRecents()).toEqual(['TODO-1']);
  });

  test('most recent is first', () => {
    recordView('TODO-1');
    recordView('TODO-2');
    expect(getRecents()[0]).toBe('TODO-2');
  });

  test('moves duplicate to front', () => {
    recordView('TODO-1');
    recordView('TODO-2');
    recordView('TODO-1');
    expect(getRecents()[0]).toBe('TODO-1');
    expect(getRecents()).toHaveLength(2);
  });

  test('caps at 10 items', () => {
    for (let i = 1; i <= 15; i++) recordView(`TODO-${i}`);
    expect(getRecents()).toHaveLength(10);
  });
});

describe('getRecents', () => {
  test('returns empty array initially', () => {
    expect(getRecents()).toEqual([]);
  });

  test('handles corrupted storage', () => {
    store['todo-recents'] = 'not-json';
    expect(getRecents()).toEqual([]);
  });
});
