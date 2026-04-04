// Activity heatmap: last 30 days of completions, shown as colored squares
// Renders as a compact SVG/HTML grid, injected into the stats bar.
import { appState } from './state.js';

export function renderHeatmap(containerEl) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = 35; // 5 weeks

  // Count completions per date
  const counts = {};
  for (const item of appState.items) {
    if (item.doneDate) {
      counts[item.doneDate] = (counts[item.doneDate] || 0) + 1;
    }
  }

  const maxCount = Math.max(...Object.values(counts), 1);

  const cells = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const count = counts[iso] || 0;
    const intensity = count === 0 ? 0 : Math.ceil((count / maxCount) * 4);
    const isToday = iso === today.toISOString().slice(0, 10);
    cells.push({ iso, count, intensity, isToday });
  }

  // Render as a grid of tiny squares (7 cols = 1 week per column)
  const cellSize = 8;
  const gap = 2;
  const cols = Math.ceil(days / 7);
  const rows = 7;
  const w = cols * (cellSize + gap) - gap;
  const h = rows * (cellSize + gap) - gap;

  // Build SVG
  let svg = `<svg class="heatmap-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-label="Completion activity last ${days} days">`;

  cells.forEach((cell, i) => {
    // Fill in from oldest (top-left) to newest (bottom-right), column by column
    const col = Math.floor(i / 7);
    const row = i % 7;
    const x = col * (cellSize + gap);
    const y = row * (cellSize + gap);

    const alpha = cell.intensity === 0 ? 0.12
      : cell.intensity === 1 ? 0.35
      : cell.intensity === 2 ? 0.55
      : cell.intensity === 3 ? 0.75
      : 0.95;

    const color = cell.isToday ? 'var(--accent)' : 'var(--status-pass)';
    const opacity = cell.intensity === 0 ? 0.15 : alpha;
    const title = `${cell.iso}: ${cell.count} completed`;

    svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2"
      fill="${color}" opacity="${opacity}"
      class="heatmap-cell" data-date="${cell.iso}" data-count="${cell.count}">
      <title>${title}</title>
    </rect>`;
  });

  svg += '</svg>';

  containerEl.innerHTML = `<span class="stat-heatmap" title="Completion activity (last ${days} days)">${svg}</span>`;
}
