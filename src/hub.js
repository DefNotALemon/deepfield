// hub.js — the Waystop: the yard where you keep a ship, owe the Office money, and find out what the
// rim has been doing without you. Hand-built rather than generated, because this is home and home
// should look the same every time you come back to it.

import * as THREE from '../vendor/three.module.js';
import { In } from './input.js';
import { rng, clamp, damp, money, stamp } from './util.js';
import { FACTIONS, COMMODITIES } from './data.js';
import { priceAt, knownAt, newsSince, systemById } from './sim.js';
import * as A from './audio.js';

const PANEL_W = 26, PANEL_D = 16, WALL_H = 3.1;

export class Hub {
  constructor(app) {
    this.app = app;
    this.career = app.career;
    this.rng = rng((app.career.seed ^ 0x7744) >>> 0);
    this.time = 0;
    this.prompt = null;
    this.hover = null;
    this.pickups = [];
    this.fx = [];
    this.state = 'active';
    this.kiosks = [];
    this.people = [];
  }

  async build(scene) {
    this.scene = scene;
    const root = new THREE.Group();
    root.name = 'hub';
    scene.add(root);
    this.root = root;
    scene.background = new THREE.Color(0x06080b);
    scene.fog = new THREE.FogExp2(0x06080b, 0.008);
    this.colliders = [];
    this.interactables = [];

    const steel = this.mat(0x3b4147, 0.72, 0.45);
    const dark = this.mat(0x23272b, 0.85, 0.3);
    const grate = this.mat(0x2b2f33, 0.9, 0.5);
    const paint = this.mat(0x4c5140, 0.9, 0.1);
    const gold = this.mat(0x8a7440, 0.5, 0.7);

    // floor: telescoping deck plates with a grated walkway up the middle
    const floor = new THREE.Mesh(new THREE.BoxGeometry(PANEL_W, 0.4, PANEL_D), steel);
    floor.position.set(0, -0.2, 0); root.add(floor);
    this.box(-PANEL_W / 2, -1, -PANEL_D / 2, PANEL_W / 2, 0, PANEL_D / 2, 'hull');
    const catwalk = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, PANEL_D), grate);
    catwalk.position.set(0, 0.03, 0); root.add(catwalk);
    for (let i = -7; i <= 7; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.5), dark);
      rib.position.set(0, 0.06, i * 1); root.add(rib);
    }
    // ceiling with light troughs
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(PANEL_W, 0.3, PANEL_D), dark);
    ceil.position.set(0, WALL_H + 0.15, 0); root.add(ceil);
    this.box(-PANEL_W / 2, WALL_H, -PANEL_D / 2, PANEL_W / 2, WALL_H + 0.4, PANEL_D / 2, 'hull');
    for (let i = -2; i <= 2; i++) {
      const trough = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.5), new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffe6b0, emissiveIntensity: 1.5 }));
      trough.position.set(i * 4.6, WALL_H - 0.06, 0); root.add(trough);
      const pl = new THREE.PointLight(0xffe8c0, 5.5, 18, 1.7);
      pl.position.set(i * 4.6, WALL_H - 0.4, 0); root.add(pl);
    }
    // walls (with a big window onto the yard on the south side)
    this.wall(-PANEL_W / 2, 0, -PANEL_D / 2, PANEL_W, 'z', paint);
    this.wall(-PANEL_W / 2, 0, PANEL_D / 2, PANEL_W, 'z', paint);
    this.wall(-PANEL_W / 2, 0, -PANEL_D / 2, PANEL_D, 'x', steel);
    this.wall(PANEL_W / 2, 0, -PANEL_D / 2, PANEL_D, 'x', steel);
    // the yard outside the window: another hull and a cold star, so the window is not a mirror
    const outside = new THREE.Group();
    const hullMesh = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 12, 4, 12), this.mat(0x5a6068, 0.6, 0.6));
    hullMesh.rotation.z = Math.PI / 2;
    hullMesh.position.set(0, -3.5, PANEL_D / 2 + 26);
    outside.add(hullMesh);
    const star = new THREE.DirectionalLight(0xbfd8ff, 0.5);
    star.position.set(6, 10, 30); outside.add(star);
    root.add(outside);

    // ── the five things you came here for ──
    this.kiosk(root, 'board', -8.4, -5.6, -Math.PI / 2, 'CONTRACTS', '#d8c48f');
    this.kiosk(root, 'market', -2.6, -5.9, -Math.PI / 2, 'EXCHANGE', '#a8e6a0');
    this.kiosk(root, 'office', 3.0, -5.9, -Math.PI / 2, 'THE OFFICE', '#ff9a3a');
    this.kiosk(root, 'news', 8.6, -5.6, -Math.PI / 2, 'WIRE', '#7fd0ff');
    this.kiosk(root, 'book', 11.2, 4.6, Math.PI, 'THE BOOK', '#ff6b6b');   // only opens at rank 3
    this.kiosk(root, 'people', -11.2, 4.6, Math.PI, 'WHO IS HERE', '#c9a0ff');
    // the bar: a counter, stools, a bartender, and gossip that is actually true
    const counter = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.05, 0.8), gold);
    counter.position.set(0, 0.52, 5.6); root.add(counter);
    this.box(-3.2, 0, 5.2, 3.2, 1.05, 6.0, 'prop');
    for (let i = -2; i <= 2; i++) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 10), dark);
      stool.position.set(i * 1.3, 0.72, 4.6); root.add(stool);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6), steel);
      leg.position.set(i * 1.3, 0.36, 4.6); root.add(leg);
    }
    for (let i = -2; i <= 2; i++) {
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0xd8e6f0, transparent: true, opacity: 0.5, roughness: 0.1 }));
      glass.position.set(i * 1.05 + 0.4, 1.14, 5.5); root.add(glass);
    }
    // your ship, visible through the window, clamped to the yard
    this.ship = new THREE.Group();
    const ship = new THREE.Mesh(new THREE.BoxGeometry(9, 3.4, 4.4), this.mat(0x494f45, 0.65, 0.5));
    ship.position.set(-2, 1.4, PANEL_D / 2 + 16); this.ship.add(ship);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3, 8), this.mat(0x53595a, 0.6, 0.5));
    nose.rotation.z = -Math.PI / 2; nose.position.set(-8.6, 1.4, PANEL_D / 2 + 16); this.ship.add(nose);
    for (const [dx, c] of [[-3, 0xff5a4a], [3, 0x7fd0ff]]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2 }));
      lamp.position.set(dx - 2, 3.2, PANEL_D / 2 + 16); this.ship.add(lamp);
    }
    root.add(this.ship);

    // ── people: a dock hand, a bartender, a broker, and whoever the sim says is here ──
    const lifeMod = await safeImport('./life.js');
    this.lifeMod = lifeMod;
    const roster = this.roster();
    for (const r of roster) {
      let h = null;
      if (lifeMod && lifeMod.spawnHubPerson) { try { h = lifeMod.spawnHubPerson(r); } catch (e) { h = null; } }
      if (!h && lifeMod && lifeMod.buildPerson) { try { h = lifeMod.buildPerson(r); } catch (e) { h = null; } }
      if (!h) h = stubPerson(r);
      h.userData = h.userData || {};
      h.position.set(r.x, 0, r.z);
      h.rotation.y = r.yaw;
      root.add(h);
      this.people.push({ ...r, h, x: r.x, z: r.z, yaw: r.yaw });
      this.box(r.x - 0.3, 0, r.z - 0.3, r.x + 0.3, 1.8, r.z + 0.3, 'prop');
    }

    // hemisphere light so nothing is pure black, plus a low fill from the deck
    this.hemi = new THREE.HemisphereLight(0x2c3640, 0x0a0c10, 0.5);
    root.add(this.hemi);
    this.state = 'active';
    A.ambience('hull');
    return this;
  }

  kiosk(root, id, x, z, yaw, label, tint) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 0.5), this.mat(0x2a2e33, 0.8, 0.4));
    body.position.y = 0.6; g.add(body);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.75), new THREE.MeshStandardMaterial({ color: new THREE.Color(tint), emissive: new THREE.Color(tint), emissiveIntensity: 0.6, roughness: 0.4 }));
    screen.position.set(0, 0.82, 0.27); g.add(screen);
    const glow = new THREE.PointLight(new THREE.Color(tint), 2.4, 5.5, 2);
    glow.position.set(0, 0.95, 0.7); g.add(glow);
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    root.add(g);
    this.box(x - 0.75, 0, z - 0.3, x + 0.75, 1.3, z + 0.3, 'prop');
    const k = { id, label, tint, x, z, yaw, group: g, screen, glow };
    this.kiosks.push(k);
    this.interactables.push({ kind: 'kiosk', ref: k, x, y: 1, z, radius: 2.3 });
    return k;
  }

  mat(color, rough, metal) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); }
  box(x0, y0, z0, x1, y1, z1, kind) { this.colliders.push({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 }, kind }); }
  wall(x, y, z, len, axis, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? 0.4 : len, WALL_H, axis === 'x' ? len : 0.4), mat);
    m.position.set(axis === 'x' ? x - 0.2 * Math.sign(x) : x + len / 2, WALL_H / 2, axis === 'x' ? z + len / 2 : z - 0.2 * Math.sign(z));
    this.root.add(m);
    const b = axis === 'x'
      ? { min: { x: x - 0.4, y: 0, z }, max: { x: x + 0.1, y: WALL_H, z: z + len } }
      : { min: { x, y: 0, z: z - 0.4 }, max: { x: x + len, y: WALL_H, z: z + 0.1 } };
    this.colliders.push({ ...b, kind: 'wall' });
  }

  roster() {
    const sim = this.career.sim;
    const here = knownAt(sim, this.career.homeSys).slice(0, 4);
    const out = [
      { name: 'the dock hand', role: 'dock', x: -3.4, z: 2.0, yaw: 1.2, seed: 11, line: 'Do not scratch the plating on your way out. I have to file that.' },
      { name: 'Tallow & Ward clerk', role: 'clerk', x: 3.6, z: 1.4, yaw: -1.0, seed: 22, line: 'Freight is short everywhere. If you find any, I will pay above the board.' },
      { name: 'the bartender', role: 'bartender', x: 0, z: 6.4, yaw: Math.PI, seed: 33, line: 'Rimrunners drink here because the paperwork is worse everywhere else.' },
    ];
    here.forEach((p, i) => out.push({
      name: p.handle ? p.handle() : p.name, role: p.role || 'broker', person: p.id,
      x: -8 + i * 4.4, z: 3.4, yaw: Math.PI, seed: p.face || i * 17,
      line: p.nick ? `They call me ${p.nick}. It is not my name and it is what people use.` : 'You are the one bringing hauls out of the bad places. I have heard.',
    }));
    return out;
  }

  update(dt, app) {
    if (this.state !== 'active') return;
    this.time += dt;
    const In2 = In;
    this.player.update(dt, {
      nav: { heightAt: () => 0 }, rng: this.rng, haul: null, pad: this.pad, world: { colliders: this.colliders, foes: [], crew: [], player: this.player, rng: this.rng },
      sound: () => {}, log: (l) => app.hud && app.hud.log(l, 'self'), frozen: !!app.paused || !!app.modal, onPause: () => app.togglePause && app.togglePause(),
    });
    A.setListener(this.player.x, this.player.z, this.player.yaw);
    // kiosk hover + prompt
    let best = null, bd = 3.2;
    for (const k of this.kiosks) {
      const d = Math.hypot(k.x - this.player.x, k.z - this.player.z);
      if (d < bd && this.facing(k, 0.55)) { bd = d; best = k; }
    }
    let person = null, pd = 2.6;
    for (const p of this.people) {
      const d = Math.hypot(p.x - this.player.x, p.z - this.player.z);
      if (d < pd && this.facing(p, 0.6)) { pd = d; person = p; }
    }
    // the ship: walk to the clamp and launch whatever job you took
    const shipD = Math.hypot(0 - this.player.x, (PANEL_D / 2 - 1) - this.player.z);
    this.hover = null;
    if (best) {
      const label = `${best.label}${best.id === 'book' && this.career.rank < 3 ? ' — sealed until you are an Operator' : ''}`;
      this.prompt = `${In.label('interact')} use the ${label.toLowerCase()}`;
      this.hover = { name: label, tint: best.tint, x: 0, y: 0, act: this.prompt };
    } else if (person) {
      this.prompt = `${In.label('interact')} talk to ${person.name}`;
      this.hover = { name: person.name, tint: '#dcdcdc', x: 0, y: 0, act: this.prompt };
    } else if (shipD < 4.2) {
      const job = this.app.contract;
      this.prompt = job ? `${In.label('interact')} launch — ${job.site} (${job.sysName})` : `${In.label('tablet')} take a contract off the board first`;
      this.hover = { name: job ? `YOUR SHIP — ${job.site}` : 'YOUR SHIP', tint: '#8fb6d8', x: 0, y: 0, act: this.prompt };
    } else this.prompt = null;

    if (In.pressed.interact || In.pressed.fire) {
      In.pressed.interact = false;
      if (best) { this.useKiosk(best); }
      else if (person) { this.app.talkToPerson && this.app.talkToPerson(person); }
      else if (shipD < 4.2 && this.app.contract) { this.app.launch && this.app.launch(); }
    }
    // idle animation for the people so the yard is not a waxworks
    for (const p of this.people) {
      if (this.lifeMod && this.lifeMod.animateStand) { try { this.lifeMod.animateStand(p.h, { dt, t: this.time + p.seed }); continue; } catch {} }
      p.h.rotation.y = p.yaw + Math.sin(this.time * 0.4 + p.seed) * 0.12;
      p.h.position.y = Math.sin(this.time * 0.9 + p.seed) * 0.012;
    }
    // the ship's running lights breathe
    this.ship.children.forEach((c, i) => { if (c.material && c.material.emissive) c.material.emissiveIntensity = 1.4 + Math.sin(this.time * 1.6 + i) * 0.5; });
    for (const k of this.kiosks) k.glow.intensity = 2.0 + Math.sin(this.time * 1.3 + k.x) * 0.5;
  }

  facing(o, dot = 0.6) {
    const eye = { x: this.player.x, y: this.player.eyeY || 1.6, z: this.player.z };
    const dir = new THREE.Vector3((o.x || 0) - eye.x, (o.y || 1.2) - eye.y, (o.z || 0) - eye.z).normalize();
    return dir.dot(new THREE.Vector3(...this.player.lookDir())) > dot;
  }

  useKiosk(k) {
    A.play('ui');
    this.app.openPanel && this.app.openPanel(k.id);
  }

  dispose() {
    A.stopAmbience();
    if (this.root && this.root.parent) this.root.parent.remove(this.root);
    this.kiosks.length = 0; this.people.length = 0;
  }
}

async function safeImport(path) { try { return await import(path); } catch (e) { return null; } }

// A standing figure, used only if the human rigs are unavailable. It reads as a person from ten metres
// and that is exactly as much as it is for.
function stubPerson(r) {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: r.role === 'bartender' ? 0x3a3a2a : 0x3f444a, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb98b6a, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 10), suit); torso.position.y = 1.15; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin); head.position.y = 1.62; g.add(head);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.24), suit); hips.position.y = 0.86; g.add(hips);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.6, 4, 8), suit); leg.position.set(s * 0.12, 0.44, 0); g.add(leg);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 8), suit); arm.position.set(s * 0.3, 1.16, 0); g.add(arm);
  }
  g.userData.name = r.name;
  return g;
}
