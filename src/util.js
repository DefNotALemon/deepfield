// util.js — deterministic rng, math, small helpers. No three.js, no DOM: importable in node.

export function hash32(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = typeof p === 'string' ? p : String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= 0x9e3779b9; h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// mulberry32 — small, fast, seeded, stable across platforms (never Math.random for world content)
export function rng(seed) {
  let a = (typeof seed === 'string' ? hash32(seed) : (seed | 0)) >>> 0;
  const f = function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.chance = p => f() < p;
  f.sign = () => (f() < 0.5 ? -1 : 1);
  f.weighted = (table) => {
    let total = 0; for (const k in table) total += table[k];
    let r = f() * total;
    for (const k in table) { r -= table[k]; if (r <= 0) return k; }
    return Object.keys(table)[0];
  };
  f.shuffle = arr => { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; };
  f.pickn = (arr, n) => f.shuffle(arr).slice(0, n);
  return f;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = t => t * t * (3 - 2 * t);
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const TAU = Math.PI * 2;
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export const angLerp = (a, b, t) => a + angDiff(b, a) * t;
export const deg = r => r * 180 / Math.PI;
export const rad = d => d * Math.PI / 180;

// Stable timestamps for narrative ("day 14, 03:00") without a real clock.
export function stamp(hours) {
  const d = Math.floor(hours / 24) + 1, h = Math.floor(hours % 24), m = Math.floor((hours % 1) * 60);
  return `D${d} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function commas(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
export function credits(n) { return `${commas(n)} cr`; }
export function money(n) { return n < 0 ? `-${commas(-n)} cr` : `${commas(n)} cr`; }

// Plural-safe list join: a, b and c
export function andList(items) {
  const a = items.filter(Boolean);
  if (a.length <= 1) return a[0] || '';
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}

export function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// Longest-reach A* on a flat cell grid (used by the site generator's connectivity proof and by AI).
// blocked(i) -> true if cell i cannot be entered. Returns array of cell indices or null.
export function pathfind(w, h, start, goal, blocked, maxExpand = 200000) {
  if (start === goal) return [start];
  const n = w * h;
  const open = [start];
  const gScore = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const fScore = new Float32Array(n).fill(Infinity);
  gScore[start] = 0;
  fScore[start] = Math.abs((start % w) - (goal % w)) + Math.abs(Math.floor(start / w) - Math.floor(goal / w));
  let expand = 0;
  const hcost = i => Math.abs((i % w) - (goal % w)) + Math.abs(Math.floor(i / w) - Math.floor(goal / w));
  while (open.length) {
    if (++expand > maxExpand) return null;
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (fScore[open[i]] < fScore[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) {
      const path = []; let c = cur;
      while (c !== -1) { path.push(c); c = came[c]; }
      return path.reverse();
    }
    closed[cur] = 1;
    const cx = cur % w, cy = Math.floor(cur / w);
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (closed[ni] || blocked(ni)) continue;
      const ng = gScore[cur] + 1;
      if (ng < gScore[ni]) {
        gScore[ni] = ng; came[ni] = cur; fScore[ni] = ng + hcost(ni);
        if (!open.includes(ni)) open.push(ni);
      }
    }
  }
  return null;
}

export function flood(w, h, start, blocked) {
  const seen = new Uint8Array(w * h);
  const q = [start]; seen[start] = 1;
  while (q.length) {
    const cur = q.pop(), cx = cur % w, cy = Math.floor(cur / w);
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (seen[ni] || blocked(ni)) continue;
      seen[ni] = 1; q.push(ni);
    }
  }
  return seen;
}
