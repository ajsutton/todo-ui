import { describe, it, expect, beforeEach } from 'bun:test';
import { getNextSuggestion } from './suggestion.js';
import { appState } from './state.js';

function makeItem(overrides) {
  return {
    id: 'TODO-1',
    description: 'test item',
    descriptionHtml: 'test item',
    type: 'PR',
    status: 'Open',
    priority: 'P3',
    due: '',
    doneDate: '',
    blocked: false,
    githubUrl: 'https://github.com/org/repo/pull/1',
    ...overrides,
  };
}

describe('getNextSuggestion', () => {
  beforeEach(() => {
    appState.items = [];
  });

  it('returns null when no active items', () => {
    appState.items = [];
    expect(getNextSuggestion()).toBeNull();
  });

  it('returns null when all items are done', () => {
    appState.items = [makeItem({ doneDate: '2026-01-01' })];
    expect(getNextSuggestion()).toBeNull();
  });

  it('returns null when all items are blocked', () => {
    appState.items = [makeItem({ blocked: true })];
    expect(getNextSuggestion()).toBeNull();
  });

  it('picks P0 over P3', () => {
    appState.items = [
      makeItem({ id: 'TODO-1', priority: 'P3' }),
      makeItem({ id: 'TODO-2', priority: 'P0' }),
    ];
    const result = getNextSuggestion();
    expect(result).not.toBeNull();
    expect(result.item.id).toBe('TODO-2');
  });

  it('prefers ready-to-merge PR over same priority', () => {
    appState.items = [
      makeItem({ id: 'TODO-1', priority: 'P1', status: 'Open' }),
      makeItem({ id: 'TODO-2', priority: 'P1', status: 'Approved CI Passing' }),
    ];
    const result = getNextSuggestion();
    expect(result.item.id).toBe('TODO-2');
    expect(result.reasons).toContain('ready to merge');
  });

  it('includes overdue in reasons', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    appState.items = [makeItem({ due: yesterday })];
    const result = getNextSuggestion();
    expect(result.reasons.some(r => r.includes('overdue'))).toBe(true);
  });

  it('includes "due today" in reasons', () => {
    const today = new Date().toISOString().slice(0, 10);
    appState.items = [makeItem({ due: today })];
    const result = getNextSuggestion();
    expect(result.reasons).toContain('due today');
  });

  it('skips done items when other active items exist', () => {
    appState.items = [
      makeItem({ id: 'TODO-1', priority: 'P0', doneDate: '2026-01-01' }),
      makeItem({ id: 'TODO-2', priority: 'P3' }),
    ];
    const result = getNextSuggestion();
    expect(result.item.id).toBe('TODO-2');
  });
});
