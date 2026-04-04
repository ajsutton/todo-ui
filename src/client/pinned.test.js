import { describe, test, expect, beforeEach } from 'bun:test';

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};

const { getPinnedIds, isPinned, togglePin, sortWithPinned } = await import('./pinned.js');

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
});

describe('togglePin', () => {
  test('pins an item', () => {
    togglePin('TODO-1');
    expect(isPinned('TODO-1')).toBe(true);
  });

  test('unpins an already pinned item', () => {
    togglePin('TODO-1');
    togglePin('TODO-1');
    expect(isPinned('TODO-1')).toBe(false);
  });

  test('caps at 3 pinned items by removing oldest', () => {
    togglePin('TODO-1');
    togglePin('TODO-2');
    togglePin('TODO-3');
    togglePin('TODO-4');
    expect(getPinnedIds()).toHaveLength(3);
    expect(isPinned('TODO-1')).toBe(false); // oldest removed
    expect(isPinned('TODO-4')).toBe(true);
  });
});

describe('sortWithPinned', () => {
  const items = [
    { id: 'TODO-1' }, { id: 'TODO-2' }, { id: 'TODO-3' }
  ];

  test('moves pinned items to top', () => {
    togglePin('TODO-3');
    const sorted = sortWithPinned([...items]);
    expect(sorted[0].id).toBe('TODO-3');
  });

  test('maintains order of unpinned items', () => {
    togglePin('TODO-2');
    const sorted = sortWithPinned([...items]);
    expect(sorted[0].id).toBe('TODO-2');
    expect(sorted[1].id).toBe('TODO-1');
    expect(sorted[2].id).toBe('TODO-3');
  });

  test('returns unchanged list when nothing pinned', () => {
    const sorted = sortWithPinned([...items]);
    expect(sorted.map(i => i.id)).toEqual(['TODO-1', 'TODO-2', 'TODO-3']);
  });

  test('handles pinned IDs not in items', () => {
    togglePin('TODO-99');
    const sorted = sortWithPinned([...items]);
    expect(sorted).toHaveLength(3);
  });
});
