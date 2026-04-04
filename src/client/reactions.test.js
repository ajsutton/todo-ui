import { describe, it, expect, beforeEach } from 'bun:test';

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};

const { getReactions, toggleReaction, hasReactions, getAllReactions } = await import('./reactions.js');
const KEY = 'todo-reactions';

beforeEach(() => { delete store[KEY]; });

describe('reactions', () => {
  it('getReactions returns empty array by default', () => {
    expect(getReactions('TODO-1')).toEqual([]);
  });

  it('toggleReaction adds a reaction', () => {
    toggleReaction('TODO-1', '🔥');
    expect(getReactions('TODO-1')).toContain('🔥');
  });

  it('toggleReaction removes an existing reaction', () => {
    toggleReaction('TODO-1', '🔥');
    toggleReaction('TODO-1', '🔥');
    expect(getReactions('TODO-1')).not.toContain('🔥');
  });

  it('multiple different reactions can coexist', () => {
    toggleReaction('TODO-1', '🔥');
    toggleReaction('TODO-1', '⚡');
    const reactions = getReactions('TODO-1');
    expect(reactions).toContain('🔥');
    expect(reactions).toContain('⚡');
  });

  it('removing all reactions cleans up storage', () => {
    toggleReaction('TODO-1', '🔥');
    toggleReaction('TODO-1', '🔥');
    expect(hasReactions('TODO-1')).toBe(false);
    const all = getAllReactions();
    expect(all['TODO-1']).toBeUndefined();
  });

  it('hasReactions returns true when reactions exist', () => {
    toggleReaction('TODO-1', '✨');
    expect(hasReactions('TODO-1')).toBe(true);
  });

  it('reactions are independent per item', () => {
    toggleReaction('TODO-1', '🔥');
    toggleReaction('TODO-2', '⚡');
    expect(getReactions('TODO-1')).toEqual(['🔥']);
    expect(getReactions('TODO-2')).toEqual(['⚡']);
  });

  it('getAllReactions returns all items with reactions', () => {
    toggleReaction('TODO-1', '🔥');
    toggleReaction('TODO-2', '✨');
    const all = getAllReactions();
    expect(Object.keys(all)).toHaveLength(2);
  });
});
