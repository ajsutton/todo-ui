import { describe, it, expect } from 'bun:test';
import { formatDueDate } from './render.js';

describe('formatDueDate', () => {
  function daysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  it('returns empty string for falsy input', () => {
    expect(formatDueDate('')).toBe('');
    expect(formatDueDate(null)).toBe('');
    expect(formatDueDate(undefined)).toBe('');
  });

  it('returns Today for today', () => {
    expect(formatDueDate(daysFromNow(0))).toBe('Today');
  });

  it('returns Tomorrow for tomorrow', () => {
    expect(formatDueDate(daysFromNow(1))).toBe('Tomorrow');
  });

  it('returns Yesterday for yesterday', () => {
    expect(formatDueDate(daysFromNow(-1))).toBe('Yesterday');
  });

  it('returns Nd for 2-6 days out', () => {
    expect(formatDueDate(daysFromNow(3))).toBe('3d');
    expect(formatDueDate(daysFromNow(6))).toBe('6d');
  });

  it('returns Nd ago for overdue days', () => {
    const result = formatDueDate(daysFromNow(-5));
    expect(result).toBe('5d ago');
  });

  it('returns Nw for 7-13 days out', () => {
    expect(formatDueDate(daysFromNow(7))).toBe('1w');
    expect(formatDueDate(daysFromNow(13))).toBe('2w');
  });
});
