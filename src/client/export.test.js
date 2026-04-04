import { describe, it, expect, beforeEach } from 'bun:test';
import { exportAsMarkdown } from './export.js';
import { appState } from './state.js';

function makeItem(overrides) {
  return {
    id: 'TODO-1', description: 'Test item', descriptionHtml: 'Test item',
    type: 'PR', status: 'Open', priority: 'P2', due: '', doneDate: '',
    blocked: false, githubUrl: '',
    ...overrides,
  };
}

describe('exportAsMarkdown', () => {
  beforeEach(() => {
    appState.items = [];
    appState.filterType = '';
    appState.filterStatus = '';
    appState.searchQuery = '';
    appState.sortColumn = 'priority';
    appState.sortDirection = 'asc';
  });

  it('returns empty message when no items', () => {
    expect(exportAsMarkdown()).toBe('_(no items)_');
  });

  it('includes item name in output', () => {
    appState.items = [makeItem({ description: 'Fix the bug' })];
    const md = exportAsMarkdown();
    expect(md).toContain('Fix the bug');
  });

  it('groups items by priority', () => {
    appState.items = [
      makeItem({ id: 'T1', description: 'High', priority: 'P0' }),
      makeItem({ id: 'T2', description: 'Low', priority: 'P3' }),
    ];
    const md = exportAsMarkdown();
    const p0Pos = md.indexOf('## P0');
    const p3Pos = md.indexOf('## P3');
    expect(p0Pos).toBeGreaterThan(-1);
    expect(p3Pos).toBeGreaterThan(p0Pos);
  });

  it('strips markdown link prefix from description', () => {
    appState.items = [makeItem({ description: '[org/repo#1](https://github.com) My PR' })];
    const md = exportAsMarkdown();
    expect(md).toContain('My PR');
    expect(md).not.toContain('[org/repo#1]');
  });

  it('includes GitHub link when present', () => {
    appState.items = [makeItem({ githubUrl: 'https://github.com/org/repo/pull/1' })];
    const md = exportAsMarkdown();
    expect(md).toContain('https://github.com/org/repo/pull/1');
  });

  it('includes status in output', () => {
    appState.items = [makeItem({ status: 'CI Passing' })];
    const md = exportAsMarkdown();
    expect(md).toContain('CI Passing');
  });

  it('marks done items with strikethrough', () => {
    appState.items = [makeItem({ doneDate: '2026-01-01' })];
    appState.filterStatus = '';
    const md = exportAsMarkdown();
    expect(md).toContain('~~');
  });
});
