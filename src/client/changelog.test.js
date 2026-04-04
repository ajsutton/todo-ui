import { describe, it, expect, beforeEach } from 'bun:test';

const store = {};
const localStorageMock = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};
globalThis.localStorage = localStorageMock;
globalThis.window = { addEventListener: () => {}, _latestItems: null };

const { diffSinceLastVisit } = await import('./changelog.js');

const KEY = 'todo-last-visit-snapshot';

function makeSnapshot(items, ts = Date.now() - 3600000) {
  const snap = { ts, items: {} };
  for (const item of items) {
    snap.items[item.id] = {
      status: item.status || '',
      priority: item.priority || '',
      doneDate: item.doneDate || '',
      description: (item.description || '').slice(0, 80),
    };
  }
  store[KEY] = JSON.stringify(snap);
}

beforeEach(() => {
  delete store[KEY];
});

describe('diffSinceLastVisit', () => {
  it('returns null when no snapshot exists', () => {
    const result = diffSinceLastVisit([{ id: 'TODO-1', description: 'Test' }]);
    expect(result).toBeNull();
  });

  it('returns null when no changes detected', () => {
    const items = [{ id: 'TODO-1', description: 'Test', status: 'open', priority: 'P2', doneDate: '' }];
    makeSnapshot(items);
    const result = diffSinceLastVisit(items);
    expect(result).toBeNull();
  });

  it('detects new items', () => {
    const prev = [{ id: 'TODO-1', description: 'Old item', status: 'open', priority: 'P2', doneDate: '' }];
    makeSnapshot(prev);
    const current = [
      ...prev,
      { id: 'TODO-2', description: 'Brand new item', status: 'open', priority: 'P1', doneDate: '' },
    ];
    const result = diffSinceLastVisit(current);
    expect(result).not.toBeNull();
    expect(result.newItems).toHaveLength(1);
    expect(result.newItems[0].id).toBe('TODO-2');
  });

  it('detects status changes', () => {
    const prev = [{ id: 'TODO-1', description: 'Test', status: 'open', priority: 'P2', doneDate: '' }];
    makeSnapshot(prev);
    const current = [{ id: 'TODO-1', description: 'Test', status: 'CI Failing', priority: 'P2', doneDate: '' }];
    const result = diffSinceLastVisit(current);
    expect(result).not.toBeNull();
    expect(result.statusChanged).toHaveLength(1);
    expect(result.statusChanged[0].from).toBe('open');
    expect(result.statusChanged[0].to).toBe('CI Failing');
  });

  it('detects priority changes', () => {
    const prev = [{ id: 'TODO-1', description: 'Test', status: 'open', priority: 'P2', doneDate: '' }];
    makeSnapshot(prev);
    const current = [{ id: 'TODO-1', description: 'Test', status: 'open', priority: 'P0', doneDate: '' }];
    const result = diffSinceLastVisit(current);
    expect(result).not.toBeNull();
    expect(result.priorityChanged).toHaveLength(1);
    expect(result.priorityChanged[0].from).toBe('P2');
    expect(result.priorityChanged[0].to).toBe('P0');
  });

  it('detects items completed since last visit', () => {
    const prev = [{ id: 'TODO-1', description: 'Test', status: 'open', priority: 'P2', doneDate: '' }];
    makeSnapshot(prev);
    const current = [{ id: 'TODO-1', description: 'Test', status: 'closed', priority: 'P2', doneDate: '2026-04-04' }];
    const result = diffSinceLastVisit(current);
    expect(result).not.toBeNull();
    expect(result.completed).toHaveLength(1);
    expect(result.completed[0].id).toBe('TODO-1');
  });

  it('ignores items that were already done in snapshot', () => {
    const prev = [{ id: 'TODO-1', description: 'Test', status: 'closed', priority: 'P2', doneDate: '2026-04-03' }];
    makeSnapshot(prev);
    const current = [{ id: 'TODO-1', description: 'Test', status: 'closed', priority: 'P2', doneDate: '2026-04-03' }];
    const result = diffSinceLastVisit(current);
    expect(result).toBeNull();
  });

  it('reports correct total count', () => {
    makeSnapshot([
      { id: 'TODO-1', status: 'open', priority: 'P2', doneDate: '', description: 'A' },
      { id: 'TODO-2', status: 'open', priority: 'P3', doneDate: '', description: 'B' },
    ]);
    const current = [
      { id: 'TODO-1', status: 'CI Failing', priority: 'P2', doneDate: '', description: 'A' }, // status change
      { id: 'TODO-2', status: 'open', priority: 'P3', doneDate: '', description: 'B' },
      { id: 'TODO-3', status: 'open', priority: 'P1', doneDate: '', description: 'C' }, // new
    ];
    const result = diffSinceLastVisit(current);
    expect(result.total).toBe(2); // 1 new + 1 status
  });
});
