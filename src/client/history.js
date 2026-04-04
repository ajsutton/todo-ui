// Tracks a rolling history of active item counts and priority breakdown
// in localStorage, used to render a mini sparkline in the stats bar.

const HISTORY_KEY = 'todo-count-history';
const MAX_POINTS = 48; // ~2 days at 30min intervals

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

function saveHistory(h) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}

export function recordSnapshot(activeCount, p0Count, p1Count) {
  const history = loadHistory();
  const now = Date.now();
  // Throttle: only record if last point was >15min ago
  if (history.length > 0 && now - history[history.length - 1].t < 15 * 60000) {
    // Update the latest point instead
    history[history.length - 1] = { t: now, n: activeCount, p0: p0Count, p1: p1Count };
  } else {
    history.push({ t: now, n: activeCount, p0: p0Count, p1: p1Count });
    if (history.length > MAX_POINTS) history.shift();
  }
  saveHistory(history);
  return history;
}

export function getHistory() {
  return loadHistory();
}

// Render a tiny SVG sparkline from an array of { n } points
export function renderSparkline(points, width = 80, height = 20) {
  if (points.length < 2) return '';
  const values = points.map(p => p.n);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xStep = width / (points.length - 1);

  const coords = values.map((v, i) => {
    const x = i * xStep;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    <polyline points="${coords.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
