// Subtle sound effects via Web Audio API (no external files needed)
// Opt-in: disabled by default, persisted in localStorage.

const STORAGE_KEY = 'todo-sounds';

let _ctx = null;
function getCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}

export function isSoundEnabled() {
  try { return localStorage.getItem(STORAGE_KEY) === 'on'; } catch { return false; }
}

export function toggleSound() {
  const next = isSoundEnabled() ? 'off' : 'on';
  try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  updateSoundBtn();
  if (next === 'on') playSound('enable');
}

function updateSoundBtn() {
  const btn = document.getElementById('sound-btn');
  if (!btn) return;
  const on = isSoundEnabled();
  btn.textContent = on ? '🔊' : '🔇';
  btn.title = on ? 'Sound on — click to mute' : 'Sound off — click to enable';
}

export function initSoundBtn() {
  const btn = document.createElement('button');
  btn.id = 'sound-btn';
  btn.className = 'btn-icon';
  btn.addEventListener('click', toggleSound);
  updateSoundBtn();

  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.parentNode.insertBefore(btn, themeBtn);
}

/**
 * Play a named sound effect (no-op if sounds disabled or Web Audio unavailable).
 * type: 'done' | 'undo' | 'new' | 'error' | 'enable'
 */
export function playSound(type) {
  if (type !== 'enable' && !isSoundEnabled()) return;
  if (typeof window === 'undefined' || !window.AudioContext && !window.webkitAudioContext) return;
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    SOUNDS[type]?.(ctx);
  } catch { /* audio blocked — ignore */ }
}

// Sound definitions
const SOUNDS = {
  done: (ctx) => {
    // Cheerful ascending two-tone chime
    playTone(ctx, 523.25, 'sine', 0.15, 0, 0.01, 0.15); // C5
    playTone(ctx, 783.99, 'sine', 0.12, 0.1, 0.01, 0.2); // G5
  },

  undo: (ctx) => {
    // Descending two-tone
    playTone(ctx, 783.99, 'sine', 0.1, 0, 0.01, 0.1);
    playTone(ctx, 523.25, 'sine', 0.08, 0.08, 0.01, 0.15);
  },

  new: (ctx) => {
    // Soft ping
    playTone(ctx, 1046.5, 'sine', 0.08, 0, 0.005, 0.25);
  },

  error: (ctx) => {
    // Low buzzy tone
    playTone(ctx, 220, 'sawtooth', 0.06, 0, 0.005, 0.1);
  },

  enable: (ctx) => {
    // Quick ascending scale snippet
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      playTone(ctx, freq, 'sine', 0.1, i * 0.07, 0.005, 0.12);
    });
  },
};

function playTone(ctx, freq, type, gain, startDelay, attack, decay) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  gainNode.gain.setValueAtTime(0, now + startDelay);
  gainNode.gain.linearRampToValueAtTime(gain, now + startDelay + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + startDelay + attack + decay);

  osc.start(now + startDelay);
  osc.stop(now + startDelay + attack + decay + 0.05);
}
