// Export the currently visible (filtered) items as formatted Markdown or CSV.
import { appState } from './state.js';
import { filterItems, sortItems } from './filters.js';

export function exportAsMarkdown() {
  const items = sortItems(
    filterItems([...appState.items], {
      filterType: appState.filterType,
      filterStatus: appState.filterStatus,
      searchQuery: appState.searchQuery,
    }),
    appState.sortColumn,
    appState.sortDirection,
  );

  if (items.length === 0) return '_(no items)_';

  const today = new Date().toISOString().slice(0, 10);
  const lines = [`# TODO Export — ${today}`, ''];

  // Group by priority
  const byPriority = {};
  for (const item of items) {
    const p = item.priority || 'None';
    (byPriority[p] = byPriority[p] || []).push(item);
  }

  const priorityOrder = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'None'];
  for (const p of priorityOrder) {
    const group = byPriority[p];
    if (!group) continue;
    lines.push(`## ${p}`);
    for (const item of group) {
      const name = item.description.replace(/^\[.*?\]\(.*?\)\s*/, '').trim();
      const link = item.githubUrl ? ` ([link](${item.githubUrl}))` : '';
      const status = item.status ? ` — ${item.status}` : '';
      const due = item.due ? ` _(due ${item.due})_` : '';
      const blocked = item.blocked ? ' 🚫' : '';
      const done = item.doneDate ? ' ~~' : '';
      const doneEnd = item.doneDate ? '~~' : '';
      lines.push(`- ${done}${name}${link}${status}${due}${blocked}${doneEnd}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export async function copyExport() {
  const md = exportAsMarkdown();
  try {
    await navigator.clipboard.writeText(md);
    return true;
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = md;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  }
}

function csvCell(val) {
  const s = String(val ?? '').replace(/"/g, '""');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
}

export function exportAsCsv() {
  const items = sortItems(
    filterItems([...appState.items], {
      filterType: appState.filterType,
      filterStatus: appState.filterStatus,
      searchQuery: appState.searchQuery,
    }),
    appState.sortColumn,
    appState.sortDirection,
  );

  const headers = ['ID', 'Description', 'Type', 'Status', 'Priority', 'Due', 'Done Date', 'GitHub URL', 'Blocked'];
  const rows = [headers.map(csvCell).join(',')];

  for (const item of items) {
    const desc = item.description.replace(/^\[.*?\]\(.*?\)\s*/, '').trim();
    rows.push([
      item.id,
      desc,
      item.type,
      item.status,
      item.priority,
      item.due || '',
      item.doneDate || '',
      item.githubUrl || '',
      item.blocked ? 'yes' : '',
    ].map(csvCell).join(','));
  }

  return rows.join('\r\n');
}

export function downloadCsv() {
  const csv = exportAsCsv();
  const today = new Date().toISOString().slice(0, 10);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `todos-${today}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
