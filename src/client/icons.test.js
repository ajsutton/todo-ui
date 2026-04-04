import { describe, it, expect } from 'bun:test';
import { typeLabel, statusEmoji, itemDisplayName, descText, escHtml } from './icons.js';

describe('typeLabel', () => {
  it('returns emoji for Review', () => {
    expect(typeLabel('Review')).toBe('👀');
  });

  it('returns emoji for PR', () => {
    expect(typeLabel('PR')).toBe('🔀');
  });

  it('returns emoji for Workstream', () => {
    expect(typeLabel('Workstream')).toBe('🏗️');
  });

  it('returns emoji for Issue', () => {
    expect(typeLabel('Issue')).toBe('📋');
  });

  it('returns fallback for unknown type', () => {
    expect(typeLabel('Unknown')).toBe('📌');
  });

  it('returns fallback for empty string', () => {
    expect(typeLabel('')).toBe('📌');
  });
});

describe('statusEmoji', () => {
  const item = (status, extra = {}) => ({ status, blocked: false, doneDate: '', ...extra });

  it('returns blocked emoji for blocked items', () => {
    expect(statusEmoji(item('Open', { blocked: true }))).toBe('🚫');
  });

  it('returns merged emoji for done merged items', () => {
    expect(statusEmoji(item('Merged', { doneDate: '2024-01-01' }))).toBe('✅');
  });

  it('returns done emoji for done closed items', () => {
    expect(statusEmoji(item('Closed', { doneDate: '2024-01-01' }))).toBe('🗑️');
  });

  it('returns rocket for approved + ci passing', () => {
    expect(statusEmoji(item('Approved, CI passing'))).toBe('🚀');
  });

  it('returns thumbs up for approved', () => {
    expect(statusEmoji(item('Approved'))).toBe('👍');
  });

  it('returns x for failing', () => {
    expect(statusEmoji(item('CI failing'))).toBe('❌');
  });

  it('returns checkmark for ci passing', () => {
    expect(statusEmoji(item('CI passing'))).toBe('✅');
  });

  it('returns empty string for unknown status', () => {
    expect(statusEmoji(item('Open'))).toBe('');
  });

  it('returns train for merge queue', () => {
    expect(statusEmoji(item('In merge queue'))).toBe('🚂');
  });

  it('returns draft emoji for draft', () => {
    expect(statusEmoji(item('Draft'))).toBe('📝');
  });
});

describe('itemDisplayName', () => {
  it('strips markdown link prefix', () => {
    const item = { description: '[org/repo#1](https://github.com) My PR', repo: undefined, prNumber: undefined, id: 'TODO-1' };
    expect(itemDisplayName(item)).toBe('My PR');
  });

  it('returns plain description if no link prefix', () => {
    const item = { description: 'Simple description', repo: undefined, prNumber: undefined, id: 'TODO-1' };
    expect(itemDisplayName(item)).toBe('Simple description');
  });

  it('falls back to repo#number when description is only a link', () => {
    const item = { description: '[repo#1](https://github.com)', repo: 'ethereum-optimism/optimism', prNumber: 123, id: 'TODO-1' };
    expect(itemDisplayName(item)).toBe('optimism#123');
  });

  it('falls back to id when all else empty', () => {
    const item = { description: '', repo: undefined, prNumber: undefined, id: 'TODO-42' };
    expect(itemDisplayName(item)).toBe('TODO-42');
  });
});

describe('descText', () => {
  it('strips leading markdown link', () => {
    expect(descText('[ref](url) remaining text')).toBe('remaining text');
  });

  it('returns original if no link prefix', () => {
    expect(descText('plain text')).toBe('plain text');
  });

  it('returns description if only link with no trailing text', () => {
    // When stripping leaves empty string, returns original
    expect(descText('[ref](url)')).toBe('[ref](url)');
  });
});

describe('escHtml', () => {
  it('escapes ampersands', () => {
    expect(escHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than', () => {
    expect(escHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes quotes', () => {
    expect(escHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('leaves safe strings unchanged', () => {
    expect(escHtml('hello world')).toBe('hello world');
  });
});
