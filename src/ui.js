'use strict';
/* Verticale — rendu canvas, gestes tactiles, panneaux */
(function () {
const E = window.Engine;
const CW = 40, FH = 56;
const COLS = E.COLS;
const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const eur = (n) => fmt(n) + ' €';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SAVE_KEY = 'verticale-save-v1';
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignoré */ } }
};

/* ───────── couleurs et ciel ───────── */
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mixa = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (a, al) => (al == null ? 'rgb(' : 'rgba(') + Math.round(a[0]) + ',' + Math.round(a[1]) + ',' + Math.round(a[2]) + (al == null ? ')' : ',' + al + ')');
const SKY = [[0, '#0b1330', '#1d2c58'], [5, '#101b40', '#3b4272'], [6.3, '#4f72b8', '#f4b48a'], [7.8, '#6db2ee', '#d2e8f6'], [12, '#4ea5ee', '#bfe3fa'],
  [16.5, '#5aa7e6', '#d6ebf6'], [18.4, '#4a63ad', '#f2a475'], [19.8, '#202c58', '#6d4c7e'], [21.5, '#0b1330', '#1d2c58'], [24, '#0b1330', '#1d2c58']]
  .map((k) => [k[0], hex(k[1]), hex(k[2])]);
function skyAt(h) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const a = SKY[i], b = SKY[i + 1];
    if (h >= a[0] && h <= b[0]) { const t = (h - a[0]) / (b[0] - a[0]); return [mixa(a[1], b[1], t), mixa(a[2], b[2], t)]; }
  }
  return [SKY[0][1], SKY[0][2]];
}
function nightF(h) {
  if (h >= 7.5 && h <= 17.5) return 0;
  if (h >= 20.5 || h <= 5.5) return 1;
  if (h > 17.5) return (h - 17.5) / 3;
  return 1 - (h - 5.5) / 2;
}
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const prng = mulberry(7);
const LAYERS = [0.32, 0.55].map((p, li) => {
  const items = [];
  for (let x = -3200; x < 5200; x += 60 + prng() * 70) items.push({ x, w: 44 + prng() * 60, h: (li ? 90 : 150) + prng() * (li ? 160 : 230), s: prng() });
  return { p, items };
});
const STARS = Array.from({ length: 90 }, () => [prng(), prng() * 0.7, 0.5 + prng() * 1.3]);
const TREES = Array.from({ length: 30 }, (_, i) => ({ x: -1600 + i * 190 + prng() * 120, s: 0.8 + prng() * 0.7 }));

/* ───────── état UI ───────── */
const cv = $('#cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1;
const cam = { x: 20 * CW, y: -FH * 2, z: 0.8, tx: null, ty: null };
const ui = { cat: 'home', tool: null, ghost: null, sel: null, sheet: null, tab: 'goals', speed: 2, paused: false, modal: false, floats: [], muted: false, advDismiss: {}, advIdx: 0, hudAt: 0, rankShown: 0, confirmNew: false };
const SPEEDS = [1, 2, 4, 8];
let selRef = null;

const TONES = {
  apt: ['#dce7f1', '#f3dfcf', '#ddebda', '#ecdff1'], pent: ['#ecdcb4'], office: ['#cbd6e2'], shop: ['#f6dcae'], resto: ['#f2baa9'], janitor: ['#ccd6a8'], parking: ['#b8bdc4'], hall: ['#d6dde6'], stair: ['#c3cad2'],
  studio: ['#e6e1f1', '#f1e6dc', '#dcebe6'], loft: ['#e9dcc8', '#d9dfe6'], cowork: ['#d3e3df'], openspace: ['#c7d2e0'], bank: ['#e3dcc0'], clinic: ['#e1eef0'], daycare: ['#f7e3a8'],
  bakery: ['#f5dfc2'], cafe: ['#e5d5c0'], salon: ['#f1d3dc'], grocery: ['#d9ebcf'], pharmacy: ['#d8eee0'], gym: ['#d3dbe8'], cinema: ['#cfc5dc'], bar: ['#d9bfa6'], club: ['#2a2038'],
  observatory: ['#232f55'], trash: ['#cfd6c6'], security: ['#c9d0da'], tech: ['#d4d6d9'], garden: ['#d6ecd0'], solar: ['#cfe2ee'], metro: ['#d5dbe3'], heli: ['#c9ced6']
};
const ICON = {
  apt: '<path d="M4 11l8-6 8 6v8H4z"/><path d="M10 19v-5h4v5"/>',
  elev: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 8l-2.5 3h5zM12 16l2.5-3h-5z" fill="currentColor"/>',
  stair: '<path d="M4 19h4v-4h4v-4h4V7h4"/>',
  hall: '<path d="M5 20V9a7 7 0 0114 0v11z"/><path d="M12 9v11"/>',
  office: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  shop: '<path d="M4 9l1.5-5h13L20 9z"/><path d="M5 9v11h14V9M10 20v-6h4v6"/>',
  janitor: '<path d="M14 3l-5 10"/><path d="M6 13l6 2 3 6-9-1z"/>',
  resto: '<circle cx="12" cy="13" r="6"/><path d="M12 7V4M4 4v6M20 4v6"/>',
  parking: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 17V8h3a2.5 2.5 0 010 5h-3"/>',
  pent: '<path d="M4 20V10l8-6 8 6v10z"/><path d="M12 9l1 2 2 .3-1.5 1.4.4 2.1L12 13.8 10.1 14.8l.4-2.1L9 11.3l2-.3z" fill="currentColor"/>',
  studio: '<path d="M3 18V8M3 14h18v4M21 14v-2a3 3 0 00-3-3h-7v5"/><circle cx="7" cy="11.5" r="1.6"/>',
  loft: '<path d="M4 20V6h16v14z"/><path d="M4 10h16M9 6v4M15 6v4M8 20v-5h8v5"/>',
  cowork: '<rect x="4" y="5" width="16" height="10" rx="1.5"/><path d="M2 19h20M9 15v4M15 15v4"/>',
  openspace: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  bank: '<path d="M3 9l9-5 9 5zM5 9v8M9.5 9v8M14.5 9v8M19 9v8M3 20h18"/>',
  clinic: '<path d="M12 20s-8-5-8-10.5A4.5 4.5 0 0112 7a4.5 4.5 0 018 2.5C20 15 12 20 12 20z"/><path d="M12 10v5M9.5 12.5h5"/>',
  daycare: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5a4 4 0 007 0"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/>',
  bakery: '<path d="M4 15c0-5 3-8 8-8s8 3 8 8z"/><path d="M4 15h16v3H4zM9 9l1 2M13 8l1 2"/>',
  cafe: '<path d="M5 9h11v5a5 5 0 01-5 5h-1a5 5 0 01-5-5z"/><path d="M16 10h2a2.5 2.5 0 010 5h-2M8 4v2M12 4v2"/>',
  salon: '<circle cx="7" cy="17" r="2.6"/><circle cx="17" cy="17" r="2.6"/><path d="M8.6 15L18 4M15.4 15L6 4"/>',
  grocery: '<path d="M3 5h3l2.2 9h9l2-6.5H7"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="16.5" cy="19" r="1.4"/>',
  pharmacy: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
  gym: '<path d="M2 12h20M5 8v8M8 6v12M16 6v12M19 8v8"/>',
  cinema: '<rect x="3" y="7" width="18" height="13" rx="1.5"/><path d="M3 7l3-4h4l-3 4M12 3l-3 4M17 3l-3 4M21 7l-3-4"/><path d="M10 11.5v5l4.5-2.5z" fill="currentColor"/>',
  bar: '<path d="M4 4h16l-8 9z"/><path d="M12 13v7M8 20h8"/>',
  club: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4v16M6 7c4 2 8 2 12 0M6 17c4-2 8-2 12 0"/>',
  observatory: '<path d="M5 19a7 7 0 0114 0z"/><path d="M12 12l6-6M4 5l1 1.6M18 3.5l.7 1.6M20 9l1.6.6"/>',
  trash: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/>',
  security: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5L16 9.5"/>',
  tech: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  garden: '<circle cx="12" cy="9" r="6"/><path d="M12 15v6M8 21h8M10 9l2 2 3-3"/>',
  solar: '<path d="M4 17l2.5-9h11L20 17zM9.5 8l-1 9M14.5 8l1 9M5.3 12.5h13.4"/><path d="M12 3v2M5 4.5l1.3 1.3M19 4.5l-1.3 1.3"/>',
  metro: '<circle cx="12" cy="12" r="9"/><path d="M7.5 16V8l4.5 5 4.5-5v8"/>',
  heli: '<circle cx="12" cy="12" r="9"/><path d="M9 7.5v9M15 7.5v9M9 12h6"/>'
};
const SVG = (k) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICON[k] + '</svg>';

/* ───────── son ───────── */
let actx = null;
function beep(freq, dur, type, vol, when) {
  if (ui.muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    const t0 = actx.currentTime + (when || 0);
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.05, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) { /* audio indisponible */ }
}
const SOUND = {
  build() { beep(190, 0.09, 'square', 0.04); beep(120, 0.12, 'square', 0.04, 0.07); },
  demolish() { beep(90, 0.18, 'sawtooth', 0.04); },
  cash() { beep(880, 0.08, 'triangle', 0.035); beep(1320, 0.14, 'triangle', 0.03, 0.07); },
  rank() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'triangle', 0.05, i * 0.1)); },
  err() { beep(150, 0.16, 'sawtooth', 0.04); }
};

/* ───────── canvas ───────── */
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
}
function clampCam() {
  cam.z = clamp(cam.z, 0.3, 2.4);
  cam.x = clamp(cam.x, -4 * CW, (COLS + 4) * CW);
  cam.y = clamp(cam.y, -(E.FMAX + 4) * FH, (-E.FMIN + 2) * FH);
}
function fitLot() {
  const S = E.S;
  const cols = S.owned.r - S.owned.l + 1;
  cam.z = clamp((W - 24) / (cols * CW + 40), 0.35, 1.3);
  cam.x = (S.owned.l + cols / 2) * CW;
  cam.y = -0.16 * H / cam.z;
  clampCam();
}
const w2sx = (wx) => (wx - cam.x) * cam.z + W / 2;
const w2sy = (wy) => (wy - cam.y) * cam.z + H / 2;
const s2wx = (sx) => (sx - W / 2) / cam.z + cam.x;
const s2wy = (sy) => (sy - H / 2) / cam.z + cam.y;
const cellOf = (sx, sy) => ({ c: Math.floor(s2wx(sx) / CW), f: Math.floor(-s2wy(sy) / FH) });

function rrect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

let cur = null;   // contexte de dessin (heure, nuit, lit)
function drawSky() {
  const S = E.S, h = (S.T % E.DAY) / 60, night = nightF(h);
  const sk = skyAt(h);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(sk[0])); g.addColorStop(1, rgb(sk[1]));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (night > 0.1) {
    ctx.fillStyle = 'rgba(255,255,255,' + (night * 0.8) + ')';
    for (const s of STARS) ctx.fillRect(s[0] * W, s[1] * H, s[2], s[2]);
  }
  // soleil / lune
  const isDay = h >= 6 && h < 18;
  const t = isDay ? (h - 6) / 12 : ((h + 6) % 24) / 12;
  const sx = W * (0.08 + 0.84 * t), sy = H * 0.5 - Math.sin(Math.PI * t) * H * 0.38;
  if (isDay) {
    const rg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 60);
    rg.addColorStop(0, 'rgba(255,244,200,.95)'); rg.addColorStop(0.25, 'rgba(255,230,160,.5)'); rg.addColorStop(1, 'rgba(255,230,160,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(sx, sy, 60, 0, 7); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(235,240,255,.9)'; ctx.beginPath(); ctx.arc(sx, sy, 15, 0, 7); ctx.fill();
    ctx.fillStyle = rgb(sk[0]); ctx.beginPath(); ctx.arc(sx + 6, sy - 3, 13, 0, 7); ctx.fill();
  }
  // nuages
  ctx.fillStyle = 'rgba(255,255,255,' + (0.6 * (1 - night * 0.85)) + ')';
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 263 + S.simT * (3 + i * 0.7)) % (W + 320)) - 160;
    const cy = 70 + ((i * 97) % 220) - cam.y * 0.04;
    const s = 26 + (i % 3) * 12;
    ctx.beginPath(); ctx.ellipse(cx, cy, s * 1.6, s * 0.55, 0, 0, 7); ctx.ellipse(cx - s, cy + 6, s, s * 0.4, 0, 0, 7); ctx.ellipse(cx + s, cy + 5, s * 1.1, s * 0.42, 0, 0, 7); ctx.fill();
  }
  cur = { h, night, sk, S };
  // horizon
  const gy = w2sy(0);
  const farN = [10, 14, 34];
  LAYERS.forEach((L, li) => {
    const col = mixa(mixa(sk[1], [58, 80, 108], 0.3 + li * 0.25), farN, night * 0.8);
    ctx.fillStyle = rgb(col);
    const k = cam.z * L.p;
    for (const b of L.items) {
      const bx = W / 2 + (b.x - cam.x) * k, bw = b.w * k * 1.6;
      if (bx + bw < 0 || bx > W) continue;
      const bh = b.h * k * 1.5;
      ctx.fillRect(bx, gy - bh, bw, bh + 2);
    }
    if (night > 0.3 && li === 1) {
      ctx.fillStyle = 'rgba(255,214,120,' + (night * 0.7) + ')';
      for (const b of L.items) {
        const bx = W / 2 + (b.x - cam.x) * k, bw = b.w * k * 1.6, bh = b.h * k * 1.5;
        if (bx + bw < 0 || bx > W || b.s < 0.4) continue;
        for (let yy = gy - bh + 6 * k * 2; yy < gy - 8; yy += 16 * k * 1.6)
          for (let xx = bx + 4 * k * 1.5; xx < bx + bw - 4; xx += 12 * k * 1.7) if (((xx * 7 + yy * 13) | 0) % 5 === 0) ctx.fillRect(xx, yy, 3 * k * 1.7, 4 * k * 1.7);
      }
    }
  });
}

function drawGround() {
  const S = cur.S, night = cur.night;
  const x0 = -3000, x1 = COLS * CW + 3000;
  // terre
  const depth = Math.max((-E.FMIN + 1) * FH, s2wy(H) + 20);
  const g = ctx.createLinearGradient(0, 0, 0, depth);
  g.addColorStop(0, mixc('#7b6a57', night)); g.addColorStop(1, mixc('#3d352e', night));
  ctx.fillStyle = g; ctx.fillRect(x0, 0, x1 - x0, depth);
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  for (let i = 1; i < 4; i++) ctx.fillRect(x0, i * FH - 1, x1 - x0, 1.5);
  // herbe + trottoir
  ctx.fillStyle = mixc('#5e9a4a', night); ctx.fillRect(x0, -6, x1 - x0, 6);
  ctx.fillStyle = mixc('#c9cfd6', night); ctx.fillRect(S.owned.l * CW - 14, -5, (S.owned.r - S.owned.l + 1) * CW + 28, 5);
  // arbres sur les terrains à vendre
  for (const t of TREES) {
    const c = t.x / CW;
    if (c >= S.owned.l - 1.5 && c <= S.owned.r + 2.5) continue;
    ctx.fillStyle = mixc('#5a4330', night); ctx.fillRect(t.x - 3, -24 * t.s, 6, 24 * t.s);
    ctx.fillStyle = mixc('#4c8a3f', night);
    ctx.beginPath(); ctx.arc(t.x, -34 * t.s, 17 * t.s, 0, 7); ctx.arc(t.x - 11 * t.s, -26 * t.s, 12 * t.s, 0, 7); ctx.arc(t.x + 11 * t.s, -26 * t.s, 12 * t.s, 0, 7); ctx.fill();
  }
  // panneaux « à vendre »
  const signs = [];
  if (S.owned.l > 0) signs.push(S.owned.l * CW - 74);
  if (S.owned.r < COLS - 1) signs.push((S.owned.r + 1) * CW + 74);
  for (const sx of signs) {
    ctx.fillStyle = mixc('#5a4330', night); ctx.fillRect(sx - 2, -30, 4, 30);
    ctx.fillStyle = mixc('#f4f1e8', night); rrect(sx - 22, -44, 44, 20, 3); ctx.fill();
    ctx.fillStyle = mixc('#c0352a', night); ctx.fillRect(sx - 22, -44, 44, 4);
    ctx.fillStyle = mixc('#222', night); ctx.font = '700 8px "Public Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('À VENDRE', sx, -29);
  }
  // fondations visibles
  ctx.fillStyle = 'rgba(30,40,55,.55)'; ctx.fillRect(S.owned.l * CW - 3, 0, 3, (-E.minFloor()) * FH);
  ctx.fillRect((S.owned.r + 1) * CW, 0, 3, (-E.minFloor()) * FH);
}
function mixc(c, night) { const a = hex(c); return rgb(mixa(a, [a[0] * 0.28, a[1] * 0.3, a[2] * 0.45], night * 0.8)); }

function drawFloorLabels() {
  const S = cur.S;
  const x = S.owned.l * CW - 8;
  const step = cam.z < 0.5 ? 5 : cam.z < 0.8 ? 2 : 1;
  const fmin = Math.max(E.minFloor(), Math.floor(-s2wy(H) / FH) - 1), fmax = Math.min(E.maxFloor(), Math.ceil(-s2wy(0) / FH));
  ctx.textAlign = 'right'; ctx.fillStyle = cur.night > 0.5 ? 'rgba(230,238,250,.75)' : 'rgba(20,32,48,.7)';
  ctx.font = '700 11px "Big Shoulders Display", "Arial Narrow", sans-serif';
  for (let f = fmin; f <= fmax; f++) {
    if (f % step !== 0 && f !== 0) continue;
    const y = -f * FH - FH / 2 + 4;
    ctx.fillText(E.label(f), x, y);
    ctx.fillRect(x + 2, -f * FH - 1, 4, 1);
  }
  // limite de hauteur
  const top = -(E.maxFloor() + 1) * FH;
  ctx.save(); ctx.setLineDash([6, 6]); ctx.strokeStyle = cur.night > 0.5 ? 'rgba(230,238,250,.35)' : 'rgba(20,32,48,.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(S.owned.l * CW, top); ctx.lineTo((S.owned.r + 1) * CW, top); ctx.stroke(); ctx.restore();
  ctx.textAlign = 'left'; ctx.font = '700 10px "Public Sans", sans-serif';
  ctx.fillText('Limite ★' + S.rank + ' : ' + E.label(E.maxFloor()), S.owned.l * CW + 2, top - 5);
}

function drawBuildGrid() {
  if (!ui.tool) return;
  const S = cur.S, tool = ui.tool;
  const T = E.TYPES[tool];
  const fmin = Math.max(E.minFloor(), Math.floor(-s2wy(H) / FH) - 1), fmax = Math.min(E.maxFloor(), Math.ceil(-s2wy(0) / FH));
  const dark = cur.night > 0.5;
  ctx.lineWidth = 1;
  for (let f = fmin; f <= fmax; f++) {
    for (let c = S.owned.l; c <= S.owned.r; c++) {
      if (E.roomAt(f, c)) continue;
      const supported = f <= 0 || E.roomAt(f - 1, c);
      const x = c * CW, y = -(f + 1) * FH;
      if (supported) { ctx.fillStyle = dark ? 'rgba(138,168,255,.14)' : 'rgba(31,79,216,.11)'; ctx.fillRect(x, y, CW, FH); }
      ctx.strokeStyle = supported ? (dark ? 'rgba(200,215,255,.34)' : 'rgba(20,50,120,.30)') : (dark ? 'rgba(200,215,255,.07)' : 'rgba(20,50,120,.07)');
      ctx.strokeRect(x + 0.5, y + 0.5, CW - 1, FH - 1);
    }
  }
  // zone non possédée
  ctx.fillStyle = 'rgba(30,40,55,.18)';
  ctx.fillRect(-3000, -(E.maxFloor() + 2) * FH, S.owned.l * CW + 3000, (E.maxFloor() + 2 - E.minFloor()) * FH);
  ctx.fillRect((S.owned.r + 1) * CW, -(E.maxFloor() + 2) * FH, 3000 + (COLS - S.owned.r) * CW, (E.maxFloor() + 2 - E.minFloor()) * FH);
  void T;
}

/* — pièces — */
function glass(lit) {
  const n = cur.night;
  if (lit && n > 0.25) return mixc('#ffd98a', 0);
  return rgb(mixa(hex('#bfdcf2'), hex('#1b2647'), n));
}
function shade(c, k) { const a = hex(c); return rgb([a[0] * k, a[1] * k, a[2] * k]); }

function winPane(x, y, w, h, gl) {
  ctx.fillStyle = gl; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(40,40,50,.5)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function awning(x, y, w, c1, c2, hh) {
  const k = Math.max(4, Math.round(w / 14));
  for (let i = 0; i < k; i++) { ctx.fillStyle = i % 2 ? c2 : c1; ctx.fillRect(x + i * (w / k), y, w / k + 0.5, hh); }
}
function miniTable(cx, by) {
  ctx.fillStyle = '#8a5a3a'; ctx.fillRect(cx - 1, by - 13, 2.5, 13);
  ctx.fillStyle = '#f8f1e4'; ctx.beginPath(); ctx.ellipse(cx, by - 14, 8, 3, 0, 0, 7); ctx.fill();
}

function drawRoom(r, lit) {
  const x = r.c * CW, w = r.w * CW, h = r.h * FH, y = -(r.f + r.h) * FH;
  const T = E.TYPES[r.type];
  const tones = TONES[r.type], base = tones[r.id % tones.length];
  const vacant = T.lease && !r.tenant;
  const n = cur.night;
  // fond
  ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(40,32,24,.16)'; ctx.fillRect(x, y + h - 6, w, 6);
  const gl = glass(lit && !vacant);
  const detail = cam.z >= 0.4;
  if (detail) switch (r.type) {
    case 'apt': case 'pent': {
      ctx.fillStyle = gl; ctx.fillRect(x + w * 0.56, y + 9, w * 0.34, h * 0.4);
      ctx.strokeStyle = 'rgba(40,40,50,.55)'; ctx.lineWidth = 1.2; ctx.strokeRect(x + w * 0.56, y + 9, w * 0.34, h * 0.4);
      ctx.beginPath(); ctx.moveTo(x + w * 0.73, y + 9); ctx.lineTo(x + w * 0.73, y + 9 + h * 0.4); ctx.stroke();
      ctx.fillStyle = shade(base, 0.72); rrect(x + 5, y + h - 21, w * 0.36, 15, 3); ctx.fill();
      ctx.fillStyle = shade(base, 0.6); ctx.fillRect(x + 5, y + h - 25, w * 0.36, 5);
      ctx.fillStyle = '#6c4d33'; ctx.fillRect(x + w * 0.62, y + h - 16, 3, 10); ctx.fillStyle = lit && n > 0.3 ? '#ffe08a' : '#d9c28a'; ctx.beginPath(); ctx.arc(x + w * 0.62 + 1.5, y + h - 19, 5, 0, 7); ctx.fill();
      if (r.type === 'pent') { ctx.fillStyle = '#c9a24a'; ctx.fillRect(x, y, w, 3); ctx.fillRect(x, y + h - 3, w, 3); }
      break;
    }
    case 'office': {
      for (let i = 0; i < 3; i++) { ctx.fillStyle = gl; ctx.fillRect(x + 6 + i * (w / 3), y + 7, w / 3 - 10, h * 0.34); }
      for (let i = 0; i < 2; i++) {
        const dx = x + 10 + i * (w / 2 - 4);
        ctx.fillStyle = '#7b6246'; ctx.fillRect(dx, y + h - 20, 26, 4); ctx.fillRect(dx + 2, y + h - 16, 2, 10); ctx.fillRect(dx + 22, y + h - 16, 2, 10);
        ctx.fillStyle = lit ? '#8fd0ff' : '#44556a'; ctx.fillRect(dx + 8, y + h - 31, 11, 8); ctx.fillStyle = '#2d3642'; ctx.fillRect(dx + 12, y + h - 23, 3, 3);
      }
      break;
    }
    case 'shop': {
      for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#f8f3ea' : '#d6493c'; ctx.fillRect(x + i * (w / 8), y, w / 8, 11); }
      ctx.fillStyle = '#d9dde3'; ctx.fillRect(x + 4, y + 16, w - 8, 3);
      const cols = ['#e2574c', '#3f8edb', '#f0a92e', '#5bb974', '#9b6bd6'];
      for (let i = 0; i < 9; i++) { ctx.fillStyle = cols[i % 5]; ctx.fillRect(x + 8 + i * ((w - 16) / 9), y + 21, (w - 16) / 9 - 3, 9); }
      ctx.fillStyle = '#7b5a3c'; ctx.fillRect(x + 8, y + h - 18, w * 0.5, 12);
      ctx.fillStyle = gl; ctx.fillRect(x + w * 0.68, y + 34, w * 0.26, h - 44);
      break;
    }
    case 'resto': {
      ctx.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < w / 8; i++) if (i % 2 === 0) ctx.fillRect(x + i * 8, y + h - 6, 8, 6);
      for (let i = 0; i < 3; i++) {
        const tx = x + 22 + i * (w - 36) / 2.4;
        ctx.fillStyle = '#8a5a3a'; ctx.fillRect(tx - 1, y + h - 20, 3, 14);
        ctx.fillStyle = '#f8f1e4'; ctx.beginPath(); ctx.ellipse(tx, y + h - 22, 11, 4, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#5a4030'; ctx.fillRect(tx - 1, y + 6, 1.5, 12);
        ctx.fillStyle = lit ? '#ffd36e' : '#d6b45a'; ctx.beginPath(); ctx.arc(tx, y + 20, 5, 0, Math.PI); ctx.fill();
      }
      break;
    }
    case 'janitor': {
      ctx.fillStyle = '#7d8a5a'; ctx.fillRect(x + 4, y + 8, w - 8, 4);
      ctx.fillStyle = '#6b7b8c'; ctx.beginPath(); ctx.moveTo(x + 12, y + h - 22); ctx.lineTo(x + 26, y + h - 22); ctx.lineTo(x + 24, y + h - 7); ctx.lineTo(x + 14, y + h - 7); ctx.fill();
      ctx.strokeStyle = '#7b5a3c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w - 18, y + 14); ctx.lineTo(x + w - 14, y + h - 12); ctx.stroke();
      ctx.fillStyle = '#d3a949'; ctx.fillRect(x + w - 20, y + h - 14, 10, 7);
      break;
    }
    case 'parking': {
      ctx.fillStyle = '#8f959c'; ctx.fillRect(x, y, w, 8);
      ctx.fillStyle = '#f0c93c'; ctx.font = '800 14px "Big Shoulders Display", sans-serif'; ctx.textAlign = 'left'; ctx.fillText('P', x + 6, y + 22);
      const cc = ['#c0392b', '#2d6fb6', '#e8e8e8', '#4a4f57'];
      for (let i = 0; i < 3; i++) {
        const cx = x + 22 + i * (w - 30) / 3;
        ctx.fillStyle = cc[(r.id + i) % 4]; rrect(cx, y + h - 22, 36, 12, 4); ctx.fill();
        ctx.fillStyle = '#9fc5e3'; ctx.fillRect(cx + 9, y + h - 28, 17, 7);
        ctx.fillStyle = '#1c1f24'; ctx.beginPath(); ctx.arc(cx + 8, y + h - 9, 3.4, 0, 7); ctx.arc(cx + 28, y + h - 9, 3.4, 0, 7); ctx.fill();
      }
      break;
    }
    case 'studio': {
      winPane(x + w * 0.45, y + 9, w * 0.45, h * 0.36, gl);
      ctx.fillStyle = shade(base, 0.7); ctx.fillRect(x + 3, y + h - 17, w - 6, 10);
      ctx.fillStyle = '#f4efe6'; ctx.fillRect(x + 3, y + h - 21, w * 0.4, 6);
      break;
    }
    case 'loft': {
      for (let i = 0; i < 3; i++) winPane(x + 6 + i * (w / 3), y + 7, w / 3 - 10, h * 0.5, gl);
      ctx.fillStyle = '#6d4f3a'; rrect(x + 8, y + h - 22, w * 0.4, 14, 4); ctx.fill(); ctx.fillRect(x + 8, y + h - 27, w * 0.4, 6);
      ctx.fillStyle = '#4f9d5e'; ctx.beginPath(); ctx.arc(x + w - 16, y + h - 21, 7, 0, 7); ctx.fill(); ctx.fillStyle = '#7b6246'; ctx.fillRect(x + w - 18, y + h - 15, 4, 9);
      break;
    }
    case 'cowork': case 'openspace': {
      const k = r.type === 'cowork' ? 3 : 5;
      winPane(x + 6, y + 6, w - 12, 10, gl);
      for (let i = 0; i < k; i++) {
        const dx = x + 8 + i * ((w - 16) / k);
        ctx.fillStyle = '#7b6246'; ctx.fillRect(dx, y + h - 19, 22, 4); ctx.fillRect(dx + 2, y + h - 15, 2, 9); ctx.fillRect(dx + 18, y + h - 15, 2, 9);
        ctx.fillStyle = lit ? '#8fd0ff' : '#44556a'; ctx.fillRect(dx + 6, y + h - 29, 10, 8);
      }
      break;
    }
    case 'bank': {
      ctx.fillStyle = '#efe9d8'; ctx.beginPath(); ctx.moveTo(x + 2, y + 15); ctx.lineTo(x + w / 2, y + 3); ctx.lineTo(x + w - 2, y + 15); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 4; i++) { ctx.fillStyle = '#f9f5ea'; ctx.fillRect(x + 8 + i * ((w - 22) / 3), y + 17, 6, h - 26); }
      ctx.fillStyle = '#b08d3c'; ctx.beginPath(); ctx.arc(x + w - 14, y + h - 18, 6, 0, 7); ctx.fill();
      break;
    }
    case 'clinic': {
      ctx.fillStyle = '#fff'; ctx.fillRect(x + 6, y + 8, 14, 14); ctx.fillStyle = '#d8453a'; ctx.fillRect(x + 11, y + 10, 4, 10); ctx.fillRect(x + 8, y + 13, 10, 4);
      ctx.fillStyle = '#e8f0f4'; ctx.fillRect(x + w * 0.45, y + h - 20, w * 0.5, 9); ctx.fillStyle = '#a8c4d4'; ctx.fillRect(x + w * 0.45, y + h - 23, w * 0.18, 4);
      winPane(x + w * 0.6, y + 9, w * 0.3, 14, gl);
      break;
    }
    case 'daycare': {
      const cc = ['#e2574c', '#3f8edb', '#f0a92e', '#5bb974'];
      for (let i = 0; i < 4; i++) { ctx.fillStyle = cc[i]; ctx.fillRect(x + 8 + i * 12, y + h - 16 - (i % 2) * 6, 10, 10 + (i % 2) * 6); }
      ctx.fillStyle = cc[r.id % 4]; ctx.beginPath(); ctx.arc(x + w - 18, y + 16, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#f0a92e'; ctx.beginPath(); ctx.arc(x + w - 18, y + 16, 3, 0, 7); ctx.fill();
      break;
    }
    case 'bakery': {
      awning(x, y, w, '#e98fa6', '#f8f1e4', 11);
      ctx.fillStyle = '#7b5a3c'; ctx.fillRect(x + 4, y + h - 18, w - 8, 12);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = '#d99a4a'; ctx.beginPath(); ctx.ellipse(x + 12 + i * ((w - 20) / 3.5), y + h - 21, 6, 3, 0, 0, 7); ctx.fill(); }
      winPane(x + 6, y + 22, w - 12, 12, gl);
      break;
    }
    case 'cafe': {
      awning(x, y, w, '#4f8f6a', '#f8f1e4', 11);
      miniTable(x + 14, y + h - 5); miniTable(x + w - 16, y + h - 5);
      ctx.fillStyle = '#fff'; ctx.fillRect(x + w / 2 - 6, y + 22, 12, 9); ctx.fillStyle = '#7b5a3c'; ctx.fillRect(x + w / 2 - 4, y + 24, 8, 5);
      break;
    }
    case 'salon': {
      winPane(x + 6, y + 9, 16, 24, gl); winPane(x + w - 24, y + 9, 16, 24, gl);
      for (let i = 0; i < 2; i++) { const cx = x + 12 + i * (w - 36); ctx.fillStyle = '#a63d52'; ctx.fillRect(cx, y + h - 15, 12, 8); ctx.fillRect(cx + 4, y + h - 20, 4, 6); }
      break;
    }
    case 'grocery': {
      awning(x, y, w, '#3d8f55', '#f8f1e4', 11);
      for (let row = 0; row < 2; row++) for (let i = 0; i < 8; i++) { ctx.fillStyle = ['#e2574c', '#3f8edb', '#f0a92e', '#5bb974', '#9b6bd6'][(i + row) % 5]; ctx.fillRect(x + 8 + i * ((w - 40) / 8), y + 18 + row * 12, (w - 40) / 8 - 3, 8); }
      ctx.strokeStyle = '#59636e'; ctx.lineWidth = 1.5; ctx.strokeRect(x + w - 26, y + h - 20, 16, 10);
      ctx.fillStyle = '#1c1f24'; ctx.beginPath(); ctx.arc(x + w - 23, y + h - 6, 2, 0, 7); ctx.arc(x + w - 13, y + h - 6, 2, 0, 7); ctx.fill();
      break;
    }
    case 'pharmacy': {
      ctx.fillStyle = '#2f9e62'; ctx.fillRect(x + w / 2 - 9, y + 5, 18, 18); ctx.fillStyle = '#fff'; ctx.fillRect(x + w / 2 - 2, y + 8, 4, 12); ctx.fillRect(x + w / 2 - 6, y + 12, 12, 4);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = ['#e2574c', '#3f8edb', '#f0a92e', '#5bb974'][i]; ctx.fillRect(x + 6 + i * ((w - 12) / 4), y + h - 20, (w - 12) / 4 - 3, 8); }
      break;
    }
    case 'gym': {
      ctx.fillStyle = gl; ctx.fillRect(x + 6, y + 8, w * 0.35, 20);
      for (let i = 0; i < 2; i++) { const bx = x + w * 0.45 + i * 38; ctx.fillStyle = '#4a4f57'; ctx.fillRect(bx, y + h - 17, 28, 4); ctx.fillRect(bx + 20, y + h - 30, 3, 15); ctx.fillStyle = '#d8453a'; ctx.fillRect(bx + 14, y + h - 33, 12, 4); }
      ctx.fillStyle = '#6b7b8c'; for (let i = 0; i < 4; i++) { ctx.fillRect(x + 10 + i * 12, y + h - 14, 4, 7); ctx.fillRect(x + 8 + i * 12, y + h - 16, 8, 3); }
      break;
    }
    case 'cinema': {
      ctx.fillStyle = '#1f2a3a'; ctx.fillRect(x + 8, y + 10, w - 16, h * 0.4);
      ctx.fillStyle = lit && n > 0.2 ? '#9fd0ff' : '#33465e'; ctx.fillRect(x + 11, y + 13, w - 22, h * 0.4 - 6);
      for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#ffe08a' : '#fff'; ctx.fillRect(x + 8 + i * ((w - 16) / 8), y + 3, (w - 16) / 8 - 3, 4); }
      for (let i = 0; i < 7; i++) { ctx.fillStyle = '#9c2d3b'; rrect(x + 12 + i * ((w - 24) / 7), y + h - 14, 14, 9, 3); ctx.fill(); }
      break;
    }
    case 'bar': {
      ctx.fillStyle = '#5a3d2b'; ctx.fillRect(x + 6, y + h - 20, w - 12, 5); ctx.fillRect(x + 6, y + h - 15, w - 12, 9);
      for (let i = 0; i < 5; i++) { ctx.fillStyle = ['#e2574c', '#3f8edb', '#f0a92e', '#5bb974', '#9b6bd6'][i]; ctx.fillRect(x + 10 + i * ((w - 24) / 5), y + 14, 4, 12); }
      ctx.fillStyle = '#d6dce4'; ctx.fillRect(x + 8, y + 12, w - 16, 2);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.arc(x + 14 + i * ((w - 28) / 3), y + h - 24, 3, 0, 7); ctx.fill(); }
      if (n > 0.3 && lit) { ctx.fillStyle = '#ff5cb8'; ctx.fillRect(x + w - 20, y + 6, 14, 3); }
      break;
    }
    case 'club': {
      ctx.fillStyle = '#1a1424'; ctx.fillRect(x, y, w, h);
      const t = (ui.tnow || 0) / 300, cols = ['#ff4fb8', '#4fd1ff', '#ffe14f', '#7dff6a'];
      if (lit && !vacant) for (let i = 0; i < 4; i++) {
        const bx = x + 12 + i * ((w - 24) / 3);
        ctx.fillStyle = cols[(i + Math.floor(t)) % 4]; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(x + w / 2, y + 6); ctx.lineTo(bx - 8, y + h - 8); ctx.lineTo(bx + 8, y + h - 8); ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = '#c9d4e0'; ctx.beginPath(); ctx.arc(x + w / 2, y + 12, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#3a2f4a'; ctx.fillRect(x + 6, y + h - 10, w - 12, 5);
      break;
    }
    case 'observatory': {
      ctx.fillStyle = '#1b2647'; ctx.fillRect(x, y, w, h);
      for (let i = 0; i < 9; i++) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(x + ((r.id * 31 + i * 47) % (w - 6)) + 3, y + 5 + ((i * 13) % 22), 1.5, 1.5); }
      ctx.fillStyle = '#c9d4e0'; ctx.beginPath(); ctx.arc(x + w / 2, y + h - 8, 22, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#59636e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + w / 2 + 2, y + h - 22); ctx.lineTo(x + w / 2 + 20, y + h - 36); ctx.stroke();
      break;
    }
    case 'trash': {
      const cc = ['#4f8f6a', '#3f8edb', '#e0b43a'], bw = (w - 16) / 3;
      for (let i = 0; i < 3; i++) { ctx.fillStyle = cc[i]; rrect(x + 8 + i * bw, y + h - 26, bw - 4, 20, 3); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x + 8 + i * bw, y + h - 26, bw - 4, 4); }
      break;
    }
    case 'security': {
      const mw = (w - 12) / 3;
      ctx.fillStyle = '#1f2a3a'; for (let i = 0; i < 3; i++) ctx.fillRect(x + 6 + i * mw, y + 8, mw - 3, 12);
      ctx.fillStyle = '#6fe0a0'; for (let i = 0; i < 3; i++) ctx.fillRect(x + 8 + i * mw, y + 10, mw - 7, 8);
      ctx.fillStyle = '#4a5560'; ctx.fillRect(x + 6, y + h - 17, w - 12, 5); ctx.fillStyle = '#2a3a4f'; ctx.fillRect(x + w / 2 - 4, y + h - 27, 8, 10);
      break;
    }
    case 'tech': {
      ctx.strokeStyle = '#7d8a96'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 4, y + 14); ctx.lineTo(x + w - 4, y + 14); ctx.moveTo(x + 14, y + 14); ctx.lineTo(x + 14, y + h - 4); ctx.stroke();
      ctx.fillStyle = '#4a5560'; ctx.fillRect(x + w - 40, y + h - 32, 30, 26);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = (i + Math.floor((ui.tnow || 0) / 500)) % 3 === 0 ? '#e2574c' : '#6fe0a0'; ctx.fillRect(x + w - 36 + i * 7, y + h - 28, 4, 4); }
      ctx.fillStyle = '#d6dce4'; ctx.beginPath(); ctx.arc(x + 36, y + h - 18, 8, 0, 7); ctx.fill();
      ctx.strokeStyle = '#59636e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 36, y + h - 18); ctx.lineTo(x + 40, y + h - 23); ctx.stroke();
      break;
    }
    case 'garden': {
      ctx.fillStyle = '#7fb069'; ctx.fillRect(x, y + h - 14, w, 14);
      for (let i = 0; i < 3; i++) { const tx = x + 16 + i * ((w - 32) / 2); ctx.fillStyle = '#7b5a3c'; ctx.fillRect(tx - 2, y + h - 30, 4, 18); ctx.fillStyle = ['#3f8f4f', '#4fa35f', '#2f7f45'][i]; ctx.beginPath(); ctx.arc(tx, y + h - 36, 11, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#9a7a52'; ctx.fillRect(x + w / 2 - 12, y + h - 12, 24, 3);
      break;
    }
    case 'solar': {
      ctx.fillStyle = '#a9cde6'; ctx.fillRect(x, y, w, h * 0.35);
      const q = [[x + 6, y + h - 10], [x + 20, y + 16], [x + w - 6, y + 16], [x + w - 20, y + h - 10]];
      ctx.fillStyle = '#1f3f7a'; ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[2][0], q[2][1]); ctx.lineTo(q[3][0], q[3][1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8fb4e8'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 1; i < 4; i++) { ctx.moveTo(x + 20 + i * (w - 40) / 4, y + 16); ctx.lineTo(x + 6 + i * (w - 12) / 4, y + h - 10); }
      ctx.moveTo(x + 13, y + h / 2 + 3); ctx.lineTo(x + w - 13, y + h / 2 + 3); ctx.stroke();
      break;
    }
    case 'metro': {
      ctx.fillStyle = '#d6dde6'; ctx.fillRect(x, y + h - 8, w, 8);
      ctx.fillStyle = '#d8453a'; ctx.beginPath(); ctx.arc(x + 20, y + 20, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 14px "Big Shoulders Display", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('M', x + 20, y + 25);
      for (let i = 0; i < 3; i++) { const gx = x + 50 + i * ((w - 62) / 3); ctx.fillStyle = '#6b7b8c'; ctx.fillRect(gx, y + h - 26, 6, 18); ctx.fillStyle = '#e0b43a'; ctx.fillRect(gx, y + h - 28, 6, 3); }
      break;
    }
    case 'heli': {
      ctx.fillStyle = '#4a4f57'; ctx.fillRect(x, y + h - 10, w, 10);
      ctx.strokeStyle = '#f0c93c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 30, y + h - 28, 16, 0, 7); ctx.stroke();
      ctx.fillStyle = '#f0c93c'; ctx.font = '800 16px "Big Shoulders Display", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('H', x + 30, y + h - 22);
      const hx = x + w - 44, ang = Math.sin((ui.tnow || 0) / 60) * 18;
      ctx.fillStyle = '#c0392b'; rrect(hx, y + h - 34, 30, 14, 6); ctx.fill(); ctx.fillStyle = '#9fc5e3'; ctx.fillRect(hx + 18, y + h - 31, 9, 7); ctx.fillRect(hx - 12, y + h - 28, 14, 3);
      ctx.strokeStyle = '#2a3a4f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx + 15 - ang, y + h - 38); ctx.lineTo(hx + 15 + ang, y + h - 38); ctx.stroke();
      break;
    }
    case 'hall': {
      ctx.fillStyle = '#c4ccd6'; ctx.fillRect(x, y + h - 8, w, 8);
      ctx.fillStyle = 'rgba(160,190,215,.7)'; const dx = x + w / 2 - 22; ctx.fillRect(dx, y + 12, 44, h - 20);
      ctx.strokeStyle = '#59636e'; ctx.lineWidth = 1.5; ctx.strokeRect(dx, y + 12, 44, h - 20); ctx.beginPath(); ctx.moveTo(dx + 22, y + 12); ctx.lineTo(dx + 22, y + h - 8); ctx.stroke();
      ctx.fillStyle = '#7b6246'; ctx.fillRect(x + 6, y + h - 22, 28, 14); ctx.fillStyle = '#4f9d5e'; ctx.beginPath(); ctx.arc(x + w - 14, y + h - 18, 7, 0, 7); ctx.fill(); ctx.fillStyle = '#7b6246'; ctx.fillRect(x + w - 16, y + h - 12, 4, 6);
      ctx.fillStyle = '#2a3a4f'; ctx.font = '800 10px "Big Shoulders Display", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('HALL', x + w / 2, y + 9);
      break;
    }
    case 'stair': {
      ctx.fillStyle = '#9aa3ae'; ctx.beginPath(); ctx.moveTo(x + 4, y + 2 * FH - 4);
      for (let i = 0; i < 8; i++) { const sx = x + 4 + i * ((w - 8) / 8), sy = y + 2 * FH - 4 - i * ((2 * FH - 12) / 8); ctx.lineTo(sx, sy); ctx.lineTo(sx + (w - 8) / 8, sy); }
      ctx.lineTo(x + w - 4, y + 2 * FH - 4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#59636e'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + 4, y + 2 * FH - 28); ctx.lineTo(x + w - 4, y + 12); ctx.stroke();
      break;
    }
    default: break;
  }
  // nuit
  if (n > 0.02) {
    ctx.fillStyle = 'rgba(8,14,40,' + (n * (lit && !vacant ? 0.18 : 0.52)) + ')';
    ctx.fillRect(x, y, w, h);
  }
  if (vacant) {
    ctx.fillStyle = 'rgba(235,240,246,.55)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(30,45,70,.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.strokeRect(x + 5, y + h / 2 - 9, w - 10, 18); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(30,45,70,.85)'; ctx.font = '800 11px "Big Shoulders Display", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(r.reach ? 'À LOUER' : 'SANS ACCÈS', x + w / 2, y + h / 2 + 4);
  }
  if (!r.reach && (T.lease || (T.service && T.fx !== 'solar'))) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = 'rgba(200,50,40,.5)'; ctx.lineWidth = 3;
    for (let i = -h; i < w + h; i += 12) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
    ctx.restore();
  }
  // saleté
  if (r.dirt > 45 && r.tenant) {
    ctx.fillStyle = 'rgba(70,55,40,.45)';
    for (let i = 0; i < 6; i++) ctx.fillRect(x + 4 + ((r.id * 37 + i * 29) % (w - 10)), y + h - 7 + (i % 2) * 3, 3, 2);
  }
  // cadre
  ctx.strokeStyle = 'rgba(25,35,50,.65)'; ctx.lineWidth = 1.6; ctx.strokeRect(x + 0.8, y + 0.8, w - 1.6, h - 1.6);
  // pastille de satisfaction
  if (T.lease && r.tenant && r.type !== 'parking') {
    ctx.fillStyle = r.sat >= 70 ? '#2fae6a' : r.sat >= 45 ? '#e9a32a' : '#d8453a';
    ctx.beginPath(); ctx.arc(x + w - 7, y + 7, 3.6, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1; ctx.stroke();
  }
  if (r.lvl > 0 && T.lease && !vacant) {
    ctx.fillStyle = '#c9a24a';
    for (let i = 0; i < r.lvl; i++) { ctx.beginPath(); ctx.moveTo(x + 5 + i * 8, y + h - 3); ctx.lineTo(x + 8.5 + i * 8, y + h - 9); ctx.lineTo(x + 12 + i * 8, y + h - 3); ctx.fill(); }
  }
  if (cam.z >= 0.75 && !vacant && r.type !== 'hall' && r.type !== 'stair') {
    const dark = r.type === 'club' || r.type === 'observatory';
    ctx.fillStyle = dark ? 'rgba(235,240,255,.85)' : 'rgba(20,30,45,.7)'; ctx.font = '700 8px "Public Sans", sans-serif'; ctx.textAlign = 'left';
    let nm = T.name.toUpperCase();
    const room = w - (T.lease ? 16 : 8);
    if (ctx.measureText(nm).width > room && T.ab) nm = T.ab.toUpperCase();
    if (ctx.measureText(nm).width <= room) ctx.fillText(nm, x + 4, y + 8 + (r.type === 'shop' || r.type === 'bakery' || r.type === 'cafe' || r.type === 'grocery' ? 4 : 0));
  }
}

function drawShaftCell(r, doorOpen) {
  const x = r.c * CW, y = -(r.f + 1) * FH;
  ctx.fillStyle = '#2c3440'; ctx.fillRect(x, y, CW, FH);
  ctx.fillStyle = '#3a4452'; ctx.fillRect(x + 4, y, 2, FH); ctx.fillRect(x + CW - 6, y, 2, FH);
  ctx.fillStyle = '#566272'; ctx.fillRect(x + 8, y + FH - 3, CW - 16, 2);
  ctx.fillStyle = doorOpen ? '#6ee09a' : '#e2574c'; ctx.beginPath(); ctx.arc(x + CW / 2, y + 6, 2.4, 0, 7); ctx.fill();
  if (cur.night > 0.02) { ctx.fillStyle = 'rgba(8,14,40,' + cur.night * 0.25 + ')'; ctx.fillRect(x, y, CW, FH); }
  ctx.strokeStyle = 'rgba(15,22,32,.8)'; ctx.lineWidth = 1.6; ctx.strokeRect(x + 0.8, y + 0.8, CW - 1.6, FH - 1.6);
}

const SKIN = ['#f2d3b8', '#e0b28f', '#b98962', '#8a5c3f'];
const SHIRT = { res: ['#e2574c', '#3f8edb', '#f0a92e', '#5bb974', '#9b6bd6', '#e9779c', '#2fa5a5', '#8c9aab'], work: ['#2f4b7a', '#4c5b6b', '#7a5a3a', '#35555b', '#5b3f6b', '#3c6e8f'], cust: ['#ff6b57', '#ffb020', '#37c0a0', '#7a8cff', '#ff7ab6'], jan: ['#f2c230'] };
function drawPerson(x, y, a, s) {
  const sh = SHIRT[a.kind] || SHIRT.res;
  ctx.fillStyle = sh[a.col % sh.length];
  rrect(x - 3 * s, y - 11 * s, 6 * s, 10 * s, 2 * s); ctx.fill();
  ctx.fillStyle = a.kind === 'jan' ? '#3b6ea5' : '#2a3140'; ctx.fillRect(x - 2.4 * s, y - 2.5 * s, 4.8 * s, 2.5 * s);
  ctx.fillStyle = SKIN[(a.id * 7) % 4]; ctx.beginPath(); ctx.arc(x, y - 14 * s, 3.1 * s, 0, 7); ctx.fill();
}

function drawAgents() {
  const S = cur.S, t = S.simT;
  const x0 = s2wx(-20), x1 = s2wx(W + 20);
  for (const a of S.agents) {
    if (a.dead || a.st === 'away' || a.st === 'ride') continue;
    const px = a.x * CW;
    if (px < x0 || px > x1) continue;
    let py = -a.fy * FH - 3;
    if (a.st === 'walk' || a.st === 'stair') py -= Math.abs(Math.sin(t * 9 + a.id)) * 1.3;
    drawPerson(px, py, a, 1);
    if (a.st === 'wait' && t - a.w0 > 22) {
      ctx.fillStyle = t - a.w0 > 50 ? '#d8302a' : '#e9a32a';
      ctx.beginPath(); ctx.arc(px, py - 24, 4.2, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 7px "Public Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', px, py - 21.5);
    }
  }
}

function drawShafts() {
  const S = cur.S;
  for (const r of S.rooms.values()) {
    if (r.type !== 'elev') continue;
    const sh = S.shafts.get(r.shaft);
    let open = false;
    if (sh) for (const car of sh.cars) if (car.st === 'dwell' && Math.round(car.y) === r.f) open = true;
    drawShaftCell(r, open);
  }
  for (const sh of S.shafts.values()) {
    const x = sh.col * CW;
    for (const car of sh.cars) {
      const y = -(car.y + 1) * FH;
      ctx.fillStyle = '#cfd6de'; rrect(x + 5, y + 4, CW - 10, FH - 8, 3); ctx.fill();
      ctx.fillStyle = '#b6a063'; ctx.fillRect(x + 5, y + 4, CW - 10, 3);
      ctx.fillStyle = car.st === 'dwell' ? '#fff3c4' : '#a9b3be'; ctx.fillRect(x + 8, y + 10, CW - 16, FH - 18);
      ctx.strokeStyle = 'rgba(20,28,40,.8)'; ctx.lineWidth = 1.2; ctx.strokeRect(x + 5.6, y + 4.6, CW - 11.2, FH - 9.2);
      let i = 0;
      for (const p of car.pass) {
        const px = x + 12 + (i % 4) * 5.5, py = y + FH - 9 - Math.floor(i / 4) * 9;
        drawPerson(px, py, p, 0.62);
        i++;
        if (i >= 8) break;
      }
      if (car.dir !== 0 && car.st === 'move') {
        ctx.fillStyle = '#2a3140'; ctx.beginPath();
        if (car.dir > 0) { ctx.moveTo(x + CW / 2, y + 9); ctx.lineTo(x + CW / 2 - 4, y + 14); ctx.lineTo(x + CW / 2 + 4, y + 14); }
        else { ctx.moveTo(x + CW / 2, y + 15); ctx.lineTo(x + CW / 2 - 4, y + 10); ctx.lineTo(x + CW / 2 + 4, y + 10); }
        ctx.fill();
      }
    }
    // files d'attente
    for (const k of Object.keys(sh.q)) {
      const n = sh.q[k].length;
      if (n < 5) continue;
      const y = -(+k + 1) * FH + 4;
      ctx.fillStyle = n >= 10 ? '#d8302a' : '#e9a32a'; ctx.beginPath(); ctx.arc(x + CW + 8, y + 8, 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 9px "Public Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(n), x + CW + 8, y + 11);
    }
  }
}

function ghostCells(g) {
  const T = E.TYPES[g.type];
  if (g.type === 'elev') { const f0 = Math.min(g.a, g.b), f1 = Math.max(g.a, g.b); return { f: f0, f1, c: g.c, w: 1, h: f1 - f0 + 1 }; }
  return { f: g.f, f1: g.f, c: g.c, w: T.w, h: T.h };
}
function ghostCheck(g) {
  const gc = ghostCells(g);
  const chk = E.canPlace(g.type, gc.f, gc.c, { f1: gc.f1 });
  if (chk.ok && E.S.cash < chk.cost) return { ok: false, reason: 'Fonds insuffisants', cost: chk.cost };
  return chk;
}

function drawGhost() {
  const g = ui.ghost;
  if (!g) return;
  const gc = ghostCells(g), chk = ghostCheck(g);
  const x = gc.c * CW, y = -(gc.f + gc.h) * FH, w = gc.w * CW, h = gc.h * FH;
  ctx.fillStyle = chk.ok ? 'rgba(40,190,110,.42)' : 'rgba(225,60,50,.42)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = chk.ok ? '#18a35e' : '#d8302a'; ctx.lineWidth = 2.4; ctx.setLineDash([7, 4]); ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); ctx.setLineDash([]);
  ctx.fillStyle = '#fff'; ctx.font = '800 12px "Big Shoulders Display", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(E.TYPES[g.type].name.toUpperCase(), x + w / 2, y + Math.min(h, FH) / 2 + 4);
}

function drawSelection() {
  const s = ui.sel;
  if (!s) return;
  ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 3 / cam.z * 0.9 + 1; ctx.setLineDash([]);
  if (s.kind === 'room') {
    const r = E.S.rooms.get(s.id); if (!r) return;
    ctx.strokeRect(r.c * CW - 1, -(r.f + r.h) * FH - 1, r.w * CW + 2, r.h * FH + 2);
  } else {
    const sh = E.S.shafts.get(s.id); if (!sh) return;
    ctx.strokeRect(sh.col * CW - 1, -(sh.f1 + 1) * FH - 1, CW + 2, (sh.f1 - sh.f0 + 1) * FH + 2);
  }
}

function drawFloats(now) {
  ctx.textAlign = 'center';
  for (let i = ui.floats.length - 1; i >= 0; i--) {
    const f = ui.floats[i], age = (now - f.t0) / 1400;
    if (age >= 1) { ui.floats.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - age * age;
    ctx.fillStyle = f.col; ctx.font = '800 14px "Big Shoulders Display", sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 3; ctx.strokeText(f.text, f.x, f.y - age * 34); ctx.fillText(f.text, f.x, f.y - age * 34);
  }
  ctx.globalAlpha = 1;
}

function draw(now) {
  const S = E.S;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSky();
  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (W / 2 - cam.x * cam.z), dpr * (H / 2 - cam.y * cam.z));
  drawGround();
  drawFloorLabels();
  drawBuildGrid();
  ui.tnow = now || 0;
  const TY = E.TYPES;
  const lit = new Set();
  for (const a of S.agents) if (a.cur && (a.st === 'in' || a.st === 'visit')) lit.add(a.cur);
  const m = S.T % E.DAY;
  const x0 = s2wx(-10), x1 = s2wx(W + 10), y0 = s2wy(-10), y1 = s2wy(H + 10);
  for (const r of S.rooms.values()) {
    if (r.type === 'elev') continue;
    const rx = r.c * CW, ry = -(r.f + r.h) * FH;
    if (rx + r.w * CW < x0 || rx > x1 || ry + r.h * FH < y0 || ry > y1) continue;
    let l = lit.has(r.id);
    if (r.tenant && TY[r.type].hours && E.isOpen(r, m)) l = true;
    if (r.type === 'hall') l = true;
    drawRoom(r, l);
  }
  drawShafts();
  drawAgents();
  drawGhost();
  drawSelection();
  drawFloats(now);
}

/* ───────── entrées tactiles ───────── */
const ptrs = new Map();
let gesture = null;
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY, sx: e.offsetX, sy: e.offsetY, t: performance.now(), moved: false });
  if (ptrs.size === 1) {
    const g = ui.ghost;
    let onGhost = false;
    if (g) {
      const gc = ghostCells(g), cl = cellOf(e.offsetX, e.offsetY);
      onGhost = cl.c >= gc.c && cl.c < gc.c + gc.w && cl.f >= gc.f && cl.f < gc.f + gc.h;
    }
    gesture = { mode: onGhost ? 'ghost' : 'pan', cx: cam.x, cy: cam.y };
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    gesture = { mode: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, wx: s2wx((a.x + b.x) / 2), wy: s2wy((a.y + b.y) / 2) };
  }
  cam.tx = null;
});
cv.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  p.x = e.offsetX; p.y = e.offsetY;
  if (Math.hypot(p.x - p.sx, p.y - p.sy) > 8) p.moved = true;
  if (!gesture) return;
  if (gesture.mode === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    cam.z = clamp(gesture.z * d / Math.max(10, gesture.d), 0.3, 2.4);
    cam.x = gesture.wx - (mx - W / 2) / cam.z; cam.y = gesture.wy - (my - H / 2) / cam.z;
    clampCam();
  } else if (gesture.mode === 'pan' && p.moved && ptrs.size === 1) {
    cam.x = gesture.cx - (p.x - p.sx) / cam.z; cam.y = gesture.cy - (p.y - p.sy) / cam.z; clampCam();
  } else if (gesture.mode === 'ghost' && p.moved) {
    moveGhostTo(p.x, p.y);
  }
});
function endPtr(e) {
  const p = ptrs.get(e.pointerId);
  ptrs.delete(e.pointerId);
  if (!p) return;
  if (!p.moved && performance.now() - p.t < 450 && ptrs.size === 0 && gesture && gesture.mode !== 'pinch') onTap(p.x, p.y);
  if (ptrs.size === 0) gesture = null;
  else if (ptrs.size === 1) { const q = [...ptrs.values()][0]; q.sx = q.x; q.sy = q.y; q.moved = true; gesture = { mode: 'pan', cx: cam.x, cy: cam.y }; }
}
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const wx = s2wx(e.offsetX), wy = s2wy(e.offsetY);
  cam.z = clamp(cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.3, 2.4);
  cam.x = wx - (e.offsetX - W / 2) / cam.z; cam.y = wy - (e.offsetY - H / 2) / cam.z; clampCam();
}, { passive: false });

function moveGhostTo(sx, sy) {
  const g = ui.ghost; if (!g) return;
  const cl = cellOf(sx, sy), T = E.TYPES[g.type];
  if (g.type === 'elev') { g.c = clamp(cl.c, 0, COLS - 1); const d = g.b - g.a; g.a = cl.f; g.b = cl.f + d; }
  else { g.c = clamp(cl.c - Math.floor((T.w - 1) / 2), 0, COLS - T.w); g.f = clamp(cl.f, E.FMIN, E.FMAX); }
  renderBuildBar();
}

function onTap(sx, sy) {
  const S = E.S, cl = cellOf(sx, sy);
  if (ui.tool) {
    const T = E.TYPES[ui.tool];
    if (ui.tool === 'elev' && ui.ghost && cl.c === ui.ghost.c) {
      ui.ghost.b = cl.f; renderBuildBar(); return;
    }
    if (ui.tool === 'elev') ui.ghost = { type: 'elev', c: clamp(cl.c, 0, COLS - 1), a: cl.f, b: cl.f };
    else ui.ghost = { type: ui.tool, c: clamp(cl.c - Math.floor((T.w - 1) / 2), 0, COLS - T.w), f: clamp(cl.f, E.FMIN, E.FMAX) };
    renderBuildBar();
    return;
  }
  // terrain à vendre
  const wx = s2wx(sx), wy = s2wy(sy);
  if (wy > -60 && wy < 4 && ((S.owned.l > 0 && Math.abs(wx - (S.owned.l * CW - 74)) < 34) || (S.owned.r < COLS - 1 && Math.abs(wx - ((S.owned.r + 1) * CW + 74)) < 34))) { openMenu('land'); return; }
  const r = E.roomAt(cl.f, cl.c);
  if (r) select(r.type === 'elev' ? { kind: 'shaft', id: r.shaft } : { kind: 'room', id: r.id });
  else select(null);
}

/* ───────── palette, barre de construction ───────── */
function buildDock() {
  const S = E.S, el = $('#tools');
  $('#cats').innerHTML = E.CATS.map(([id, nm]) => {
    const free = E.ORDER.filter((k) => E.TYPES[k].cat === id && S.rank >= E.TYPES[k].rank).length;
    return '<button class="cat" role="tab" data-cat="' + id + '" aria-selected="' + (ui.cat === id) + '">' + nm + (free ? '' : ' <i>★</i>') + '</button>';
  }).join('');
  let html = '<button class="tool hand" data-tool="" aria-pressed="' + (!ui.tool) + '"><span class="sw" style="background:transparent;border-color:var(--line);color:var(--ink)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5a1.5 1.5 0 013 0v5m0-1a1.5 1.5 0 013 0v2m0-1a1.5 1.5 0 013 0v4a6 6 0 01-6 6h-1a6 6 0 01-5-3l-2-4a1.5 1.5 0 012.5-1.5L9 14"/></svg></span><span class="nm">Visiter</span><span class="pr">&nbsp;</span></button>';
  for (const k of E.ORDER) {
    const T = E.TYPES[k];
    if (T.cat !== ui.cat) continue;
    const locked = S.rank < T.rank, dark = k === 'club' || k === 'observatory';
    html += '<button class="tool' + (locked ? ' locked' : '') + '" data-tool="' + k + '" aria-pressed="' + (ui.tool === k) + '" aria-label="' + T.name + '">' +
      '<span class="sw" style="background:' + TONES[k === 'elev' ? 'stair' : k][0] + (dark ? ';color:#e8ecff' : '') + '">' + SVG(k) + '</span><span class="nm">' + (T.ab || T.name) + '</span>' +
      '<span class="pr">' + (locked ? '★' + T.rank : eur(T.cost) + (k === 'elev' ? '/ét.' : '')) + '</span></button>';
  }
  el.innerHTML = html;
  el.scrollLeft = 0;
  ui.dockRank = S.rank;
}
function refreshDockState() {
  const S = E.S;
  document.querySelectorAll('.tool[data-tool]').forEach((b) => {
    const k = b.dataset.tool;
    b.setAttribute('aria-pressed', String(ui.tool === k || (!ui.tool && !k)));
    if (k) b.classList.toggle('poor', S.rank >= E.TYPES[k].rank && S.cash < E.TYPES[k].cost);
  });
}
$('#cats').addEventListener('click', (e) => {
  const b = e.target.closest('.cat'); if (!b) return;
  ui.cat = b.dataset.cat; buildDock(); refreshDockState();
});
$('#tools').addEventListener('click', (e) => {
  const b = e.target.closest('.tool'); if (!b) return;
  const k = b.dataset.tool;
  if (!k) { setTool(null); return; }
  const T = E.TYPES[k];
  if (E.S.rank < T.rank) { toast('Débloqué au rang ★' + T.rank + ' (' + E.RANK_POP[T.rank] + ' habitants).', 'warn'); SOUND.err(); return; }
  setTool(ui.tool === k ? null : k);
});

function setTool(k) {
  ui.tool = k; ui.ghost = null;
  if (k && E.TYPES[k].cat !== ui.cat) { ui.cat = E.TYPES[k].cat; buildDock(); }
  if (k) { select(null); ui.ghost = autoGhost(k); focusGhost(); }
  renderBuildBar(); refreshDockState();
}

function autoGhost(type, near) {
  const S = E.S, T = E.TYPES[type];
  const cc = near ? near.c : Math.floor(s2wx(W / 2) / CW), cf = near ? near.f : (T.floors === 'basement' ? -1 : 0);
  let best = null, bd = 1e9;
  if (type === 'elev') {
    let top = 1;
    for (const r of S.rooms.values()) top = Math.max(top, r.f + r.h - 1);
    top = Math.min(top, E.maxFloor());
    for (let c = S.owned.l; c <= S.owned.r; c++) {
      for (const tp of [top, 1, 0]) {
        const chk = E.canPlace('elev', 0, c, { f1: tp });
        if (!chk.ok) continue;
        const d = Math.abs(c - cc) + (tp === top ? 0 : 4);
        if (d < bd) { bd = d; best = { type, c, a: 0, b: tp }; }
        break;
      }
    }
    return best || { type, c: clamp(cc, S.owned.l, S.owned.r), a: 0, b: 0 };
  }
  const f0 = T.floors === 'basement' ? -1 : 0;
  for (let f = Math.max(E.minFloor(), f0 === -1 ? E.minFloor() : 0); f <= E.maxFloor(); f++) {
    if (T.floors === 'ground' && f !== 0) continue;
    if (T.floors === 'basement' && f >= 0) continue;
    if (T.minF && f < T.minF) continue;
    for (let c = S.owned.l; c + T.w - 1 <= S.owned.r; c++) {
      if (!E.canPlace(type, f, c).ok) continue;
      const d = Math.abs(c + T.w / 2 - cc) + Math.abs(f - cf) * 10;
      if (d < bd) { bd = d; best = { type, c, f }; }
    }
  }
  if (best) return best;
  return { type, c: clamp(cc, S.owned.l, S.owned.r - T.w + 1), f: T.floors === 'basement' ? -1 : Math.max(0, cf) };
}

function focusGhost() {
  const g = ui.ghost; if (!g) return;
  const gc = ghostCells(g);
  const sx = w2sx((gc.c + gc.w / 2) * CW), sy = w2sy(-(gc.f + gc.h / 2) * FH);
  if (sx < 30 || sx > W - 30 || sy < 140 || sy > H - 260) { cam.tx = (gc.c + gc.w / 2) * CW; cam.ty = -(gc.f + gc.h / 2) * FH + (H * 0.12) / cam.z; }
}

function renderBuildBar() {
  const el = $('#build'), g = ui.ghost;
  if (!ui.tool || !g) { el.hidden = true; el.innerHTML = ''; return; }
  const T = E.TYPES[g.type], gc = ghostCells(g), chk = ghostCheck(g);
  const cost = chk.cost != null ? chk.cost : E.costOf(g.type, gc.f, gc.c, { f1: gc.f1 });
  let where = E.label(gc.f) + (g.type === 'elev' && gc.f1 > gc.f ? ' → ' + E.label(gc.f1) : '');
  const step = g.type === 'elev'
    ? '<button class="btn sm" data-b="down" aria-label="Moins un étage">▼</button><button class="btn sm" data-b="up" aria-label="Plus un étage">▲</button>' : '';
  el.hidden = false;
  el.innerHTML = '<div class="bbar"><div class="info"><div class="t">' + T.name + ' · ' + where + '</div>' +
    '<div class="s' + (chk.ok ? '' : ' err') + '">' + (chk.ok ? (g.type === 'elev' ? (gc.h) + ' étage' + (gc.h > 1 ? 's' : '') + ' · glissez ou touchez un autre étage pour allonger' : T.desc) : chk.reason) + '</div></div>' +
    '<span class="price">' + eur(cost) + '</span>' + step +
    '<button class="btn" data-b="cancel" aria-label="Annuler">✕</button>' +
    '<button class="btn pri" data-b="ok"' + (chk.ok ? '' : ' disabled') + '>Construire</button></div>';
}
$('#build').addEventListener('click', (e) => {
  const b = e.target.closest('[data-b]'); if (!b || !ui.ghost) return;
  const g = ui.ghost, act = b.dataset.b;
  if (act === 'cancel') { setTool(null); return; }
  if (act === 'up') { const hi = Math.max(g.a, g.b), lo = Math.min(g.a, g.b); g.a = lo; g.b = Math.min(hi + 1, E.maxFloor()); renderBuildBar(); return; }
  if (act === 'down') { const hi = Math.max(g.a, g.b), lo = Math.min(g.a, g.b); g.a = lo; g.b = Math.max(lo, hi - 1); renderBuildBar(); return; }
  if (act === 'ok') {
    const gc = ghostCells(g);
    const res = E.place(g.type, gc.f, gc.c, { f1: gc.f1 });
    if (!res.ok) { toast(res.reason, 'warn'); SOUND.err(); return; }
    ui.floats.push({ x: (gc.c + gc.w / 2) * CW, y: -(gc.f + gc.h) * FH, text: '−' + fmt(res.cost) + ' €', col: '#ff9a8a', t0: performance.now() });
    if (g.type === 'elev') { ui.ghost = autoGhost('elev', { c: gc.c, f: gc.f }); }
    else ui.ghost = autoGhost(g.type, { c: gc.c + gc.w, f: gc.f });
    renderBuildBar(); queueSave();
  }
});

/* ───────── sélection et panneaux ───────── */
function select(s) {
  ui.sel = s;
  if (!s) { if (ui.sheet === 'room') closeSheet(); return; }
  if (ui.tool) setTool(null);
  openRoomSheet();
  const S = E.S;
  let wx, wy;
  if (s.kind === 'room') { const r = S.rooms.get(s.id); if (!r) return; wx = (r.c + r.w / 2) * CW; wy = -(r.f + r.h / 2) * FH; }
  else { const sh = S.shafts.get(s.id); if (!sh) return; wx = (sh.col + 0.5) * CW; wy = -((sh.f0 + sh.f1 + 1) / 2) * FH; }
  const sy = w2sy(wy);
  if (sy > H * 0.5 || sy < 130) { cam.tx = wx; cam.ty = wy + (H * 0.22) / cam.z; }
}

const wrap = $('#sheetwrap');
function closeSheet() {
  if (ui.sheet === 'welcome') LS.set('verticale-seen', '1');
  ui.sheet = null; wrap.className = 'layer'; wrap.innerHTML = '';
  if (ui.modal) { ui.modal = false; }
  if (ui.sel && !ui.keepSel) ui.sel = null;
}
function sheetHTML(cls, title, body, tabs) {
  return (cls === 'room' ? '' : '<div class="back" data-close="1"></div>') + '<section class="sheet ' + cls + '" role="dialog" aria-label="' + title + '"><header><h2>' + title + '</h2><button class="x" data-close="1" aria-label="Fermer">✕</button></header>' +
    (tabs || '') + '<div class="sbody">' + body + '</div></section>';
}
wrap.addEventListener('pointerdown', () => { ui.holdUntil = performance.now() + 900; });
wrap.addEventListener('click', (e) => {
  const t = e.target.closest('[data-close],[data-act],[data-tab]');
  if (!t) return;
  if (t.dataset.close) { closeSheet(); return; }
  if (t.dataset.tab) { ui.tab = t.dataset.tab; ui.confirmNew = false; renderMenu(); return; }
  doAct(t.dataset.act, t);
});
wrap.addEventListener('input', (e) => { if (e.target.id === 'imp') { ui.pendingImport = null; const m = $('#imp-msg'); if (m) m.innerHTML = ''; } });

function satBar(v) { return '<div class="bar" role="img" aria-label="Satisfaction ' + Math.round(v) + ' %"><i class="' + (v >= 70 ? '' : v >= 45 ? 'mid' : 'low') + '" style="width:' + clamp(v, 2, 100) + '%"></i></div>'; }
const POLN = ['Bas', 'Normal', 'Élevé'];
const WD = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
function hoursText(T) {
  const f = (m) => { m = m % 1440; return Math.floor(m / 60) + ' h' + (m % 60 ? String(m % 60).padStart(2, '0') : ''); };
  return f(T.hours[0]) + '–' + f(T.hours[1]) + (T.days === 'week' ? ' · lun–ven' : '');
}
function bdChips(bd) {
  const items = [['Transport', -bd.stress], ['Bruit', -bd.noise], ['Propreté', -bd.dirt], ['Vue', bd.view], ['Services', -bd.svc], ['Commodités', bd.bonus || 0], ['Rénové', bd.reno || 0], ['Loyer', bd.pol || 0]];
  return '<div class="chips">' + items.filter((i) => Math.abs(i[1]) >= 1).map((i) => '<span class="chip ' + (i[1] < 0 ? 'neg' : 'pos') + '">' + i[0] + ' ' + (i[1] > 0 ? '+' : '−') + Math.round(Math.abs(i[1])) + '</span>').join('') + '</div>';
}
function openRoomSheet() {
  const s = ui.sel; if (!s) return;
  const S = E.S;
  ui.sheet = 'room'; ui.modal = false;
  let title, body;
  if (s.kind === 'room') {
    const r = S.rooms.get(s.id); if (!r) { closeSheet(); return; }
    const T = E.TYPES[r.type];
    title = T.name + ' · ' + E.label(r.f);
    const dm = E.canDemolish(r);
    let st = '';
    if (T.lease) {
      if (!r.reach) st = '<p class="p"><b style="color:var(--bad)">Sans accès.</b> Aucune route continue jusqu’au hall : le locataire ne viendra pas. Reliez cette pièce par des pièces voisines, un escalier ou un ascenseur.</p>';
      else if (!r.tenant) st = '<p class="p"><b>À louer.</b> Un locataire arrive en général en un à deux jours.</p>';
      else {
        const lv = r.lvl || 0, canReno = r.type !== 'parking', pol = r.pol || 0;
        st = '<dl class="kv"><dt>Satisfaction</dt><dd>' + Math.round(r.sat) + ' %</dd></dl>' + satBar(r.sat) + bdChips(r.bd || {}) +
          '<dl class="kv"><dt>Loyer</dt><dd>' + eur(E.rentNow(r)) + ' / jour</dd><dt>Propreté</dt><dd>' + Math.round(100 - r.dirt) + ' %</dd>' +
          (T.cap ? '<dt>Clients hier</dt><dd>' + r.visY + '</dd>' : '') + (r.type !== 'parking' ? '<dt>Trajets moyens</dt><dd>' + r.trip.toFixed(0) + ' s</dd>' : '') +
          (T.hours ? '<dt>Ouverture</dt><dd>' + hoursText(T) + '</dd>' : '') +
          (canReno ? '<dt>Rénovation</dt><dd>' + ['Standard', 'Rénové ★', 'Luxe ★★'][lv] + '</dd>' : '') +
          (T.rent ? '<dt>Politique de loyer</dt><dd>' + POLN[pol + 1] + '</dd>' : '') + '</dl>';
        const bt = [];
        if (canReno) bt.push('<button class="btn" data-act="reno"' + (lv >= 2 ? ' disabled' : '') + '>' + (lv >= 2 ? 'Luxe atteint' : 'Rénover · ' + eur(E.upgradeRoomCost(r))) + '</button>');
        if (T.rent) bt.push('<button class="btn" data-act="pol">Loyer : ' + POLN[pol + 1] + '</button>');
        if (bt.length) st += '<div class="acts">' + bt.join('') + '</div><p class="p fine">Rénover augmente la satisfaction et le loyer. Un loyer élevé rapporte plus mais mécontente ; un loyer bas fidélise.</p>';
      }
    } else if (T.service) {
      st = '<p class="p">' + T.desc + '</p>' + (!r.reach && T.fx !== 'solar' ? '<p class="p"><b style="color:var(--bad)">Sans accès.</b> Reliez cette pièce au hall : sans accès, elle ne produit aucun effet.</p>' : '') +
        (T.income ? '<dl class="kv"><dt>Revenu</dt><dd>' + eur(T.income) + ' / jour</dd></dl>' : '');
    } else st = '<p class="p">' + T.desc + '</p>';
    body = st + '<div class="acts"><button class="btn bad" data-act="demolish"' + (dm.ok ? '' : ' disabled') + '>Démolir' + (dm.ok ? ' (+' + eur(dm.refund) + ')' : '') + '</button></div>' + (dm.ok ? '' : '<p class="p">' + dm.reason + '.</p>');
  } else {
    const sh = S.shafts.get(s.id); if (!sh) { closeSheet(); return; }
    title = 'Ascenseur · ' + E.label(sh.f0) + ' à ' + E.label(sh.f1);
    const top = E.roomAt(sh.f1, sh.col), dm = E.canDemolish(top);
    body = '<dl class="kv"><dt>Cabines</dt><dd>' + sh.ncars + ' / ' + E.MAX_CARS + '</dd><dt>Vitesse</dt><dd>Niveau ' + sh.lvl + ' / 3</dd><dt>Attente moyenne</dt><dd>' + Math.round(sh.wavg) + ' s</dd>' +
      '<dt>En attente maintenant</dt><dd>' + Object.keys(sh.q).reduce((a, k) => a + sh.q[k].length, 0) + '</dd></dl>' +
      '<div class="acts"><button class="btn" data-act="car+"' + (sh.ncars >= E.MAX_CARS ? ' disabled' : '') + '>+ Cabine · ' + eur(E.CAR_COST) + '</button>' +
      '<button class="btn" data-act="car-"' + (sh.ncars <= 1 ? ' disabled' : '') + '>− Cabine</button>' +
      '<button class="btn" data-act="upg"' + (sh.lvl >= 3 || S.rank < 3 ? ' disabled' : '') + '>Moderniser · ' + (sh.lvl >= 3 ? 'max' : S.rank < 3 ? '★3' : eur(E.upgradeCost(sh))) + '</button></div>' +
      '<div class="acts"><button class="btn bad" data-act="demolish-top"' + (dm.ok ? '' : ' disabled') + '>Retirer l’étage du haut' + (dm.ok ? ' (+' + eur(dm.refund) + ')' : '') + '</button></div>' +
      '<p class="p">Les cabines suivent les appels et se garent au rez-de-chaussée. Plus de cabines et un moteur plus rapide raccourcissent l’attente.</p>';
  }
  ui.keepSel = true;
  wrap.className = 'layer show'; wrap.innerHTML = sheetHTML('room', title, body);
  ui.keepSel = false;
  wrap.style.pointerEvents = 'none';
}

function doAct(act) {
  const S = E.S;
  let res = null;
  const s = ui.sel;
  if (act === 'demolish' && s && s.kind === 'room') { res = E.demolish(s.id); if (res.ok) { toast('Démoli, remboursé ' + eur(res.refund) + '.'); ui.sel = null; closeSheet(); } }
  else if (act === 'demolish-top' && s && s.kind === 'shaft') {
    const sh = S.shafts.get(s.id); const top = E.roomAt(sh.f1, sh.col);
    res = E.demolish(top.id);
    if (res.ok) { if (S.shafts.has(s.id)) openRoomSheet(); else { ui.sel = null; closeSheet(); } }
  }
  else if (act === 'reno' && s && s.kind === 'room') { res = E.upgradeRoom(s.id); if (res.ok) { toast('Rénovation terminée', 'good'); openRoomSheet(); } }
  else if (act === 'pol' && s && s.kind === 'room') {
    const r = E.S.rooms.get(s.id), nx = { 0: 1, 1: -1, '-1': 0 }[r.pol || 0];
    res = E.setPolicy(s.id, nx); if (res.ok) openRoomSheet();
  }
  else if (act === 'car+' && s) res = E.addCar(s.id);
  else if (act === 'car-' && s) res = E.removeCar(s.id);
  else if (act === 'upg' && s) res = E.upgradeShaft(s.id);
  else if (act === 'borrow') res = E.borrow();
  else if (act === 'repay') res = E.repay();
  else if (act === 'land-l') res = E.buyLand('l');
  else if (act === 'land-r') res = E.buyLand('r');
  else if (act === 'save-now') {
    const ok = save(true);
    toast(ok ? 'Partie sauvegardée' : 'Le navigateur refuse l’enregistrement : exportez la partie.', ok ? 'good' : 'warn');
    if (!ok && ui.sheet === 'menu') renderMenu();
    return;
  }
  else if (act === 'cloud-up') { cloudUp(false); return; }
  else if (act === 'cloud-up-force') { cloudUp(true); return; }
  else if (act === 'cloud-down') { cloudDown(); return; }
  else if (act === 'exp') { doExport(); return; }
  else if (act === 'copy') { doCopy(); return; }
  else if (act === 'imp-check') { doImportCheck(); return; }
  else if (act === 'imp-go') { doImportGo(); return; }
  else if (act === 'mute') { ui.muted = !ui.muted; LS.set('verticale-mute', ui.muted ? '1' : '0'); renderMenu(); return; }
  else if (act === 'newgame') { if (!ui.confirmNew) { ui.confirmNew = true; renderMenu(); return; } newGameStart(true); return; }
  else if (act === 'start') { closeSheet(); LS.set('verticale-seen', '1'); resumeIfModal(); return; }
  else if (act === 'restart') { newGameStart(true); return; }
  else if (act === 'help') { ui.tab = 'help'; renderMenu(); return; }
  if (res && !res.ok) { toast(res.reason, 'warn'); SOUND.err(); }
  if (res && res.ok) queueSave();
  if (ui.sheet === 'room') openRoomSheet(); else if (ui.sheet === 'menu') renderMenu();
}

function openMenu(tab) {
  ui.tab = tab || 'goals'; ui.sheet = 'menu'; ui.modal = true; ui.confirmNew = false;
  if (ui.tool) setTool(null);
  renderMenu();
}
function renderMenu() {
  const S = E.S;
  const T = [['goals', 'Objectifs'], ['tower', 'Tour'], ['report', 'Bilan'], ['bank', 'Banque'], ['land', 'Terrain'], ['save', 'Sauvegarde'], ['settings', 'Réglages'], ['help', 'Aide']];
  const tabs = '<div class="tabs" role="tablist">' + T.map((t) => '<button role="tab" data-tab="' + t[0] + '" aria-selected="' + (ui.tab === t[0]) + '">' + t[1] + '</button>').join('') + '</div>';
  let body = '';
  if (ui.tab === 'goals') {
    const rk = S.rank;
    let rc = '<div class="rankcard"><span class="lbl">Rang actuel</span><div class="stars">' + starsHTML(rk) + '</div>';
    if (rk < 5) {
      const np = E.RANK_POP[rk + 1], ns = E.RANK_SAT[rk + 1];
      rc += '<p class="p" style="margin:6px 0 4px">Pour le rang ★' + (rk + 1) + ' : <b>' + np + ' habitants</b>' + (ns ? ' et <b>' + ns + ' % de satisfaction</b>' : '') + '.</p>' +
        '<dl class="kv" style="margin:4px 0"><dt>Habitants</dt><dd>' + S.pop + ' / ' + np + '</dd></dl>' + satBarSimple(S.pop / np * 100) +
        (ns ? '<dl class="kv" style="margin:6px 0 4px"><dt>Satisfaction</dt><dd>' + Math.round(S.avgSat) + ' / ' + ns + ' %</dd></dl>' + satBarSimple(S.avgSat / ns * 100) : '') +
        '<p class="p" style="margin:8px 0 0">Débloque : ' + unlocks(rk + 1) + '. Hauteur maximale ' + E.label(E.RANK_FLOORS[rk + 1]) + '.</p>';
    } else rc += '<p class="p" style="margin:6px 0 0">Rang maximal. La tour n’a plus de limite de hauteur au-delà de ' + E.label(45) + '.</p>';
    rc += '</div>';
    let list = '';
    if (S.goalIdx > 3) list += '<p class="fine" style="margin:8px 0 2px">' + S.goalIdx + ' / ' + E.GOALS.length + ' objectifs accomplis</p>';
    E.GOALS.forEach((g, i) => {
      if (i < S.goalIdx - 3) return;
      if (i < S.goalIdx) list += '<div class="goal done"><span class="ck">✓</span><div><b>' + g.t + '</b><small>+' + eur(g.rw) + ' encaissés</small></div></div>';
      else if (i === S.goalIdx) list += '<div class="goal now"><span class="ck"></span><div><b>' + g.t + '</b><small>Récompense ' + eur(g.rw) + '</small></div></div>';
      else if (i <= S.goalIdx + 2) list += '<div class="goal"><span class="ck"></span><div><b>' + g.t + '</b><small>Récompense ' + eur(g.rw) + '</small></div></div>';
    });
    if (S.goalIdx >= E.GOALS.length) list += '<p class="p">Tous les objectifs sont accomplis. Il ne reste qu’à agrandir la tour.</p>';
    body = rc + list;
  } else if (ui.tab === 'tower') {
    body = towerHTML();
  } else if (ui.tab === 'report') {
    const h = S.hist.slice(-14);
    if (!h.length) body = '<p class="p">Le premier bilan arrive à minuit : loyers encaissés, charges payées.</p>';
    else {
      const maxA = Math.max(1000, ...h.map((d) => Math.abs(d.net))), bw = 26, hh = 110, mid = 62;
      let bars = '';
      h.forEach((d, i) => {
        const v = d.net / maxA * 52, x = 8 + i * (bw + 4);
        bars += '<rect x="' + x + '" y="' + (v >= 0 ? mid - v : mid) + '" width="' + bw + '" height="' + Math.max(1.5, Math.abs(v)) + '" rx="2" fill="' + (v >= 0 ? 'var(--good)' : 'var(--bad)') + '"/><text x="' + (x + bw / 2) + '" y="' + (hh + 10) + '" font-size="9" text-anchor="middle" fill="var(--ink-2)">J' + (d.day + 1) + '</text>';
      });
      const wsvg = 16 + h.length * (bw + 4);
      const L = h[h.length - 1];
      body = '<div class="lbl">Résultat net par jour</div><div class="chart"><svg viewBox="0 0 ' + wsvg + ' ' + (hh + 16) + '" width="' + Math.max(wsvg, 300) + '" height="' + (hh + 16) + '" role="img" aria-label="Résultat net des derniers jours"><line x1="0" x2="' + wsvg + '" y1="' + mid + '" y2="' + mid + '" stroke="var(--line)"/>' + bars + '</svg></div>' +
        '<table class="tbl"><tr><td>Loyers (J' + (L.day + 1) + ')</td><td>' + eur(L.rent) + '</td></tr><tr><td>Ventes des commerces</td><td>' + eur(L.sales) + '</td></tr>' + (L.other ? '<tr><td>Autres revenus</td><td>' + eur(L.other) + '</td></tr>' : '') + '<tr><td>Charges et intérêts</td><td>−' + eur(L.costs) + '</td></tr><tr><td>Résultat net</td><td style="color:' + (L.net >= 0 ? 'var(--good)' : 'var(--bad)') + '">' + (L.net >= 0 ? '+' : '−') + eur(Math.abs(L.net)) + '</td></tr></table>';
    }
    body += '<table class="tbl"><tr><td>Charges prévues par jour</td><td>' + eur(E.costsPerDay()) + '</td></tr><tr><td>Attractivité de la tour</td><td>' + Math.round(S.attr) + ' / 100</td></tr><tr><td>Satisfaction moyenne</td><td>' + Math.round(S.avgSat) + ' %</td></tr></table>';
  } else if (ui.tab === 'bank') {
    body = '<dl class="kv"><dt>Trésorerie</dt><dd>' + eur(S.cash) + '</dd><dt>Dette</dt><dd>' + eur(S.debt) + '</dd><dt>Intérêts</dt><dd>' + eur(S.debt * E.interestRate()) + ' / jour</dd></dl>' +
      '<p class="p">Un prêt verse <b>20 000 €</b> et se rembourse <b>22 000 €</b>, avec ' + (E.interestRate() * 100).toFixed(1).replace('.', ',') + ' % d’intérêt par jour tant que la dette court' + (S.fx && S.fx.bank ? ' (taux réduit grâce à votre banque)' : '') + '. En dessous de −30 000 € pendant trois jours, c’est la faillite.</p>' +
      '<div class="acts"><button class="btn pri" data-act="borrow"' + (S.debt >= 60000 ? ' disabled' : '') + '>Emprunter 20 000 €</button><button class="btn" data-act="repay"' + (S.debt <= 0 ? ' disabled' : '') + '>Rembourser 22 000 €</button></div>';
  } else if (ui.tab === 'land') {
    const cols = S.owned.r - S.owned.l + 1, cost = E.landCost();
    body = '<dl class="kv"><dt>Largeur du terrain</dt><dd>' + cols + ' cases</dd><dt>Prix des 4 cases suivantes</dt><dd>' + eur(cost) + '</dd></dl>' +
      '<p class="p">Un terrain plus large permet des étages plus longs et plusieurs colonnes d’ascenseurs. Chaque achat coûte plus cher que le précédent.</p>' +
      '<div class="acts"><button class="btn" data-act="land-l"' + (S.owned.l < 4 ? ' disabled' : '') + '>← Acheter à gauche</button><button class="btn" data-act="land-r"' + (S.owned.r > COLS - 5 ? ' disabled' : '') + '>Acheter à droite →</button></div>';
  } else if (ui.tab === 'save') {
    body = saveTabHTML();
  } else if (ui.tab === 'settings') {
    body = '<div class="acts"><button class="btn" data-act="mute">Son : ' + (ui.muted ? 'coupé' : 'activé') + '</button><button class="btn" data-act="help">Comment jouer</button></div>' +
      '<p class="p">Pour garder une copie de la partie, la mettre dans le cloud ou la changer d’appareil, ouvrez l’onglet Sauvegarde.</p>' +
      '<div class="acts"><button class="btn bad" data-act="newgame">' + (ui.confirmNew ? 'Confirmer : tout effacer' : 'Nouvelle partie') + '</button></div>';
  } else {
    body = helpHTML();
  }
  wrap.className = 'layer show'; wrap.style.pointerEvents = '';
  wrap.innerHTML = sheetHTML('menu', 'Verticale', body, tabs);
  ui.sheet = 'menu'; ui.modal = true;
  if (ui.tab === 'save') { cloudUI(); if (cloud.state === 'ready' && Date.now() - cloud.readAt > 20000) cloudRead(); }
  const tb = wrap.querySelector('.tabs'), sel = tb && tb.querySelector('[aria-selected="true"]');
  if (tb && sel) tb.scrollLeft += sel.getBoundingClientRect().left - tb.getBoundingClientRect().left - (tb.clientWidth - sel.offsetWidth) / 2;
}
function towerHTML() {
  const S = E.S, st = E.statsNow(), fmtP = (v) => Math.round(v * 100) + ' %';
  let h = '<dl class="kv"><dt>Occupation</dt><dd>' + st.tenants + ' / ' + st.leased + ' (' + fmtP(st.occ) + ')</dd></dl><div class="bar"><i class="' + (st.occ >= 0.7 ? '' : st.occ >= 0.4 ? 'mid' : 'low') + '" style="width:' + clamp(st.occ * 100, 2, 100) + '%"></i></div>' +
    '<dl class="kv"><dt>Habitants et salariés</dt><dd>' + S.pop + '</dd><dt>Satisfaction moyenne</dt><dd>' + Math.round(S.avgSat) + ' %</dd><dt>Attractivité</dt><dd>' + Math.round(S.attr) + ' / 100</dd>' +
    '<dt>Variété de pièces</dt><dd>' + st.kinds + ' / ' + E.ORDER.length + '</dd><dt>Attente moyenne</dt><dd>' + Math.round(st.wait) + ' s</dd></dl>';
  h += '<div class="lbl sub">Par catégorie</div><div class="chart"><table class="tbl cols"><tr class="th"><td>Catégorie</td><td>Pièces</td><td>Vides</td><td>Loyers/j</td><td>Charges/j</td></tr>' +
    E.CATS.filter((c) => st.cats[c[0]]).map((c) => { const o = st.cats[c[0]]; return '<tr><td>' + c[1] + '</td><td>' + o.n + '</td><td>' + (o.vac || '·') + '</td><td>' + (o.rent ? eur(o.rent) : '·') + '</td><td>' + eur(o.up) + '</td></tr>'; }).join('') + '</table></div>';
  const fx = S.fx || {}, names = { sec: 'Sécurité', tech: 'Technique', trash: 'Déchets', solar: 'Solaire', metro: 'Métro', heli: 'Héliport', bank: 'Banque' };
  const act = Object.keys(fx).filter((k) => names[k]);
  h += '<div class="lbl sub">Effets actifs</div>';
  if (!act.length) h += '<p class="p">Aucun. Les services (sécurité, déchets, local technique, métro…) donnent des bonus à toute la tour.</p>';
  else {
    h += '<div class="chips">' + act.map((k) => '<span class="chip pos">' + names[k] + (fx[k] > 1 ? ' ×' + fx[k] : '') + '</span>').join('') + '</div><ul class="fxl">' +
      act.map((k) => { const t = E.ORDER.map((id) => E.TYPES[id]).find((T) => T.fx === k); return '<li><b>' + t.name + '.</b> ' + t.desc + '</li>'; }).join('') + '</ul>';
  }
  h += '<div class="lbl sub">Journal</div>';
  if (!st.log.length) h += '<p class="p">Rien à signaler pour le moment. Des événements surviennent chaque jour : pannes, fuites, inspections, tournages, fêtes…</p>';
  else h += '<ul class="jrn">' + st.log.map((l) => '<li class="' + (l.lvl || 'info') + '"><span>J' + (Math.floor(l.t / E.DAY) + 1) + '</span>' + escHTML(l.text) + '</li>').join('') + '</ul>';
  return h;
}
function escHTML(t) { return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function saveTabHTML() {
  const when = ui.savedAt ? fmtWhen(ui.savedAt) : 'pas encore';
  return '<dl class="kv"><dt>Dernière sauvegarde</dt><dd id="save-at">' + when + '</dd><dt>Enregistrée dans</dt><dd>ce navigateur</dd></dl>' +
    (ui.saveFail ? '<p class="p warnp"><b>Le navigateur refuse d’enregistrer.</b> Exportez votre partie ci-dessous pour ne pas la perdre.</p>'
      : '<p class="p">La partie s’enregistre seule à chaque jour de jeu, après chaque construction et quand vous quittez la page.</p>') +
    '<div class="acts"><button class="btn pri" data-act="save-now">Sauvegarder maintenant</button></div>' +
    '<div class="lbl sub">Cloud, compte Claude</div><p class="p">Gardez la partie dans un espace privé lié à votre compte, pour la reprendre sur un autre appareil. Rien n’est envoyé sans votre action.</p>' +
    '<p class="p" id="cloud-info" aria-live="polite"></p><p class="fine">Cet appareil : jour ' + E.dateInfo().day + ', ' + E.S.rooms.size + ' pièces.</p>' +
    '<div class="acts"><button class="btn" id="btn-up" data-act="cloud-up" disabled>Envoyer vers le cloud</button><button class="btn" id="btn-down" data-act="cloud-down" disabled>Récupérer</button></div><div id="cloud-msg" class="msg" aria-live="polite"></div>' +
    '<div class="lbl sub">Exporter</div><p class="p">Générez un code pour garder une copie ou continuer sur un autre appareil.</p>' +
    '<div class="acts"><button class="btn" data-act="exp">Générer le code</button><button class="btn" data-act="copy" id="btn-copy" disabled>Copier</button></div>' +
    '<textarea id="exp" class="code" readonly rows="3" placeholder="Le code apparaît ici" aria-label="Code de sauvegarde à copier"></textarea><p class="fine" id="exp-msg" aria-live="polite"></p>' +
    '<div class="lbl sub">Importer</div><p class="p">Collez un code Verticale. La partie en cours sera remplacée.</p>' +
    '<textarea id="imp" class="code" rows="3" placeholder="VERTICALE1…" aria-label="Code de sauvegarde à importer" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea>' +
    '<div class="acts"><button class="btn" data-act="imp-check">Vérifier le code</button></div><div id="imp-msg" class="msg" aria-live="polite"></div>';
}
async function doExport() {
  const ta = $('#exp'), msg = $('#exp-msg'), cb = $('#btn-copy');
  if (!ta) return;
  try {
    const code = await encodeSave(E.serialize());
    ui.exportCode = code; ta.value = code; cb.disabled = false;
    msg.textContent = 'Code de ' + fmt(code.length) + ' caractères. Touchez Copier, puis collez-le dans une note ou un message.';
  } catch (e) { msg.textContent = 'Impossible de générer le code.'; }
}
function doCopy() {
  const code = ui.exportCode, ta = $('#exp'), msg = $('#exp-msg');
  if (!code || !ta) return;
  const fallback = () => { ta.focus(); ta.select(); try { ta.setSelectionRange(0, code.length); } catch (e) { /* ignoré */ } msg.textContent = 'Copie automatique impossible : le texte est sélectionné, copiez-le avec votre clavier.'; };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(() => { msg.textContent = 'Code copié.'; toast('Code copié', 'good'); }, fallback);
    else fallback();
  } catch (e) { fallback(); }
}
async function doImportCheck() {
  const ta = $('#imp'), msg = $('#imp-msg');
  if (!ta) return;
  ui.pendingImport = null;
  const showErr = (t) => { msg.innerHTML = '<p class="p err"></p>'; msg.firstChild.textContent = t; };
  const text = ta.value.trim();
  if (!text) { showErr('Collez d’abord un code.'); return; }
  try {
    const obj = await decodeSave(text);
    const v = E.validate(obj);
    if (!v.ok) throw new Error('Ce code n’est pas une partie valide : ' + v.reason);
    ui.pendingImport = obj;
    const i = v.info;
    msg.innerHTML = '<p class="p"><b>Code valide.</b> Tour de ' + i.rooms + ' pièces, jour ' + i.day + ', rang ★' + i.rank + ', trésorerie ' + eur(i.cash) + '. Elle remplacera votre partie actuelle.</p><div class="acts"><button class="btn bad" data-act="imp-go">Remplacer ma partie</button></div>';
    msg.scrollIntoView({ block: 'nearest' });
  } catch (e) { showErr(e.message); }
}
function doImportGo() {
  const obj = ui.pendingImport;
  if (!obj) return;
  const backup = E.serialize();
  let ok = false;
  try { ok = !!E.deserialize(obj); } catch (e) { ok = false; }
  if (!ok) { try { E.deserialize(backup); } catch (e) { /* ignoré */ } toast('Import impossible : votre partie est conservée.', 'warn'); return; }
  ui.pendingImport = null; ui.tool = null; ui.ghost = null; ui.sel = null; ui.floats = []; ui.advDismiss = {};
  E.S.events.length = 0;
  closeSheet(); buildDock(); renderBuildBar(); fitLot(); save(true);
  toast('Partie importée : jour ' + E.dateInfo().day, 'good');
}
/* cloud : espace privé du compte via la capacité db (absente hors de claude.ai) */
const cloud = { state: 'init', ref: null, doc: null, readAt: 0, busy: false, err: '' };
function cloudErr(e) {
  const c = e && e.code;
  if (c === 'timeout') return 'Le cloud ne répond pas. Réessayez dans un instant.';
  if (c === 'quota_exceeded') return 'L’espace cloud de cette page est plein.';
  if (c === 'resource_exhausted') return 'Trop de demandes d’affilée. Patientez quelques secondes.';
  if (c === 'revoked') return 'L’accès au cloud a été retiré pour cette page.';
  if (c === 'invalid_argument') return 'Le cloud a refusé l’écriture : droits insuffisants sur cette page, ou partie trop volumineuse.';
  return 'Cloud injoignable pour le moment. Réessayez plus tard.';
}
function cloudCall(fn) {
  const once = () => new Promise((res, rej) => {
    const t = setTimeout(() => rej({ code: 'timeout' }), ui.cloudTimeout || 10000);
    Promise.resolve().then(fn).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
  return once().catch((e) => (e && e.code === 'unavailable') ? new Promise((r) => setTimeout(r, 500 + Math.random() * 500)).then(once) : Promise.reject(e));
}
async function cloudInit() {
  try {
    const cl = window.claude;
    if (!cl || typeof cl.use !== 'function') throw new Error('absent');
    const [db, user] = await Promise.all([cl.use('db'), cl.use('user')]);
    const uid = user ? await user.id() : null;
    if (!db || !uid) throw new Error('absent');
    cloud.ref = db.doc('data/users/' + uid + '/save'); cloud.state = 'ready';
  } catch (e) { cloud.state = 'off'; }
  cloudUI();
  if (cloud.state === 'ready' && ui.sheet === 'menu' && ui.tab === 'save') cloudRead();
}
const cn = (x) => Math.round(Number(x) || 0);
const cloudSummary = (d) => 'jour ' + cn(d.day) + ', ' + cn(d.rooms) + ' pièces, rang ★' + cn(d.rank);
function cloudMsg(text, kind, btn) {
  const m = $('#cloud-msg'); if (!m) return;
  m.innerHTML = '<p class="p' + (kind === 'err' ? ' err' : '') + '"></p>' + (btn ? '<div class="acts"><button class="btn bad" data-act="' + btn[0] + '">' + btn[1] + '</button></div>' : '');
  m.firstChild.textContent = text;
}
function cloudUI() {
  const info = $('#cloud-info'); if (!info) return;
  let t = '';
  if (cloud.state === 'init') t = 'Connexion au cloud…';
  else if (cloud.state === 'off') t = 'Indisponible ici. Ouvrez le jeu depuis votre compte claude.ai pour synchroniser votre partie. L’export par code marche partout.';
  else if (cloud.err) t = cloud.err;
  else if (cloud.busy && !cloud.readAt) t = 'Lecture du cloud…';
  else if (cloud.readAt) t = cloud.doc ? 'Dans le cloud : ' + cloudSummary(cloud.doc) + ', envoyée ' + fmtWhen(Number(cloud.doc.savedAt) || 0) + '.' : 'Aucune partie dans le cloud pour l’instant.';
  info.textContent = t;
  const ok = cloud.state === 'ready' && !cloud.busy;
  const up = $('#btn-up'), dn = $('#btn-down');
  if (up) up.disabled = !ok;
  if (dn) dn.disabled = !ok || (!!cloud.readAt && !cloud.doc);
}
async function cloudRead() {
  if (cloud.state !== 'ready' || cloud.busy) return;
  cloud.busy = true; cloud.err = ''; cloudUI();
  try {
    const snap = await cloudCall(() => cloud.ref.get());
    cloud.doc = snap.exists ? snap.data() : null; cloud.readAt = Date.now();
  } catch (e) { cloud.err = cloudErr(e); }
  cloud.busy = false; cloudUI();
}
async function cloudUp(force) {
  if (cloud.state !== 'ready' || cloud.busy) return;
  cloud.busy = true; cloud.err = ''; cloudUI(); cloudMsg('');
  try {
    const snap = await cloudCall(() => cloud.ref.get());
    cloud.doc = snap.exists ? snap.data() : null; cloud.readAt = Date.now();
    const day = E.dateInfo().day, S = E.S;
    if (!force && cloud.doc && cn(cloud.doc.day) > day) {
      cloudMsg('Le cloud contient une partie plus avancée (jour ' + cn(cloud.doc.day) + ' contre jour ' + day + ' ici). L’écraser ?', '', ['cloud-up-force', 'Écraser le cloud']);
    } else {
      const code = await encodeSave(E.serialize());
      const body = { v: 1, code, savedAt: Date.now(), day, rooms: S.rooms.size, cash: Math.round(S.cash), rank: S.rank };
      await cloudCall(() => cloud.ref.set(body));
      cloud.doc = body;
      cloudMsg('Partie envoyée dans le cloud.');
      toast('Partie envoyée dans le cloud', 'good');
    }
  } catch (e) { cloudMsg(cloudErr(e), 'err'); }
  cloud.busy = false; cloudUI();
}
async function cloudDown() {
  if (cloud.state !== 'ready' || cloud.busy) return;
  cloud.busy = true; cloud.err = ''; ui.pendingImport = null; cloudUI(); cloudMsg('');
  try {
    const snap = await cloudCall(() => cloud.ref.get());
    cloud.doc = snap.exists ? snap.data() : null; cloud.readAt = Date.now();
    if (!cloud.doc) cloudMsg('Aucune partie dans le cloud pour l’instant.');
    else {
      if (typeof cloud.doc.code !== 'string') throw new Error('Partie du cloud illisible.');
      const obj = await decodeSave(cloud.doc.code);
      const v = E.validate(obj);
      if (!v.ok) throw new Error('Partie du cloud invalide : ' + v.reason);
      ui.pendingImport = obj;
      cloudMsg('Partie du cloud : ' + cloudSummary(v.info) + ', trésorerie ' + eur(v.info.cash) + '. Elle remplacera la partie en cours (jour ' + E.dateInfo().day + ').', '', ['imp-go', 'Remplacer ma partie']);
    }
  } catch (e) { cloudMsg(e && e.code ? cloudErr(e) : (e && e.message) || 'Partie du cloud illisible.', 'err'); }
  cloud.busy = false; cloudUI();
}
function satBarSimple(p) { return '<div class="bar"><i class="' + (p >= 100 ? '' : p >= 60 ? 'mid' : 'low') + '" style="width:' + clamp(p, 2, 100) + '%"></i></div>'; }
function starsHTML(n) { let s = ''; for (let i = 1; i <= 5; i++) s += '<i class="' + (i <= n ? 'on' : '') + '">★</i>'; return s; }
function unlocks(rank) { return E.ORDER.filter((k) => E.TYPES[k].rank === rank).map((k) => E.TYPES[k].name).join(', ') || 'plus de hauteur et de sous-sols'; }
function helpHTML() {
  return '<ol class="help"><li><b>Construire.</b> Choisissez une catégorie puis un outil en bas (l’ascenseur est dans <b>Base</b>), touchez la tour pour placer la pièce, puis <b>Construire</b>. Une pièce de l’étage n+1 doit reposer sur quelque chose à l’étage n.</li>' +
    '<li><b>Relier.</b> Les gens marchent seulement sur des cases contiguës. Au-delà du 2e étage, installez un <b>ascenseur</b> : touchez l’étage de départ puis un autre étage pour l’allonger.</li>' +
    '<li><b>Louer.</b> Les pièces vides trouvent un locataire en un jour ou deux. Les loyers tombent à minuit.</li>' +
    '<li><b>Satisfaire.</b> La pastille d’une pièce passe au rouge si l’attente à l’ascenseur est longue, si c’est bruyant ou sale. Un concierge nettoie, une cabine de plus raccourcit les files.</li>' +
    '<li><b>Diversifier.</b> Commerces, loisirs et services attirent des clients et rendent les logements plus agréables. Les <b>services</b> (sécurité, déchets, technique, jardin, métro, héliport…) agissent sur toute la tour : voyez l’onglet Tour.</li>' +
    '<li><b>Rénover.</b> Touchez un logement ou un commerce loué pour le rénover (jusqu’au luxe) ou régler son loyer. Des événements surviennent chaque jour : gardez de la trésorerie.</li>' +
    '<li><b>Monter en rang.</b> Plus d’habitants et plus de satisfaction débloquent de nouveaux bâtiments, de la hauteur et des sous-sols.</li>' +
    '<li><b>Se déplacer.</b> Un doigt pour faire glisser la vue, deux doigts pour zoomer.</li>' +
    '<li><b>Sauvegarder.</b> La partie s’enregistre seule. Pour changer d’appareil, envoyez-la dans le cloud ou exportez-la depuis l’onglet Sauvegarde.</li></ol>';
}

/* ───────── HUD, conseils, notifications ───────── */
function toast(msg, level, big) {
  const el = document.createElement('div');
  el.className = 'toast' + (level ? ' ' + level : '') + (big ? ' big' : '');
  el.textContent = msg;
  const box = $('#toasts');
  while (box.children.length >= 3) box.removeChild(box.firstChild);
  box.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, big ? 5200 : 3200);
}

function updateHUD() {
  const S = E.S, d = E.dateInfo();
  const cash = $('#h-cash'); cash.textContent = eur(S.cash); cash.classList.toggle('neg', S.cash < 0);
  $('#h-date').textContent = d.jour + '. ' + d.date + ' ' + d.mois;
  $('#h-time').textContent = d.hh + ':' + d.mm;
  $('#h-stars').innerHTML = starsHTML(S.rank);
  $('#h-pop').textContent = S.pop;
  const sat = Math.round(S.avgSat);
  $('#h-sat').textContent = sat;
  $('#h-dot').style.background = sat >= 70 ? 'var(--good)' : sat >= 45 ? 'var(--warn)' : 'var(--bad)';
  const pb = $('#btn-pause'); pb.setAttribute('aria-pressed', String(ui.paused || ui.modal));
  pb.innerHTML = (ui.paused || ui.modal) ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>' : '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  $('#btn-speed').textContent = ui.speed + '×';
  if (ui.dockRank !== S.rank) buildDock(); else refreshDockState();
  // conseil
  const adv = S.advice.filter((a) => !(ui.advDismiss[a.id] > S.T));
  const box = $('#advice');
  if (!adv.length || ui.tool || ui.sheet) { box.hidden = true; box.innerHTML = ''; ui.advShown = null; }
  else {
    const a = adv.sort((x, y) => (y.lvl === 'bad') - (x.lvl === 'bad'))[0];
    if (ui.advShown !== a.id) {
      ui.advShown = a.id; box.hidden = false;
      box.innerHTML = '<div class="adv ' + a.lvl + '"><span>' + a.text + '</span>' + (a.shaft ? '<button class="go" data-adv="go" aria-label="Voir l’ascenseur">Voir</button>' : '') + '<button data-adv="x" aria-label="Masquer le conseil">✕</button></div>';
    }
  }
  if (ui.sheet === 'room') refreshRoomSheet();
}
function refreshRoomSheet() {
  const now = performance.now();
  if (now - (ui.sheetAt || 0) < 600 || now < (ui.holdUntil || 0)) return;
  ui.sheetAt = now;
  if (ui.sel && ((ui.sel.kind === 'room' && !E.S.rooms.has(ui.sel.id)) || (ui.sel.kind === 'shaft' && !E.S.shafts.has(ui.sel.id)))) { ui.sel = null; closeSheet(); return; }
  openRoomSheet();
}
$('#advice').addEventListener('click', (e) => {
  const b = e.target.closest('[data-adv]'); if (!b) return;
  const a = E.S.advice.find((x) => x.id === ui.advShown);
  if (b.dataset.adv === 'x') { if (a) { ui.advDismiss[a.id] = E.S.T + 1440 * 2; } ui.advShown = null; updateHUD(); }
  else if (a && a.shaft) select({ kind: 'shaft', id: a.shaft });
});

$('#btn-menu').addEventListener('click', () => openMenu('goals'));
$('#st-rank').addEventListener('click', () => openMenu('goals'));
$('#btn-pause').addEventListener('click', () => { ui.paused = !ui.paused; });
$('#btn-speed').addEventListener('click', () => { ui.speed = SPEEDS[(SPEEDS.indexOf(ui.speed) + 1) % SPEEDS.length]; ui.paused = false; });

function drain() {
  const S = E.S, ev = S.events.splice(0);
  const now = performance.now();
  for (const e of ev) {
    if (e.k === 'cash') { ui.floats.push({ x: e.x * CW, y: -(e.f + 1) * FH + 6, text: '+' + e.amt + ' €', col: '#8ff0b2', t0: now }); }
    else if (e.k === 'move') { ui.floats.push({ x: e.x * CW, y: -(e.f + 1) * FH + 6, text: 'Loué', col: '#ffe08a', t0: now }); }
    else if (e.k === 'toast') toast(e.msg, e.level);
    else if (e.k === 'sound') { const f = SOUND[e.name]; if (f) f(); }
    else if (e.k === 'rank') { toast('Rang ★' + e.rank + ' atteint ! Bonus ' + eur(e.bonus) + '. Nouveau : ' + unlocks(e.rank) + '.', 'good', true); }
    else if (e.k === 'goal') toast('Objectif : ' + e.text + ' · +' + eur(e.reward), 'good');
    else if (e.k === 'day') {
      const r = e.rep;
      toast('Bilan du jour : ' + (r.net >= 0 ? '+' : '−') + eur(Math.abs(r.net)) + ' (loyers ' + eur(r.rent) + ')', r.net >= 0 ? 'good' : 'warn');
    } else if (e.k === 'save') save(false);
    else if (e.k === 'over') showOver();
  }
}

/* ───────── sauvegarde, démarrage ───────── */
let saveTimer = 0;
function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => save(false), 1500); }
function save(manual) {
  let ok = false;
  try { ok = LS.set(SAVE_KEY, JSON.stringify(E.serialize())); } catch (e) { ok = false; }
  if (ok) {
    ui.savedAt = Date.now(); LS.set('verticale-save-at', String(ui.savedAt)); ui.saveFail = false;
    const el = $('#save-at'); if (el) el.textContent = fmtWhen(ui.savedAt);
  } else {
    if (!ui.saveFail && manual !== true) toast('Sauvegarde automatique indisponible dans ce navigateur. Exportez votre partie (Menu, Sauvegarde).', 'warn', true);
    ui.saveFail = true;
  }
  return ok;
}
function fmtWhen(ms) {
  const d = new Date(ms), n = new Date();
  const t = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === n.toDateString()) return 'aujourd’hui ' + t;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + t;
}

/* export / import : VERTICALE1.<z|r>.<base64url>.<somme de contrôle> */
function b64u(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(t) {
  t = t.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  const s = atob(t), a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
async function pipeBytes(bytes, stream, cap) {
  const rd = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const parts = []; let n = 0;
  for (;;) {
    const r = await rd.read();
    if (r.done) break;
    n += r.value.length;
    if (cap && n > cap) { try { rd.cancel(); } catch (e) { /* ignoré */ } throw new Error('Ce code est trop volumineux pour être une partie.'); }
    parts.push(r.value);
  }
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function encodeSave(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  let mode = 'r', data = raw;
  if (typeof CompressionStream !== 'undefined') {
    try { data = await pipeBytes(raw, new CompressionStream('deflate-raw'), 0); mode = 'z'; } catch (e) { data = raw; mode = 'r'; }
  }
  const body = b64u(data);
  return 'VERTICALE1.' + mode + '.' + body + '.' + fnv(mode + body);
}
async function decodeSave(text) {
  text = String(text).replace(/\s+/g, '');
  if (text.length > 600000) throw new Error('Ce code est trop volumineux pour être une partie.');
  const m = /^VERTICALE1\.([zr])\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(text);
  if (!m) throw new Error(text.indexOf('VERTICALE1.') === 0 ? 'Code incomplet ou modifié : copiez-le de nouveau en entier.' : 'Format non reconnu. Collez le code complet, qui commence par VERTICALE1.');
  if (fnv(m[1] + m[2]) !== m[3]) throw new Error('Code incomplet ou modifié : copiez-le de nouveau en entier.');
  try {
    let data = unb64u(m[2]);
    if (m[1] === 'z') {
      if (typeof DecompressionStream === 'undefined') throw new Error('Ce navigateur ne sait pas lire ce code compressé.');
      data = await pipeBytes(data, new DecompressionStream('deflate-raw'), 3000000);
    }
    return JSON.parse(new TextDecoder().decode(data));
  } catch (e) {
    if (/volumineux|ne sait pas/.test(e.message)) throw e;
    throw new Error('Code illisible : il est peut-être tronqué.');
  }
}
function showOver() {
  ui.modal = true; ui.sheet = 'over';
  wrap.className = 'layer show'; wrap.style.pointerEvents = '';
  wrap.innerHTML = '<div class="back"></div><section class="sheet over" role="dialog" aria-label="Faillite"><header><h2>Faillite</h2></header><div class="sbody"><p class="p">La banque a repris la tour : votre trésorerie est restée sous −30 000 € pendant trois jours. Tenez compte des charges avant de construire, et empruntez avec mesure.</p><div class="acts"><button class="btn pri" data-act="restart">Recommencer</button></div></div></section>';
}
function newGameStart(fresh) {
  if (fresh) LS.del(SAVE_KEY);
  E.newGame();
  ui.tool = null; ui.ghost = null; ui.sel = null; ui.floats = []; ui.advDismiss = {}; ui.confirmNew = false;
  closeSheet(); ui.modal = false;
  buildDock(); renderBuildBar(); fitLot();
  ui.paused = false;
  showWelcome();
}
function showWelcome() {
  ui.modal = true; ui.sheet = 'welcome';
  wrap.className = 'layer show'; wrap.style.pointerEvents = '';
  wrap.innerHTML = sheetHTML('menu', 'Bienvenue', '<p class="p">Vous héritez d’un terrain et d’un hall d’entrée. Faites-en une tour que les gens aiment habiter.</p><ol class="help"><li>Dans l’onglet <b>Logement</b>, choisissez <b>Appartement</b> et touchez le rez-de-chaussée à côté du hall.</li><li>Validez avec <b>Construire</b>. Les loyers tombent à minuit.</li><li>Dès le 3e étage, ajoutez un <b>ascenseur</b> (onglet <b>Base</b>).</li></ol><div class="acts"><button class="btn pri" data-act="start">Commencer</button></div>');
}
function resumeIfModal() { ui.modal = false; }

let last = 0, bootAt = 0;
function frame(ts) {
  const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
  if (!ui.paused && !ui.modal && !E.S.over) E.tick(dt * ui.speed);
  drain();
  if (cam.tx != null) {
    cam.x += (cam.tx - cam.x) * 0.15; cam.y += (cam.ty - cam.y) * 0.15;
    if (Math.abs(cam.tx - cam.x) < 0.5 && Math.abs(cam.ty - cam.y) < 0.5) cam.tx = null;
    clampCam();
  }
  draw(ts);
  if (ts - ui.hudAt > 180) { ui.hudAt = ts; updateHUD(); }
  requestAnimationFrame(frame);
}

function start(data) {
  resize();
  ui.muted = LS.get('verticale-mute') === '1';
  ui.savedAt = Number(LS.get('verticale-save-at')) || 0;
  let loaded = false;
  const raw = (data && data.save) ? data.save : null;
  try {
    if (raw) loaded = !!E.deserialize(raw);
    else { const s = LS.get(SAVE_KEY); if (s) loaded = !!E.deserialize(JSON.parse(s)); }
  } catch (e) { loaded = false; }
  if (!loaded) E.newGame();
  if (data && data.ui) { ui.speed = data.ui.speed || 2; ui.paused = !!data.ui.paused; }
  buildDock(); fitLot();
  if (data && data.cam) { cam.x = data.cam.x; cam.y = data.cam.y; cam.z = data.cam.z; clampCam(); }
  if (!loaded && LS.get('verticale-seen') !== '1') showWelcome();
  else if (loaded) toast('Partie reprise : ' + E.dateInfo().jour + '. ' + E.dateInfo().date + ' ' + E.dateInfo().mois);
  updateHUD();
  requestAnimationFrame((t) => { last = t; frame(t); });
  cloudInit();
}

window.addEventListener('resize', () => { resize(); clampCam(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) save(false); });
window.addEventListener('pagehide', () => save(false));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (ui.tool) setTool(null); else if (ui.sheet) closeSheet(); } });

// mise à jour à chaud : l'état de la partie survit à une republication de la page
const hot = window.claude && window.claude.hot;
if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ save: E.serialize(), cam: { x: cam.x, y: cam.y, z: cam.z }, ui: { speed: ui.speed, paused: ui.paused } }));
if (hot && typeof hot.ready === 'function') hot.ready(start); else start((hot && hot.data) || {});

// accès de test
window.__verticale = { ui, cam, select, setTool, openMenu, E };
})();
