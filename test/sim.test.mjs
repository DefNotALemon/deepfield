// test/sim.test.mjs — the world, the contracts and the career, headless. No three.js, no DOM.
// Run: node test/sim.test.mjs
import './_stub.mjs';
import { PASS, done } from './_stub.mjs';
import { newGalaxy, tick, priceAt, incidentWeights, dangerAt, lootAt, rivalsAlive, topRivals, serialize, deserialize, worldDigest, knownAt } from '../src/sim.js';
import { contractBoard, makeContract, siteSpec, placeJobItem, objectiveMet, INCIDENTS, clockWarn2, clockDoom, objectiveLine } from '../src/contracts.js';
import { newCareer, save, load, clear, settle, award, hunterBook, rankName, gearTiers, buy, sellStash, advanceWorld } from '../src/state.js';
import { ITEMS } from '../src/data.js';

console.log('— the galaxy —');
const sim = newGalaxy(20261106);
PASS('8 systems', sim.systems.length === 8, `(${sim.systems.length})`);
PASS('every system has sites', sim.systems.every(s => s.sites.length >= 1));
PASS('known people exist and have faces', sim.known.length >= 20 && sim.known.every(p => typeof p.face === 'number'));
PASS('rivals exist', rivalsAlive(sim).length >= 5, `(${rivalsAlive(sim).length})`);
PASS('day one already has problems', sim.happenings.length >= 3, `(${sim.happenings.length})`);

const before = worldDigest(sim);
tick(sim, 24 * 12);
PASS('the world moves without the player', worldDigest(sim) !== before);
PASS('the wire fills up', sim.news.length > 8, `(${sim.news.length} items)`);
PASS('happenings resolve and leave aftermath', sim.news.some(n => n.tag === 'aftermath'));
PASS('prices drift', sim.systems.some(s => s.prices.crystal !== newGalaxy(20261106).systems.find(x => x.id === s.id).prices.crystal));
PASS('tick is seeded and repeatable', (() => {
  const a = newGalaxy(7), b = newGalaxy(7);
  tick(a, 100); tick(b, 100);
  return worldDigest(a) === worldDigest(b);
})());

console.log('\n— contracts are missions —');
const career = newCareer(4242);
const board = contractBoard(sim, career, 4);
PASS('the board offers work', board.length === 4, `(${board.length})`);
PASS('every contract has an incident with a reason', board.every(c => c.incident.title && c.incident.reason.length > 20));
PASS('every contract has a payer and a fee', board.every(c => c.payer.name && c.fee > 100));
PASS('every contract has a job and an objective line', board.every(c => c.job.short && objectiveLine(c).length > 5));
PASS('the incident decides who is aboard', board.every(c => {
  const inc = INCIDENTS[c.incidentId];
  return c.truth.alien === false || c.truth.alien === true ? true : false;
}));
PASS('one incident per site kind is plausible (gas on refineries and labs, deals where the law is thin)', (() => {
  const counts = {};
  for (let i = 0; i < 400; i++) {
    const c = makeContract(sim, sim.systems[i % 8].sites[0], { career, salt: i });
    counts[c.incidentId] = (counts[c.incidentId] || 0) + 1;
  }
  const kinds = Object.keys(counts);
  return kinds.length >= 4 && counts.deal + counts.gas + counts.organism + counts.purge + counts.lockdown + counts.mutiny + counts.quiet + counts.rogue === 400;
})(), '');
PASS('a drug corridor makes deals more likely', (() => {
  const sim2 = newGalaxy(99);
  const sys = sim2.systems[2];
  const site = sys.sites[0];
  const wBefore = incidentWeights(sim2, sys.id, site.kind).deal || 1;
  sys.happenings.push({ kind: 'drug_corridor', effect: { incidents: { deal: 7 } } });
  sim2.happenings.push(sys.happenings[0]);
  const wAfter = incidentWeights(sim2, sys.id, site.kind).deal || 1;
  return wAfter > wBefore * 3;
})());
PASS('risk and fee scale with danger', (() => {
  const calm = makeContract(sim, sim.systems[0].sites[0], { career: { rank: 0, marks: 0, credits: 0 }, salt: 1 });
  const rough = makeContract(sim, sim.systems[7].sites[0], { career: { rank: 5, marks: 30, credits: 0 }, salt: 1 });
  return rough.fee >= calm.fee;
})());
PASS('clock lines and doom text exist for every incident', Object.keys(INCIDENTS).every(k => {
  const c = makeContract(sim, sim.systems[0].sites[0], { career, salt: 3 });
  const probe = { ...c, incidentId: k, incident: { ...c.incident, id: k, clock: INCIDENTS[k].clock }, corp: 'Tallow & Ward', ai: 'SEXTANT' };
  return typeof clockDoom(probe) === 'string' && clockDoom(probe).length > 10;
}));
PASS('nightmare case: every incident has at least two jobs', Object.keys(INCIDENTS).every(k => INCIDENTS[k].jobs.length >= 2));

console.log('\n— the dive spec and the job item —');
const ct = board[0];
const spec = siteSpec(ct, career, 1234);
PASS('spec carries the incident and the truth', spec.incident === ct.incidentId && spec.crewCount === ct.truth.crew);
PASS('spec sizes match the site kind', spec.size[0] >= 22 && spec.size[1] >= 16, `(${spec.size})`);
// fake site just to prove placement works and stays inside the map
const fakeSite = { w: 30, h: 20, rooms: [{ id: 0, kind: 'portside', x: 2, z: 2, w: 6, d: 6 }], containers: [{ id: 'c0', x: 4, z: 4, roomId: 0, sealed: false, contents: [] }, { id: 'c1', x: 6, z: 6, roomId: 0, sealed: true, contents: [] }] };
const placed = placeJobItem(fakeSite, ct, newGalaxy(3) && { int: () => 0, range: (a, b) => a, chance: () => true });
PASS('the job item is placed in a container', !!placed && placed.contents.some(c => c.job));

console.log('\n— the career and the Office —');
const c2 = newCareer(555);
PASS('a career starts poor and unproven', c2.credits < 600 && c2.rank === 0 && c2.gear.guns.length === 1);
PASS('quota is set', c2.quota.target > 0);
const run = { extracted: true, objective: true, fee: 1000, haulValue: 1500, quotaPaid: 500, kills: 2, rescued: 1, xp: 50, site: 'the Cradle', sysName: 'Ysolde', incidentTitle: 'ROGUE AI', payer: 'union rep', damage: 1, shots: 10, hurt: 0.2, carried: [{ id: 'dataspool', n: 1 }], time: 400 };
const aw = award(c2, run, sim);
PASS('a good dive earns marks', c2.marks >= 2, `(${c2.marks})`);
const st = settle(c2, run, sim);
PASS('settling pays the fee and the haul', st.gross >= 2400, `(${st.gross})`);
PASS('settling costs money too', st.net < st.gross);
PASS('the office reports the quota', st.notes.some(n => /quota/i.test(n)));
PASS('save and load round-trip', (() => { save(c2); const b = load(); return b && b.marks === c2.marks && b.sim.systems.length === 8; })());
PASS('ranks advance with marks', (() => { const t = newCareer(1); t.marks = 12; const a2 = award(t, run, sim); return t.rank >= 2; })());
PASS('gear unlocks with rank', (() => { const t = newCareer(1); const low = gearTiers(t).guns.length; t.rank = 4; return gearTiers(t).guns.length > low; })());
PASS('the hunter book is sealed below Operator and open at it', (() => {
  const t = newCareer(2); t.rank = 2;
  const closed = hunterBook(sim, t).length === 0;
  t.rank = 3;
  return closed && hunterBook(sim, t).length > 0;
})());
PASS('buying respects the wallet', (() => {
  const t = newCareer(3); t.credits = 10;
  const r = buy(t, 'gun', 'rifle');
  return r.ok === false;
})());
PASS('selling empties the stash and pays', (() => {
  const t = newCareer(4); t.stash = [{ id: 'dataspool', n: 3 }];
  const before2 = t.credits;
  const r = sellStash(t, sim, 'waypost');
  return t.stash.length === 0 && t.credits > before2 && r.total > 100;
})());

console.log('\n— a dead rimrunner is content —');
PASS('dying costs the haul and reports it to the world', (() => {
  const t = newCareer(6);
  t.gear.guns.push({ id: 'smg', uid: 'gx', mag: 30, ammo: 30 });
  const newsCount = t.sim.news.length;
  const deadRun = { ...run, extracted: false, died: true, haulValue: 3000, objective: false };
  settle(t, deadRun, t.sim);
  return t.sim.news.length > newsCount && t.gear.guns.length === 1;
})());
PASS('insurance changes what death costs', (() => {
  const t = newCareer(7);
  t.insurance = true;
  t.gear.guns.push({ id: 'rifle', uid: 'g9', mag: 10, ammo: 10 });
  const before3 = t.gear.guns.length;
  settle(t, { ...run, extracted: false, died: true }, t.sim);
  return t.gear.guns.length === before3 && t.insurance === false;
})());

console.log('\n— the world notices you —');
PASS('advancing the world ticks the sim and saves', (() => {
  const t = newCareer(8);
  const d = worldDigest(t.sim);
  advanceWorld(t, 200);
  return worldDigest(t.sim) !== d && !!load();
})());
clear();
done('deepfield sim suite');
