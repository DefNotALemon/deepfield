// player.js — movement, camera, hands and guns for the rimrunner you play.
// Movement constants are Space Ranger's (Walk.cs / Character.Stance.cs) so the character feels the same
// in both games: walk 4.38, sprint 5.04, crouch x0.5, jump 3.8, g 9.8, ease 14/s.
//
// First person only in v1: you see your hands, your gun, your torch and the thing you are carrying.

import * as THREE from '../vendor/three.module.js';
import { In, haptic } from './input.js';
import { clamp, damp, lerp } from './util.js';
import { GUNS, itemName } from './data.js';
import { gunMesh } from './items.js';
import { fireShot, applyShot, dirFromAngles } from './weapons.js';

export const MOVE = {
  walk: 4.38, sprint: 5.04, crouchMul: 0.5, ease: 14, jump: 3.8, g: 9.8, air: 0.35,
  radius: 0.34, standH: 1.78, crouchH: 1.16, eyeFrac: 0.95, stepUp: 0.42, slide: 0.55,
};
const SENS = 0.0021;

export class Player {
  constructor() {
    this.x = 0; this.y = 1; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;
    this.onGround = true; this.crouch = false; this.crouchT = 0;
    this.hp = 100; this.maxHp = 100; this.dead = false;
    this.stamina = 1; this.sprinting = false;
    this.speed = 0; this.stepPhase = 0; this.bobT = 0; this.bobY = 0; this.bobX = 0;
    this.noise = 0;
    this.torch = false;
    this.aim = false; this.fov = 76;
    this.weapon = null;            // gun instance {id, uid, mag, ammo}
    this.ammo = 0; this.mag = 0;
    this.fireT = 0; this.reloadT = 0; this.recoil = 0; this.kick = 0;
    this.flash = 0; this.muzzle = 0;
    this.viewLag = new THREE.Vector2();
    this.shots = 0; this.damageTaken = 0;
    this.hurtDir = 0; this.hurtT = 0;
    this.cam = new THREE.PerspectiveCamera(76, 16 / 9, 0.06, 60000);
    this.cam.rotation.order = 'YXZ';
    this.root = new THREE.Group();
    this.root.add(this.cam);
    this.handRoot = new THREE.Group();
    this.cam.add(this.handRoot);
    this.lamp = new THREE.SpotLight(0xfff0d0, 0, 34, 0.55, 0.45, 1.1);
    this.lamp.position.set(0.12, -0.05, 0.1);
    this.lampTarget = new THREE.Object3D();
    this.lampTarget.position.set(0, -0.1, -6);
    this.cam.add(this.lamp); this.cam.add(this.lampTarget);
    this.lamp.target = this.lampTarget;
    this.gunMesh = null;
    this.hitBuckets = null;
    this.lastStepSound = 0;
  }

  // ── setup ────────────────────────────────────────────────────────────────────────────────
  place(root, opts = {}) {
    root.add(this.root);
    this.gunVis = new THREE.Group();
    this.handRoot.add(this.gunVis);
    this.buildHands();
    this.setWeapon(opts.weapon || null);
    const t = document.getElementById('torchglow');
    this.torchEl = t || null;
  }

  buildHands() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xb98b6a, roughness: 0.75, metalness: 0.02 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.85, metalness: 0.05 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x4a4f3a, roughness: 0.95, metalness: 0.02 });
    this.hands = {};
    for (const side of ['left', 'right']) {
      const g = new THREE.Group();
      const s = side === 'right' ? 1 : -1;
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.045, 0.34, 8), glove);
      fore.rotation.x = Math.PI / 2;
      fore.position.set(s * 0.04, -0.02, -0.22);
      g.add(fore);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.055, 0.11), skin);
      palm.position.set(s * 0.03, -0.03, -0.42);
      g.add(palm);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.3, 8), sleeve);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(0, 0, -0.05);
      g.add(arm);
      g.traverse(o => { if (o.isMesh) o.userData.look = { skip: true }; });
      this.hands[side] = g;
      this.handRoot.add(g);
    }
    this.handRoot.traverse(o => { if (o.isMesh) { o.renderOrder = 4; o.frustumCulled = false; } });
  }

  setWeapon(inst) {
    this.weapon = inst;
    if (this.gunMesh) { this.gunVis.remove(this.gunMesh); this.gunMesh = null; }
    if (!inst) return;
    const m = gunMesh(inst.id);
    m.position.set(0.1, -0.16, -0.42);
    m.rotation.set(0, 0.06, 0);
    m.traverse(o => { if (o.isMesh) o.userData.look = { skip: true }; });
    this.gunVis.add(m);
    this.gunMesh = m;
    this.mag = GUNS[inst.id]?.mag || 12;
    this.ammo = inst.ammo ?? this.mag;
    this.fireInterval = 60 / (GUNS[inst.id]?.rpm || 380);
  }

  // ── per-frame ────────────────────────────────────────────────────────────────────────────
  update(dt, ctx) {
    if (this.dead) { dt *= 0.35; }
    // read the press map without wiping it: the dive consumes interact/fire/bag/drop/tool itself before
    // the player runs, so a click on loot never also becomes a gunshot
    const look = In.pressed;
    const l = In.take();
    if (look.back2) { In.pressed.back2 = false; ctx.onPause && ctx.onPause(); }
    if (!ctx.frozen) {
      this.yaw -= l.x * SENS * (this.aim ? 0.72 : 1);
      this.pitch -= l.y * SENS * (this.aim ? 0.72 : 1);
      this.pitch = clamp(this.pitch, -1.45, 1.35);
    }
    // ── movement ──
    const wantCrouch = !!In.down.crouch;
    const wantSprint = !!In.down.sprint && !wantCrouch;
    this.crouch = wantCrouch;
    this.crouchT = damp(this.crouchT, wantCrouch ? 1 : 0, 12, dt);
    const canSprint = wantSprint && this.stamina > 0.05 && In.move.y < -0.4;
    this.sprinting = canSprint && !ctx.frozen;
    this.stamina = clamp(this.stamina + (this.sprinting ? -0.22 : 0.34) * dt, 0, 1);

    let mx = ctx.frozen ? 0 : In.move.x, mz = ctx.frozen ? 0 : In.move.y;
    const mag = Math.hypot(mx, mz);
    let target = 0;
    if (mag > 0.02) {
      const base = this.sprinting ? MOVE.sprint : MOVE.walk;
      target = base * (this.crouch ? MOVE.crouchMul : 1) * (ctx.haul ? ctx.haul.speedMul() : 1);
      if (ctx.wet) target *= 0.94;
    }
    const dirX = Math.sin(this.yaw), dirZ = Math.cos(this.yaw);
    const wx = mx * dirZ - mz * dirX;   // strafe right is +x per the face convention
    const wz = -mx * dirX - mz * dirZ;
    const len = Math.hypot(wx, wz) || 1;
    const tx = (wx / len) * target, tz = (wz / len) * target;
    const ease = this.onGround ? MOVE.ease : MOVE.air * MOVE.ease;
    this.vx = damp(this.vx, mag > 0.02 ? tx : 0, ease, dt);
    this.vz = damp(this.vz, mag > 0.02 ? tz : 0, ease, dt);
    this.speed = Math.hypot(this.vx, this.vz);

    // gravity + jump
    this.vy -= MOVE.g * dt;
    if (In.pressed.jump && this.onGround && !ctx.frozen && this.stamina > 0.06) { this.vy = MOVE.jump; this.onGround = false; In.pressed.jump = false; }
    // integrate
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    const res = this.collide(nx, nz, ctx);
    if (res.blockedX) this.vx *= 0.2;
    if (res.blockedZ) this.vz *= 0.2;
    this.x = res.x; this.z = res.z;
    let ny = this.y + this.vy * dt;
    const floor = ctx.nav ? ctx.nav.heightAt(this.x, this.z) : 0;
    if (ny <= floor + 0.001) {
      if (!this.onGround && this.vy < -4) { this.landKick = -this.vy; ctx.sound && ctx.sound('step', this.x, this.z, clamp(-this.vy / 8, 0.2, 1.4)); }
      ny = floor; this.vy = 0; this.onGround = true;
    } else this.onGround = false;
    // step up small lips instead of stopping dead
    if (this.onGround) this.y = damp(this.y, floor, 22, dt); else this.y = ny;

    // ── noise: the whole game's stealth economy ──
    let noise = this.speed * (this.crouch ? 0.05 : 0.16) + (this.onGround ? 0 : 0.1);
    if (ctx.haul) noise += ctx.haul.noiseAdd() * (this.speed > 0.4 ? 1 : 0.4);
    this.noise = clamp(noise, 0, 1.5);
    this.stepPhase += dt * (0.6 + this.speed * 0.55);
    if (this.onGround && this.speed > 0.5 && this.stepPhase > 1) {
      this.stepPhase = 0;
      const loud = (this.crouch ? 2.2 : this.sprinting ? 11 : 6.5) * (ctx.haul && ctx.haul.handsBusy() ? 1.7 : 1);
      ctx.sound && ctx.sound('step', this.x, this.z, loud);
      haptic(ctx.pad, 'tap');
    }

    // ── hands: the lamp, the gun, the thing in both arms ──
    if (look.torch || In.pressed.torch) { this.torch = !this.torch; In.pressed.torch = false; if (ctx.log) ctx.log(this.torch ? 'Lamp on. You are easier to see and easier to find.' : 'Lamp off.'); }
    this.lamp.intensity = damp(this.lamp.intensity, this.torch && !ctx.frozen ? 26 : 0, 10, dt);
    const busy = ctx.haul ? ctx.haul.handsBusy() : false;
    this.aim = !busy && !!In.down.aim;
    this.fov = damp(this.fov, this.aim ? 58 : 76, 9, dt);

    // firing
    this.fireT -= dt;
    const def = this.weapon ? GUNS[this.weapon.id] : null;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.ammo = this.mag; if (ctx.log) ctx.log('Reloaded.'); }
    } else if (!ctx.frozen && !busy && def && In.down.fire && this.fireT <= 0 && this.ammo > 0) {
      this.shoot(ctx, def);
    } else if (look.reload && def && this.ammo < this.mag) {
      In.pressed.reload = false;
      this.reloadT = def.mag > 8 ? 2.2 : 1.7;
      ctx.sound && ctx.sound('tool', this.x, this.z, 6);
      if (ctx.log) ctx.log('Reloading.');
    }

    // view model feel: lag, kick, reload dip, torch arm
    const lagX = clamp(-l.x * 0.00035, -0.05, 0.05), lagY = clamp(-l.y * 0.00035, -0.05, 0.05);
    this.viewLag.x = damp(this.viewLag.x, lagX, 8, dt);
    this.viewLag.y = damp(this.viewLag.y, lagY, 8, dt);
    this.kick = damp(this.kick, 0, 9, dt);
    this.recoil = damp(this.recoil, 0, 7, dt);
    const dip = this.reloadT > 0 ? Math.sin((1 - this.reloadT / 2) * Math.PI) * 0.14 : 0;
    if (this.gunVis) {
      this.gunVis.position.set(this.viewLag.x, this.viewLag.y - dip - this.kick * 0.02, this.recoil * 0.06);
      this.gunVis.rotation.set(this.recoil * 0.22 - dip * 1.1, 0, 0);
    }
    const walkSway = Math.sin(this.stepPhase * Math.PI * 2) * clamp(this.speed / 5, 0, 1);
    this.handRoot.position.set(this.viewLag.x * 0.5 + walkSway * 0.012, this.viewLag.y * 0.5 + Math.abs(walkSway) * 0.01 - dip * 0.5, 0);
    if (this.hands) {
      const both = busy || ctx.carrying;
      this.hands.left.position.set(both ? -0.22 : -0.05, both ? -0.28 : -0.02, both ? -0.16 : 0);
      this.hands.right.position.set(both ? 0.22 : 0.05, both ? -0.28 : -0.02, both ? -0.16 : 0);
      this.hands.left.visible = this.hands.right.visible = true;
      if (this.torch && !busy) { this.hands.left.rotation.x = -0.5; this.hands.left.position.z -= 0.16; }
      else this.hands.left.rotation.x = damp(this.hands.left.rotation.x, 0, 8, dt);
    }

    // ── camera ──
    const eyeH = lerp(MOVE.standH, MOVE.crouchH, this.crouchT) * MOVE.eyeFrac;
    this.bobT += dt * (2.6 + this.speed * 1.25);
    const bobAmt = clamp(this.speed / 5, 0, 1) * (this.crouch ? 0.25 : 1);
    this.bobY = damp(this.bobY, Math.sin(this.bobT * 2) * 0.032 * bobAmt, 18, dt);
    this.bobX = damp(this.bobX, Math.cos(this.bobT) * 0.02 * bobAmt, 18, dt);
    const shakeHurt = this.hurtT > 0 ? Math.sin(this.hurtT * 40) * 0.02 : 0;
    this.hurtT = Math.max(0, this.hurtT - dt);
    const lean = 0;
    this.cam.position.set(this.bobX + shakeHurt, eyeH + this.bobY - this.recoil * 0.01, 0);
    this.cam.rotation.set(this.pitch - this.kick * 0.02 + shakeHurt, this.yaw, lean);
    this.cam.fov = this.fov;
    this.cam.updateProjectionMatrix();
    this.eyeY = this.y + eyeH;
    In.pressed.jump = false;
  }

  shoot(ctx, def) {
    this.fireT = this.fireInterval;
    if (def.mode !== 'auto') In.pressed.fire = false;
    this.ammo--;
    this.shots++;
    const world = ctx.world;
    const res = fireShot(world, { x: this.x, y: this.eyeY, z: this.z, yaw: this.yaw, pitch: this.pitch }, this.weapon.id, {
      rng: ctx.rng, exclude: null, by: 'player', spreadMul: this.aim ? 0.45 : (this.speed > 3 ? 1.9 : 1),
    });
    const out = applyShot(world, res, { by: 'player' });
    this.kick += def.recoil * 0.1;
    this.recoil += def.recoil * 0.05;
    this.pitch += def.recoil * 0.004 * (this.aim ? 0.7 : 1);
    this.yaw += (ctx.rng ? ctx.rng() - 0.5 : 0) * def.recoil * 0.004;
    ctx.onShot && ctx.onShot(res, out, this.weapon.id);
    haptic(ctx.pad, 'shot');
    if (this.ammo === 0 && ctx.log) ctx.log('Empty.');
  }

  hurt(amount, source) {
    if (this.dead) return;
    this.hp -= amount;
    this.damageTaken += amount;
    this.hurtT = 0.6;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }

  heal(amount) { this.hp = clamp(this.hp + amount, 0, this.maxHp); }

  // Exact AABB resolution with slide, on a bucketed collider index built once per site.
  buildIndex(colliders, cell = 6) {
    this.hitBuckets = new Map();
    this.cellSize = cell;
    colliders.forEach((c, i) => {
      const x0 = Math.floor(c.min.x / cell), x1 = Math.floor(c.max.x / cell);
      const z0 = Math.floor(c.min.z / cell), z1 = Math.floor(c.max.z / cell);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = x + ',' + z;
        if (!this.hitBuckets.has(k)) this.hitBuckets.set(k, []);
        this.hitBuckets.get(k).push(i);
      }
    });
    this.colliderList = colliders;
  }

  nearColliders(x, z) {
    if (!this.hitBuckets) return [];
    const cell = this.cellSize, out = new Set();
    const x0 = Math.floor((x - MOVE.radius) / cell), x1 = Math.floor((x + MOVE.radius) / cell);
    const z0 = Math.floor((z - MOVE.radius) / cell), z1 = Math.floor((z + MOVE.radius) / cell);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const b = this.hitBuckets.get(cx + ',' + cz);
      if (b) for (const i of b) out.add(i);
    }
    return [...out].map(i => this.colliderList[i]);
  }

  collide(nx, nz, ctx) {
    const feet = this.y, head = this.y + 1.6;
    let x = nx, z = nz, blockedX = false, blockedZ = false;
    const cols = this.nearColliders(nx, nz);
    for (const c of cols) {
      if (c.max.y <= feet + MOVE.stepUp || c.min.y >= head) continue;   // steppable lip or overhead
      const r = MOVE.radius;
      const cx = clamp(x, c.min.x, c.max.x), cz = clamp(z, c.min.z, c.max.z);
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (r - d) * 1.001;
        x += (dx / d) * push; z += (dz / d) * push;
      } else {
        // centre inside the box: push out along the shallowest axis
        const leftPen = x - c.min.x, rightPen = c.max.x - x, backPen = z - c.min.z, frontPen = c.max.z - z;
        const m = Math.min(leftPen, rightPen, backPen, frontPen);
        if (m === leftPen) { x = c.min.x - r; blockedX = true; }
        else if (m === rightPen) { x = c.max.x + r; blockedX = true; }
        else if (m === backPen) { z = c.min.z - r; blockedZ = true; }
        else { z = c.max.z + r; blockedZ = true; }
      }
    }
    return { x, z, blockedX, blockedZ };
  }

  lookDir() { return dirFromAngles(this.yaw, this.pitch); }
  eyePos() { return { x: this.x, y: this.eyeY || (this.y + 1.68), z: this.z }; }
}
