import { describe, test, expect, beforeEach } from 'bun:test';

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};

const { getTagsForItem, addTag, removeTag, getAllTags } = await import('./tags.js');

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
});

describe('addTag', () => {
  test('adds a tag to an item', () => {
    addTag('TODO-1', 'needs-review');
    expect(getTagsForItem('TODO-1')).toContain('needs-review');
  });

  test('normalizes tag to lowercase with hyphens', () => {
    addTag('TODO-1', 'Needs Review');
    expect(getTagsForItem('TODO-1')).toContain('needs-review');
  });

  test('does not add duplicate tags', () => {
    addTag('TODO-1', 'bug');
    addTag('TODO-1', 'bug');
    expect(getTagsForItem('TODO-1')).toHaveLength(1);
  });

  test('trims whitespace', () => {
    addTag('TODO-1', '  blocker  ');
    expect(getTagsForItem('TODO-1')).toContain('blocker');
  });

  test('ignores empty tags', () => {
    addTag('TODO-1', '');
    addTag('TODO-1', '   ');
    expect(getTagsForItem('TODO-1')).toHaveLength(0);
  });
});

describe('removeTag', () => {
  test('removes an existing tag', () => {
    addTag('TODO-1', 'bug');
    removeTag('TODO-1', 'bug');
    expect(getTagsForItem('TODO-1')).toHaveLength(0);
  });

  test('ignores removing non-existent tag', () => {
    addTag('TODO-1', 'bug');
    removeTag('TODO-1', 'nonexistent');
    expect(getTagsForItem('TODO-1')).toHaveLength(1);
  });
});

describe('getAllTags', () => {
  test('returns all unique tags across items', () => {
    addTag('TODO-1', 'bug');
    addTag('TODO-2', 'feature');
    addTag('TODO-3', 'bug');
    const all = getAllTags();
    expect(all).toContain('bug');
    expect(all).toContain('feature');
    expect(all.filter(t => t === 'bug')).toHaveLength(1);
  });

  test('returns sorted tags', () => {
    addTag('TODO-1', 'zebra');
    addTag('TODO-2', 'alpha');
    const all = getAllTags();
    expect(all.indexOf('alpha')).toBeLessThan(all.indexOf('zebra'));
  });
});
