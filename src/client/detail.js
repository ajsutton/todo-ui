// Detail panel: show, edit, save
import { appState } from './state.js';
import { syncUrl } from './url.js';
import { staleDays } from './stale.js';

function renderDetailMeta(item) {
  let metaEl = document.getElementById('detail-meta');
  if (!metaEl) {
    metaEl = document.createElement('div');
    metaEl.id = 'detail-meta';
    metaEl.className = 'detail-meta';
    const detailId = document.getElementById('detail-id');
    if (detailId) detailId.after(metaEl);
  }

  if (!item) { metaEl.innerHTML = ''; return; }

  const badges = [];

  // Priority
  badges.push(`<span class="dm-badge priority-${item.priority.toLowerCase()}">${item.priority}</span>`);

  // Type
  badges.push(`<span class="dm-badge">${item.type}</span>`);

  // Blocked
  if (item.blocked) badges.push(`<span class="dm-badge dm-blocked">🚫 Blocked</span>`);

  // Due date
  if (item.due) {
    const today = new Date().toISOString().slice(0, 10);
    const cls = item.due < today ? 'dm-overdue' : item.due === today ? 'dm-today' : '';
    badges.push(`<span class="dm-badge ${cls}" title="${item.due}">Due ${item.due}</span>`);
  }

  // Stale indicator
  const days = staleDays(item.id);
  if (days >= 7) {
    badges.push(`<span class="dm-badge dm-stale" title="Status unchanged for ${days} days">Stale ${days}d</span>`);
  }

  // GitHub link
  if (item.githubUrl) {
    const ref = (item.repo || '').replace('ethereum-optimism/', '') + (item.prNumber ? '#' + item.prNumber : '');
    badges.push(`<a href="${item.githubUrl}" target="_blank" rel="noopener" class="dm-badge dm-link" onclick="event.stopPropagation()">${ref || 'GitHub'} ↗</a>`);
  }

  metaEl.innerHTML = badges.join('');
}

export async function showDetail(id) {
  const panel = document.getElementById('detail-panel');
  const title = document.getElementById('detail-title');
  const content = document.getElementById('detail-content');

  if (appState.detailEditMode) exitDetailEditMode(false);
  appState.currentDetailRaw = null;
  appState.currentDetailHtml = null;
  document.getElementById('detail-edit').classList.add('hidden');
  document.getElementById('detail-note')?.classList.add('hidden');
  const noteFormEl = document.getElementById('detail-note-form');
  if (noteFormEl) noteFormEl.classList.add('hidden');

  const item = appState.items.find(i => i.id === id);
  const desc = item ? item.description.replace(/^\[.*?\]\(.*?\)\s*/, '') : id;
  title.textContent = desc || id;
  document.getElementById('detail-id').textContent = id;

  // Show item metadata badge row
  renderDetailMeta(item);
  content.innerHTML = '<p>Loading...</p>';
  panel.classList.add('visible');
  syncUrl();

  try {
    const res = await fetch('/api/detail/' + id);
    if (res.ok) {
      const detail = await res.json();
      appState.currentDetailRaw = detail.content;
      appState.currentDetailHtml = detail.contentHtml;
      content.innerHTML = detail.contentHtml;
    } else {
      appState.currentDetailRaw = '';
      appState.currentDetailHtml = '';
      content.innerHTML = '';
    }
    document.getElementById('detail-edit').classList.remove('hidden');
    document.getElementById('detail-note')?.classList.remove('hidden');
  } catch {
    content.innerHTML = '<p>Error loading details.</p>';
  }
}

export function refreshOpenDetail() {
  const panel = document.getElementById('detail-panel');
  if (!panel.classList.contains('visible')) return;
  if (appState.detailEditMode) return;
  const id = document.getElementById('detail-id').textContent;
  if (id) showDetail(id);
}

export function enterDetailEditMode() {
  if (appState.currentDetailRaw === null) return;
  appState.detailEditMode = true;

  document.getElementById('detail-edit').classList.add('hidden');
  document.getElementById('detail-save').classList.remove('hidden');
  document.getElementById('detail-cancel').classList.remove('hidden');

  const content = document.getElementById('detail-content');

  // Make entire markdown content editable as a single textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'detail-edit-textarea';
  textarea.value = appState.currentDetailRaw;
  content.innerHTML = '';
  content.appendChild(textarea);
  textarea.focus();
}

export function exitDetailEditMode(restoreContent) {
  appState.detailEditMode = false;
  document.getElementById('detail-save').classList.add('hidden');
  document.getElementById('detail-cancel').classList.add('hidden');
  if (appState.currentDetailRaw !== null) {
    document.getElementById('detail-edit').classList.remove('hidden');
  }
  if (restoreContent && appState.currentDetailHtml) {
    document.getElementById('detail-content').innerHTML = appState.currentDetailHtml;
  }
}

export function toggleNoteForm() {
  const noteForm = document.getElementById('detail-note-form');
  const noteBtn = document.getElementById('detail-note');
  if (!noteForm) return;
  const isHidden = noteForm.classList.toggle('hidden');
  if (!isHidden) {
    document.getElementById('detail-note-text')?.focus();
    if (noteBtn) noteBtn.textContent = 'Cancel note';
  } else {
    if (noteBtn) noteBtn.textContent = '+ Note';
    const noteText = document.getElementById('detail-note-text');
    if (noteText) noteText.value = '';
  }
}

export async function appendNote() {
  const id = document.getElementById('detail-id').textContent;
  if (!id) return;
  const noteText = document.getElementById('detail-note-text');
  const text = noteText?.value.trim();
  if (!text) return;

  const saveBtn = document.getElementById('detail-note-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const noteMarkdown = appState.currentDetailRaw
    ? `${appState.currentDetailRaw}\n\n---\n**Note** (${timestamp}): ${text}`
    : `**Note** (${timestamp}): ${text}`;

  try {
    const res = await fetch('/api/detail/' + id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: noteMarkdown }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Save failed');
    }
    appState.currentDetailRaw = noteMarkdown;
    if (noteText) noteText.value = '';
    const noteForm = document.getElementById('detail-note-form');
    if (noteForm) noteForm.classList.add('hidden');
    const noteBtn = document.getElementById('detail-note');
    if (noteBtn) noteBtn.textContent = '+ Note';
    showDetail(id);
  } catch (err) {
    console.error('Failed to append note:', err);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Append note'; }
  }
}

export async function saveDetailContent() {
  const id = document.getElementById('detail-id').textContent;
  if (!id || appState.currentDetailRaw === null) return;

  const content = document.getElementById('detail-content');
  const textarea = content.querySelector('textarea.detail-edit-textarea');
  const newMarkdown = textarea ? textarea.value : appState.currentDetailRaw;

  const saveBtn = document.getElementById('detail-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const res = await fetch('/api/detail/' + id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: newMarkdown }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Save failed');
    }
    appState.currentDetailRaw = newMarkdown;
    exitDetailEditMode(false);
    showDetail(id);
  } catch (err) {
    console.error('Failed to save detail:', err);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}
