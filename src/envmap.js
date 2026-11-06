// envmap.js — the one thing that is easy to forget and impossible to miss: in three.js a metallic
// MeshStandardMaterial with nothing to reflect renders black, so every interior in this game gets a
// procedural environment (a dim shell with a few bright panels) and its metals tamed. Without this a
// lit ship still looks like a power cut.

import * as THREE from '../vendor/three.module.js';

let cached = null;

export function environmentTexture(renderer) {
  if (cached) return cached;
  try {
    if (!renderer || !renderer.capabilities) return null;      // headless node: no GL, nothing to build
    const pmrem = new THREE.PMREMGenerator(renderer);
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x121a24);
    s.add(new THREE.Mesh(new THREE.SphereGeometry(60, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0x27333f, side: THREE.BackSide })));
    // panels: ceiling strips, a warm engine glow, a cold window, a dark deck
    const panels = [
      [-22, 16, -18, 0x6a7b8f, 10], [18, 14, 20, 0x5a6a7c, 9], [0, 22, 0, 0x8a949c, 12],
      [-18, 4, 22, 0x4a5560, 8], [24, -2, -14, 0x3f4a55, 7], [0, -20, 0, 0x0c0f12, 26],
    ];
    for (const [x, y, z, c, r] of panels) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color: c }));
      p.position.set(x, y, z);
      s.add(p);
    }
    const rt = pmrem.fromScene(s, 0.06);
    pmrem.dispose();
    cached = rt.texture;
    return cached;
  } catch (e) { return null; }
}

// Give a scene its environment and take the shine off anything that would go black without one.
export function applyEnvironment(renderer, scene, root, opts = {}) {
  const tex = environmentTexture(renderer);
  if (tex && scene) scene.environment = tex;
  tameMetals(root, opts.maxMetal ?? 0.18);
  return tex;
}

export function tameMetals(root, max = 0.18) {
  if (!root) return 0;
  let n = 0;
  root.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m && m.isMeshStandardMaterial && m.metalness > max) { m.metalness = max; n++; }
    }
  });
  return n;
}
