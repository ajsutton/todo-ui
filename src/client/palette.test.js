import { describe, test, expect } from 'bun:test';

// Test fuzzy matching logic isolated from DOM
function fuzzyScore(text, query) {
  if (!query) return 1;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0, qi = 0, score = 0, consecutive = 0;
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) {
      score += 1 + consecutive;
      consecutive++;
      qi++;
    } else {
      consecutive = 0;
    }
    ti++;
  }
  return qi === q.length ? score : 0;
}

describe('fuzzyScore', () => {
  test('matches full substring', () => {
    expect(fuzzyScore('hello world', 'hello')).toBeGreaterThan(0);
  });

  test('matches partial letters in order', () => {
    expect(fuzzyScore('Filter: Active items', 'filt')).toBeGreaterThan(0);
    expect(fuzzyScore('Filter: Active items', 'active')).toBeGreaterThan(0);
  });

  test('returns 0 when letters are out of order or missing', () => {
    expect(fuzzyScore('abc', 'xyz')).toBe(0);
    expect(fuzzyScore('abc', 'cba')).toBe(0);
  });

  test('returns 1 for empty query', () => {
    expect(fuzzyScore('anything', '')).toBe(1);
  });

  test('consecutive matches score higher', () => {
    const consecutive = fuzzyScore('filter', 'fil');
    const scattered = fuzzyScore('fxixl', 'fil');
    expect(consecutive).toBeGreaterThan(scattered);
  });

  test('is case insensitive', () => {
    expect(fuzzyScore('Hello World', 'HW')).toBeGreaterThan(0);
    expect(fuzzyScore('hello world', 'HW')).toBeGreaterThan(0);
  });

  test('short string against long query returns 0', () => {
    expect(fuzzyScore('hi', 'hello world')).toBe(0);
  });
});
