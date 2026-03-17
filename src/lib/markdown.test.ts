import { describe, expect, test } from 'bun:test';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  test('renders headings', () => {
    const html = renderMarkdown('# Title');
    expect(html).toContain('<h1>');
    expect(html).toContain('Title');
    expect(html).toContain('</h1>');
  });

  test('renders task lists', () => {
    const html = renderMarkdown('- [ ] unchecked\n- [x] checked');
    expect(html).toContain('<input');
    expect(html).toContain('type="checkbox"');
  });

  test('renders tables', () => {
    const input = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const html = renderMarkdown(input);
    expect(html).toContain('<table>');
    expect(html).toContain('</table>');
  });

  test('renders links', () => {
    const html = renderMarkdown('[text](http://example.com)');
    expect(html).toContain('<a href="http://example.com">text</a>');
  });

  test('strips script tags', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });
});
