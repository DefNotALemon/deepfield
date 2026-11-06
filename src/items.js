// items.js — real objects for every piece of loot, so nothing in this game is a menu row.
// Procedural three.js meshes, cached by id, sized and weighted so the thing you are looking at
// is the thing you are carrying.

import * as THREE from '../vendor/three.module.js';
import { ITEMS, TOOLS, GUNS } from './data.js';
import { rng } from './util.js';

const CACHE = new Map();
const MATS = new Map();
function mat(tint, rough = 0.7, metal = 0.1, extra = {}) {
  const key = `${tint}|${rough}|${metal}|${JSON.stringify(extra)}`;
  if (!MATS.has(key)) MATS.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(tint), roughness: rough, metalness: metal, ...extra }));
  return MATS.get(key);
}

// Archetypes keep the loot readable at a glance: a case is a case, a spool is a spool.
const ARCH = {
  chit: ['flat', 0.09, 0.01, 0.06], trinket: ['soft', 0.16, 0.12, 0.10], tag: ['flat', 0.07, 0.01, 0.04],
  carchip: ['flat', 0.06, 0.05, 0.02], dataspool: ['spool', 0.10, 0.12, 0.10], medkit: ['case', 0.30, 0.12, 0.22],
  respirator: ['soft', 0.22, 0.16, 0.18], coilspool: ['spool', 0.24, 0.16, 0.24], servo: ['box', 0.30, 0.22, 0.24],
  optic: ['tube', 0.36, 0.10, 0.10], bergson: ['box', 0.34, 0.20, 0.26], guncase: ['case', 1.15, 0.26, 0.34],
  cryocase: ['case', 0.95, 0.40, 0.45], reactorcore: ['sphere', 0.62, 0.62, 0.62], spicebrick: ['soft', 0.34, 0.16, 0.22],
  evidence: ['case', 0.62, 0.30, 0.38], hymncrystal: ['crystal', 0.42, 0.30, 0.30], whisperstone: ['crystal', 0.36, 0.26, 0.26],
  biomatter: ['tube', 0.30, 0.44, 0.30], carchip2: ['flat', 0.1, 0.1, 0.1], corpse: ['soft', 1.7, 0.5, 0.5],
  flashlight: ['tube', 0.24, 0.09, 0.09], welder: ['tube', 0.5, 0.12, 0.12], scanner: ['box', 0.2, 0.14, 0.1], spike: ['tube', 0.34, 0.06, 0.06],
  sling: ['soft', 0.3, 0.2, 0.16],
};

function shortName(rec) { return rec?.name || 'thing'; }

export function itemMesh(id, seed = 1) {
  const key = `${id}|${seed}`;
  if (CACHE.has(key)) return CACHE.get(key).clone(true);
  const rec = ITEMS[id] || TOOLS[id];
  const spec = ARCH[id] || ['box', 0.28, 0.2, 0.2];
  const [shape, w, h, d] = spec;
  const g = new THREE.Group();
  const tint = rec?.tint || '#9a9a9a';
  const r = rng(`${id}${seed}`);
  const M = mat(tint, 0.55 + r.range(0, 0.3), id === 'reactorcore' ? 0.7 : 0.25);
  const dark = mat('#2a2d30', 0.85, 0.2);
  let core;
  switch (shape) {
    case 'flat': core = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M); break;
    case 'soft': {
      core = new THREE.Mesh(new THREE.BoxGeometry(w, h * 1.1, d), M);
      // straps/edges so a bag or a body reads as soft, not as a brick
      const strap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, h * 0.18, d * 0.2), dark);
      strap.position.y = h * 0.1; g.add(strap);
      break;
    }
    case 'case': {
      core = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(h * 0.28, h * 0.06, 6, 10, Math.PI), dark);
      handle.position.y = h * 0.55; handle.rotation.y = Math.PI / 2; g.add(handle);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(w * 1.005, h * 0.12, d * 1.005), mat('#3a3d40', 0.8, 0.3));
      lid.position.y = h * 0.42; g.add(lid);
      break;
    }
    case 'tube': core = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.5, h, 12), M); break;
    case 'spool': {
      core = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.5, h * 0.8, 14), M);
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.62, w * 0.62, h * 0.1, 14), dark);
      const flange2 = flange.clone(); flange.position.y = h * 0.42; flange2.position.y = -h * 0.42;
      g.add(flange, flange2);
      break;
    }
    case 'sphere': {
      core = new THREE.Mesh(new THREE.SphereGeometry(w * 0.5, 18, 12), M);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(w * 0.58, w * 0.05, 6, 16), mat('#d8c48f', 0.4, 0.8));
      ring.rotation.x = Math.PI / 2; g.add(ring);
      break;
    }
    case 'crystal': {
      core = new THREE.Mesh(new THREE.OctahedronGeometry(w * 0.5, 1), new THREE.MeshStandardMaterial({
        color: new THREE.Color(tint), roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.82, emissive: new THREE.Color(tint), emissiveIntensity: 0.25,
      }));
      break;
    }
    default: core = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M);
  }
  core.name = id;
  g.add(core);
  g.userData.item = id;
  g.userData.size = new THREE.Vector3(w, h, d);
  g.userData.kg = rec?.kg || 1;
  CACHE.set(key, g);
  return g.clone(true);
}

// Held/viewmodel gun: a chunky procedural silhouette, per class. Returns a Group with muzzle marker.
export function gunMesh(id) {
  const key = 'gun_' + id;
  if (CACHE.has(key)) return CACHE.get(key).clone(true);
  const def = GUNS[id] || GUNS.pistol;
  const g = new THREE.Group();
  const body = mat('#2c2f33', 0.55, 0.55);
  const gr = mat('#4a3a2a', 0.75, 0.05);
  const w = def.kg * 0.11 + 0.16;
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, w), body); barrel.position.z = -w * 0.5; g.add(barrel);
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.22), body); receiver.position.z = 0.02; g.add(receiver);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.07), gr); grip.position.set(0, -0.11, 0.09); grip.rotation.x = 0.22; g.add(grip);
  if (def.mode === 'auto' || id === 'rifle') {
    const magz = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.05), body); magz.position.set(0, -0.1, -0.03); g.add(magz);
  }
  if (id === 'shotgun') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.2), gr); stock.position.set(0, -0.02, 0.22); g.add(stock);
    const under = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), body); under.position.set(0, -0.06, -0.28); g.add(under);
  }
  if (id === 'rifle') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), mat('#1c1e20', 0.5, 0.6));
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.09, -0.02); g.add(scope);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.z = -w - 0.02; muzzle.name = 'muzzle'; g.add(muzzle);
  g.userData.gun = id;
  CACHE.set(key, g);
  return g.clone(true);
}

export function clearItemCache() { CACHE.clear(); MATS.clear(); }
