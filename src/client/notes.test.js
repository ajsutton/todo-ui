import { describe, it, expect, beforeEach } from 'bun:test';

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};

const { getNote, setNote, hasNote, getAllNotes } = await import('./notes.js');
const KEY = 'todo-item-notes';

beforeEach(() => { delete store[KEY]; });

describe('notes', () => {
  it('getNote returns empty string when no note', () => {
    expect(getNote('TODO-1')).toBe('');
  });

  it('setNote stores and retrieves a note', () => {
    setNote('TODO-1', 'Follow up with Alice');
    expect(getNote('TODO-1')).toBe('Follow up with Alice');
  });

  it('setNote trims whitespace', () => {
    setNote('TODO-1', '  my note  ');
    expect(getNote('TODO-1')).toBe('my note');
  });

  it('setNote with empty string removes the note', () => {
    setNote('TODO-1', 'something');
    setNote('TODO-1', '');
    expect(getNote('TODO-1')).toBe('');
    expect(hasNote('TODO-1')).toBe(false);
  });

  it('setNote with whitespace-only removes the note', () => {
    setNote('TODO-1', 'something');
    setNote('TODO-1', '   ');
    expect(hasNote('TODO-1')).toBe(false);
  });

  it('hasNote returns true when note exists', () => {
    setNote('TODO-1', 'note here');
    expect(hasNote('TODO-1')).toBe(true);
  });

  it('hasNote returns false when no note', () => {
    expect(hasNote('TODO-99')).toBe(false);
  });

  it('getAllNotes returns all stored notes', () => {
    setNote('TODO-1', 'note A');
    setNote('TODO-2', 'note B');
    const all = getAllNotes();
    expect(all['TODO-1']).toBe('note A');
    expect(all['TODO-2']).toBe('note B');
  });

  it('notes are independent per item', () => {
    setNote('TODO-1', 'note for 1');
    setNote('TODO-2', 'note for 2');
    expect(getNote('TODO-1')).toBe('note for 1');
    expect(getNote('TODO-2')).toBe('note for 2');
  });
});
