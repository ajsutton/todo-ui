import { describe, it, expect, beforeEach } from 'bun:test';

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};
globalThis.document = { getElementById: () => null };

const { getDensity, cycleDensity, applyDensity } = await import('./density.js');
const KEY = 'todo-density';

beforeEach(() => {
  delete store[KEY];
});

describe('getDensity', () => {
  it('returns comfortable by default', () => {
    expect(getDensity()).toBe('comfortable');
  });

  it('returns stored value if valid', () => {
    store[KEY] = 'compact';
    expect(getDensity()).toBe('compact');
  });

  it('returns comfortable for unknown stored value', () => {
    store[KEY] = 'unknown-mode';
    expect(getDensity()).toBe('comfortable');
  });
});

describe('cycleDensity', () => {
  it('cycles comfortable → compact → spacious → comfortable', () => {
    // Start at comfortable (default)
    cycleDensity();
    expect(getDensity()).toBe('compact');
    cycleDensity();
    expect(getDensity()).toBe('spacious');
    cycleDensity();
    expect(getDensity()).toBe('comfortable');
  });
});
