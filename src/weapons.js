// weapons.js — one ballistics path for everyone: the player, the crew, the hostiles and the rivals all
// resolve shots through here, so a bullet does not care who fired it.
//
// collision: exact slab tests against AABB colliders (never stepped marching — it tunnels through
// 0.3 m interior walls), then cylinder tests against bodies.

import * as THREE from '../vendor/three.module.js';
import { GUNS } from './data.js';

export const BODY_R = 0.34;          // a person is a 0.34 m cylinder for hit purposes
export const HEAD_Y = [1.45, 1.85];  // head band, metres above the feet

// Ray vs AABB (exact). Returns t or null.
export function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = -Infinity, tmax = Infinity;
  const lo = [b.min.x, b.min.y, b.min.z], hi = [b.max.x, b.max.y, b.max.z];
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) { if (o[i] < lo[i] || o[i] > hi[i]) return null; continue; }
    let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin >= 0 ? tmin : (tmax >= 0 ? 0 : null);
}

function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1) {
  const px = ox - cx, pz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) { if (px * px + pz * pz > r * r) return null; return oy >= y0 && oy <= y1 ? 0 : null; }
  const b = 2 * (px * dx + pz * dz), c = px * px + pz * pz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t < 0) continue;
    const y = oy + dy * t;
    if (y >= y0 && y <= y1) return t;
  }
  return null;
}

// world = { colliders, foes, crew, player, rng }
export function traceShot(world, origin, dir, maxDist = 120, opts = {}) {
  const { x: ox, y: oy, z: oz } = origin;
  const [dx, dy, dz] = dir;
  let best = { t: maxDist, kind: null, ref: null, head: false };
  const cols = opts.colliders || world.colliders || [];
  for (const b of cols) {
    if (b.kind === 'door' && opts.throughDoors) continue;
    const t = rayBox(ox, oy, oz, dx, dy, dz, b);
    if (t !== null && t < best.t) best = { t, kind: 'world', ref: b, head: false };
  }
  const bodies = [];
  if (world.foes) for (const f of world.foes) if (!f.dead) bodies.push({ kind: 'foe', ref: f, x: f.x, z: f.z, y0: 0, y1: 1.9 });
  if (world.crew) for (const n of world.crew) if (!n.dead && !n.gone) bodies.push({ kind: 'crew', ref: n, x: n.x, z: n.z, y0: 0, y1: 1.85 });
  if (world.player && !world.player.dead && !opts.skipPlayer) bodies.push({ kind: 'player', ref: world.player, x: world.player.x, z: world.player.z, y0: 0, y1: 1.9 });
  if (opts.exclude) bodies.splice(0, bodies.length, ...bodies.filter(b => b.ref !== opts.exclude));
  for (const b of bodies) {
    const t = rayCylinder(ox, oy, oz, dx, dy, dz, b.x, b.z, BODY_R, b.y0, b.y1);
    if (t !== null && t < best.t) {
      const y = oy + dy * t;
      const local = y - (b.ref.y || 0);
      best = { t, kind: b.kind, ref: b.ref, head: local >= HEAD_Y[0] && local <= HEAD_Y[1] };
    }
  }
  return { hit: best.kind !== null, t: best.t, kind: best.kind, ref: best.ref, head: best.head, point: { x: ox + dx * best.t, y: oy + dy * best.t, z: oz + dz * best.t } };
}

// Spread the shot within the gun's cone; returns the direction actually taken.
export function spreadDir(dir, spread, rng) {
  if (!spread) return dir.slice();
  const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * spread;
  // build an orthonormal basis around dir
  const up = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const right = norm(cross(dir, up));
  const realUp = cross(right, dir);
  const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
  const out = [dir[0] + right[0] * ox + realUp[0] * oy, dir[1] + right[1] * ox + realUp[1] * oy, dir[2] + right[2] * ox + realUp[2] * oy];
  return norm(out);
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = v => { const m = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; };

// How far a sound from this gun carries, in metres.
export function gunLoudness(id) { return 26 * (GUNS[id]?.noise || 1); }

// Fire one shot for a shooter (player-shaped: {x,y,z,eyeY,yaw,pitch}). The caller owns cooldowns/ammo.
// Returns the trace plus a resolver that applies the damage, so callers can sequence audio/fx.
export function fireShot(world, shooter, gunId, opts = {}) {
  const def = GUNS[gunId] || GUNS.pistol;
  const rng = opts.rng || world.rng || Math.random;
  const origin = { x: shooter.x, y: (shooter.eyeY || 1.65), z: shooter.z };
  const base = dirFromAngles(shooter.yaw, shooter.pitch);
  const pellets = def.pellets || 1;
  const shots = [];
  for (let i = 0; i < pellets; i++) {
    const dir = spreadDir(base, def.spread * (opts.spreadMul || 1) * (pellets > 1 ? 1.6 : 1), rng);
    const tr = traceShot(world, origin, dir, opts.maxDist || 120, { exclude: opts.exclude, skipPlayer: opts.skipPlayer });
    shots.push({ dir, trace: tr, dmg: def.dmg * (tr.head ? 2.2 : 1) });
  }
  // announce it: everyone who can hear a gunshot now knows roughly where you are
  if (world.sound) world.sound('shot', shooter.x, shooter.z, gunLoudness(gunId));
  if (world.event) world.event('shot', { x: shooter.x, z: shooter.z, gun: gunId, by: opts.by || 'player' });
  return { shots, def, origin };
}

// Apply the damage from a fireShot() result. Kept separate so the caller can play the muzzle flash
// and the impact decal in the same frame.
export function applyShot(world, res, opts = {}) {
  const out = { hits: 0, kills: 0, damage: 0, blood: [], sparks: [] };
  for (const s of res.shots) {
    const tr = s.trace;
    if (!tr.hit) continue;
    if (tr.kind === 'world') { out.sparks.push(tr.point); continue; }
    out.hits++; out.damage += s.dmg;
    if (tr.kind === 'foe') {
      if (world.hitFoe) { const died = world.hitFoe(tr.ref, s.dmg, tr.head, opts.by); if (died) out.kills++; }
      out.blood.push(tr.point);
    } else if (tr.kind === 'crew') {
      if (world.hitCrew) world.hitCrew(tr.ref, s.dmg, tr.head, opts.by);
      out.blood.push(tr.point);
    } else if (tr.kind === 'player') {
      if (world.hurt) world.hurt(s.dmg * (opts.damageMul || 1), opts.by || 'a shooter');
      out.blood.push(tr.point);
    }
  }
  return out;
}

export function dirFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

// Where a shot from the current look would land (crosshair truth, also used by the AI for aim error).
export function aimPoint(world, shooter, dist = 40, opts = {}) {
  const d = dirFromAngles(shooter.yaw, shooter.pitch);
  const tr = traceShot(world, { x: shooter.x, y: shooter.eyeY || 1.65, z: shooter.z }, d, dist, opts);
  return tr;
}
