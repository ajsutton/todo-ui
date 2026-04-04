// Icon helpers and display utilities

export const TYPE_EMOJI = { Review: '👀', PR: '🔀', Workstream: '🏗️', Issue: '📋' };

export const PRIORITY_ICONS = {
  P0: `<svg class="priority-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M8 1l1.5 3.5L13 5l-2.5 2.5L11 11.5 8 9.5 5 11.5l.5-4L3 5l3.5-.5z" fill="#e53e3e" stroke="#e53e3e" stroke-width=".5"/><line x1="3" y1="13" x2="13" y2="13" stroke="#e53e3e" stroke-width="2" stroke-linecap="round"/></svg>`,
  P1: `<svg class="priority-icon" viewBox="0 0 16 16" width="16" height="16"><rect x="2" y="3" width="12" height="10" rx="2" fill="none" stroke="#dd6b20" stroke-width="1.5"/><path d="M5 6.5h6M5 9.5h4" stroke="#dd6b20" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="3" r="2.5" fill="#dd6b20"/></svg>`,
  P2: `<svg class="priority-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M4 12V4l4 2.5L4 9" fill="none" stroke="#d69e2e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="4" y1="12" x2="4" y2="4" stroke="#d69e2e" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  P3: `<svg class="priority-icon" viewBox="0 0 16 16" width="16" height="16"><line x1="4" y1="8" x2="12" y2="8" stroke="#718096" stroke-width="2" stroke-linecap="round"/></svg>`,
  P4: `<svg class="priority-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l4 4-4 4" fill="none" stroke="#a0aec0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  P5: `<svg class="priority-icon" viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="2" fill="#cbd5e0"/></svg>`,
};

export const TOOL_LABELS = {
  Bash: 'Running command',
  Read: 'Reading file',
  Write: 'Writing file',
  Edit: 'Editing file',
  Glob: 'Searching files',
  Grep: 'Searching code',
  Agent: 'Running sub-agent',
  WebFetch: 'Fetching URL',
  WebSearch: 'Searching web',
};

export function typeLabel(t) {
  return TYPE_EMOJI[t] || '📌';
}

export function priorityIcon(p) {
  return PRIORITY_ICONS[p] || '';
}

export function statusEmoji(item) {
  const s = item.status.toLowerCase();
  if (item.blocked) return '🚫';
  if (item.doneDate) {
    if (s.includes('merged')) return '✅';
    if (s.includes('closed')) return '🗑️';
    if (s.includes('approved')) return '👍';
    return '✅';
  }
  // Merge queue
  if (s.includes('merge queue')) return '🚂';
  // Ready to merge: approved + CI passing, not draft
  if (s.includes('approved') && s.includes('ci passing')) return '🚀';
  if (s.includes('approved')) return '👍';
  if (s.includes('draft')) return '📝';
  if (s.includes('failing')) return '❌';
  if (s.includes('ci passing')) return '✅';
  if (s.includes('conflict')) return '⚠️';
  if (s.includes('changes requested')) return '🔄';
  return '';
}

export function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function itemDisplayName(item) {
  const title = (item.description || '').replace(/^\[.*?\]\(.*?\)\s*/, '');
  if (title) return title;
  if (item.repo && item.prNumber) return item.repo.replace('ethereum-optimism/', '') + '#' + item.prNumber;
  return item.id || 'Unknown';
}

export function descText(description) {
  return description.replace(/^\[.*?\]\(.*?\)\s*/, '').trim() || description;
}

export function descWithRefHtml(description) {
  const match = description.match(/^\[([^\]]+)\]\(([^)]+)\)\s*(.*)/);
  if (match) {
    const ref = escHtml(match[1]);
    const url = escHtml(match[2]);
    const rest = escHtml(match[3]);
    return `<a href="${url}" target="_blank" rel="noopener">${ref}</a>${rest ? ' ' + rest : ''}`;
  }
  return escHtml(description);
}

export function descWithRefMarkdown(description) {
  const match = description.match(/^\[([^\]]+)\]\(([^)]+)\)\s*(.*)/);
  if (match) {
    const ref = match[1];
    const url = match[2];
    const rest = match[3];
    return `[${ref}](${url})${rest ? ' ' + rest : ''}`;
  }
  return description;
}
