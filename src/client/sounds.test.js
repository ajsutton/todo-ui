import { describe, it, expect, beforeEach } from 'bun:test';

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};
globalThis.window = {};
globalThis.document = { getElementById: () => null };

const { isSoundEnabled, toggleSound } = await import('./sounds.js');
const KEY = 'todo-sounds';

beforeEach(() => { delete store[KEY]; });

describe('sound preferences', () => {
  it('sound is off by default', () => {
    expect(isSoundEnabled()).toBe(false);
  });

  it('toggleSound enables sound', () => {
    toggleSound();
    expect(isSoundEnabled()).toBe(true);
  });

  it('toggleSound disables sound when on', () => {
    toggleSound(); // on
    toggleSound(); // off
    expect(isSoundEnabled()).toBe(false);
  });

  it('isSoundEnabled returns false for unknown stored value', () => {
    store[KEY] = 'yes'; // not 'on'
    expect(isSoundEnabled()).toBe(false);
  });

  it('isSoundEnabled returns true when stored as on', () => {
    store[KEY] = 'on';
    expect(isSoundEnabled()).toBe(true);
  });
});
