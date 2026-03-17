import { marked } from 'marked';

// Configure marked for GFM (tables, task lists, strikethrough)
marked.use({ gfm: true });

export function renderMarkdown(content: string): string {
  const html = marked.parse(content, { async: false }) as string;
  // Strip script tags for defense in depth
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}
