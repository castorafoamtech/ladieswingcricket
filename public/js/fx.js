// Sound, confetti, toast, count-up
let ctx; let enabled = localStorage.getItem('sound') !== 'off';
export const soundOn = () => enabled;
export function setSound(v) { enabled = v; localStorage.setItem('sound', v ? 'on' : 'off'); if (v) sfx.tick(); }
function ac() {
  try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; } catch { return null; }
}
function tone(f, t0, d, type = 'sine', v = 0.18, slide) {
  const c = ac(); if (!c || !enabled) return;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, c.currentTime + t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, c.currentTime + t0 + d);
  g.gain.setValueAtTime(0.0001, c.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(v, c.currentTime + t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + d);
  o.connect(g).connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + d + 0.05);
}
function noise(t0, d, v = 0.25, hp = 800) {
  const c = ac(); if (!c || !enabled) return;
  const n = Math.floor(c.sampleRate * d); const buf = c.createBuffer(1, n, c.sampleRate); const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = c.createGain(); g.gain.value = v;
  s.connect(f).connect(g).connect(c.destination); s.start(c.currentTime + t0);
}
export const sfx = {
  tick() { tone(880, 0, 0.06, 'square', 0.05); },
  bid() { tone(660, 0, 0.09, 'triangle', 0.2); tone(990, 0.08, 0.16, 'triangle', 0.2); },
  undo() { tone(500, 0, 0.14, 'sawtooth', 0.1, 260); },
  reveal() { noise(0, 0.5, 0.12, 2000); tone(220, 0, 0.5, 'sawtooth', 0.07, 880); tone(880, 0.5, 0.25, 'triangle', 0.15); },
  sold() { noise(0, 0.12, 0.5, 200); tone(140, 0, 0.3, 'sine', 0.5, 60); [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25 + i * 0.09, 0.5, 'triangle', 0.16)); tone(1568, 0.7, 0.9, 'sine', 0.12); },
  unsold() { tone(330, 0, 0.28, 'sawtooth', 0.12, 140); tone(220, 0.25, 0.5, 'sawtooth', 0.1, 90); },
  drum() { for (let i = 0; i < 14; i++) tone(300 + i * 25, i * 0.11, 0.05, 'square', 0.035); },
};

/* ---------- confetti ---------- */
let cv; let cx; let parts = []; let raf;
function ensureCanvas() {
  cv = cv || document.getElementById('fx');
  if (!cv) return false;
  cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
  cx = cv.getContext('2d'); return true;
}
export function confetti(colors = ['#e6f514', '#ffffff', '#1d6bff', '#2fe38a'], count = 220, power = 1) {
  if (!ensureCanvas()) return;
  const W = cv.width, H = cv.height, d = devicePixelRatio;
  for (let i = 0; i < count; i++) {
    const fromLeft = i % 2 === 0;
    parts.push({
      x: (fromLeft ? 0 : W) + (fromLeft ? 1 : -1) * 10, y: H * (0.55 + Math.random() * 0.25),
      vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 14) * d * power, vy: -(10 + Math.random() * 18) * d * power,
      g: 0.32 * d, w: (6 + Math.random() * 8) * d, h: (4 + Math.random() * 7) * d, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: colors[(Math.random() * colors.length) | 0], life: 0,
    });
  }
  for (let i = 0; i < count / 2; i++) {
    parts.push({ x: W / 2 + (Math.random() - 0.5) * W * 0.5, y: -20, vx: (Math.random() - 0.5) * 4 * d, vy: (2 + Math.random() * 5) * d, g: 0.12 * d, w: (5 + Math.random() * 7) * d, h: (4 + Math.random() * 6) * d, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: colors[(Math.random() * colors.length) | 0], life: 0 });
  }
  if (!raf) raf = requestAnimationFrame(step);
}
function step() {
  cx.clearRect(0, 0, cv.width, cv.height);
  parts = parts.filter((p) => p.y < cv.height + 40 && p.life < 330);
  for (const p of parts) {
    p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.992; p.r += p.vr; p.life++;
    cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.globalAlpha = Math.min(1, (330 - p.life) / 60);
    cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore();
  }
  raf = parts.length ? requestAnimationFrame(step) : (cx.clearRect(0, 0, cv.width, cv.height), null);
}

/* ---------- toasts ---------- */
export function toast(msg, kind = '') {
  const box = document.getElementById('toasts'); if (!box) return;
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.style.transition = '.4s'; el.style.opacity = 0; el.style.transform = 'translateX(30px)'; setTimeout(() => el.remove(), 400); }, 3200);
}

/* ---------- count-up ---------- */
export function countTo(el, to, fmt = (n) => String(Math.round(n)), ms = 650) {
  const from = Number(el.dataset.v || 0); to = Number(to) || 0;
  if (from === to) { el.textContent = fmt(to); el.dataset.v = to; return; }
  const t0 = performance.now(); el.dataset.v = to;
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
export function popEl(el, cls = 'pop') { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
