import { describe, it, expect } from 'bun:test';

globalThis.document = { title: '' };

const { getTitleBadgeParts } = await import('./tabtitle.js');

// Use a fixed "today" for all tests — inject via item dates
const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = (() => {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
})();
const TOMORROW = (() => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
})();

describe('getTitleBadgeParts', () => {
  it('returns empty array when no items', () => {
    expect(getTitleBadgeParts([])).toEqual([]);
  });

  it('returns empty array when all items are done', () => {
    const items = [{ id: 'TODO-1', doneDate: TODAY, priority: 'P0', due: YESTERDAY }];
    expect(getTitleBadgeParts(items)).toEqual([]);
  });

  it('shows overdue count', () => {
    const items = [
      { id: 'TODO-1', priority: 'P2', due: YESTERDAY, doneDate: null },
      { id: 'TODO-2', priority: 'P2', due: YESTERDAY, doneDate: null },
    ];
    const parts = getTitleBadgeParts(items);
    expect(parts).toContain('2 overdue');
  });

  it('shows P0 count separately from overdue', () => {
    const items = [
      { id: 'TODO-1', priority: 'P0', due: null, doneDate: null }, // P0 no due
      { id: 'TODO-2', priority: 'P2', due: TOMORROW, doneDate: null }, // not overdue
    ];
    const parts = getTitleBadgeParts(items);
    expect(parts).toContain('1 P0');
    expect(parts.some(p => p.includes('overdue'))).toBe(false);
  });

  it('shows blocked count when no overdue/P0', () => {
    const items = [
      { id: 'TODO-1', priority: 'P2', due: TOMORROW, doneDate: null, blocked: true },
    ];
    const parts = getTitleBadgeParts(items);
    expect(parts).toContain('1 blocked');
  });

  it('does not show blocked when overdue items exist', () => {
    const items = [
      { id: 'TODO-1', priority: 'P2', due: YESTERDAY, doneDate: null, blocked: true },
    ];
    const parts = getTitleBadgeParts(items);
    expect(parts).toContain('1 overdue');
    expect(parts.some(p => p.includes('blocked'))).toBe(false);
  });

  it('P0 items that are also overdue count as overdue not P0', () => {
    const items = [
      { id: 'TODO-1', priority: 'P0', due: YESTERDAY, doneDate: null }, // overdue P0
    ];
    const parts = getTitleBadgeParts(items);
    expect(parts).toContain('1 overdue');
    expect(parts.some(p => p.includes('P0'))).toBe(false); // not double-counted
  });

  it('combines overdue and P0 when both present', () => {
    const items = [
      { id: 'TODO-1', priority: 'P2', due: YESTERDAY, doneDate: null }, // overdue
      { id: 'TODO-2', priority: 'P0', due: null, doneDate: null },       // P0
    ];
    const parts = getTitleBadgeParts(items);
    expect(parts).toContain('1 overdue');
    expect(parts).toContain('1 P0');
  });
});
