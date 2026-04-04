import { describe, it, expect, beforeEach } from 'bun:test';

// Mock localStorage
const store = {};
const localStorageMock = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};
globalThis.localStorage = localStorageMock;

// Import after mocking
const { recordCompletion, getStreak, isStreakActive } = await import('./streak.js');

const KEY = 'todo-streak';

beforeEach(() => {
  delete store[KEY];
});

describe('recordCompletion', () => {
  it('first completion starts streak at 1', () => {
    const data = recordCompletion('2026-04-01');
    expect(data.currentStreak).toBe(1);
    expect(data.longestStreak).toBe(1);
    expect(data.lastCompletedDate).toBe('2026-04-01');
    expect(data.totalCompleted).toBe(1);
  });

  it('completion on consecutive day extends streak', () => {
    recordCompletion('2026-04-01');
    const data = recordCompletion('2026-04-02');
    expect(data.currentStreak).toBe(2);
    expect(data.longestStreak).toBe(2);
  });

  it('second completion on same day just increments total', () => {
    recordCompletion('2026-04-01');
    const data = recordCompletion('2026-04-01');
    expect(data.currentStreak).toBe(1);
    expect(data.totalCompleted).toBe(2);
  });

  it('gap of one day breaks streak, resets to 1', () => {
    recordCompletion('2026-04-01');
    recordCompletion('2026-04-02');
    const data = recordCompletion('2026-04-04'); // skipped 03
    expect(data.currentStreak).toBe(1);
    expect(data.longestStreak).toBe(2); // previous best preserved
  });

  it('long streak builds correctly', () => {
    for (let d = 1; d <= 7; d++) {
      const dd = String(d).padStart(2, '0');
      recordCompletion(`2026-04-${dd}`);
    }
    const data = getStreak();
    expect(data.currentStreak).toBe(7);
    expect(data.longestStreak).toBe(7);
  });

  it('new streak after break does not exceed previous longest', () => {
    recordCompletion('2026-04-01');
    recordCompletion('2026-04-02');
    recordCompletion('2026-04-03');
    // break
    const data = recordCompletion('2026-04-10');
    expect(data.currentStreak).toBe(1);
    expect(data.longestStreak).toBe(3); // preserved from before
  });

  it('longest streak updates when new streak surpasses it', () => {
    recordCompletion('2026-04-01');
    recordCompletion('2026-04-02');
    // break
    recordCompletion('2026-04-10');
    recordCompletion('2026-04-11');
    recordCompletion('2026-04-12');
    const data = recordCompletion('2026-04-13');
    expect(data.currentStreak).toBe(4);
    expect(data.longestStreak).toBe(4);
  });
});

describe('isStreakActive', () => {
  it('returns false when no completions', () => {
    const data = { currentStreak: 0, lastCompletedDate: null, longestStreak: 0, totalCompleted: 0 };
    expect(isStreakActive(data, '2026-04-04')).toBe(false);
  });

  it('returns true when last completion was today', () => {
    const data = { currentStreak: 3, lastCompletedDate: '2026-04-04', longestStreak: 3, totalCompleted: 5 };
    expect(isStreakActive(data, '2026-04-04')).toBe(true);
  });

  it('returns true when last completion was yesterday', () => {
    const data = { currentStreak: 3, lastCompletedDate: '2026-04-03', longestStreak: 3, totalCompleted: 5 };
    expect(isStreakActive(data, '2026-04-04')).toBe(true);
  });

  it('returns false when last completion was 2 days ago', () => {
    const data = { currentStreak: 3, lastCompletedDate: '2026-04-02', longestStreak: 3, totalCompleted: 5 };
    expect(isStreakActive(data, '2026-04-04')).toBe(false);
  });
});
