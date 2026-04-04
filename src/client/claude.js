// Claude prompt panel functions
import { TOOL_LABELS } from './icons.js';

// Prompt history (persisted in localStorage)
const HISTORY_KEY = 'claude-prompt-history';
const MAX_HISTORY = 100;
let promptHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
let historyIndex = -1;
let savedInput = '';

export function pushHistory(prompt) {
  if (!prompt.trim()) return;
  if (promptHistory.length > 0 && promptHistory[promptHistory.length - 1] === prompt) return;
  promptHistory.push(prompt);
  if (promptHistory.length > MAX_HISTORY) promptHistory.shift();
  localStorage.setItem(HISTORY_KEY, JSON.stringify(promptHistory));
}

export function resetHistoryNav() {
  historyIndex = -1;
  savedInput = '';
}

export function getHistory() {
  return promptHistory;
}

export function getHistoryIndex() {
  return historyIndex;
}

export function getSavedInput() {
  return savedInput;
}

export function navigateHistory(direction, currentValue) {
  if (direction === 'up') {
    if (historyIndex === -1) savedInput = currentValue;
    if (historyIndex < promptHistory.length - 1) {
      historyIndex++;
      return promptHistory[promptHistory.length - 1 - historyIndex];
    }
    return null;
  } else if (direction === 'down') {
    if (historyIndex > 0) {
      historyIndex--;
      return promptHistory[promptHistory.length - 1 - historyIndex];
    } else if (historyIndex === 0) {
      historyIndex = -1;
      return savedInput;
    }
    return null;
  }
  return null;
}

export async function sendClaudePrompt(prompt) {
  if (!prompt.trim()) return;

  const output = document.getElementById('claude-output');
  const spinner = document.getElementById('claude-spinner');
  const sendBtn = document.getElementById('claude-send');
  output.classList.add('hidden');
  output.textContent = '';
  spinner.classList.remove('hidden');
  sendBtn.disabled = true;

  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    if (!res.ok) {
      spinner.classList.add('hidden');
      output.classList.remove('hidden');
      output.textContent = 'Error: ' + (await res.text());
      output.classList.add('claude-error');
      sendBtn.disabled = false;
    }
    // Output streams via WebSocket claude-status messages; button re-enabled on done/error
  } catch (err) {
    spinner.classList.add('hidden');
    output.classList.remove('hidden');
    output.textContent = 'Error: ' + err.message;
    output.classList.add('claude-error');
    sendBtn.disabled = false;
  }
}

export function handleClaudeStatus(data) {
  const output = document.getElementById('claude-output');
  const spinner = document.getElementById('claude-spinner');
  if (data.status === 'running') {
    if (data.activity) {
      const label = TOOL_LABELS[data.activity] || ('Using ' + data.activity);
      spinner.innerHTML = '<span class="spinner"></span> ' + label + '...';
      spinner.classList.remove('hidden');
    }
    if (data.output) {
      output.classList.remove('hidden');
      output.textContent += data.output;
    }
  } else if (data.status === 'done') {
    spinner.classList.add('hidden');
    document.getElementById('claude-send').disabled = false;
  } else if (data.status === 'error') {
    spinner.classList.add('hidden');
    output.classList.remove('hidden');
    output.classList.add('claude-error');
    output.textContent += (output.textContent ? '\n' : '') + 'Error: ' + data.output;
    document.getElementById('claude-send').disabled = false;
  }
}
