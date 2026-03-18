import { marked } from 'marked';

// Configure marked for GFM (tables, task lists, strikethrough)
marked.use({ gfm: true });

// Turn org/repo#123 references into GitHub links (but not inside existing <a> tags)
function linkifyIssueRefs(html: string): string {
  return html.replace(
    /(<a\b[^>]*>.*?<\/a>)|([\w.-]+\/[\w.-]+#\d+)/g,
    (match, anchor, ref) => {
      if (anchor) return anchor;
      const hashIdx = ref.indexOf('#');
      const repo = ref.slice(0, hashIdx);
      const num = ref.slice(hashIdx + 1);
      return `<a href="https://github.com/${repo}/issues/${num}" target="_blank" rel="noopener">${ref}</a>`;
    },
  );
}

export function renderMarkdown(content: string): string {
  const html = marked.parse(content, { async: false }) as string;
  // Strip script tags for defense in depth
  const sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  return linkifyIssueRefs(sanitized);
}
