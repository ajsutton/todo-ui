// Tag cloud panel: visualize all tags by usage frequency
import { appState } from './state.js';

const STORAGE_KEY = 'todo-tags';
const PANEL_OPEN_KEY = 'todo-tagcloud-open';

function loadAllTagsWithCounts() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const counts = {};
    for (const tags of Object.values(data)) {
      for (const tag of tags) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return counts;
  } catch { return {}; }
}

function isPanelOpen() {
  try { return localStorage.getItem(PANEL_OPEN_KEY) === 'open'; } catch { return false; }
}

function setPanelOpen(open) {
  try { localStorage.setItem(PANEL_OPEN_KEY, open ? 'open' : 'closed'); } catch {}
}

export function initTagCloud() {
  // Create toggle button
  const btn = document.createElement('button');
  btn.id = 'tagcloud-btn';
  btn.className = 'btn-small';
  btn.textContent = '# Tags';
  btn.title = 'Show tag cloud';
  btn.addEventListener('click', toggleTagCloud);

  const filtersDiv = document.querySelector('.filters');
  if (filtersDiv) filtersDiv.appendChild(btn);

  // Create panel
  const panel = document.createElement('div');
  panel.id = 'tag-cloud-panel';
  panel.className = 'tag-cloud-panel hidden';
  document.body.appendChild(panel);

  if (isPanelOpen()) showTagCloud();
}

function toggleTagCloud() {
  const panel = document.getElementById('tag-cloud-panel');
  if (!panel) return;
  if (panel.classList.contains('hidden')) {
    showTagCloud();
    setPanelOpen(true);
  } else {
    panel.classList.add('hidden');
    setPanelOpen(false);
  }
}

export function showTagCloud() {
  const panel = document.getElementById('tag-cloud-panel');
  if (!panel) return;

  const counts = loadAllTagsWithCounts();
  const tags = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  if (tags.length === 0) {
    panel.innerHTML = `
      <div class="tc-header">
        <span># Tags</span>
        <button class="tc-close">✕</button>
      </div>
      <div class="tc-empty">No tags yet.<br>Add tags to items to see them here.</div>
    `;
    panel.classList.remove('hidden');
    panel.querySelector('.tc-close')?.addEventListener('click', () => {
      panel.classList.add('hidden');
      setPanelOpen(false);
    });
    return;
  }

  const maxCount = tags[0][1];
  const minSize = 12;
  const maxSize = 26;

  // Current filter tag (if any)
  const currentSearch = appState.searchQuery || '';
  const currentTagMatch = currentSearch.match(/(?:^|\s)tag:(\S+)/);
  const activeTag = currentTagMatch ? currentTagMatch[1] : null;

  const cloudHtml = tags.map(([tag, count]) => {
    const size = minSize + Math.round(((count - 1) / Math.max(maxCount - 1, 1)) * (maxSize - minSize));
    const isActive = tag === activeTag;
    return `<span
      class="tc-tag${isActive ? ' tc-active' : ''}"
      data-tag="${escAttr(tag)}"
      title="${count} item${count > 1 ? 's' : ''}"
      style="font-size:${size}px"
    >${escHtml(tag)}<sup class="tc-count">${count}</sup></span>`;
  }).join(' ');

  panel.innerHTML = `
    <div class="tc-header">
      <span># Tag Cloud</span>
      <div class="tc-header-right">
        ${activeTag ? `<button class="tc-clear-filter">Clear filter</button>` : ''}
        <button class="tc-close">✕</button>
      </div>
    </div>
    <div class="tc-cloud">${cloudHtml}</div>
    <div class="tc-footer">${tags.length} tag${tags.length > 1 ? 's' : ''}</div>
  `;

  panel.querySelectorAll('.tc-tag').forEach(el => {
    el.addEventListener('click', () => {
      const tag = el.dataset.tag;
      // Toggle: if already filtered by this tag, clear it; otherwise apply
      const search = appState.searchQuery || '';
      if (activeTag === tag) {
        appState.searchQuery = search.replace(new RegExp(`(?:^|\\s)tag:${escapeRegex(tag)}`, 'g'), '').trim();
      } else {
        // Replace existing tag: filter or append
        const withoutOldTag = search.replace(/(?:^|\s)tag:\S+/g, '').trim();
        appState.searchQuery = (withoutOldTag ? withoutOldTag + ' ' : '') + `tag:${tag}`;
      }
      const searchEl = document.getElementById('filter-search');
      if (searchEl) searchEl.value = appState.searchQuery;
      import('./url.js').then(({ syncUrl }) => syncUrl());
      import('./render.js').then(m => { m.renderTable(); showTagCloud(); });
    });
  });

  panel.querySelector('.tc-close')?.addEventListener('click', () => {
    panel.classList.add('hidden');
    setPanelOpen(false);
  });

  panel.querySelector('.tc-clear-filter')?.addEventListener('click', () => {
    appState.searchQuery = (appState.searchQuery || '').replace(/(?:^|\s)tag:\S+/g, '').trim();
    const searchEl = document.getElementById('filter-search');
    if (searchEl) searchEl.value = appState.searchQuery;
    import('./url.js').then(({ syncUrl }) => syncUrl());
    import('./render.js').then(m => { m.renderTable(); showTagCloud(); });
  });

  panel.classList.remove('hidden');
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
