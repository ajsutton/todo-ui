import { describe, it, expect } from 'bun:test';
import { isGitHubUrl, extractUrl } from './quickadd.js';

describe('isGitHubUrl', () => {
  it('detects PR URLs', () => {
    expect(isGitHubUrl('https://github.com/org/repo/pull/123')).toBe(true);
  });

  it('detects issue URLs', () => {
    expect(isGitHubUrl('https://github.com/org/repo/issues/456')).toBe(true);
  });

  it('rejects non-GitHub URLs', () => {
    expect(isGitHubUrl('https://example.com/foo')).toBe(false);
  });

  it('rejects bare text', () => {
    expect(isGitHubUrl('hello world')).toBe(false);
  });

  it('detects URLs with trailing content', () => {
    expect(isGitHubUrl('https://github.com/org/repo/pull/123#discussion')).toBe(true);
  });

  it('handles repos with dots and hyphens', () => {
    expect(isGitHubUrl('https://github.com/ethereum-optimism/op-geth/pull/99')).toBe(true);
  });
});

describe('extractUrl', () => {
  it('extracts a PR URL from text', () => {
    const url = extractUrl('https://github.com/org/repo/pull/42');
    expect(url).toBe('https://github.com/org/repo/pull/42');
  });

  it('returns null for non-GitHub text', () => {
    expect(extractUrl('just some text')).toBeNull();
  });

  it('extracts URL from text with surrounding whitespace', () => {
    const url = extractUrl('  https://github.com/org/repo/pull/1  ');
    expect(url).toBe('https://github.com/org/repo/pull/1');
  });
});
