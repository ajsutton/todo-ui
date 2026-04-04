import { describe, it, expect } from 'bun:test';
import { computeUrgency, urgencyColor } from './urgency.js';

function item(overrides) {
  return { id: 'T1', priority: 'P3', status: 'Open', due: '', doneDate: '', blocked: false, ...overrides };
}

describe('computeUrgency', () => {
  it('returns 0 for done items', () => {
    expect(computeUrgency(item({ doneDate: '2026-01-01' }))).toBe(0);
  });

  it('returns 0 for blocked items', () => {
    expect(computeUrgency(item({ blocked: true }))).toBe(0);
  });

  it('P0 scores higher than P3', () => {
    expect(computeUrgency(item({ priority: 'P0' }))).toBeGreaterThan(
      computeUrgency(item({ priority: 'P3' }))
    );
  });

  it('overdue items score higher than same priority without due date', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    expect(computeUrgency(item({ due: yesterday }))).toBeGreaterThan(
      computeUrgency(item({ due: '' }))
    );
  });

  it('ready-to-merge boosts score', () => {
    const base = computeUrgency(item({ priority: 'P2' }));
    const ready = computeUrgency(item({ priority: 'P2', status: 'Approved CI Passing' }));
    expect(ready).toBeGreaterThan(base);
  });

  it('draft status reduces score', () => {
    const base = computeUrgency(item({ priority: 'P2' }));
    const draft = computeUrgency(item({ priority: 'P2', status: 'Draft' }));
    expect(draft).toBeLessThan(base);
  });

  it('caps at 100', () => {
    const yesterday = new Date(Date.now() - 86400000 * 30).toISOString().slice(0, 10);
    expect(computeUrgency(item({ priority: 'P0', due: yesterday, status: 'Approved CI Passing' }))).toBeLessThanOrEqual(100);
  });

  it('never goes below 0', () => {
    expect(computeUrgency(item({ priority: 'P5', status: 'Draft' }))).toBeGreaterThanOrEqual(0);
  });
});

describe('urgencyColor', () => {
  it('returns p0 color for score >= 90', () => {
    expect(urgencyColor(95)).toContain('p0');
  });
  it('returns p4 color for low score', () => {
    expect(urgencyColor(10)).toContain('p4');
  });
});
