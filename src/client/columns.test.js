import { describe, it, expect, beforeEach } from 'bun:test';

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};
globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };

const { getHiddenColumns, isColumnHidden, toggleColumn, TOGGLEABLE_COLUMNS } = await import('./columns.js');
const KEY = 'todo-hidden-cols';

beforeEach(() => { delete store[KEY]; });

describe('column visibility', () => {
  it('no columns hidden by default', () => {
    expect(getHiddenColumns().size).toBe(0);
  });

  it('isColumnHidden returns false by default', () => {
    expect(isColumnHidden('type')).toBe(false);
    expect(isColumnHidden('urgency')).toBe(false);
  });

  it('toggleColumn hides a visible column', () => {
    toggleColumn('urgency');
    expect(isColumnHidden('urgency')).toBe(true);
  });

  it('toggleColumn shows a hidden column', () => {
    toggleColumn('urgency');
    toggleColumn('urgency');
    expect(isColumnHidden('urgency')).toBe(false);
  });

  it('can hide multiple columns independently', () => {
    toggleColumn('type');
    toggleColumn('urgency');
    expect(isColumnHidden('type')).toBe(true);
    expect(isColumnHidden('urgency')).toBe(true);
    expect(isColumnHidden('status')).toBe(false);
  });

  it('TOGGLEABLE_COLUMNS contains expected ids', () => {
    const ids = TOGGLEABLE_COLUMNS.map(c => c.id);
    expect(ids).toContain('type');
    expect(ids).toContain('status');
    expect(ids).toContain('priority');
    expect(ids).toContain('due');
    expect(ids).toContain('urgency');
    expect(ids).toContain('actions');
  });
});
