// Confetti burst — plain DOM, cleaned up automatically.

const COLORS = ['#F2C200', '#E24B4A', '#2E86D8', '#2C8C4B', '#D6338F', '#FF8C42', '#8E6BE8'];

export function confettiBurst(big = false) {
  const n = big ? 110 : 60;
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:100;overflow:hidden;';
  document.body.appendChild(container);
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    const size = 6 + Math.random() * 8;
    const left = Math.random() * 100;
    const delay = Math.random() * 0.35;
    const dur = 1.1 + Math.random() * 1.1;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const spin = Math.random() > 0.5 ? 720 : -720;
    p.style.cssText = `position:absolute;top:-20px;left:${left}vw;width:${size}px;height:${size * 0.45}px;background:${color};border-radius:2px;animation:confetti-fall ${dur}s ${delay}s cubic-bezier(.2,.6,.4,1) forwards;--spin:${spin}deg;`;
    container.appendChild(p);
  }
  setTimeout(() => container.remove(), 3200);
}
