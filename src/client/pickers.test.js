import { describe, it, expect } from 'bun:test';
import { parseNaturalDate } from './pickers.js';

// Use a fixed reference date: Wednesday 2026-04-08
const REF = '2026-04-08';

describe('parseNaturalDate', () => {
  it('returns today as the reference date', () => {
    expect(parseNaturalDate('today', REF)).toBe('2026-04-08');
  });

  it('returns tomorrow as the day after reference', () => {
    expect(parseNaturalDate('tomorrow', REF)).toBe('2026-04-09');
  });

  it('is case-insensitive', () => {
    expect(parseNaturalDate('Today', REF)).toBe('2026-04-08');
    expect(parseNaturalDate('TOMORROW', REF)).toBe('2026-04-09');
  });

  it('handles +Nd (days)', () => {
    expect(parseNaturalDate('+3d', REF)).toBe('2026-04-11');
    expect(parseNaturalDate('+1d', REF)).toBe('2026-04-09');
  });

  it('handles +Nw (weeks)', () => {
    expect(parseNaturalDate('+1w', REF)).toBe('2026-04-15');
    expect(parseNaturalDate('+2w', REF)).toBe('2026-04-22');
  });

  it('returns next occurrence of named weekday', () => {
    // Reference is Wednesday (3). Next Monday is +5 days = 2026-04-13
    expect(parseNaturalDate('monday', REF)).toBe('2026-04-13');
    // Next Thursday is +1 day = 2026-04-09
    expect(parseNaturalDate('thursday', REF)).toBe('2026-04-09');
    // Next Wednesday (same day) should be +7 days = 2026-04-15
    expect(parseNaturalDate('wednesday', REF)).toBe('2026-04-15');
  });

  it('returns null for unrecognized input', () => {
    expect(parseNaturalDate('someday', REF)).toBe(null);
    expect(parseNaturalDate('', REF)).toBe(null);
    expect(parseNaturalDate('next week', REF)).toBe(null);
  });

  it('handles +0d as today', () => {
    expect(parseNaturalDate('+0d', REF)).toBe('2026-04-08');
  });
});
