import { describe, it, expect, beforeEach } from 'bun:test';

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};
globalThis.document = {
  getElementById: () => null,
  body: { appendChild: () => {} },
};
globalThis.window = { _latestItems: [] };

const { getWeekStart: _gs, getCurrentWeekStart, loadGoal, setGoal, countCompletedThisWeek, getGoalProgress } =
  await import('./goals.js');

const KEY = 'todo-weekly-goal';

// Helper to get the week start (re-exported via named internals, or tested via countCompletedThisWeek)
beforeEach(() => { delete store[KEY]; });

describe('loadGoal', () => {
  it('returns default target of 5', () => {
    expect(loadGoal().target).toBe(5);
  });
});

describe('setGoal', () => {
  it('persists the goal', () => {
    setGoal(10);
    expect(loadGoal().target).toBe(10);
  });

  it('clamps to minimum of 1', () => {
    setGoal(0);
    expect(loadGoal().target).toBe(1);
  });

  it('clamps to maximum of 100', () => {
    setGoal(200);
    expect(loadGoal().target).toBe(100);
  });
});

describe('countCompletedThisWeek', () => {
  it('counts items completed in the current week', () => {
    const weekStart = getCurrentWeekStart();
    const items = [
      { id: 'TODO-1', doneDate: weekStart },
      { id: 'TODO-2', doneDate: weekStart },
      { id: 'TODO-3', doneDate: null },
    ];
    expect(countCompletedThisWeek(items)).toBe(2);
  });

  it('excludes items completed before this week', () => {
    const items = [
      { id: 'TODO-1', doneDate: '2020-01-01' }, // old
      { id: 'TODO-2', doneDate: getCurrentWeekStart() },
    ];
    expect(countCompletedThisWeek(items)).toBe(1);
  });

  it('returns 0 when no items completed this week', () => {
    const items = [
      { id: 'TODO-1', doneDate: null },
      { id: 'TODO-2', doneDate: '2020-01-01' },
    ];
    expect(countCompletedThisWeek(items)).toBe(0);
  });
});

describe('getGoalProgress', () => {
  it('calculates percentage correctly', () => {
    setGoal(4);
    const weekStart = getCurrentWeekStart();
    const items = [
      { id: 'TODO-1', doneDate: weekStart },
      { id: 'TODO-2', doneDate: weekStart },
    ];
    const result = getGoalProgress(items);
    expect(result.target).toBe(4);
    expect(result.completed).toBe(2);
    expect(result.pct).toBe(50);
  });

  it('caps pct at 100 even when overachieved', () => {
    setGoal(2);
    const weekStart = getCurrentWeekStart();
    const items = [
      { id: 'TODO-1', doneDate: weekStart },
      { id: 'TODO-2', doneDate: weekStart },
      { id: 'TODO-3', doneDate: weekStart },
      { id: 'TODO-4', doneDate: weekStart },
    ];
    const result = getGoalProgress(items);
    expect(result.pct).toBe(100);
    expect(result.completed).toBe(4);
  });
});
