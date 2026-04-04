// Standup dialog functions
import { appState } from './state.js';
import { escHtml, descText, descWithRefHtml, descWithRefMarkdown } from './icons.js';
import { TOOL_LABELS } from './icons.js';

export async function showStandupDialog() {
  const dialog = document.getElementById('standup-dialog');
  appState.standupReportLoaded = false;
  appState.currentStandupReport = null;
  appState.standupClaudeLoaded = false;
  dialog.show();
  await switchStandupTab('claude');
}

export function closeStandupDialog() {
  document.getElementById('standup-dialog').hide();
}

export async function switchStandupTab(tab) {
  appState.activeStandupTab = tab;
  // sl-tab-group handles tab UI state; just load content as needed
  if (tab === 'report' && !appState.standupReportLoaded) {
    appState.standupReportLoaded = true;
    await loadStandupReport();
  } else if (tab === 'claude' && !appState.standupClaudeLoaded) {
    appState.standupClaudeLoaded = true;
    // Try cache first
    try {
      const res = await fetch('/api/standup/claude');
      if (res.ok) {
        const cache = await res.json();
        if (cache.output) {
          displayStandupClaudeReport(cache.output, cache.generatedAt);
          return;
        }
      }
    } catch {}
    generateStandupWithClaude();
  }
}

async function loadStandupReport() {
  const content = document.getElementById('standup-tab-report');
  content.innerHTML = '<p style="padding:16px;color:var(--muted)">Loading...</p>';
  try {
    const res = await fetch('/api/standup');
    if (!res.ok) throw new Error(await res.text());
    const report = await res.json();
    appState.currentStandupReport = report;
    content.innerHTML = '';
    content.appendChild(renderStandupReport(report));
  } catch (err) {
    appState.currentStandupReport = null;
    content.innerHTML = '<p style="padding:16px;color:var(--status-fail)">Error loading report: ' + err.message + '</p>';
  }
}

export function displayStandupClaudeReport(output, generatedAt) {
  const outputEl = document.getElementById('standup-claude-output');
  const rendered = document.getElementById('standup-claude-rendered');
  const spinner = document.getElementById('standup-claude-spinner');
  const btn = document.getElementById('standup-claude-generate');
  const timeEl = document.getElementById('standup-claude-generated-at');

  appState.standupClaudeRawOutput = output || '';
  spinner.classList.add('hidden');
  outputEl.classList.add('hidden');
  outputEl.classList.remove('claude-error');
  btn.disabled = false;
  btn.classList.remove('hidden');

  if (appState.standupClaudeRawOutput.trim()) {
    rendered.innerHTML = renderSimpleMarkdown(appState.standupClaudeRawOutput);
    rendered.classList.remove('hidden');
  } else {
    rendered.classList.add('hidden');
  }

  if (generatedAt) {
    const d = new Date(generatedAt);
    timeEl.textContent = 'Generated ' + d.toLocaleString();
    timeEl.classList.remove('hidden');
  } else {
    timeEl.classList.add('hidden');
  }
}

export async function generateStandupWithClaude() {
  const output = document.getElementById('standup-claude-output');
  const rendered = document.getElementById('standup-claude-rendered');
  const spinner = document.getElementById('standup-claude-spinner');
  const spinnerLabel = document.getElementById('standup-claude-spinner-label');
  const btn = document.getElementById('standup-claude-generate');
  const timeEl = document.getElementById('standup-claude-generated-at');

  appState.standupClaudeRawOutput = '';
  output.textContent = '';
  output.classList.remove('hidden');
  output.classList.remove('claude-error');
  rendered.classList.add('hidden');
  rendered.innerHTML = '';
  spinner.classList.remove('hidden');
  spinnerLabel.textContent = 'Thinking...';
  timeEl.classList.add('hidden');
  btn.classList.add('hidden');
  btn.disabled = true;

  try {
    const res = await fetch('/api/standup/claude', { method: 'POST' });
    if (!res.ok) {
      spinner.classList.add('hidden');
      output.classList.add('claude-error');
      output.textContent = 'Error: ' + (await res.text());
      btn.disabled = false;
      btn.classList.remove('hidden');
    }
    // Output streams via WebSocket standup-status messages
  } catch (err) {
    spinner.classList.add('hidden');
    output.classList.add('claude-error');
    output.textContent = 'Error: ' + err.message;
    btn.disabled = false;
    btn.classList.remove('hidden');
  }
}

export function handleStandupStatus(data) {
  const output = document.getElementById('standup-claude-output');
  const spinner = document.getElementById('standup-claude-spinner');
  const spinnerLabel = document.getElementById('standup-claude-spinner-label');
  const btn = document.getElementById('standup-claude-generate');

  if (data.status === 'running') {
    if (data.activity) {
      const label = TOOL_LABELS[data.activity] || ('Using ' + data.activity);
      spinnerLabel.textContent = label + '...';
    }
  } else if (data.status === 'done') {
    displayStandupClaudeReport(data.output || '', new Date().toISOString());
  } else if (data.status === 'error') {
    spinner.classList.add('hidden');
    output.classList.remove('hidden');
    output.classList.add('claude-error');
    output.textContent += (output.textContent ? '\n' : '') + 'Error: ' + data.output;
    btn.disabled = false;
    btn.classList.remove('hidden');
  }
}

export async function copyStandupReport() {
  const btn = document.getElementById('standup-copy-btn');
  let text = '';

  if (appState.activeStandupTab === 'report') {
    if (!appState.currentStandupReport) return;
    text = formatReportAsMarkdown(appState.currentStandupReport);
  } else {
    text = appState.standupClaudeRawOutput || '';
    if (!text.trim()) return;
  }

  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }
}

function formatReportAsMarkdown(report) {
  const lines = [];

  lines.push(`**Yesterday (${report.yesterdayDate})**`);
  lines.push('');

  const yesterdayItems = [];

  for (const item of report.yesterday.done) {
    if (item.subItems && item.subItems.length > 0) {
      yesterdayItems.push({ text: `Completed ${descWithRefMarkdown(item.description)}`, subItems: item.subItems });
    } else if (item.type === 'PR') {
      yesterdayItems.push({ text: `Merged ${descWithRefMarkdown(item.description)}` });
    } else {
      yesterdayItems.push({ text: `Completed ${descWithRefMarkdown(item.description)}` });
    }
  }

  const doneDescs = new Set(report.yesterday.done.map(d => descText(d.description).toLowerCase()));
  for (const a of report.yesterday.githubActivity) {
    if (doneDescs.has(a.title.toLowerCase())) continue;
    const ref = a.repo.split('/').pop() + '#' + a.url.match(/\/(\d+)$/)?.[1];
    yesterdayItems.push({ text: `${capitalize(a.action)} [${ref}](${a.url}) ${a.title}` });
  }

  const coveredDescs = new Set([...report.yesterday.done.map(d => d.description)]);
  for (const c of report.yesterday.statusChanges) {
    if (coveredDescs.has(c.description)) continue;
    yesterdayItems.push({ text: `${descWithRefMarkdown(c.description)} (${c.oldStatus} → ${c.newStatus})` });
  }

  if (yesterdayItems.length === 0) {
    lines.push('_Nothing recorded_');
  } else {
    for (const item of yesterdayItems) {
      lines.push(`- ${item.text}`);
      if (item.subItems) {
        for (const sub of item.subItems) {
          const shortRepo = sub.repo.split('/').pop();
          const kind = sub.githubUrl.includes('/issues/') ? 'issues' : 'pull';
          const url = `https://github.com/${sub.repo}/${kind}/${sub.number}`;
          const statusSuffix = sub.status.toLowerCase().includes('merged') ? ' (merged)' : '';
          lines.push(`  - [${shortRepo}#${sub.number}](${url}) ${sub.title}${statusSuffix}`);
        }
      }
    }
  }

  lines.push('');
  lines.push(`**Today (${report.date})**`);
  lines.push('');

  const todayItems = [];

  for (const item of report.today.highPriority) {
    const action = actionForType(item.type, item.status);
    const entry = { text: `${action} ${descWithRefMarkdown(item.description)}`, subItems: item.subItems };
    todayItems.push(entry);
  }

  if (report.today.needsReview && report.today.needsReview.length > 0) {
    for (const item of report.today.needsReview) {
      if (todayItems.some(t => t.text.includes(descText(item.description)))) continue;
      todayItems.push({ text: `**Needs review:** ${descWithRefMarkdown(item.description)}` });
    }
  }

  for (const item of report.today.overdue) {
    todayItems.push({ text: `${descWithRefMarkdown(item.description)} _(overdue, due ${item.due})_` });
  }

  for (const item of report.today.dueToday) {
    todayItems.push({ text: `${descWithRefMarkdown(item.description)} _(due today)_` });
  }

  for (const item of report.today.blocked) {
    todayItems.push({ text: `**Blocked:** ${descWithRefMarkdown(item.description)}` });
  }

  if (todayItems.length === 0) {
    lines.push('_Nothing high priority_');
  } else {
    for (const item of todayItems) {
      lines.push(`- ${item.text}`);
      if (item.subItems && item.subItems.length > 0) {
        for (const sub of item.subItems) {
          const shortRepo = sub.repo.split('/').pop();
          const kind = sub.githubUrl.includes('/issues/') ? 'issues' : 'pull';
          const url = `https://github.com/${sub.repo}/${kind}/${sub.number}`;
          lines.push(`  - [${shortRepo}#${sub.number}](${url}) ${sub.title} (${sub.status})`);
        }
      }
    }
  }

  return lines.join('\n');
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function actionForType(type, status) {
  const s = (status || '').toLowerCase();
  if (type === 'Review') return 'Review';
  if (type === 'PR') {
    if (s.includes('approved')) return 'Merge';
    if (s.includes('changes requested')) return 'Address feedback on';
    if (s.includes('draft')) return 'Continue work on';
    return 'Work on';
  }
  if (type === 'Issue') return 'Work on';
  if (type === 'Workstream') return 'Continue';
  return 'Work on';
}

function renderStandupReport(report) {
  const root = document.createElement('div');

  const ySection = document.createElement('div');
  ySection.className = 'standup-section';

  const yHeading = document.createElement('h3');
  yHeading.className = 'standup-day-heading';
  yHeading.textContent = `Yesterday (${report.yesterdayDate})`;
  ySection.appendChild(yHeading);

  const doneSection = document.createElement('div');
  doneSection.className = 'standup-section';
  const doneTitle = document.createElement('div');
  doneTitle.className = 'standup-section-title';
  doneTitle.textContent = 'Completed';
  doneSection.appendChild(doneTitle);

  if (report.yesterday.done.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'standup-empty';
    empty.textContent = 'No items completed';
    doneSection.appendChild(empty);
  } else {
    const ul = document.createElement('ul');
    ul.className = 'standup-list';
    for (const item of report.yesterday.done) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="standup-item-desc">${descWithRefHtml(item.description)}</span>` +
        `<span class="standup-item-badge">${escHtml(item.type)}</span>`;
      ul.appendChild(li);
    }
    doneSection.appendChild(ul);
  }
  ySection.appendChild(doneSection);

  if (report.yesterday.statusChanges.length > 0) {
    const changesSection = document.createElement('div');
    changesSection.className = 'standup-section';
    const changesTitle = document.createElement('div');
    changesTitle.className = 'standup-section-title';
    changesTitle.textContent = 'Status Changes';
    changesSection.appendChild(changesTitle);
    const ul = document.createElement('ul');
    ul.className = 'standup-list';
    for (const c of report.yesterday.statusChanges) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="standup-item-desc">${descWithRefHtml(c.description)}</span>` +
        `<span class="standup-arrow">${escHtml(c.oldStatus)} → ${escHtml(c.newStatus)}</span>`;
      ul.appendChild(li);
    }
    changesSection.appendChild(ul);
    ySection.appendChild(changesSection);
  }

  if (report.yesterday.githubActivity.length > 0) {
    const ghSection = document.createElement('div');
    ghSection.className = 'standup-section';
    const ghTitle = document.createElement('div');
    ghTitle.className = 'standup-section-title';
    ghTitle.textContent = 'GitHub Activity';
    ghSection.appendChild(ghTitle);
    const ul = document.createElement('ul');
    ul.className = 'standup-list';
    for (const a of report.yesterday.githubActivity) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="standup-item-badge">${escHtml(a.action)}</span>` +
        `<span class="standup-item-desc"><a href="${escHtml(a.url)}" target="_blank" rel="noopener">${escHtml(a.title)}</a></span>` +
        `<span class="standup-item-id">${escHtml(a.repo)}</span>`;
      ul.appendChild(li);
    }
    ghSection.appendChild(ul);
    ySection.appendChild(ghSection);
  }

  root.appendChild(ySection);

  const tSection = document.createElement('div');
  tSection.className = 'standup-section';

  const tHeading = document.createElement('h3');
  tHeading.className = 'standup-day-heading';
  tHeading.textContent = `Today (${report.date})`;
  tSection.appendChild(tHeading);

  const hpSection = document.createElement('div');
  hpSection.className = 'standup-section';
  const hpTitle = document.createElement('div');
  hpTitle.className = 'standup-section-title';
  hpTitle.textContent = 'High Priority (P0/P1)';
  hpSection.appendChild(hpTitle);

  if (report.today.highPriority.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'standup-empty';
    empty.textContent = 'No high priority items';
    hpSection.appendChild(empty);
  } else {
    const ul = document.createElement('ul');
    ul.className = 'standup-list';
    for (const item of report.today.highPriority) {
      const li = document.createElement('li');
      const priorityCls = item.priority.toLowerCase();
      li.innerHTML = `<span class="standup-item-badge ${priorityCls}">${escHtml(item.priority)}</span>` +
        `<span class="standup-item-desc">${descWithRefHtml(item.description)}</span>` +
        `<span class="standup-arrow">${escHtml(item.status)}</span>`;
      ul.appendChild(li);
    }
    hpSection.appendChild(ul);
  }
  tSection.appendChild(hpSection);

  if (report.today.needsReview && report.today.needsReview.length > 0) {
    const nrSection = document.createElement('div');
    nrSection.className = 'standup-section';
    const nrTitle = document.createElement('div');
    nrTitle.className = 'standup-section-title';
    nrTitle.textContent = 'Awaiting Review';
    nrSection.appendChild(nrTitle);
    const ul = document.createElement('ul');
    ul.className = 'standup-list';
    for (const item of report.today.needsReview) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="standup-item-badge">${escHtml(item.priority)}</span>` +
        `<span class="standup-item-desc">${descWithRefHtml(item.description)}</span>`;
      ul.appendChild(li);
    }
    nrSection.appendChild(ul);
    tSection.appendChild(nrSection);
  }

  if (report.today.overdue.length > 0) {
    const odSection = document.createElement('div');
    odSection.className = 'standup-section';
    const odTitle = document.createElement('div');
    odTitle.className = 'standup-section-title';
    odTitle.textContent = 'Overdue';
    odSection.appendChild(odTitle);
    const ul = document.createElement('ul');
    ul.className = 'standup-list';
    for (const item of report.today.overdue) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="standup-item-desc">${descWithRefHtml(item.description)}</span>` +
        `<span class="standup-item-badge" style="color:var(--status-fail)">due ${escHtml(item.due)}</span>`;
      ul.appendChild(li);
    }
    odSection.appendChild(ul);
    tSection.appendChild(odSection);
  }

  if (report.today.dueToday.length > 0) {
    const dtSection = document.createElement('div');
    dtSection.className = 'standup-section';
    const dtTitle = document.createElement('div');
    dtTitle.className = 'standup-section-title';
    dtTitle.textContent = 'Due Today';
    dtSection.appendChild(dtTitle);
    const ul = document.createElement('ul');
    ul.className = 'standup-list';
    for (const item of report.today.dueToday) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="standup-item-desc">${descWithRefHtml(item.description)}</span>` +
        `<span class="standup-item-badge">${escHtml(item.priority)}</span>`;
      ul.appendChild(li);
    }
    dtSection.appendChild(ul);
    tSection.appendChild(dtSection);
  }

  if (report.today.blocked.length > 0) {
    const blSection = document.createElement('div');
    blSection.className = 'standup-section';
    const blTitle = document.createElement('div');
    blTitle.className = 'standup-section-title';
    blTitle.textContent = 'Blocked';
    blSection.appendChild(blTitle);
    const ul = document.createElement('ul');
    ul.className = 'standup-list';
    for (const item of report.today.blocked) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="standup-item-desc">${descWithRefHtml(item.description)}</span>`;
      ul.appendChild(li);
    }
    blSection.appendChild(ul);
    tSection.appendChild(blSection);
  }

  root.appendChild(tSection);
  return root;
}

function inlineMarkdown(text) {
  const parts = [];
  let i = 0;
  let plain = '';

  while (i < text.length) {
    if (text[i] === '[') {
      const closeB = text.indexOf(']', i);
      if (closeB !== -1 && text[closeB + 1] === '(') {
        const closeP = text.indexOf(')', closeB + 2);
        if (closeP !== -1) {
          if (plain) { parts.push(escHtml(plain)); plain = ''; }
          const linkText = text.slice(i + 1, closeB);
          const url = text.slice(closeB + 2, closeP);
          parts.push(`<a href="${escHtml(url)}" target="_blank" rel="noopener">${escHtml(linkText)}</a>`);
          i = closeP + 1;
          continue;
        }
      }
    }
    if (text.slice(i, i + 2) === '**') {
      const end = text.indexOf('**', i + 2);
      if (end !== -1) {
        if (plain) { parts.push(escHtml(plain)); plain = ''; }
        parts.push(`<strong>${escHtml(text.slice(i + 2, end))}</strong>`);
        i = end + 2;
        continue;
      }
    }
    if (text[i] === '*' && text[i - 1] !== '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1);
      if (end !== -1 && text[end - 1] !== '*' && text[end + 1] !== '*') {
        if (plain) { parts.push(escHtml(plain)); plain = ''; }
        parts.push(`<em>${escHtml(text.slice(i + 1, end))}</em>`);
        i = end + 1;
        continue;
      }
    }
    plain += text[i];
    i++;
  }
  if (plain) parts.push(escHtml(plain));
  return parts.join('');
}

function renderSimpleMarkdown(text) {
  const lines = text.split('\n');
  const blocks = [];
  let listItems = [];
  let paraLines = [];

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push('<ul class="standup-md-list">' + listItems.map(i => `<li>${i}</li>`).join('') + '</ul>');
    listItems = [];
  }

  function flushPara() {
    if (paraLines.length === 0) return;
    const content = paraLines.join(' ').trim();
    if (content) blocks.push(`<p>${inlineMarkdown(content)}</p>`);
    paraLines = [];
  }

  for (const line of lines) {
    const hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      flushList(); flushPara();
      const level = hMatch[1].length;
      blocks.push(`<h${level} class="standup-md-h">${inlineMarkdown(hMatch[2])}</h${level}>`);
      continue;
    }
    const listMatch = line.match(/^[•\-\*]\s+(.*)/);
    if (listMatch) {
      flushPara();
      listItems.push(inlineMarkdown(listMatch[1]));
      continue;
    }
    if (line.trim() === '') {
      flushList(); flushPara();
      continue;
    }
    flushList();
    paraLines.push(line);
  }
  flushList(); flushPara();
  return blocks.join('\n');
}
