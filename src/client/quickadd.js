// Quick-add: detect GitHub PR/Issue URLs pasted on the page and offer to add them.
// Uses the Claude prompt to do the actual work.

const GH_URL_RE = /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(pull|issues?)\/\d+/i;

function isGitHubUrl(text) {
  return GH_URL_RE.test(text.trim());
}

function extractUrl(text) {
  const m = text.trim().match(GH_URL_RE);
  return m ? m[0] : null;
}

let bannerRemoveTimer = null;

function showQuickAddBanner(url) {
  const existing = document.getElementById('quickadd-banner');
  if (existing) existing.remove();
  clearTimeout(bannerRemoveTimer);

  const banner = document.createElement('div');
  banner.id = 'quickadd-banner';
  banner.className = 'quickadd-banner';

  const isIssue = url.includes('/issues/');
  const parts = url.replace('https://github.com/', '').split('/');
  const ref = parts[0] + '/' + parts[1] + '#' + parts[3];
  const type = isIssue ? 'Issue' : 'PR';

  banner.innerHTML = `
    <span class="quickadd-icon">${isIssue ? '📋' : '🔀'}</span>
    <span class="quickadd-label">Add <strong>${ref}</strong> to TODO list?</span>
    <div class="quickadd-buttons">
      <button class="btn-small quickadd-p0" data-p="P0">P0</button>
      <button class="btn-small quickadd-p1" data-p="P1">P1</button>
      <button class="btn-small quickadd-p2" data-p="P2">P2</button>
      <button class="btn-small quickadd-p3" data-p="P3">P3</button>
    </div>
    <button class="btn-icon quickadd-dismiss" title="Dismiss">&times;</button>
  `;

  banner.querySelectorAll('[data-p]').forEach(btn => {
    btn.addEventListener('click', () => {
      const priority = btn.dataset.p;
      const promptEl = document.getElementById('claude-prompt');
      if (promptEl) {
        promptEl.value = `Add this ${type} to my TODO list at ${priority}: ${url}`;
        promptEl.focus();
        // Auto-submit
        const sendBtn = document.getElementById('claude-send');
        if (sendBtn) sendBtn.click();
      }
      banner.remove();
    });
  });

  banner.querySelector('.quickadd-dismiss').addEventListener('click', () => banner.remove());

  // Insert below header
  const header = document.querySelector('header');
  if (header) header.after(banner);

  // Auto-dismiss after 8s
  bannerRemoveTimer = setTimeout(() => banner.remove(), 8000);
}

export function initQuickAdd() {
  // Listen for paste events anywhere on the page
  document.addEventListener('paste', (e) => {
    // Don't intercept paste in text inputs (let user type normally)
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    const text = e.clipboardData?.getData('text') || '';
    const url = extractUrl(text);
    if (url) {
      e.preventDefault();
      showQuickAddBanner(url);
    }
  });
}

export { isGitHubUrl, extractUrl };
