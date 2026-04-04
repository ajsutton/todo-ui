import { describe, test, expect, beforeEach } from 'bun:test';

// Mock localStorage
const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};

const { snoozeItem, unsnoozeItem, isSnoozed, getSnoozedIds, getSnoozedUntil } = await import('./snooze.js');

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function pastDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
});

describe('snoozeItem / isSnoozed', () => {
  test('snoozes an item until a future date', () => {
    snoozeItem('TODO-1', futureDate(1));
    expect(isSnoozed('TODO-1')).toBe(true);
  });

  test('not snoozed if past expiry', () => {
    snoozeItem('TODO-1', pastDate(1));
    expect(isSnoozed('TODO-1')).toBe(false);
  });

  test('not snoozed if not in storage', () => {
    expect(isSnoozed('TODO-99')).toBe(false);
  });

  test('auto-removes expired snooze', () => {
    snoozeItem('TODO-1', pastDate(1));
    isSnoozed('TODO-1');
    expect(getSnoozedUntil('TODO-1')).toBeNull();
  });
});

describe('unsnoozeItem', () => {
  test('removes snooze', () => {
    snoozeItem('TODO-1', futureDate(3));
    unsnoozeItem('TODO-1');
    expect(isSnoozed('TODO-1')).toBe(false);
  });
});

describe('getSnoozedIds', () => {
  test('returns snoozed item ids', () => {
    snoozeItem('TODO-1', futureDate(1));
    snoozeItem('TODO-2', futureDate(3));
    const ids = getSnoozedIds();
    expect(ids.has('TODO-1')).toBe(true);
    expect(ids.has('TODO-2')).toBe(true);
  });

  test('excludes expired snoozes', () => {
    snoozeItem('TODO-1', pastDate(2));
    const ids = getSnoozedIds();
    expect(ids.has('TODO-1')).toBe(false);
  });

  test('returns empty set when nothing snoozed', () => {
    expect(getSnoozedIds().size).toBe(0);
  });
});
