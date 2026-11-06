// dive.js — one extraction, start to finish. This is where the contract, the site, the people, the
// thing in the ducts, the clock and the rival all become the same situation.
//
// The run owns the truth for one dive and hands a summary to state.settle() at the end.

import * as THREE from '../vendor/three.module.js';
import { In, haptic } from './input.js';
import { rng, clamp, damp, money, stamp } from './util.js';
import { GUNS, ITEMS, TOOLS, FACTIONS, ROOM_LABEL, itemName, itemValue, itemKg } from './data.js';
import { Haul, Duffel } from './carry.js';
import { Player } from './player.js';
import { Hud, screenPos } from './hud.js';
import { itemMesh } from './items.js';
import { fireShot, applyShot, aimPoint, traceShot, dirFromAngles } from './weapons.js';
import { siteSpec, objectiveMet, objectiveLine, clockWarn2, clockWarn30, clockDoom, placeJobItem, INCIDENTS } from './contracts.js';
import { priceAt, notice, credit, pushNews, rivalsAlive, systemById } from './sim.js';
import * as A from './audio.js';

const CLOCK_SECONDS = { vent: 840, burn: 780, housing: 900, scuttle: 780, security: 720, rival: 900, none: 0 };

export class Run {
  constructor(app, opts = {}) {
    this.app = app;
    this.career = app.career;
    this.contract = app.contract;
    this.rng = rng((app.career.seed ^ 0x51ab ^ Math.floor(app.career.sim.hours)) >>> 0);
    this.time = 0;
    this.state = 'active';          // active | extracted | died
    this.log = [];
    this.sounds = [];
    this.drops = [];
    this.pickups = [];
    this.fx = [];
    this.foes = [];
    this.crew = [];
    this.rescued = 0;
    this.rescuedNpcs = [];
    this.kills = 0;
    this.shots = 0;
    this.banked = [];
    this.prompt = null;
    this.hover = null;
    this.showHints = true;
    this.mode = 'dive';
    this.lootTaken = 0;
    this.clock = null;
    this.rivalIncoming = null;
    this.alien = null;
    this.extractT = 0;
    this.deathReason = null;
    this.gassed = new Map();        // roomId -> 0..1 concentration
    this.hazardT = 0;
    this.mods = null;               // set by build()
  }

  // ── build the situation ──────────────────────────────────────────────────────────────────
  async build(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    const root = new THREE.Group();
    root.name = 'dive';
    scene.add(root);
    this.root = root;

    // the generator and the builder are separate modules so a failure in one is a bug, not a dead game
    let gen, buildMod, lifeMod, hostileMod;
    try { gen = await import('./gen.js'); } catch (e) { gen = null; }
    try { buildMod = await import('./build.js'); } catch (e) { buildMod = null; }
    try { lifeMod = await import('./life.js'); } catch (e) { lifeMod = null; }
    try { hostileMod = await import('./hostile.js'); } catch (e) { hostileMod = null; }
    this.mods = { gen: !!gen, build: !!buildMod, life: !!lifeMod, hostile: !!hostileMod };

    const spec = siteSpec(this.contract, this.career, this.rng.int(1, 1e9));
    let site = null, build = null;
    if (gen) { try { site = gen.generateSite(spec); } catch (e) { this.warnInternal('site generator failed: ' + e.message); } }
    if (site && buildMod) { try { build = buildMod.buildSite(site, { rng: this.rng }); } catch (e) { this.warnInternal('site builder failed: ' + e.message); } }
    if (!site || !build) { const fb = fallbackSite(spec); site = fb.site; build = fb.build; this.warnInternal('using the fallback layout'); }
    this.gen = gen; this.buildMod = buildMod; this.lifeMod = lifeMod; this.hostileMod = hostileMod;
    this.site = site; this.build = build;
    root.add(build.root);

    // the job item has to be findable: put it in a container that suits its story
    placeJobItem(site, this.contract, this.rng);
    this.prepareContainers();

    // player at the clamp, facing into the site
    this.player = new Player();
    this.player.place(root, { weapon: this.startingGun() });
    const spawn = site.spawn || { x: site.w / 2, z: 2 };
    this.player.x = spawn.x + 0.5; this.player.z = spawn.z + 0.5; this.player.yaw = Math.PI;
    this.player.buildIndex(build.colliders || [], 6);
    this.haul = new Haul({ slots: this.career.gear.bagSlots || 5 });
    this.duffel = new Duffel(this.haul);
    this.duffel.setOpen(0);
    root.add(this.duffel.root);

    scene.background = new THREE.Color(0x05070a);
    scene.fog = new THREE.FogExp2(0x05070a, 0.012);
    this.amb = new THREE.HemisphereLight(0x2a3540, 0x0a0c10, 0.35);
    root.add(this.amb);
    this.sun = new THREE.DirectionalLight(0x8fa8c0, 0.25);
    this.sun.position.set(30, 60, 20);
    root.add(this.sun);
    if (build.lights) { for (const l of build.lights) if (l.on !== false) this.amb.intensity += 0.001; }

    // people who live here, and the ones who are the problem
    if (lifeMod) {
      try { this.crew = lifeMod.populateSite(site, { ctx: this.ctx0(), incident: this.contract.incidentId, faction: this.contract.siteFaction, rng: this.rng, hostileCount: this.contract.truth.hostiles }) || []; }
      catch (e) { this.warnInternal('crew failed: ' + e.message); }
    }
    if (hostileMod) {
      try { this.foes = hostileMod.populateThreats(site, { ctx: this.ctx0(), incident: this.contract.incidentId, faction: this.contract.siteFaction, count: this.contract.truth.hostiles, rng: this.rng, crew: this.crew }) || []; }
      catch (e) { this.warnInternal('threats failed: ' + e.message); }
      this.alien = this.foes.find(f => f.kind === 'alien') || null;
    }

    // the clock: what is coming, and what it means
    const kind = this.contract.incident.clock.kind;
    const total = CLOCK_SECONDS[kind] ?? 0;
    this.clock = total > 0 ? { kind, name: this.contract.incident.clock.name, left: total, total, warned2: false, warned30: false } : null;

    // who else wants this haul: the rival roll was decided when the contract was written
    this.rivalRisk = this.contract.truth.rival ?? 0;
    if (this.rng() < (this.contract.truth.rivalRisk ?? this.rivalRiskOf())) this.scheduleRival();

    // hazards: gas spreads room by room; vacuum is a hole in the hull; dark needs a breaker
    this.hazards = (site.hazards || []).slice();
    this.setupHazards();

    this.hud = new Hud(document.getElementById('hud'));
    this.hud.clear();
    this.intro();
    A.ambience(this.contract.siteKind === 'derelict' ? 'derelict' : 'hull');
    this.objectiveText = objectiveLine(this.contract);
    return this;
  }

  warnInternal(msg) { this.log.push({ t: this.time, line: `[build] ${msg}`, kind: 'sys' }); }
  startingGun() {
    const g = this.career.gear.guns.find(x => x.uid === this.career.gear.gun) || this.career.gear.guns[0] || null;
    return g;
  }
  rivalRiskOf() { return this.contract.rivalRisk || 0.1; }

  intro() {
    const c = this.contract;
    this.hud.log(`Clamped onto ${c.site}. ${c.kind}, ${c.sysName}.`, 'sys');
    this.hud.say(`${c.incident.title} — ${c.job.short}`, 6);
    this.hud.alert(`${c.incident.reason[0].toUpperCase() + c.incident.reason.slice(1)}.`, 6);
    if (this.clock) this.hud.alert(this.clock.name ? `${this.clock.name}: ${fmtClock(this.clock.left)}` : '', 4);
  }

  // ── the ctx every AI and system reads ────────────────────────────────────────────────────
  ctx0() {
    if (this._ctx) return this._ctx;
    const self = this;
    this._ctx = {
      site: this.site, build: this.build, nav: this.site.nav, rng: this.rng,
      dt: 1 / 60, time: 0,
      player: { x: 0, y: 0, z: 0, eyeY: 1.7, yaw: 0, dead: false, crouch: false, noise: 0 },
      crew: this.crew, foes: this.foes, drops: this.drops, sounds: this.sounds,
      sound(type, x, z, loud) { self.onSound(type, x, z, loud); },
      event(type, data) { self.onEvent(type, data); },
      log(line) { self.hud && self.hud.log(line, 'world'); self.log.push({ t: self.time, line }); },
      hurt(amount, source) { self.onHurt(amount, source); },
      kill(npc) { self.onKill(npc); },
      shot(foe, dir) { self.onFoeShot(foe, dir); },
    };
    return this._ctx;
  }
  get ctx() { return this.ctx0(); }

  // ── sounds: the single sense the whole site shares ────────────────────────────────────────
  onSound(type, x, z, loud = 1) {
    this.sounds.push({ type, x, z, loud, t: this.time });
    if (this.sounds.length > 64) this.sounds.shift();
    A.play(type === 'shot' ? (loud > 20 ? 'shot' : 'shot_far') : type, { x, z, vol: clamp(loud / 10, 0.3, 1.4) });
    if (this.hostileMod && this.hostileMod.hear && this.foes.length) {
      try { this.hostileMod.hear(this.foes, type, x, z, loud, this.ctx); } catch (e) { /* their problem, not the run's */ }
    }
    if (this.lifeMod && this.lifeMod.hear && this.crew.length) {
      try { this.lifeMod.hear(this.crew, type, x, z, loud, this.ctx); } catch (e) { /* optional */ }
    }
  }

  onEvent(type, data = {}) {
    switch (type) {
      case 'shot': A.play('shot', { x: data.x, z: data.z, vol: 0.8 }); break;
      case 'rival_arrived': this.hud.alert('A second clamp has taken hold of the hull. Somebody else is aboard.', 7); A.stinger('bad'); break;
      case 'rival_left': this.hud.log('Their clamp released. They are gone, with whatever they were carrying.', 'world'); break;
      case 'alien_fed': this.hud.log('Something in the ducts is eating.', 'world'); break;
      case 'door': A.play('door', { x: data.x, z: data.z }); break;
      default: break;
    }
    this.app.onRunEvent && this.app.onRunEvent(type, data, this);
  }

  onHurt(amount, source) {
    if (this.player.dead) return;
    this.player.hurt(amount, source);
    A.play('flesh', { vol: 0.5 });
    if (this.player.hp <= 0) this.end('died', `Killed aboard ${this.contract.site} by ${source}.`);
    else if (this.player.hp < 35) this.hud.alert('You are losing blood. Patch yourself with a trauma kit or leave.', 3);
  }

  onKill(npc) {
    if (!npc) return;
    if (npc.kind && this.foes.includes(npc)) this.kills++;
    this.hud.log(npc.kind === 'alien' ? 'It is not dead. Nothing that size dies like that.' : `${npc.name || 'Somebody'} goes down.`, 'kill');
    A.play('flesh', { x: npc.x, z: npc.z, vol: 0.8 });
  }

  // A foe asked for a shot to be resolved: same ballistics as the player's.
  onFoeShot(foe, dir) {
    if (!foe || foe.dead || this.player.dead) return;
    const w = { colliders: this.build.colliders, foes: this.foes, crew: this.crew, player: this.player, rng: this.rng, sound: null };
    const gunId = foe.weapon || 'pistol';
    const res = fireShot(w, { x: foe.x, y: foe.y + 1.5, z: foe.z, yaw: foe.yaw, pitch: foe.pitch || 0 }, gunId, { rng: this.rng, exclude: foe, by: 'foe' });
    // suppress double-announcing (fireShot already calls world.sound when present; here sound is null)
    this.onSound('shot', foe.x, foe.z, 26 * (GUNS[gunId].noise || 1));
    const out = applyShot({ colliders: this.build.colliders, foes: this.foes, crew: this.crew, player: this.player, hitFoe: (f, d, h, by) => this.damageFoeFromAI(f, d, by), hitCrew: (n, d, h, by) => this.damageCrewFromAI(n, d, by), hurt: (d, s) => this.onHurt(d, s), rng: this.rng }, res, { by: 'foe' });
    this.addTracer(foe, res);
    if (out.hits) haptic(this.pad, 'hit');
    return out;
  }

  damageFoeFromAI(f, dmg, by) {
    if (!this.hostileMod) return false;
    try { return this.hostileMod.damageFoe(f, dmg, by, this.ctx); } catch (e) { return false; }
  }
  damageCrewFromAI(n, dmg, by) {
    if (!this.lifeMod || !this.lifeMod.damageNpc) { n.hp = (n.hp ?? 60) - dmg; if (n.hp <= 0) n.dead = true; return; }
    try { this.lifeMod.damageNpc(n, dmg, by, this.ctx); } catch (e) { /* ignore */ }
  }

  addTracer(shooter, res) {
    const from = new THREE.Vector3(shooter.x, shooter.y + 1.5, shooter.z);
    for (const s of res.shots.slice(0, 2)) {
      const to = new THREE.Vector3(s.trace.point.x, s.trace.point.y, s.trace.point.z);
      const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.55 }));
      line.userData.look = { skip: true };
      this.root.add(line);
      this.fx.push({ mesh: line, t: 0.07, kind: 'tracer' });
    }
    const light = new THREE.PointLight(0xffcf90, 6, 9);
    light.position.copy(from);
    this.root.add(light);
    this.fx.push({ mesh: light, t: 0.05, kind: 'flash' });
    A.play('shot', { x: shooter.x, z: shooter.z, vol: 0.9 });
  }

  // ── containers, doors, breakers: everything you touch with your hands ────────────────────
  prepareContainers() {
    const b = this.build;
    this.containers = (b.containers || []).map((c, i) => {
      c.idx = i;
      c.opened = 0;
      c.want = 0;
      c.stacks = (c.contents || []).slice();
      c.taken = [];
      if (!c.hoverPoint) c.hoverPoint = { x: c.x, y: 1.1, z: c.z };
      // where loot inside this container appears: the builder's lootPoint when it has one, otherwise a
      // point you can see into rather than the ceiling the hover point refers to
      if (!c.lootPoint) c.lootPoint = { x: c.x, y: Math.min(c.hoverPoint.y, 1.15), z: c.z };
      // if the builder gave us a tray of real meshes we use it; otherwise we make the loot ourselves
      c.trayMeshes = Array.isArray(c.rig?.tray) ? c.rig.tray : null;
      if (!c.trayMeshes) {
        const g = new THREE.Group();
        g.position.set(c.lootPoint.x, c.lootPoint.y, c.lootPoint.z);
        c.lootGroup = g;
        this.root.add(g);
      }
      c.hitBox = { x: c.x, y: c.hoverPoint.y, z: c.z, r: 1.5 };
      return c;
    });
    this.doors = (b.doors || []).map(d => {
      d.want = d.state === 'open' ? 1 : 0;
      d.amount = d.want;
      d.busy = 0;
      if (d.x == null && d.mesh) { d.x = d.mesh.position.x; d.z = d.mesh.position.z; }
      return d;
    });
    this.liftCollider = (c) => { if (c) { c._min = c._min || { ...c.min }; c._max = c._max || { ...c.max }; c.min = { ...c._min, y: 900 }; c.max = { ...c._max, y: 910 }; } };
    this.dropCollider = (c) => { if (c && c._min) { c.min = { ...c._min }; c.max = { ...c._max }; } };
    // breakers: the builder may have made them; if not, one lives in engineering so lights are a decision
    this.breakers = (b.interactables || []).filter(i => i.kind === 'breaker');
    this.lightsOn = true;
    if (!this.breakers.length && this.contract.incidentId === 'rogue') {
      const room = (this.site.rooms || []).find(r => r.kind === 'engineering' || r.kind === 'control') || this.site.rooms?.[0];
      if (room) this.breakers.push({ kind: 'breaker', x: room.cx ?? room.spot?.x, y: 1.3, z: room.cz ?? room.spot?.z, radius: 2.2, ref: null, home: true });
    }
  }

  refreshLootMeshes(c) {
    if (!c.trayMeshes) { /* builder-supplied trays are animated by their own rig */ }
    if (!c.lootGroup) return;
    while (c.lootGroup.children.length) { const ch = c.lootGroup.children.pop(); c.lootGroup.remove(ch); }
    c.trayMeshes = [];
    const open = c.opened > 0.45;
    c.lootGroup.visible = open;
    if (!open) return;
    let i = 0;
    for (const st of c.stacks) {
      if (st.gone) continue;
      for (let k = 0; k < (st.n || 1) && i < 6; k++) {
        const m = itemMesh(st.id, c.idx * 7 + i + 1);
        m.position.set(((i % 3) - 1) * 0.22, 0, Math.floor(i / 3) * 0.2 - 0.1);
        m.userData.item = st.id;
        m.userData.stack = st;
        m.traverse(o => { if (o.isMesh) { o.userData.look = { skip: true }; } });
        c.lootGroup.add(m);
        c.trayMeshes.push(m);
        i++;
      }
    }
    this.hud && this.hud.say(c.stacks.some(s => !s.gone) ? `${c.kind || 'container'} open — aim and grab` : 'Empty.', 2);
  }

  nearestOf(list, x, z, maxD) {
    let best = null, bd = maxD;
    for (const it of list) {
      if (it.dead || it.gone) continue;
      const d = Math.hypot((it.x ?? 0) - x, (it.z ?? 0) - z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  // ── per-frame ────────────────────────────────────────────────────────────────────────────
  update(dt, app) {
    if (this.state !== 'active') return;
    this.time += dt;
    const ctx = this.ctx;
    ctx.dt = dt; ctx.time = this.time;
    ctx.player.x = this.player.x; ctx.player.z = this.player.z; ctx.player.y = this.player.y;
    ctx.player.eyeY = this.player.eyeY; ctx.player.yaw = this.player.yaw;
    ctx.player.dead = this.player.dead; ctx.player.crouch = this.player.crouch;
    ctx.player.noise = this.player.noise;
    ctx.sounds = this.sounds;
    if (this.build.nav && this.build.nav.heightAt) {
      // the builder's floor wins over the grid when it has one
    }
    const nav = { heightAt: (x, z) => (this.build.nav && this.build.nav.heightAt ? this.build.nav.heightAt(x, z) : floorHeight(this.site, this.build, x, z)) };
    // hands first: what you are looking at decides whether a click is a grab, a grab of the world, or a shot
    this.hoverTick();
    this.interactTick();
    this.pickupTick();
    this.player.update(dt, {
      world: this._world(), nav, rng: this.rng, haul: this.haul, pad: this.pad,
      sound: (t, x, z, l) => this.onSound(t, x, z, l), log: (l) => this.hud.log(l, 'self'),
      onShot: (res, out, gunId) => this.onPlayerShot(res, out, gunId),
      frozen: !!app.paused || !!app.modal,
      onPause: () => app.togglePause && app.togglePause(),
    });
    A.setListener(this.player.x, this.player.z, this.player.yaw);

    // doors animate; their colliders lift out of the way when they are open enough to walk through
    for (const d of this.doors) {
      if (d.busy > 0) d.busy -= dt;
      const want = d.want;
      const prev = d.amount;
      d.amount = damp(d.amount, want, want > prev ? 7 : 9, dt);
      if (Math.abs(d.amount - prev) > 0.001) {
        if (typeof d.set === 'function') { try { d.set(d.amount); } catch {} }
        if (d.mesh && d.mesh.userData.rig) { /* builder animates internally */ }
        d.state = d.amount > 0.55 ? 'open' : 'closed';
      }
      if (d.collider) { if (d.amount > 0.55) this.liftCollider(d.collider); else this.dropCollider(d.collider); }
    }
    // containers: open when asked, loot meshes appear inside
    for (const c of this.containers) {
      if (c.want !== c.opened) {
        c.opened = damp(c.opened, c.want, 8, dt);
        if (typeof c.rig?.t === 'number' || c.rig) { try { c.rig.t = c.opened; c.rig.apply && c.rig.apply(c.opened); } catch {} }
        if (c.rig && 'want' in c.rig) c.rig.want = c.opened;
        if (Math.abs(c.opened - c.want) < 0.05) this.refreshLootMeshes(c);
      }
    }

    // people and threats
    if (this.lifeMod && this.crew.length) { try { this.lifeMod.updateCrew(this.crew, ctx); } catch (e) { this.warnInternal('crew tick: ' + e.message); } }
    if (this.hostileMod && this.foes.length) { try { this.hostileMod.updateThreats(this.foes, ctx); } catch (e) { this.warnInternal('threat tick: ' + e.message); } }
    this.harvestDrops();

    // the world's hazards: gas spreading, holes in the hull, fires, and the dark
    this.tickHazards(dt);

    // the clock
    if (this.clock) {
      this.clock.left -= dt;
      if (!this.clock.warned2 && this.clock.left < 120) { this.clock.warned2 = true; const m = clockWarn2(this.contract); if (m) this.hud.alert(m, 8); A.stinger('alert'); }
      if (!this.clock.warned30 && this.clock.left < 30) { this.clock.warned30 = true; const m = clockWarn30(this.contract); if (m) this.hud.alert(m, 6); A.stinger('bad'); }
      if (this.clock.left <= 0) { this.end('died', clockDoom(this.contract)); return; }
    }
    // the rival's arrival
    if (this.rivalIncoming && this.time >= this.rivalIncoming.at && !this.rivalIncoming.done) {
      this.rivalIncoming.done = true;
      this.arriveRival();
    }

    // hauling, extraction and the aftermath of the frame
    this.duffelTick(dt);
    this.extractTick(dt);
    this.fxTick(dt);

    In.pressed.interact = false;
  }

  _world() {
    if (this._w) return this._w;
    const self = this;
    this._w = {
      colliders: this.build.colliders, foes: this.foes, crew: this.crew, player: this.player, rng: this.rng,
      sound: null,
      hitFoe: (f, d, head, by) => self.damageFoeFromAI(f, d, by),
      hitCrew: (n, d, head, by) => self.damageCrewFromAI(n, d, by),
      hurt: (d, s) => self.onHurt(d, s),
    };
    return this._w;
  }

  onPlayerShot(res, out, gunId) {
    this.shots++;
    A.play(gunId === 'shotgun' ? 'shotgun' : 'shot', { vol: 1 });
    if (out.hits) { this.hud.hitmarker(); haptic(this.pad, 'hit'); }
    // impact effects on geometry
    for (const p of (out.sparks || []).slice(0, 3)) this.spark(p);
    for (const p of (out.blood || []).slice(0, 2)) this.spark(p, 0x8a1c1c);
  }

  spark(p, color = 0xffd090) {
    const light = new THREE.PointLight(color, 3, 3.5);
    light.position.set(p.x, p.y, p.z);
    this.root.add(light);
    this.fx.push({ mesh: light, t: 0.08, kind: 'spark' });
    A.play('impact', { x: p.x, z: p.z, vol: 0.4 });
  }

  fxTick(dt) {
    for (const f of this.fx.slice()) {
      f.t -= dt;
      if (f.mesh.material) f.mesh.material.opacity = Math.max(0, f.t / (f.kind === 'tracer' ? 0.07 : 1));
      if (f.mesh.isLight) f.mesh.intensity = Math.max(0, f.mesh.intensity - dt * 60);
      if (f.t <= 0) { this.root.remove(f.mesh); f.mesh.geometry?.dispose?.(); this.fx.splice(this.fx.indexOf(f), 1); }
    }
  }

  harvestDrops() {
    if (!this.drops.length) return;
    for (const d of this.drops) {
      for (const row of (d.items || [])) this.spawnPickup(row.id, d.x, d.z, row.n || 1);
    }
    this.drops.length = 0;
  }

  spawnPickup(id, x, z, n = 1) {
    const y = this.floorAt(x, z);
    const mesh = itemMesh(id, Math.floor(x * 7 + z * 3));
    mesh.position.set(x, y + 0.12, z);
    mesh.rotation.y = this.rng() * 6.28;
    mesh.traverse(o => { if (o.isMesh) o.userData.look = { skip: true }; });
    this.root.add(mesh);
    const p = { id, n, x, z, y, mesh, hit: { x, y: y + 0.2, z, r: 0.6 } };
    this.pickups.push(p);
    return p;
  }

  floorAt(x, z) {
    if (this.build.nav && this.build.nav.heightAt) { try { return this.build.nav.heightAt(x, z); } catch {} }
    return floorHeight(this.site, this.build, x, z);
  }

  // ── what the crosshair is on ─────────────────────────────────────────────────────────────
  hoverTick() {
    const eye = this.player.eyePos();
    const look = new THREE.Vector3(...this.player.lookDir());
    this.hoverTarget = null;
    // containers: nearest one you are actually looking at, that you can actually see (no shelving or
    // bulkhead in between). The container's own collider is ignored for its own point so the loot inside
    // it is reachable.
    let best = null, bd = 999;
    for (const c of this.containers) {
      const p = c.lootPoint || c.hoverPoint;
      const d = Math.hypot(p.x - eye.x, p.z - eye.z);
      if (d > 6) continue;
      const dir = new THREE.Vector3(p.x - eye.x, p.y - eye.y, p.z - eye.z);
      const len = dir.length() || 1;
      const dot = (dir.x * look.x + dir.y * look.y + dir.z * look.z) / len;
      if (dot < 0.86 || d >= bd) continue;
      if (!this.visiblePoint(eye, p, c.collider)) continue;
      bd = d; best = { kind: 'container', ref: c, dot };
    }
    // loose items in an open container
    if (best && best.ref.opened > 0.45 && best.ref.trayMeshes) {
      let bi = null, bdot = 0.9;
      for (const m of best.ref.trayMeshes) {
        const mesh = m.mesh || m;
        if (mesh.userData.taken) continue;
        const wp = new THREE.Vector3(); mesh.getWorldPosition(wp);
        const dir = new THREE.Vector3(wp.x - eye.x, wp.y - eye.y, wp.z - eye.z).normalize();
        const dot = dir.dot(look);
        if (dot > bdot) { bdot = dot; bi = mesh; }
      }
      if (bi) best = { kind: 'loot', ref: best.ref, mesh: bi, item: bi.userData.item, dot: bdot };
    }
    // world pickups (something you dropped, or something a rival dropped)
    for (const p of this.pickups) {
      const pt = { x: p.x, y: p.y + 0.15, z: p.z };
      const d = Math.hypot(pt.x - eye.x, pt.z - eye.z);
      if (d > 3.2 || d >= bd) continue;
      const dir = new THREE.Vector3(pt.x - eye.x, pt.y - eye.y, pt.z - eye.z).normalize();
      if (dir.dot(look) < 0.9) continue;
      if (!this.visiblePoint(eye, pt, null)) continue;
      best = { kind: 'pickup', ref: p, dot: 1 }; bd = d;
    }
    // people: you have to be looking at their chest, not their boots
    for (const n of this.crew) {
      if (n.dead || n.gone) continue;
      const pt = { x: n.x, y: (n.y || 0) + 1.35, z: n.z };
      const d = Math.hypot(pt.x - eye.x, pt.z - eye.z);
      if (d > 3.4 || d >= bd) continue;
      const dir = new THREE.Vector3(pt.x - eye.x, pt.y - eye.y, pt.z - eye.z).normalize();
      if (dir.dot(look) < 0.9) continue;
      if (!this.visiblePoint(eye, pt, null)) continue;
      best = { kind: 'crew', ref: n, dot: 1 }; bd = d;
    }
    const focusDoor = this.doors.find(d => Math.hypot((d.x ?? 0) - this.player.x, (d.z ?? 0) - this.player.z) < 2.6 && !best);
    if (focusDoor && this.aimingAt(focusDoor, 0.9)) best = { kind: 'door', ref: focusDoor };
    const focusBreaker = this.breakers.find(b => Math.hypot(b.x - this.player.x, b.z - this.player.z) < 2.6 && !best);
    if (focusBreaker && this.aimingAt(focusBreaker, 0.9)) best = { kind: 'breaker', ref: focusBreaker };
    const ex = this.site.exfil || this.site.spawn;
    if (ex && Math.hypot(ex.x - this.player.x, ex.z - this.player.z) < 2.6) best = { kind: 'extract', ref: ex };

    this.hoverTarget = best;
    // HUD prompt + hover tag
    const gen = this.build.interactables || [];
    const prompts = {
      container: `OPEN ${best?.ref?.kind ? labelOf(best.ref.kind) : 'container'}`,
      loot: `GRAB ${itemName(best?.item)}`,
      pickup: `PICK UP ${itemName(best?.ref?.id)}`,
      crew: `TALK TO ${best?.ref?.name || 'them'}`,
      door: `DOOR`,
      breaker: `POWER`,
      extract: `EXTRACT — ${this.contract.job.short}`,
    };
    if (best) {
      this.prompt = `${In.label('interact')} ${prompts[best.kind] || ''}`.trim();
      const w = this.app.renderer.domElement.clientWidth, h = this.app.renderer.domElement.clientHeight;
      let label = '';
      let tint = '#dcdcdc';
      if (best.kind === 'loot' || best.kind === 'pickup') {
        const id = best.item || best.ref.id;
        label = `${itemName(id)} — ${itemKg(id)} kg · ${money(itemValue(id))}`;
        tint = ITEMS[id]?.tint || TOOLS[id]?.tint || '#dcdcdc';
      } else if (best.kind === 'container') { label = `${labelOf(best.ref.kind || 'container')}${best.ref.opened > 0.45 ? '' : ' — sealed'}`; }
      else if (best.kind === 'crew') { label = `${best.ref.name || 'crew'} — ${best.ref.role || 'aboard'}`; }
      else if (best.kind === 'extract') { label = 'YOUR SHIP' + (this.haulUsed() ? ` — haul ${money(this.haul.value())}` : ''); }
      if (label && this.viewportPos(best, w, h)) {
        this.hover = { name: label, tint, x: this._hp.x, y: this._hp.y, act: this.prompt };
      } else this.hover = null;
    } else { this.prompt = null; this.hover = null; }
  }

  viewportPos(best, w, h) {
    const eye = this.player.eyePos();
    let target = null;
    if (best.kind === 'container') target = new THREE.Vector3(best.ref.hoverPoint.x, best.ref.hoverPoint.y + 0.35, best.ref.hoverPoint.z);
    else if (best.kind === 'loot') { const wp = new THREE.Vector3(); best.mesh.getWorldPosition(wp); target = wp.clone().add(new THREE.Vector3(0, 0.2, 0)); }
    else if (best.kind === 'pickup') target = new THREE.Vector3(best.ref.x, best.ref.y + 0.4, best.ref.z);
    else if (best.kind === 'crew') target = new THREE.Vector3(best.ref.x, best.ref.y + 1.95, best.ref.z);
    else if (best.kind === 'extract') target = new THREE.Vector3(best.ref.x, best.ref.y + 1.4, best.ref.z);
    else if (best.kind === 'door') target = new THREE.Vector3(best.ref.x ?? this.player.x, 1.5, best.ref.z ?? this.player.z);
    else if (best.kind === 'breaker') target = new THREE.Vector3(best.ref.x, best.ref.y, best.ref.z);
    if (!target) return false;
    const sp = screenPos(this.player.cam, target, w, h);
    if (sp.behind) return false;
    this._hp = sp;
    return true;
  }

  // Is there a clear line from your eyes to this point? Exact slab test, with one collider (usually the
  // container's own box) ignored so the loot inside it is still reachable.
  visiblePoint(eye, p, ignore) {
    const cols = ignore ? this.build.colliders.filter(c => c !== ignore) : this.build.colliders;
    const dir = [p.x - eye.x, p.y - eye.y, p.z - eye.z];
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    dir[0] /= len; dir[1] /= len; dir[2] /= len;
    const tr = traceShot({ colliders: cols, foes: [], crew: [] }, eye, dir, len - 0.12, { skipPlayer: true });
    return !tr.hit;
  }

  aimingAt(o, dot = 0.9) {
    const eye = this.player.eyePos();
    const dir = new THREE.Vector3((o.x ?? 0) - eye.x, (o.y ?? 1.2) - eye.y, (o.z ?? 0) - eye.z).normalize();
    return dir.dot(new THREE.Vector3(...this.player.lookDir())) > dot;
  }

  haulUsed() { return this.haul && this.haul.flat().length > 0; }

  // ── doing things with your hands ─────────────────────────────────────────────────────────
  interactTick() {
    const pressed = In.pressed.interact || In.pressed.fire;
    if (!this.hoverTarget) return;
    if (!pressed) return;
    const h = this.hoverTarget;
    In.pressed.interact = false;
    // taking something with your hands is not also a gunshot this frame
    In.pressed.fire = false; In.down.fire = false;
    switch (h.kind) {
      case 'container': {
        const c = h.ref;
        c.want = c.want > 0.5 ? 0 : 1;
        A.play(c.want ? 'lid' : 'door_shut', { x: c.x, z: c.z });
        this.onSound(c.want ? 'door' : 'door', c.x, c.z, 2.2);
        if (c.want) this.hud.say(`${labelOf(c.kind || 'container')}: ${c.stacks.filter(s => !s.gone).map(s => (s.n > 1 ? s.n + '× ' : '') + itemName(s.id)).join(', ') || 'empty'}`, 3);
        break;
      }
      case 'loot': {
        const c = h.ref, mesh = h.mesh, id = h.item;
        const stack = mesh.userData.stack;
        const r = this.haul.add(id, 1);
        if (!r.ok) { this.hud.say(r.why === 'haul is full' ? 'HAUL FULL — drop something' : 'BOTH HANDS FULL', 2.4); A.play('ui_bad'); break; }
        A.play('pickup');
        if (stack) { stack.n--; if (stack.n <= 0) stack.gone = true; }
        mesh.userData.taken = true;
        this.lootTaken++;
        this.hud.log(`Took ${itemName(id)}. ${this.haul.summary().kg} kg on you now.`, 'loot');
        this.refreshLootMeshes(c);
        break;
      }
      case 'pickup': {
        const p = h.ref;
        const r = this.haul.add(p.id, p.n);
        if (!r.ok) { this.hud.say(r.why || 'you cannot carry that', 2.2); break; }
        this.root.remove(p.mesh);
        this.pickups.splice(this.pickups.indexOf(p), 1);
        A.play('pickup');
        break;
      }
      case 'door': {
        const d = h.ref;
        d.want = d.want > 0.5 ? 0 : 1;
        d.busy = 0.6;
        A.play(d.want ? 'door' : 'door_shut', { x: d.x, z: d.z });
        this.onSound('door', d.x, d.z, 5);
        break;
      }
      case 'breaker': {
        this.lightsOn = !this.lightsOn;
        this.app.toggleSiteLights && this.app.toggleSiteLights(this, this.lightsOn);
        A.play('ui');
        this.hud.say(this.lightsOn ? 'Breaker closed. Lights are back, and so is the noise it makes.' : 'Breaker open. Everything goes dark, including whatever was watching you.', 3);
        this.onSound('door', h.ref.x, h.ref.z, 6);
        break;
      }
      case 'crew': this.talkTo(h.ref); break;
      case 'extract': this.tryExtract(); break;
    }
  }

  duffelTick(dt) {
    // the duffel is opened from the bag key: it is set down in front of you and the lid swings
    if (In.pressed.bag) {
      In.pressed.bag = false;
      const opening = !this.haul.bagOpen;
      this.haul.bagOpen = opening;
      if (opening) {
        const yaw = this.player.yaw;
        const fx = this.player.x - Math.sin(yaw) * 0.75, fz = this.player.z - Math.cos(yaw) * 0.75;
        this.duffel.place(fx, this.floorAt(fx, fz) + 0.02, fz, yaw);
        this.duffel.refresh();
        A.play('drawer');
        this.hud.say('Duffel open. Aim at a slot to drop it, or look at a slot to take it back.', 3);
      } else { A.play('lid'); this.duffel.stow(); }
    }
    this.duffel.setOpen(this.haul.bagOpen ? Math.min(1, this.duffel._t = damp(this.duffel._t || 0, 1, 8, dt)) : damp(this.duffel._t || 0, 0, 8, dt));
    if (this.haul.bagOpen && this.hud) {
      // aiming at a slot inside your own duffel takes it back into your hands
      const eye = this.player.eyePos();
      let bi = -1, bd = 0.94;
      for (const m of this.duffel.hitMeshes) {
        const wp = new THREE.Vector3(); m.getWorldPosition(wp);
        const dir = new THREE.Vector3(wp.x - eye.x, wp.y - eye.y, wp.z - eye.z).normalize();
        const dot = dir.dot(new THREE.Vector3(...this.player.lookDir()));
        if (dot > bd) { bd = dot; bi = m.userData.slot; }
      }
      this.duffel.setHover(bi);
      if (bi >= 0 && (In.pressed.fire || In.pressed.interact)) {
        const all = this.haul.flat();
        const row = all[bi];
        if (row) {
          const honest = this.haul.removeOne(row.id);
          if (honest) {
            this.spawnPickup(row.id, this.player.x - Math.sin(this.player.yaw) * 0.9, this.player.z - Math.cos(this.player.yaw) * 0.9, 1);
            this.hud.say(`Dropped ${itemName(row.id)}.`, 2);
            A.play('drop'); this.onSound('drop', this.player.x, this.player.z, 8);
            this.duffel.refresh();
          }
        }
        In.pressed.fire = false; In.pressed.interact = false;
      }
    }
    if (In.pressed.drop && this.haulUsed()) {
      In.pressed.drop = false;
      const all = this.haul.flat();
      const row = all[all.length - 1];
      if (row && this.haul.removeOne(row.id)) {
        this.spawnPickup(row.id, this.player.x - Math.sin(this.player.yaw) * 0.9, this.player.z - Math.cos(this.player.yaw) * 0.9, 1);
        this.hud.say(`Dropped ${itemName(row.id)}.`, 2);
        A.play('drop'); this.onSound('drop', this.player.x, this.player.z, 9);
        if (this.haul.bagOpen) this.duffel.refresh();
      }
    }
  }

  pickupTick() {
    if (!In.pressed.tool) return;
    In.pressed.tool = false;
    // the pinger: a direction and a distance to the nearest moving life, which is the whole point of it
    if (!this.career.gear.tools.scanner) { this.hud.say('You do not own a proximity pinger.', 2); return; }
    A.play('pinger');
    const near = this.nearestOf([...this.foes.filter(f => !f.dead), ...this.crew.filter(c => !c.dead)], this.player.x, this.player.z, 40);
    if (!near) { this.hud.say('Pinger: nothing moving inside forty metres.', 3); return; }
    const d = Math.hypot(near.x - this.player.x, near.z - this.player.z);
    const dir = Math.atan2(near.x - this.player.x, near.z - this.player.z) - this.player.yaw;
    const bearing = Math.abs(dir) < 0.6 ? 'ahead' : Math.abs(dir) > 2.5 ? 'behind you' : dir > 0 ? 'to your right' : 'to your left';
    const what = (near.kind === 'alien') ? 'something large on four legs' : (this.foes.includes(near) ? 'armed movement' : 'a person moving');
    this.hud.say(`Pinger: ${what}, ${d.toFixed(0)} m, ${bearing}.`, 3.4);
  }

  talkTo(npc) {
    if (!this.lifeMod || !this.lifeMod.talkTo) { this.hud.say('They are not in a talking mood.', 2); return; }
    let res = null;
    try { res = this.lifeMod.talkTo(npc, this.ctx); } catch (e) { res = null; }
    if (!res) { this.hud.say('They will not answer.', 2); return; }
    A.play('talk', { x: npc.x, z: npc.z });
    this.hud.log(`${npc.name || 'They'}: ${res.greeting || '...'}`, 'talk');
    this.app.openTalk && this.app.openTalk(npc, res, (opt) => this.applyTalkOption(npc, opt));
  }

  applyTalkOption(npc, opt) {
    const act = opt.act || opt.action || 'close';
    switch (act) {
      case 'tip': case 'reveal': {
        const tip = opt.text || this.tipFor(npc);
        this.hud.log(`${npc.name || 'They'}: ${tip}`, 'talk');
        this.hud.say(tip, 5);
        break;
      }
      case 'trade': case 'gift': {
        const id = opt.item || (opt.data && opt.data.item);
        if (id) {
          const r = this.haul.add(id, 1);
          if (r.ok) { this.hud.say(`They hand over ${itemName(id)}.`, 3); A.play('pickup'); }
          else this.hud.say('Your hands are full.', 2.5);
        } else this.hud.say('They have nothing to give you.', 2.5);
        break;
      }
      case 'rescue': case 'ride': case 'follow': {
        npc.following = true;
        this.hud.log(`${npc.name || 'They'} is coming with you. Get them to the hatch.`, 'crew');
        this.hud.say('They will follow. Keep them alive to the hatch and the payer counts them.', 4);
        break;
      }
      case 'open': case 'unlock': {
        const d = this.doors.find(x => !x.want);
        if (d) { d.want = 1; d.busy = 0.6; A.play('door', { x: d.x, z: d.z }); this.hud.say('A door opens somewhere behind them.', 3); }
        else this.hud.say('Nothing opens.', 2);
        break;
      }
      case 'fight': {
        npc.armed = true; npc.state = 'defend';
        this.hud.say(`${npc.name || 'They'} picks up whatever they can find.`, 3);
        break;
      }
      default: break;
    }
    this.app.closeTalk && this.app.closeTalk();
  }

  tipFor(npc) {
    // a tip is computed from the live site, so it is always true and always useful
    const vault = this.site.vault;
    const job = this.contract.job;
    const ren = (this.site.rooms || []).map(r => r.kind);
    const opts = [];
    if (vault) opts.push('There is a sealed vault on this deck. It takes a torch or a lot of patience.');
    if (this.clock) opts.push(`${this.clock.name} — whatever that clock is, it is real and it is running.`);
    if (job.obj === 'item' && job.item) {
      const c = this.containers.find(x => x.jobItem === job.item);
      const room = c ? (this.site.rooms[c.roomId] || {}).kind : null;
      opts.push(room ? `What you are after is in the ${ROOM_LABEL[room] || room}.` : 'What you are after is aboard, somewhere.');
    }
    if (this.alien) opts.push('Do not run. It hears running. It does not see worth a damn.');
    if (this.rivalIncoming && !this.rivalIncoming.done) opts.push('Somebody else is inbound. I heard it on the hull.');
    if (ren.includes('portside')) opts.push('The port decks are busy tonight. Men with cases, not cargo.');
    opts.push('The crew here did not ask for any of this. Remember that if you can.');
    return this.rng.pick ? this.rng.pick(opts) : opts[0];
  }

  // The hazard the incident promises has to be real the moment you step in: gas that has already taken
  // the room it started in, a breach that is still venting, a fire that is still burning, or a deck the
  // breaker left dark.
  setupHazards() {
    this.gassed = new Map();
    const first = this.hazards[0];
    for (const h of this.hazards) {
      const room = this.site.rooms[h.roomId] || (this.site.rooms || []).find(r => Math.hypot((r.cx ?? 0) - h.x, (r.cz ?? 0) - h.z) < 3);
      if (!room) continue;
      h.roomId = room.id;
      if (h.kind === 'gas') {
        this.gassed.set(room.id, 0.7);
        for (const r of this.site.rooms) if (r.id !== room.id && Math.hypot((r.cx ?? 0) - (room.cx ?? 0), (r.cz ?? 0) - (room.cz ?? 0)) < 12) this.gassed.set(r.id, 0.15);
      }
      if (h.kind === 'dark') {
        for (const l of (this.build.lights || [])) if (l.roomId === room.id && l.set) { try { l.set(false); } catch {} }
      }
    }
    this.hazardStart = this.hazards.length ? (this.site.rooms[first.roomId] || {}).kind : null;
  }

  tickHazards(dt) {
    this.hazardT += dt;
    for (const h of this.hazards) {
      const room = this.site.rooms[h.roomId] || this.site.rooms[0];
      if (!room) continue;
      if (h.kind === 'gas') {
        const spread = this.gassed.get(room.id) ?? 0;
        const next = clamp(spread + dt / 90, 0, 1);       // a room fills over 90 s, then creeps onward
        this.gassed.set(room.id, next);
        if (next > 0.85) {
          for (const r of this.site.rooms) {
            if (this.gassed.get(r.id) != null) continue;
            if (Math.hypot(r.cx - room.cx, r.cz - room.cz) < 14) this.gassed.set(r.id, 0.02);
          }
        }
      }
      // damage the player if they are standing in it
      const mine = this.gassed.get(this.roomIdAt(this.player.x, this.player.z)) ?? 0;
      if (mine > 0.3) {
        const masked = this.haul.has('respirator') || (npcWearing(this, this.player) === 'mask');
        if (!masked) {
          this.gasT = (this.gasT || 0) + dt;
          if (this.gasT > 1.6) { this.gasT = 0; this.onHurt(6 + mine * 8, 'the gas'); this.hud.alert('Your eyes are streaming. Get out of the gas.', 2.5); A.play('hiss', { vol: 0.6 }); }
        }
      }
      if (h.kind === 'fire') {
        const d = Math.hypot(h.x - this.player.x, h.z - this.player.z);
        if (d < h.r) { this.fireT = (this.fireT || 0) + dt; if (this.fireT > 1) { this.fireT = 0; this.onHurt(9, 'the fire'); } }
      }
      if (h.kind === 'vacuum') {
        const d = Math.hypot(h.x - this.player.x, h.z - this.player.z);
        if (d < h.r) { this.vacT = (this.vacT || 0) + dt; if (this.vacT > 2.2) { this.vacT = 0; this.onHurt(12, 'the breach'); this.hud.alert('Hull breach. You have seconds in here without a suit.', 2.5); } }
      }
    }
    // gas kills the people who live here too, which is the point of the incident
    if (this.crew.length && this.hazardT > 3) {
      this.hazardT = 0;
      for (const n of this.crew) {
        if (n.dead || n.gone) continue;
        const c = this.gassed.get(this.roomIdAt(n.x, n.z)) ?? 0;
        if (c > 0.5 && this.rng() < 0.35) {
          n.hp = (n.hp ?? 60) - 14;
          if (n.hp <= 0) { n.dead = true; this.hud.log(`${n.name || 'Somebody'} stops moving in the gas.`, 'world'); }
        }
      }
    }
  }

  roomIdAt(x, z) {
    const r = this.gen && this.gen.roomAt ? this.gen.roomAt(this.site, x, z) : null;
    if (r) return r.id;
    for (const rm of (this.site.rooms || [])) if (x >= rm.x && z >= rm.z && x < rm.x + rm.w && z < rm.z + rm.d) return rm.id;
    return -1;
  }

  scheduleRival() {
    const rivals = rivalsAlive(this.career.sim);
    const rival = rivals.length ? this.rng.pick(rivals) : null;
    if (!rival) return;
    const at = this.rng.range(100, 260);
    this.rivalIncoming = { at, rival, done: false };
    this.hud.log('Something on the hull: a second clamp is manoeuvring. You are not the only one who heard about this site.', 'world');
  }

  arriveRival() {
    const rv = this.rivalIncoming.rival;
    this.hud.alert(`${rv.alias} has clamped on with ${rv.crew} hired guns. They are here for the same cargo and they do not care about you.`, 9);
    if (this.hostileMod && this.hostileMod.spawnRivalSquad) {
      try {
        const squad = this.hostileMod.spawnRivalSquad(this.site, this.build, rv, { ctx: this.ctx, rng: this.rng, crew: this.crew }) || [];
        for (const f of squad) { f.onDeathDrop = true; }
        this.foes.push(...squad);
      } catch (e) { this.warnInternal('rival squad failed: ' + e.message); }
    }
    this.onSound('clamp', this.site.spawn.x, this.site.spawn.z, 30);
    A.stinger('bad');
    // the world hears about it later either way
    this.rivalHere = rv;
  }

  extractTick(dt) {
    const ex = this.site.exfil || this.site.spawn;
    const nearEx = Math.hypot(ex.x - this.player.x, ex.z - this.player.z) < 3.4;
    // survivors you talked into coming walk themselves to the hatch
    for (const n of this.crew) {
      if (n.dead || n.gone || !n.following) continue;
      if (Math.hypot(n.x - ex.x, n.z - ex.z) < 3.2) {
        n.gone = true; this.rescued++;
        this.rescuedNpcs.push(n.name || 'a survivor');
        this.hud.log(`${n.name || 'Someone'} is aboard your ship. ${this.rescued} out alive.`, 'crew');
        A.play('ui');
      }
    }
    if (nearEx && this.extractT === 0 && this.haul.bagOpen) { this.haul.bagOpen = false; }
  }

  tryExtract() {
    const ex = this.site.exfil || this.site.spawn;
    if (Math.hypot(ex.x - this.player.x, ex.z - this.player.z) > 3.4) { this.hud.say('Nothing here to seal.', 2); return; }
    const ok = objectiveMet(this.contract, {
      carried: this.haul.flat().map(r => ({ id: r.id })),
      rescued: this.rescued, haulValue: this.haulValue(), bodiesOut: 0,
    });
    this.end('extracted', null, ok);
    this.hud.say('Sealing. Hold on.', 3);
  }

  haulValue() {
    let v = 0;
    for (const row of this.haul.flat()) {
      const price = priceAt(this.career.sim, this.career.homeSys, commodityOf(row.id));
      const p = price ? price.sell : 0;
      const base = itemValue(row.id);
      v += Math.round(Math.max(base * 0.85, p ? p * (row.id === 'spicebrick' ? 3 : 6) : 0) * (row.n || 1));
    }
    return v;
  }

  // ── the end of a run ─────────────────────────────────────────────────────────────────────
  end(kind, reason, objectiveOk = null) {
    if (this.state !== 'active') return;
    this.state = kind === 'extracted' ? 'extracted' : 'died';
    this.died = this.state === 'died';
    const carried = this.haul.flat().slice();
    const haulValue = this.haulValue();
    this.objective = objectiveOk == null ? objectiveMet(this.contract, {
      carried: carried.map(r => ({ id: r.id })), rescued: this.rescued, haulValue, bodiesOut: 0,
    }) : objectiveOk;

    // what the world records about this dive
    const sys = this.contract.sysId;
    const sim = this.career.sim;
    const haulDesc = carried.length ? `${carried.length} items (${this.haul.kg()} kg)` : 'nothing';
    if (this.died) {
      // the death itself is filed by the Office when the yard finds out (state.settle); what the site
      // records is that somebody is picking over your gear right now
      for (const rv of rivalsAlive(sim)) if (this.rng() < 0.3) notice(sim, rv, `${rv.alias} picked the site clean after a rimrunner died aboard it`, -1);
    } else {
      credit(sim, sys, `Somebody lifted ${haulDesc} off ${this.contract.site} during the ${this.contract.incident.title.toLowerCase()}.`);
    }
    if (this.kills > 3) credit(sim, sys, `${this.kills} bodies were left aboard ${this.contract.site} after a rimrunner went through it.`);
    if (this.rescued) credit(sim, sys, `${this.rescued} survivor${this.rescued > 1 ? 's' : ''} walked off ${this.contract.site} behind a rimrunner.`);
    if (this.rivalHere && this.rivalHere.alive) {
      notice(sim, this.rivalHere, this.died ? 'took the haul off a dead rimrunner' : 'wanted the same cargo and lost it to a rimrunner', this.died ? -2 : -3);
    }

    this.summary = {
      extracted: !this.died, died: this.died, reason,
      site: this.contract.site, sysName: this.contract.sysName,
      incidentTitle: this.contract.incident.title,
      fee: this.objective ? this.contract.fee : 0,
      payer: this.contract.payer.name,
      haulValue: !this.died ? haulValue : 0,
      objective: this.objective, objectiveShort: this.contract.job.short,
      carried: carried, rescued: this.rescued, rescuedNames: this.rescuedNpcs,
      kills: this.kills, shots: this.shots, damage: this.player.damageTaken / 40, hurt: clamp(1 - this.player.hp / 100, 0, 1),
      quotaPaid: !this.died ? Math.round((this.contract.fee * (this.objective ? 1 : 0) + haulValue) * 0.25) : 0,
      xp: Math.round((this.objective ? 40 : 0) + haulValue / 40 + this.rescued * 15 + this.kills * 2),
      time: this.time,
      rival: this.rivalHere ? this.rivalHere.alias : null,
      lootTaken: this.lootTaken,
    };
    A.stopAmbience();
    A.stinger(this.died ? 'bad' : 'good');
    this.hud.showDeath(
      this.died ? 'YOU DID NOT COME BACK' : 'EXTRACTED',
      this.died ? (reason || `You died aboard ${this.contract.site}. Everything you were carrying is still in there.`) : `${money(haulValue)} of cargo aboard, ${this.rescued} soul${this.rescued === 1 ? '' : 's'} out alive.`
    );
    this.app.onRunEnd && this.app.onRunEnd(this);
  }

  dispose(scene) {
    A.stopAmbience();
    if (this.root && this.root.parent) this.root.parent.remove(this.root);
    if (this.buildMod && this.buildMod.disposeSite) { try { this.buildMod.disposeSite(this.build); } catch {} }
    this.hud && this.hud.clear();
    this.crew.length = 0; this.foes.length = 0; this.pickups.length = 0; this.fx.length = 0;
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────
function fmtClock(sec) { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; }
function labelOf(kind) {
  const map = { crate: 'crate', locker: 'locker', safe: 'safe', rack: 'rack', cabinet: 'cabinet', drawer: 'drawer', case: 'case', cryo: 'cryo pod', pod: 'pod', medcab: 'medical cabinet', ammocan: 'ammo can', bin: 'bin', pallet: 'pallet', shelfunit: 'shelves', wallshelf: 'shelf', vaultbox: 'vault box', toolboard: 'tool board', canister: 'canister' };
  return map[kind] || 'container';
}
function npcWearing() { return null; }
function commodityOf(id) {
  return { coilspool: 'parts', servo: 'parts', carchip: 'electronics', optic: 'optics', bergson: 'electronics', dataspool: 'data', spicebrick: 'spice', medkit: 'meds', respirator: 'meds', biomatter: 'meds', hymncrystal: 'crystal', whisperstone: 'crystal', reactorcore: 'fuel' }[id] || null;
}
function floorHeight(site, build, x, z) {
  if (build && build.nav && build.nav.heightAt) { try { return build.nav.heightAt(x, z); } catch {} }
  return 0;
}

// A last-resort layout so the game still runs if the generator or the builder is broken. Deliberately
// plain: one deck, a few partitions, containers with loot in them, a hatch at one end.
function fallbackSite(spec) {
  const w = 30, h = 20;
  const open = new Uint8Array(w * h).fill(0);
  const cellRoom = new Int16Array(w * h).fill(-1);
  const rooms = [], doors = [], runs = [], propRooms = [], containers = [], lights = [], hazards = [], ducts = [], vents = [];
  const rngf = rng(spec.seed || 1);
  const kinds = ['airlock', 'plaza', 'portside', 'storage', 'canteen', 'office', 'server', 'engineering', 'reactor', 'vault'];
  const cols = 5, rows = 2, rw = 5, rh = 6;
  for (let ry = 0; ry < rows; ry++) for (let rx = 0; rx < cols; rx++) {
    const kind = kinds[(ry * cols + rx) % kinds.length];
    const id = rooms.length;
    const x0 = 2 + rx * 5, z0 = 2 + ry * 8;
    const room = { id, kind, style: 'industrial', label: ROOM_LABEL[kind] || kind, x: x0, z: z0, w: rw, d: rh, cx: x0 + rw / 2, cz: z0 + rh / 2, spot: { x: x0 + rw / 2, z: z0 + rh / 2 }, area: rw * rh, value: 1, tier: 2 };
    rooms.push(room);
    for (let z = z0; z < z0 + rh; z++) for (let x = x0; x < x0 + rw; x++) { const i = z * w + x; open[i] = 1; cellRoom[i] = id; }
    runs.push({ x0: x0, z0: z0, x1: x0 + rw, z1: z0, side: 'n', room: kind, style: 'industrial', roomId: id, other: null });
    runs.push({ x0: x0, z0: z0 + rh, x1: x0 + rw, z1: z0 + rh, side: 's', room: kind, style: 'industrial', roomId: id, other: null });
    runs.push({ x0: x0, z0: z0, x1: x0, z1: z0 + rh, side: 'w', room: kind, style: 'industrial', roomId: id, other: null });
    runs.push({ x0: x0 + rw, z0: z0, x1: x0 + rw, z1: z0 + rh, side: 'e', room: kind, style: 'industrial', roomId: id, other: null });
    lights.push({ x: room.cx, y: 2.6, z: room.cz, roomId: id, broken: false });
    if (rx < cols - 1) doors.push({ id: 'd' + doors.length, x: x0 + rw, z: z0 + 2, dir: 'x', kind: 'door', roomA: id, roomB: id + 1, width: 1 });
    if (ry < rows - 1) doors.push({ id: 'd' + doors.length, x: x0 + 2, z: z0 + rh, dir: 'z', kind: 'arch', roomA: id, roomB: id + cols, width: 1 });
    for (let k = 0; k < 3; k++) {
      const cx = x0 + 1 + (k % 2) * 2, cz = z0 + 1 + k;
      containers.push({ id: 'c' + containers.length, kind: kind === 'storage' ? 'locker' : 'crate', x: cx, z: cz, ry: 0, roomId: id, sealed: false, contents: [{ id: ['chit', 'trinket', 'carchip', 'coilspool', 'servo', 'optic', 'dataspool', 'medkit'][rngf.int(0, 7)], n: 1 }, { id: 'chit', n: rngf.int(1, 3) }] });
    }
  }
  const spawn = { x: rooms[0].cx, z: rooms[0].cz };
  const exfil = { x: rooms[0].cx + 1, z: rooms[0].cz };
  const site = {
    seed: spec.seed, kind: spec.kind, w, h, name: spec.name, faction: spec.faction, incident: spec.incident, lootTier: spec.lootTier,
    open, cellRoom, rooms, doors, ducts, runs, props: [], containers, lights, hazards,
    spawn, exfil, vault: null, vents,
    nav: { w, h, idx: (x, z) => z * w + x, open: i => open[i] === 1, blocked: i => open[i] !== 1, roomAt: i => (cellRoom[i] >= 0 ? rooms[cellRoom[i]] : null) },
    stats: { rooms: rooms.length, doors: doors.length, containers: containers.length, propCount: 0 },
  };
  // ── meshes: floor, ceiling, walls as boxes, lights, container blocks ──
  const root = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.85, metalness: 0.15 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.8, metalness: 0.2 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, h), floorMat);
  floor.position.set(w / 2, -0.1, h / 2); root.add(floor);
  colliders.push({ min: { x: 0, y: -1, z: 0 }, max: { x: w, y: 0, z: h }, kind: 'hull' });
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, h), wallMat);
  ceil.position.set(w / 2, 2.8, h / 2); root.add(ceil);
  colliders.push({ min: { x: 0, y: 2.7, z: 0 }, max: { x: w, y: 3.4, z: h }, kind: 'hull' });
  for (const run of runs) {
    const len = Math.max(1, Math.hypot(run.x1 - run.x0, run.z1 - run.z0));
    const horiz = Math.abs(run.x1 - run.x0) > Math.abs(run.z1 - run.z0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 0.25, 2.8, horiz ? 0.25 : len), wallMat);
    const cx = (run.x0 + run.x1) / 2, cz = (run.z0 + run.z1) / 2;
    m.position.set(cx, 1.4, cz);
    root.add(m);
    colliders.push({ min: { x: cx - (horiz ? len / 2 : 0.14), y: 0, z: cz - (horiz ? 0.14 : len / 2) }, max: { x: cx + (horiz ? len / 2 : 0.14), y: 2.8, z: cz + (horiz ? 0.14 : len / 2) }, kind: 'wall' });
  }
  // punch doorways through the walls at each door cell by lifting the wall segments above them
  const lightMeshes = [];
  for (const l of lights) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffe8b0, emissiveIntensity: 1.6 }));
    lamp.position.set(l.x, 2.6, l.z); root.add(lamp);
    const pl = new THREE.PointLight(0xffe8c0, 6, 14, 1.6);
    pl.position.set(l.x, 2.5, l.z); root.add(pl);
    lightMeshes.push({ ...l, on: true, mesh: lamp, light: pl, set(on) { pl.intensity = on ? 6 : 0; lamp.material.emissiveIntensity = on ? 1.6 : 0; this.on = on; } });
  }
  const containerMeshes = [];
  for (const c of containers) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.6), new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.9 }));
    m.position.set(c.x, 0.4, c.z); root.add(m);
    colliders.push({ min: { x: c.x - 0.45, y: 0, z: c.z - 0.3 }, max: { x: c.x + 0.45, y: 0.8, z: c.z + 0.3 }, kind: 'prop' });
    containerMeshes.push({ ...c, mesh: m, collider: colliders[colliders.length - 1], hoverPoint: { x: c.x, y: 1.1, z: c.z }, rig: null, opened: 0, want: 0, contents: c.contents });
    interactables.push({ kind: 'container', x: c.x, y: 1.1, z: c.z, radius: 1.6, ref: containerMeshes[containerMeshes.length - 1] });
  }
  const build = {
    root, colliders, doors: doors.map(d => ({ ...d, state: 'closed', amount: 0, mesh: null, collider: null })),
    containers: containerMeshes, props: [], lights: lightMeshes, interactables,
    nav: { isOpen: () => true, heightAt: () => 0, blockedCell: () => false, cellBlocked: () => false },
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: w, y: 2.8, z: h } },
    stats: { meshes: root.children.length, drawCalls: 1, fallback: true },
  };
  return { site, build };
}
