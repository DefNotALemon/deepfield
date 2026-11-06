// main.js — the app: one canvas, one loop, and the mode machine that takes you from the title, to the
// yard, out through a cruise, into a site, and back to the Office to find out what it cost.

import * as THREE from '../vendor/three.module.js';
import { In, initInput, pollInput } from './input.js';
import { clamp, rng, money, stamp } from './util.js';
import { newCareer, load as loadCareer, save as saveCareer, clear as clearCareer, settle, advanceWorld, award, hunterBook, rankName, handleFor, buy, sellStash, addToStash } from './state.js';
import { contractBoard, makeContract, INCIDENTS, objectiveLine } from './contracts.js';
import { newGalaxy, tick, priceAt, knownAt, pushNews, notice, systemById } from './sim.js';
import { Hub } from './hub.js';
import { Run } from './dive.js';
import { Cruise } from './cruise.js';
import { Hud } from './hud.js';
import { Tablet } from './tablet.js';
import { Player } from './player.js';
import * as A from './audio.js';
import { COMMODITIES, FACTIONS, ITEMS, itemName, SITE_KINDS } from './data.js';

const app = {
  career: null, contract: null, board: [], mode: 'title', paused: false, modal: false, scar: 0,
  hub: null, run: null, cruise: null, hud: null, tablet: null, bookCache: null, boardHours: -999,
  fps: 0, frames: 0,
};
globalThis.__df = { app };

// ── boot ────────────────────────────────────────────────────────────────────────────────────
function boot() {
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  app.renderer = renderer;
  app.canvas = canvas;
  app.scene = new THREE.Scene();
  app.hud = new Hud(document.getElementById('hud'));
  app.hud.clear();
  app.tablet = new Tablet(app, document.getElementById('panel'));
  initInput(canvas);

  // resume audio + pointer lock on the first real interaction
  const wake = () => { A.init(); A.resume(); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); };
  addEventListener('pointerdown', wake); addEventListener('keydown', wake);
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight, false);
    if (app.hub && app.hub.player) { app.hub.player.cam.aspect = innerWidth / innerHeight; app.hub.player.cam.updateProjectionMatrix(); }
    if (app.run && app.run.player) { app.run.player.cam.aspect = innerWidth / innerHeight; app.run.player.cam.updateProjectionMatrix(); }
  });

  const saved = loadCareer();
  const params = new URLSearchParams(location.search);
  if (saved && !params.has('new')) { app.career = saved; } else { app.career = newCareer(); }
  globalThis.__df.career = app.career;

  if (params.has('autostart') || params.has('hub') || params.has('dive') || params.has('extract')) {
    document.getElementById('title').classList.add('gone');
    enterHub().then(() => {
      if (params.has('dive')) { refreshBoard(); app.contract = app.board[0]; enterDive({ scar: 0 }); }
      if (params.has('class') || params.has('seed')) { /* debug shape kept for parity with Rimrunner */ }
    });
  } else {
    renderTitle();
  }
  requestAnimationFrame(loop);
}

function renderTitle() {
  const t = document.getElementById('title');
  const rows = [['Move', `${In.label('forward')}${In.label('left')}${In.label('back')}${In.label('right')}`], ['Use / talk', In.label('interact')], ['Duffel', In.label('bag')], ['Lamp', In.label('torch')], ['Tablet', In.label('tablet')]];
  t.innerHTML = `<div class="tbox">
    <h1>DEEPFIELD</h1>
    <p class="tag">a space extraction shooter on the Rim</p>
    <p class="blurb">You work for a buyer you never meet, on a quota you cannot miss, with a hold that only carries so much.
    Every site you board is somebody else's bad day, and the reason there is one is that the galaxy has been having one without you.
    Bring the haul out before the clock ends, or stay in there with it. And when you are big enough — become the one who boards other people's runs.</p>
    <div class="tbuttons">
      ${loadCareer() ? `<button id="btn-continue" class="go">CONTINUE</button>` : ''}
      <button id="btn-new" class="go">NEW CAREER</button>
    </div>
    <div class="tcontrols">${rows.map(([k, v]) => `<span><b>${k}</b> ${v}</span>`).join('')}</div>
    <div class="tfoot">controls follow whatever you pick up — keyboard, a pad, or touch. ${In.scheme === 'kb' ? 'Currently: keyboard and mouse.' : ''}</div>
  </div>`;
  const startNew = () => { clearCareer(); app.career = newCareer(); globalThis.__df.career = app.career; t.classList.add('gone'); enterHub(); };
  document.getElementById('btn-new').onclick = startNew;
  const cont = document.getElementById('btn-continue');
  if (cont) cont.onclick = () => { t.classList.add('gone'); enterHub(); };
}

// ── the yard ────────────────────────────────────────────────────────────────────────────────
async function enterHub() {
  if (app.tablet.isOpen()) app.tablet.hide();
  if (app.run) { app.run.dispose(app.scene); app.run = null; }
  if (app.hub) { app.hub.dispose(); app.hub = null; }
  app.scene.background = new THREE.Color(0x06080b);
  if (app.scene.fog) app.scene.fog = null;
  const hub = new Hub(app);
  app.hub = hub;
  await hub.build(app.scene);
  hub.player = new Player();
  hub.player.place(hub.root, { weapon: null });
  hub.player.x = 0; hub.player.z = -2; hub.player.yaw = Math.PI;
  hub.player.buildIndex(hub.colliders, 6);
  hub.player.torch = true;
  app.mode = 'hub';
  refreshBoard();
  showHints(['You are at the Waystop. The board has work, the Exchange buys and sells, and the Office is where you find out what you owe.']);
  saveCareer(app.career);
  return hub;
}

function refreshBoard() {
  app.board = contractBoard(app.career.sim, app.career, 4);
  app.boardHours = app.career.sim.hours;
}

function launch() {
  if (!app.contract) { app.hud.say('Nothing taken off the board yet.', 3); return; }
  app.cruise = new Cruise(app, app.contract);
  app.mode = 'cruise';
  app.hub && (app.hub.state = 'idle');
  A.stopAmbience();
  app.cruise.start();
}

async function enterDive(cruiseResult = {}) {
  if (app.cruise) { const r = app.cruise.finish(); cruiseResult = { ...r, ...cruiseResult }; app.cruise = null; }
  if (app.hub) { app.hub.dispose(); app.hub = null; }
  app.mode = 'dive';
  const run = new Run(app, {});
  app.run = run;
  globalThis.__df.run = run;
  await run.build(app.scene, app.renderer);
  if (cruiseResult.insight) run.hud.log('You know one thing about this site that the payer did not tell you.', 'sys');
  const scar = cruiseResult.scar || 0;
  if (scar) { run.player.hp = clamp(run.player.hp - scar, 20, 100); run.hud.alert(`You come in from the leg already bruised (${scar} damage).`, 5); }
  run.hud.say('Clamped. Walk in and take what the payer asked for.', 5);
  // carry over the guns you own
  run.player.setWeapon(run.startingGun());
  app.hud.clear();
  saveCareer(app.career);
}

function onRunEnd(run) {
  const career = app.career;
  const sim = career.sim;
  const aw = award(career, run.summary, sim);
  const st = settle(career, run.summary, sim);
  // time passes on the way home: the world moves while you are in the black
  tick(sim, Math.round(8 + run.summary.time / 120));
  career.heat = sim.player.heat;
  saveCareer(career);
  app.run = null;
  setTimeout(() => {
    app.tablet.show('results', { run: run.summary, settle: st });
    const el = document.getElementById('panel');
    el && el.addEventListener('click', function once(e) {
      if (e.target.closest('[data-act="close"]')) { el.removeEventListener('click', once); app.tablet.hide(); enterHub(); }
    });
    if (aw.notes.length) console.log('[career]', aw.notes.join(' '));
  }, 2600);
  run.dispose(app.scene);
}

// ── hub interaction ─────────────────────────────────────────────────────────────────────────
function talkToPerson(person) {
  const sim = app.career.sim, c = app.career;
  const known = person.person ? sim.known.find(p => p.id === person.person) : null;
  const greeting = known && known.memory.length
    ? `${person.line} (${known.memory[0].at > sim.hours - 100 ? 'That was recent, and they have not decided what to make of you yet.' : 'They remember you.'})`
    : person.line;
  const options = [];
  options.push({ label: 'Ask what is happening out there', act: 'news' });
  if (known) options.push({ label: `Ask about ${known.role === 'broker' ? 'work' : 'the people here'}`, act: 'gossip' });
  options.push({ label: 'Ask what the Office is saying about you', act: 'standing' });
  if (person.role === 'bartender') options.push({ label: 'Buy the bar a round (120 cr)', act: 'round' });
  if (person.role === 'dock') options.push({ label: 'Ask what came in today', act: 'cargo' });
  app.openTalk(person, { greeting, options }, (opt) => {
    switch (opt.act) {
      case 'news': {
        const recent = sim.news.slice(0, 2).map(n => n.text);
        app.hud.log(`${person.name}: ${recent.join(' ')}`, 'talk');
        break;
      }
      case 'gossip': {
        const rv = sim.known.filter(p => p.rival).slice(0, 3).map(p => `${p.alias} (${p.tier}●)`);
        app.hud.log(`${person.name}: ${rv.length ? `The ones to watch are ${rv.join(', ')}. They board people's runs, not just their cargo.` : 'Nobody worth watching this week.'}`, 'talk');
        break;
      }
      case 'standing': {
        app.hud.log(`${person.name}: you are ${rankName(c)} with ${c.marks} marks and ${c.quota.paid} of ${c.quota.target} paid this cycle. The Office talks about you the way it talks about weather.`, 'talk');
        break;
      }
      case 'round': {
        if (c.credits < 120) { app.hud.log('You cannot afford to buy the bar anything.', 'talk'); break; }
        c.credits -= 120;
        const p = sim.known.filter(x => x.where === c.homeSys)[0];
        if (p) notice(sim, p, 'bought the bar a round', 1);
        app.hud.log('The bar drinks your money. Three people tell you something true, and two of them are useful.', 'talk');
        const recent = sim.news[0];
        if (recent) app.hud.say(`${recent.text}`, 5);
        break;
      }
      case 'cargo': {
        const p = Object.keys(COMMODITIES)[Math.floor(Math.random() * Object.keys(COMMODITIES).length)];
        const pr = priceAt(sim, c.homeSys, p);
        app.hud.log(`${person.name}: ${COMMODITIES[p].name} is trading at ${money(pr.sell)} out of here today. Take it somewhere it is not.`, 'talk');
        break;
      }
      default: break;
    }
  });
}

function openPanel(id) { app.tablet.show(id); }

// ── the loop ────────────────────────────────────────────────────────────────────────────────
let last = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
  last = now;
  app.frames++;
  pollInput();
  if (In.consume().back2 && app.mode !== 'title' && app.mode !== 'cruise') {
    if (app.tablet.isOpen()) app.tablet.hide(); else togglePause();
  }
  if (app.mode === 'title') { app.renderer.render(app.scene, dummyCam()); return; }
  if (app.mode === 'hub' && app.hub) {
    if (!app.paused && !app.modal) app.hub.update(dt, app);
    app.renderer.render(app.scene, app.hub.player.cam);
  } else if (app.mode === 'dive' && app.run) {
    if (!app.paused && !app.modal) app.run.update(dt, app);
    app.renderer.render(app.scene, app.run.player.cam);
    app.run.hud.update(dt, app.run);
  } else if (app.mode === 'cruise' && app.cruise) {
    if (!app.paused) app.cruise.update(dt);
  }
}
let _dummy = null;
function dummyCam() { if (!_dummy) { _dummy = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100); _dummy.position.set(0, 2, 6); } return _dummy; }

function togglePause() {
  app.paused = !app.paused;
  const el = document.getElementById('pause');
  el.classList.toggle('on', app.paused);
  el.innerHTML = app.paused
    ? `<b>PAUSED</b><div class="rows">${[['Resume', In.label('back2')], ['Tablet', In.label('tablet')], ['Controls', In.scheme === 'kb' ? 'keyboard + mouse' : In.scheme === 'pad' ? `gamepad (${In.brand})` : 'touch']].map(([k, v]) => `<span><b>${k}</b> ${v}</span>`).join('')}</div>`
    : '';
}

function showHints(lines) {
  const el = document.getElementById('hints');
  if (el) el.innerHTML = lines.map(l => `<div>${l}</div>`).join('');
}

// ── app surface used by the other modules ───────────────────────────────────────────────────
Object.assign(app, {
  hud: null, openPanel, talkToPerson, launch, enterDive, enterHub, refreshBoard, onRunEnd,
  togglePause,
  openTalk(npc, res, cb) { app.tablet.onOption = cb; app.tablet.show('talk', { npc, res }); },
  closeTalk() { app.tablet.onOption = null; app.tablet.hide(); },
  advanceSim(hours) { tick(app.career.sim, hours); },
  onRunEvent(type, data, run) { if (type === 'rival_arrived') showHints(['Somebody else is working your site. They want the same cargo and they are not on your payroll.']); },
  toggleSiteLights(run, on) {
    const lights = run.build.lights || [];
    for (const l of lights) { try { l.set ? l.set(on) : (l.light && (l.light.intensity = on ? 6 : 0)); } catch {} }
    run.amb.intensity = on ? 0.45 : 0.12;
  },
  hunterContract(h) {
    const sim = app.career.sim;
    const site = { id: h.siteId, kind: h.siteKind, name: h.siteName, sysId: h.sysId, faction: 'dead', souls: 0 };
    const ct = makeContract(sim, site, { career: app.career, salt: 9 });
    ct.hunter = { rivalId: h.rival, alias: h.name, crew: h.crew, tier: h.tier };
    ct.payer = { name: 'a broker with a grudge', role: 'fixer', faction: 'syndicate', kind: 'syndicate', line: 'somebody wants an operator stopped' };
    ct.fee = h.fee + (h.bounty || 0);
    ct.job = { obj: 'haul', short: `Strip ${h.name}'s run`, long: `${h.name} is aboard ${h.siteName} working it with ${h.crew} guns. Take their cargo off the site and leave them nothing. ${money(ct.fee)} on delivery, and whatever is on their bodies is yours as well.`, wants: [] };
    ct.incidentId = 'lockdown';
    ct.incident = { ...ct.incident, id: 'lockdown', title: `${h.name.toUpperCase()} IS ABOARD`, tint: '#ff6b6b', reason: `${h.name} is working the same site with ${h.crew} hired guns`, blurb: h.blurb, clock: INCIDENTS.lockdown.clock };
    ct.truth.rival = 1;
    ct.truth.rivalRisk = 1;
    ct.riskTrue = Math.min(5, h.tier); ct.risk = Math.min(5, h.tier);
    return ct;
  },
  buy, sellStash, addToStash,
});

// ?cruise / ?results debug entries
function debugEntries() {
  const p = new URLSearchParams(location.search);
  if (p.has('cruise')) { refreshBoard(); app.contract = app.board[0]; launch(); }
}
boot();
setTimeout(debugEntries, 300);

export { app };
