// Confetti celebration burst — pure canvas, no external library

function spawnBurst(canvas, ctx, x, y, count, speedMultiplier, duration) {
  const colors = ['#e53e3e', '#dd6b20', '#d69e2e', '#38a169', '#3182ce', '#805ad5', '#d53f8c', '#ed64a6'];
  const particles = [];

  for (let i = 0; i < count; i++) {
    const angle = (Math.random() * Math.PI * 1.4) - (Math.PI * 1.2);
    const speed = (4 + Math.random() * 8) * speedMultiplier;
    particles.push({
      x: x + (Math.random() - 0.5) * 60,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2 * speedMultiplier,
      color: colors[Math.floor(Math.random() * colors.length)],
      width: 6 + Math.random() * 6,
      height: 4 + Math.random() * 4,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
      opacity: 1,
      shape: Math.random() > 0.7 ? 'circle' : 'rect',
    });
  }

  const gravity = 0.3;
  const startTime = Date.now();

  function animate() {
    const elapsed = Date.now() - startTime;
    if (elapsed > duration) return;

    for (const p of particles) {
      p.vy += gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.opacity = Math.max(0, 1 - (elapsed / duration));

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
      }
      ctx.restore();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

export function triggerConfetti(priority) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');

  const isP0 = priority === 'P0';
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.8;
  const duration = isP0 ? 3500 : 2000;

  if (isP0) {
    // P0 celebration: multiple bursts from different positions
    spawnBurst(canvas, ctx, cx, cy, 150, 1.4, duration);
    setTimeout(() => spawnBurst(canvas, ctx, cx * 0.4, cy, 80, 1.2, duration - 300), 200);
    setTimeout(() => spawnBurst(canvas, ctx, cx * 1.6, cy, 80, 1.2, duration - 300), 400);
    // Burst from top
    setTimeout(() => spawnBurst(canvas, ctx, cx, 20, 60, 0.8, duration - 500), 600);
  } else {
    spawnBurst(canvas, ctx, cx, cy, 80, 1, duration);
  }

  setTimeout(() => canvas.remove(), duration + 100);
}
