// Detail panel: show, edit, save
import { appState } from './state.js';
import { syncUrl } from './url.js';

export async function showDetail(id) {
  const panel = document.getElementById('detail-panel');
  const title = document.getElementById('detail-title');
  const content = document.getElementById('detail-content');

  if (appState.detailEditMode) exitDetailEditMode(false);
  appState.currentDetailRaw = null;
  appState.currentDetailHtml = null;
  document.getElementById('detail-edit').classList.add('hidden');

  const item = appState.items.find(i => i.id === id);
  const desc = item ? item.description.replace(/^\[.*?\]\(.*?\)\s*/, '') : id;
  title.textContent = desc || id;
  document.getElementById('detail-id').textContent = id;
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
