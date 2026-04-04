import { describe, it, expect } from 'bun:test';
import { getUrlParams } from './url.js';

describe('getUrlParams', () => {
  it('returns default values for empty params', () => {
    const p = getUrlParams('');
    expect(p.filterType).toBe('');
    expect(p.filterStatus).toBe('active');
    expect(p.searchQuery).toBe('');
    expect(p.sortColumn).toBe('priority');
    expect(p.sortDirection).toBe('asc');
    expect(p.detailId).toBe('');
    expect(p.expanded).toEqual([]);
  });

  it('parses filterType from type param', () => {
    const p = getUrlParams('?type=PR');
    expect(p.filterType).toBe('PR');
  });

  it('parses filterStatus=active', () => {
    const p = getUrlParams('?status=active');
    expect(p.filterStatus).toBe('active');
  });

  it('parses filterStatus=done', () => {
    const p = getUrlParams('?status=done');
    expect(p.filterStatus).toBe('done');
  });

  it('returns empty string for filterStatus when status=all', () => {
    const p = getUrlParams('?status=all');
    expect(p.filterStatus).toBe('');
  });

  it('defaults filterStatus to active when status not in URL', () => {
    const p = getUrlParams('?type=PR');
    expect(p.filterStatus).toBe('active');
  });

  it('parses searchQuery from search param', () => {
    const p = getUrlParams('?search=my+query');
    expect(p.searchQuery).toBe('my query');
  });

  it('parses sortColumn from sort param', () => {
    const p = getUrlParams('?sort=description');
    expect(p.sortColumn).toBe('description');
  });

  it('parses sortDirection from dir param', () => {
    const p = getUrlParams('?dir=desc');
    expect(p.sortDirection).toBe('desc');
  });

  it('parses detailId from detail param', () => {
    const p = getUrlParams('?detail=TODO-42');
    expect(p.detailId).toBe('TODO-42');
  });

  it('parses expanded comma-separated ids', () => {
    const p = getUrlParams('?expanded=TODO-1,TODO-2,TODO-3');
    expect(p.expanded).toEqual(['TODO-1', 'TODO-2', 'TODO-3']);
  });

  it('returns empty array for expanded when not present', () => {
    const p = getUrlParams('?type=PR');
    expect(p.expanded).toEqual([]);
  });

  it('handles multiple params together', () => {
    const p = getUrlParams('?type=Review&status=done&sort=due&dir=desc&search=foo');
    expect(p.filterType).toBe('Review');
    expect(p.filterStatus).toBe('done');
    expect(p.sortColumn).toBe('due');
    expect(p.sortDirection).toBe('desc');
    expect(p.searchQuery).toBe('foo');
  });
});
