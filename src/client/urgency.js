// Urgency score computation — combines priority, due date, and GitHub status
// into a single 0–100 score for sorting and display.

const PRIORITY_BASE = { P0: 100, P1: 85, P2: 70, P3: 50, P4: 30, P5: 15 };

export function computeUrgency(item) {
  if (item.doneDate) return 0;
  if (item.blocked) return 0;

  let score = PRIORITY_BASE[item.priority] ?? 10;
  const today = new Date().toISOString().slice(0, 10);
  const sl = (item.status || '').toLowerCase();

  // Due date factor
  if (item.due) {
    const daysUntilDue = Math.round((new Date(item.due) - new Date(today)) / 86400000);
    if (daysUntilDue < 0) score = Math.min(100, score + Math.min(Math.abs(daysUntilDue) * 3, 30));
    else if (daysUntilDue === 0) score = Math.min(100, score + 20);
    else if (daysUntilDue <= 3) score = Math.min(100, score + 10);
  }

  // GitHub status factor
  if (sl.includes('approved') && sl.includes('ci passing')) score = Math.min(100, score + 20);
  else if (sl.includes('changes requested')) score = Math.min(100, score + 15);
  else if (sl.includes('failing')) score = Math.min(100, score + 12);
  else if (sl.includes('approved')) score = Math.min(100, score + 8);
  else if (sl.includes('draft')) score = Math.max(0, score - 10);

  return Math.round(Math.min(100, Math.max(0, score)));
}

// Color for the urgency score (green → yellow → orange → red)
export function urgencyColor(score) {
  if (score >= 90) return 'var(--p0)';
  if (score >= 70) return 'var(--p1)';
  if (score >= 50) return 'var(--p2)';
  if (score >= 30) return 'var(--p3)';
  return 'var(--p4)';
}
