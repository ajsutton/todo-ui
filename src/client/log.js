// Update log dialog
import { itemDisplayName } from './icons.js';

let logOffset = 0;
let logTotal = 0;
const LOG_PAGE_SIZE = 50;

export async function showLogDialog() {
  logOffset = 0;
  const dialog = document.getElementById('log-dialog');
  const content = document.getElementById('log-dialog-content');
  content.innerHTML = '<p>Loading...</p>';
  dialog.show();
  await loadLogPage(true);
}

export async function loadLogPage(reset) {
  const content = document.getElementById('log-dialog-content');
  const loadMore = document.getElementById('log-load-more');
  try {
    const res = await fetch('/api/log?limit=' + LOG_PAGE_SIZE + '&offset=' + logOffset);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    logTotal = data.total;

    if (reset) content.innerHTML = '';

    if (data.entries.length === 0 && logOffset === 0) {
      content.innerHTML = '<p class="no-changes">No update log entries.</p>';
      loadMore.classList.add('hidden');
      return;
    }

    for (const entry of data.entries) {
      content.appendChild(renderLogEntry(entry));
    }

    logOffset += data.entries.length;
    if (logOffset < logTotal) {
      loadMore.classList.remove('hidden');
    } else {
      loadMore.classList.add('hidden');
    }
  } catch (err) {
    content.innerHTML = '<p>Error loading log: ' + err.message + '</p>';
  }
}

export function renderLogEntry(entry) {
  const div = document.createElement('div');
  div.className = 'log-entry';

  const header = document.createElement('div');
  header.className = 'log-entry-header';

  const time = document.createElement('span');
  time.className = 'log-entry-time';
  const d = new Date(entry.timestamp);
  time.textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  header.appendChild(time);

  const source = document.createElement('span');
  source.className = 'log-entry-source log-source-' + entry.source;
  source.textContent = entry.source;
  header.appendChild(source);

  const summary = document.createElement('span');
  summary.className = 'log-entry-summary';
  const parts = [];
  if (entry.results.length > 0) parts.push(entry.results.length + ' changed');
  if (entry.discoveredCount > 0) parts.push(entry.discoveredCount + ' discovered');
  if (entry.errors.length > 0) parts.push(entry.errors.length + ' errors');
  if (parts.length === 0) parts.push('no changes');
  summary.textContent = parts.join(', ');
  header.appendChild(summary);

  div.appendChild(header);

  if (entry.results.length > 0 || entry.errors.length > 0) {
    const toggle = document.createElement('button');
    toggle.className = 'btn-small log-toggle';
    toggle.textContent = 'Details';

    const details = document.createElement('div');
    details.className = 'log-details hidden';

    if (entry.results.length > 0) {
      const ul = document.createElement('ul');
      ul.className = 'log-changes';
      for (const r of entry.results) {
        const li = document.createElement('li');
        li.textContent = itemDisplayName(r) + ': ' + r.oldStatus + ' \u2192 ' + r.newStatus;
        if (r.oldPriority !== r.newPriority) li.textContent += ' (' + r.oldPriority + ' \u2192 ' + r.newPriority + ')';
        if (r.doneDateSet) li.textContent += ' [Done]';
        ul.appendChild(li);
      }
      details.appendChild(ul);
    }

    if (entry.errors.length > 0) {
      const errTitle = document.createElement('div');
      errTitle.className = 'log-errors-title';
      errTitle.textContent = 'Errors:';
      details.appendChild(errTitle);
      const ul = document.createElement('ul');
      ul.className = 'log-errors';
      for (const e of entry.errors) {
        const li = document.createElement('li');
        li.textContent = itemDisplayName(e) + ': ' + e.error;
        ul.appendChild(li);
      }
      details.appendChild(ul);
    }

    toggle.onclick = () => {
      details.classList.toggle('hidden');
      toggle.textContent = details.classList.contains('hidden') ? 'Details' : 'Hide';
    };

    header.appendChild(toggle);
    div.appendChild(details);
  }

  return div;
}

export function closeLogDialog() {
  document.getElementById('log-dialog').hide();
}
