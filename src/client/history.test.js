import { describe, test, expect, beforeEach, mock } from 'bun:test';

// Mock localStorage
const store = {};
const localStorageMock = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};
globalThis.localStorage = localStorageMock;

// Re-import after mock is set up
const { recordSnapshot, getHistory, renderSparkline } = await import('./history.js');

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
});

describe('recordSnapshot', () => {
  test('records first snapshot', () => {
    const h = recordSnapshot(5, 1, 2);
    expect(h).toHaveLength(1);
    expect(h[0].n).toBe(5);
    expect(h[0].p0).toBe(1);
    expect(h[0].p1).toBe(2);
  });

  test('updates latest point if < 15min ago', () => {
    recordSnapshot(5, 1, 2);
    const h = recordSnapshot(6, 2, 2);
    expect(h).toHaveLength(1);
    expect(h[0].n).toBe(6);
  });

  test('adds new point if > 15min ago', () => {
    const old = [{ t: Date.now() - 20 * 60000, n: 3, p0: 0, p1: 1 }];
    store['todo-count-history'] = JSON.stringify(old);
    const h = recordSnapshot(5, 1, 2);
    expect(h).toHaveLength(2);
    expect(h[1].n).toBe(5);
  });

  test('caps at 48 points', () => {
    const points = Array.from({ length: 48 }, (_, i) => ({
      t: Date.now() - (50 - i) * 60000,
      n: i, p0: 0, p1: 0
    }));
    store['todo-count-history'] = JSON.stringify(points);
    const h = recordSnapshot(99, 0, 0);
    expect(h).toHaveLength(48);
    expect(h[47].n).toBe(99);
  });

  test('handles corrupted localStorage gracefully', () => {
    store['todo-count-history'] = 'not-json';
    const h = recordSnapshot(3, 0, 1);
    expect(h).toHaveLength(1);
  });
});

describe('getHistory', () => {
  test('returns empty array when nothing stored', () => {
    expect(getHistory()).toEqual([]);
  });

  test('returns stored history', () => {
    recordSnapshot(4, 1, 1);
    const h = getHistory();
    expect(h).toHaveLength(1);
    expect(h[0].n).toBe(4);
  });
});

describe('renderSparkline', () => {
  test('returns empty string for < 2 points', () => {
    expect(renderSparkline([])).toBe('');
    expect(renderSparkline([{ n: 5 }])).toBe('');
  });

  test('returns SVG string for 2+ points', () => {
    const svg = renderSparkline([{ n: 3 }, { n: 7 }, { n: 5 }]);
    expect(svg).toContain('<svg');
    expect(svg).toContain('polyline');
    expect(svg).toContain('</svg>');
  });

  test('uses provided width and height', () => {
    const svg = renderSparkline([{ n: 1 }, { n: 2 }], 100, 30);
    expect(svg).toContain('viewBox="0 0 100 30"');
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="30"');
  });

  test('handles all-equal values without division by zero', () => {
    const svg = renderSparkline([{ n: 5 }, { n: 5 }, { n: 5 }]);
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('NaN');
  });
});
