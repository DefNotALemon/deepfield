// carry.js — the haul. Everything you want off a site has to fit in two hands and a duffel, and the
// weight is on you while you walk, so the decision is always "what do I leave behind".
// The duffel is a physical object: set it down, the lid opens, the slots are real slots.

import * as THREE from '../vendor/three.module.js';
import { ITEMS, TOOLS, GUNS, itemKg, itemValue, itemName } from './data.js';
import { itemMesh } from './items.js';
import { clamp } from './util.js';

export const SLOT_POS = [ // duffel layout: two rows of slots on the floor-facing side
  [-0.22, 0, -0.12], [0, 0, -0.12], [0.22, 0, -0.12],
  [-0.22, 0, 0.10], [0, 0, 0.10], [0.22, 0, 0.10],
  [-0.22, 0, 0.30], [0, 0, 0.30], [0.22, 0, 0.30], [0, 0, 0.48],
];

export class Haul {
  constructor(opts = {}) {
    this.slotsMax = opts.slots || 5;
    this.slots = [];
    this.pocket = [];               // small items, unlimited-ish (chits, tags, chips)
    this.hands = { left: null, right: null };
    this.handItems = [];            // heavy items taking both hands: [{id, uid}]
    this.bagOpen = false;
    this.bagT = 0;                  // 0 stowed, 1 open on the floor
  }

  capacity() { return this.slotsMax; }
  used() { return this.slots.length; }
  kg() {
    let k = 0;
    for (const s of this.slots) k += itemKg(s.id) * (s.n || 1);
    for (const p of this.pocket) k += itemKg(p.id) * (p.n || 1);
    for (const h of this.handItems) k += itemKg(h.id);
    return Math.round(k * 10) / 10;
  }
  value() {
    let v = 0;
    for (const s of this.slots) v += itemValue(s.id) * (s.n || 1);
    for (const p of this.pocket) v += itemValue(p.id) * (p.n || 1);
    for (const h of this.handItems) v += itemValue(h.id);
    return v;
  }
  count(itemId) {
    let n = 0;
    for (const s of this.slots) if (s.id === itemId) n += (s.n || 1);
    for (const p of this.pocket) if (p.id === itemId) n += (p.n || 1);
    for (const h of this.handItems) if (h.id === itemId) n += 1;
    return n;
  }
  has(itemId) { return this.count(itemId) > 0; }

  // mode: 'small' | 'loot' | 'heavy'
  accepts(id) {
    const rec = ITEMS[id] || TOOLS[id];
    if (!rec) return { ok: false, why: 'you cannot carry that' };
    const kind = rec.kind || 'loot';
    if (kind === 'small') return { ok: true, mode: 'small' };
    if (kind === 'heavy') return { ok: this.handItems.length === 0, mode: 'heavy', why: 'both hands are full' };
    return this.slots.length < this.slotsMax ? { ok: true, mode: 'loot' } : { ok: false, mode: 'loot', why: 'haul is full' };
  }

  add(id, n = 1) {
    const a = this.accepts(id);
    if (!a.ok) return a;
    if (a.mode === 'small') {
      const row = this.pocket.find(p => p.id === id);
      if (row) row.n += n; else this.pocket.push({ id, n });
    } else if (a.mode === 'heavy') {
      this.handItems.push({ id, uid: 'h' + Math.floor(Math.random() * 1e6) });
    } else {
      const row = this.slots.find(s => s.id === id);
      if (row) row.n += n; else this.slots.push({ id, n });
    }
    return { ok: true, mode: a.mode };
  }

  removeOne(id) {
    const row = this.slots.find(s => s.id === id);
    if (row) { row.n--; if (row.n <= 0) this.slots.splice(this.slots.indexOf(row), 1); return true; }
    const p = this.pocket.find(s => s.id === id);
    if (p) { p.n--; if (p.n <= 0) this.pocket.splice(this.pocket.indexOf(p), 1); return true; }
    const h = this.handItems.findIndex(s => s.id === id);
    if (h >= 0) { this.handItems.splice(h, 1); return true; }
    return false;
  }

  dropAt(index) {
    const all = this.flat();
    const it = all[index];
    if (!it) return null;
    this.removeOne(it.id);
    return it;
  }
  flat() { return [...this.slots, ...this.pocket, ...this.handItems.map(h => ({ id: h.id, n: 1 }))]; }

  // Both-hands rule: a heavy item means no gun, slower feet and louder boots.
  handsBusy() { return this.handItems.length > 0; }
  canShoot() { return !this.handsBusy(); }
  speedMul() { return this.handsBusy() ? 0.72 : 1; }
  noiseAdd() { let n = 0; for (const h of this.handItems) n += (ITEMS[h.id]?.noise || 0.4) * 0.35; return n; }

  summary() {
    const items = this.flat();
    return {
      items: items.length, kg: this.kg(), value: this.value(), full: this.slots.length >= this.slotsMax,
      heavy: this.handsBusy(), hands: this.handItems.map(h => itemName(h.id)),
    };
  }
}

// ── The duffel, physically ───────────────────────────────────────────────────────────────────
// Stowed: mesh hidden. Opening it (bag key) sets it on the deck in front of you, lid swings, and the
// items inside are the real meshes you grab. Lemon's rule for this project: inventory is never a menu.
export class Duffel {
  constructor(haul, THREEref = THREE) {
    this.haul = haul;
    this.root = new THREEref.Group();
    this.root.visible = false;
    const body = new THREEref.Mesh(new THREEref.BoxGeometry(0.66, 0.3, 0.94), new THREEref.MeshStandardMaterial({ color: 0x3a3f33, roughness: 0.9, metalness: 0.05 }));
    body.position.y = 0.15; this.root.add(body);
    this.body = body;
    const lidPivot = new THREEref.Group();
    lidPivot.position.set(-0.33, 0.3, 0);          // hinge on the left edge
    const lid = new THREEref.Mesh(new THREEref.BoxGeometry(0.66, 0.06, 0.94), new THREEref.MeshStandardMaterial({ color: 0x2f342a, roughness: 0.85 }));
    lid.position.set(0.33, 0.03, 0); lidPivot.add(lid);
    this.root.add(lidPivot); this.lid = lidPivot;
    const liner = new THREEref.Mesh(new THREEref.BoxGeometry(0.6, 0.22, 0.88), new THREEref.MeshStandardMaterial({ color: 0x15170f, roughness: 1 }));
    liner.position.y = 0.16; this.root.add(liner);
    this.items = [];
    this.slots = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREEref.Object3D();
      m.position.set(...SLOT_POS[i]);
      m.visible = false;
      this.root.add(m);
      this.slots.push(m);
    }
    this.hovered = -1;
    this.hitMeshes = [];
  }

  place(x, y, z, yaw) {
    this.root.visible = true;
    this.root.position.set(x, y, z);
    this.root.rotation.set(0, yaw, 0);
  }
  stow() { this.root.visible = false; }
  // t: 0 closed, 1 open
  setOpen(t) {
    this.lid.rotation.y = -t * 2.05;
    this.root.visible = t > 0.01;
  }
  refresh() {
    // lay the carried loot out in the slots so the player sees exactly what they have
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      while (s.children.length) { const c = s.children.pop(); s.remove(c); }
      s.visible = false;
    }
    this.hitMeshes = [];
    const all = this.haul.flat();
    for (let i = 0; i < all.length && i < this.slots.length; i++) {
      const slot = this.slots[i];
      const mesh = itemMesh(all[i].id, i + 1);
      mesh.position.set(0, 0.1, 0);
      mesh.userData.slot = i;
      slot.add(mesh);
      slot.visible = true;
      mesh.traverse(o => { if (o.isMesh) this.hitMeshes.push(o); });
    }
    return all.length;
  }
  // Which slot is under the crosshair (called by the dive controller with a raycaster)
  setHover(i) { this.hovered = i; }
}

// Value of a stack, for pricing a haul full of small things.
export function stackValue(row) { return itemValue(row.id) * (row.n || 1); }
export function stackKg(row) { return itemKg(row.id) * (row.n || 1); }
