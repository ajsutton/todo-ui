// Smart "What to work on next?" — scores active items and picks the best one.
// Entirely client-side, no AI required. Uses a scoring heuristic.
import { appState } from './state.js';

const PRIORITY_SCORE = { P0: 100, P1: 80, P2: 60, P3: 40, P4: 20, P5: 10 };

function scoreItem(item, today) {
  if (item.doneDate || item.blocked) return -Infinity;

  let score = PRIORITY_SCORE[item.priority] ?? 5;

  // Boost for overdue
  if (item.due && item.due < today) {
    const daysOverdue = Math.round((new Date(today) - new Date(item.due)) / 86400000);
    score += Math.min(daysOverdue * 5, 40);
  }
  // Boost for due soon
  if (item.due && item.due >= today) {
    const daysUntilDue = Math.round((new Date(item.due) - new Date(today)) / 86400000);
    if (daysUntilDue <= 1) score += 30;
    else if (daysUntilDue <= 3) score += 15;
    else if (daysUntilDue <= 7) score += 5;
  }

  // Status-based boosts
  const sl = (item.status || '').toLowerCase();
  if (sl.includes('approved') && sl.includes('ci passing')) score += 35; // ready to merge!
  if (sl.includes('changes requested')) score += 25; // needs action
  if (sl.includes('failing')) score += 20; // CI broken
  if (sl.includes('approved')) score += 15;
  if (sl.includes('merge queue')) score -= 20; // already handled
  if (sl.includes('draft')) score -= 10; // not ready for review

  return score;
}

export function getNextSuggestion() {
  const today = new Date().toISOString().slice(0, 10);
  const active = appState.items.filter(i => !i.doneDate && !i.blocked);
  if (active.length === 0) return null;

  const scored = active.map(i => ({ item: i, score: scoreItem(i, today) }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best.score === -Infinity) return null;

  const reasons = [];
  const item = best.item;
  const sl = (item.status || '').toLowerCase();
  const today2 = today;

  if (sl.includes('approved') && sl.includes('ci passing')) reasons.push('ready to merge');
  else if (sl.includes('changes requested')) reasons.push('changes requested');
  else if (sl.includes('failing')) reasons.push('CI failing');
  else if (sl.includes('approved')) reasons.push('approved');

  if (item.due && item.due < today2) {
    const d = Math.round((new Date(today2) - new Date(item.due)) / 86400000);
    reasons.push(`${d}d overdue`);
  } else if (item.due && item.due === today2) {
    reasons.push('due today');
  }

  if (reasons.length === 0) reasons.push(item.priority);

  return { item, reasons };
}

export function showSuggestionBanner() {
  const existing = document.getElementById('suggestion-banner');
  if (existing) existing.remove();

  const result = getNextSuggestion();
  if (!result) return;

  const { item, reasons } = result;
  const name = item.description.replace(/^\[.*?\]\(.*?\)\s*/, '').slice(0, 80);

  const banner = document.createElement('div');
  banner.id = 'suggestion-banner';
  banner.className = 'suggestion-banner';
  banner.innerHTML = `
    <span class="suggestion-label">👉 Next up:</span>
    <span class="suggestion-item">${name}</span>
    <span class="suggestion-reasons">${reasons.join(' · ')}</span>
    <button class="suggestion-open btn-small">Open</button>
    <button class="suggestion-dismiss btn-icon" title="Dismiss">&times;</button>
  `;

  banner.querySelector('.suggestion-open').onclick = async () => {
    const { showDetail } = await import('./detail.js');
    showDetail(item.id);
  };
  banner.querySelector('.suggestion-dismiss').onclick = () => banner.remove();

  // Insert after filters
  const statsBar = document.getElementById('stats-bar');
  if (statsBar) statsBar.after(banner);
}
