// sim.js — the living galaxy. Pure data + text, no three.js, no DOM: the tests and the contracts
// module both run this headless. Everything the player reads (contracts, prices, news, rumours,
// known people, heat) is derived from this object, so the world always agrees with itself.
//
// Rule that keeps it honest: the sim NEVER talks to the game. It publishes state; contracts.js and
// the UI read it. Anything that happens because of the player is pushed in through notice()/credit().

import { rng } from './util.js';
import { SYSTEMS, FACTIONS, FACTIONS_PLAYABLE, COMMODITIES, SITE_KINDS, FIRST, LAST, NICKNAME, SHIPS, ITEMS } from './data.js';

// ── Happenings: the things running in the world, with a lifetime and real effects ─────────────
// `effect` is read by contracts.js (incident weights inside sites) and by the market.
export const HAPPENINGS = {
  drug_corridor: {
    name: 'drug corridor', tint: '#ffb26b', days: [2, 5], likes: ['syndicate'],
    headline: (s) => `Syndicate moving spice through ${s}`,
    blurb: (s, f) => `A spice corridor has opened through ${s}. Freight manifests are fiction, dock crews are paid in silence, and ${FACTIONS.syndicate.short} men are on the port decks with cases they do not put down.`,
    effect: { incidents: { deal: 7, lockdown: 2 }, prices: { spice: 1.45, meds: 1.1 }, danger: 1, heat: 0.2 },
  },
  outbreak: {
    name: 'outbreak', tint: '#c7ff5a', days: [2, 6], likes: ['halcyon', 'charter'],
    headline: (s) => `Fever spreading on ${s}`,
    blurb: (s) => `Something is going through the people of ${s}: fevers, then panic, then sealed quarters. ${FACTIONS.halcyon.short} has shipped in, which is never a good sign.`,
    effect: { incidents: { gas: 4, organism: 4, lockdown: 2 }, prices: { meds: 1.7 }, danger: 1.1 },
  },
  ai_sealoff: {
    name: 'AI seal-off', tint: '#ff5a4a', days: [1, 4], likes: ['charter', 'tallow', 'halcyon'],
    headline: (s) => `Station AI has sealed a deck at ${s}`,
    blurb: (s) => `An AI at ${s} stopped taking orders. Bulkheads are locked, air is being rationed by something that thinks it is being careful, and its security units shoot anything out of place.`,
    effect: { incidents: { rogue: 8, lockdown: 1.5 }, prices: { data: 1.5, electronics: 1.3 }, danger: 1.4 },
  },
  strike: {
    name: 'dock strike', tint: '#e0a45a', days: [2, 5], likes: ['freehaul', 'tallow'],
    headline: (s) => `Dock crews down tools at ${s}`,
    blurb: (s) => `The crews at ${s} have stopped working and started talking. Nothing moves, everybody is angry, and the private security on the gates have been there long enough to get bored.`,
    effect: { incidents: { mutiny: 6, lockdown: 2 }, prices: { fuel: 1.4, water: 1.25 }, danger: 0.8 },
  },
  purge_order: {
    name: 'sterilisation order', tint: '#ff9a3a', days: [1, 3], likes: ['tallow', 'halcyon'],
    headline: (s) => `Burn order filed at ${s}`,
    blurb: (s) => `Someone at ${s} has filed for a sterilisation burn. That means they decided what is aboard is cheaper to destroy than to explain. The crew found out already, which is why the traffic is one-way.`,
    effect: { incidents: { purge: 7, lockdown: 3 }, prices: { data: 1.3 }, danger: 1.3 },
  },
  war_front: {
    name: 'war front', tint: '#ff6b6b', days: [3, 9], likes: ['charter', 'syndicate', 'wardens'],
    headline: (s) => `Shooting in ${s}`,
    blurb: (s) => `Two outfits are taking ${s} apart one dock at a time. Contracts are good, escorts are not, and the wrecks are fresh enough to still have air in some of them.`,
    effect: { incidents: { lockdown: 4, mutiny: 3, deal: 2 }, prices: { fuel: 1.6, parts: 1.4, crystal: 1.2 }, danger: 1.6, loot: 1.3 },
  },
  gold_rush: {
    name: 'claim rush', tint: '#ffd27f', days: [2, 6], likes: ['freehaul', 'dead'],
    headline: (s) => `Claim rush in ${s}`,
    blurb: (s) => `Somebody struck a vein in ${s}. Every independent crew in the arm is inbound, the claims are being filed with guns, and the crystal price is already sliding.`,
    effect: { incidents: { mutiny: 3, quiet: 3, deal: 2 }, prices: { crystal: 0.7, parts: 1.2 }, loot: 1.5, danger: 1.1 },
  },
  quorum_awake: {
    name: 'Quorum revival', tint: '#c9a0ff', days: [3, 8], likes: ['quorum', 'dead'],
    headline: (s) => `Quorum singing again at ${s}`,
    blurb: (s) => `The Quorum have a new voice in ${s} and they have stopped answering hails so as not to drown it out. Their relics move for silly money, and they do not like people who take them.`,
    effect: { incidents: { quiet: 5, organism: 2 }, prices: { crystal: 1.6, water: 1.2 }, loot: 1.2 },
  },
  ghost_ship: {
    name: 'ghost hull', tint: '#8fb6d8', days: [1, 3], likes: ['dead', 'syndicate'],
    headline: (s) => `A hull is drifting in ${s}`,
    blurb: (s) => `Something big came apart in ${s} and its pieces are still moving. No transponder, no beacon, no survivors answering — and it is on nobody's manifest.`,
    effect: { incidents: { quiet: 4, organism: 3, purge: 2 }, loot: 1.7, danger: 1.4 },
  },
  exodus: {
    name: 'refugee exodus', tint: '#a8e6a0', days: [2, 5], likes: ['freehaul', 'charter'],
    headline: (s) => `People leaving ${s}`,
    blurb: (s) => `Whole decks of people are trying to get out of ${s}. Union ports are full of families with everything they own in a bag, and the recovery fees for the ones who do not make it are unusually good.`,
    effect: { incidents: { purge: 4, lockdown: 3, mutiny: 2 }, prices: { water: 1.5, meds: 1.3 }, danger: 1 },
  },
  cordon: {
    name: 'Warden cordon', tint: '#7fd0ff', days: [2, 6], likes: ['wardens', 'charter'],
    headline: (s) => `Wardens have cordoned ${s}`,
    blurb: (s) => `${FACTIONS.wardens.short} cutters are running inspections at ${s}. Everyone with a hold is being looked into, which means everyone with a hold is suddenly paying for somewhere else to be.`,
    effect: { incidents: { lockdown: 3, quiet: 4 }, prices: { spice: 1.5, bergson: 1.4 }, law: 1.4, heat: 0.4 },
  },
  quiet_spread: {
    name: 'the quiet spreading', tint: '#b0b0b0', days: [4, 10], likes: ['dead', 'quorum'],
    headline: (s) => `${s} has gone quiet`,
    blurb: (s) => `Traffic into ${s} has thinned to nothing and the stations have stopped sending their hourly. Nobody is calling it a crisis yet, which is how the last one started.`,
    effect: { incidents: { organism: 5, quiet: 5 }, danger: 1.5, loot: 1.4 },
  },
};
export const HAPPENING_IDS = Object.keys(HAPPENINGS);

// ── Known people: named NPCs with a face, a temper and a memory of you ───────────────────────
function makePerson(r, factionId, role) {
  const first = r.pick(FIRST), last = r.pick(LAST);
  const nick = r.chance(0.45) ? r.pick(NICKNAME) : null;
  return {
    id: 'p' + r.int(100000, 999999),
    name: `${first} ${last}`,
    nick, first,
    handle() { return this.nick ? `${this.first} "${this.nick}"` : this.name; },
    face: r.int(0, 99999),
    temperament: r.pick(['calm', 'proud', 'desperate', 'drunk', 'paranoid', 'greedy', 'kind', 'cold']),
    faction: factionId, role,
    ship: r.pick(SHIPS),
    rapport: 0,               // -10 (he wants you dead) .. 20 (he would bleed for you)
    memory: [],               // {at, what, delta}
    alive: true,
    where: null,              // system id
  };
}

const RIVAL_TITLES = ['the Ledger', 'Coldwash', 'Halflight', 'Nine', 'Rusthand', 'Slowburn', 'the Clerk', 'Bramble', 'Two-Knives', 'Patch'];
function makeRival(r, sim) {
  const p = makePerson(r, r.pick(['syndicate', 'freehaul', 'dead', 'charter']), 'operator');
  p.alive = true;
  p.rival = true;
  p.alias = r.pick(RIVAL_TITLES);
  p.tier = r.int(2, 5);
  p.crew = r.int(2, 5);
  p.shipName = r.pick(SHIPS);
  p.gear = r.pick(['Kestrel 9', 'Ward break-action', 'Halcyon pattern rifle', 'Tael & Sons compact', 'salvage rivet gun']);
  p.marks = r.int(0, 9);          // how many runs they have taken off other people
  p.style = r.pick(['quiet', 'loud', 'patient', 'greedy', 'sadistic']);
  p.grudges = [];
  p.bounty = 0;
  return p;
}

// ── The galaxy ───────────────────────────────────────────────────────────────────────────────
export function newGalaxy(seed, opts = {}) {
  const r = rng(seed ^ 0x5eed);
  const sim = {
    seed, hours: 0, day: 1, version: 3,
    systems: [], known: [], happenings: [], news: [], log: [],
    player: { heat: 0, notice: 0, name: null, marks: 0 },
    digest: 0,
  };
  SYSTEMS.forEach((s, i) => {
    const owner = i === 0 ? 'charter' : i === 1 ? 'freehaul' : r.pick(FACTIONS_PLAYABLE);
    const sys = {
      id: s.id, name: s.name, star: s.star, lore: s.lore, planets: s.planets.slice(),
      owner, law: FACTIONS[owner].law * r.range(0.75, 1.2),
      prosperity: r.range(0.4, 1.0), threat: r.range(0.1, 0.6),
      mood: 'steady', happenings: [], sites: [], prices: {}, discovered: i < 3,
    };
    // 1-3 sites per system: stations, derelicts, platforms, mines, labs, outposts
    const n = r.int(1, 3);
    const kinds = r.shuffle(['station', 'derelict', 'refinery', 'lab', 'mine', 'outpost', 'station', 'derelict']);
    for (let k = 0; k < n; k++) {
      const kind = kinds[k % kinds.length];
      const sk = SITE_KINDS[kind];
      sys.sites.push({
        id: `${s.id}:${k}`, kind, name: siteName(r, kind, s.name), sysId: s.id,
        faction: r.chance(0.6) ? owner : r.pick(FACTIONS_PLAYABLE),
        integrity: r.range(0.4, 1), souls: r.int(0, 40), drifting: kind === 'derelict' || r.chance(0.2),
      });
    }
    // market prices: base * system factor * noise, drifting over time
    for (const c in COMMODITIES) sys.prices[c] = priceFor(r, c, sys, 0);
    sim.systems.push(sys);
  });
  // Known people: brokers, fixers, bartenders, and rivals
  for (let i = 0; i < 14; i++) sim.known.push(makePerson(r, r.pick(FACTIONS_PLAYABLE), r.pick(['broker', 'fixer', 'bartender', 'quartermaster', 'clerk', 'medic', 'salvor'])));
  for (let i = 0; i < 8; i++) sim.known.push(makeRival(r, sim));
  for (const p of sim.known) p.where = r.pick(sim.systems).id;
  // Seed the board with a few happenings so day 1 is already a bad day
  for (let i = 0; i < 4; i++) spawnHappening(sim, r, r.pick(sim.systems));
  sim.digest = worldDigest(sim);
  return sim;
}

function siteName(r, kind, sysName) {
  const pool = {
    station: ['Waypost Annex', 'Dock Nine', 'Halyard Spur', 'the Cradle', 'Ardent Ring'],
    derelict: ['the Longwake', 'MV Tessellate', 'the Cormorant', 'Harrowline', 'the Second Draft'],
    refinery: ['Refinery Six', 'Slagfield Works', 'the Furnaces', 'Boiler Row'],
    lab: ['Varga Cryo', 'the Clean Rooms', 'Ysolde Deep Annex', 'Hush Lab'],
    mine: ['Nobody\'s Rock', 'Cairn Cut', 'the Deep Seam', 'Ash Tide Dig'],
    outpost: ['Fringe Anchorage', 'Cold Cairn Post', 'the Long Quiet Relay', 'Six Souls'],
  }[kind];
  return r.pick(pool) + (r.chance(0.6) ? ` (${sysName})` : '');
}

function priceFor(r, c, sys, hours) {
  const base = COMMODITIES[c].base;
  const ferment = 1 + 0.12 * Math.sin((hours + sys.id.length * 7) / 31) + 0.05 * Math.sin(hours / 7.3 + c.length);
  let f = ferment * (0.65 + sys.prosperity * 0.7) * (0.85 + sys.threat * 0.5);
  for (const h of sys.happenings) {
    const hp = HAPPENINGS[h.kind];
    if (hp && hp.effect.prices && hp.effect.prices[c]) f *= hp.effect.prices[c];
  }
  return Math.max(4, Math.round(base * f));
}

function spawnHappening(sim, r, sys) {
  // weight by what this system's owner and neighbours would plausibly be doing
  const table = {};
  for (const id in HAPPENINGS) {
    const h = HAPPENINGS[id];
    let w = 1;
    if (h.likes.includes(sys.owner)) w *= 3;
    if (h.likes.includes('dead') && sys.owner === 'dead') w *= 3;
    if (sim.happenings.some(x => x.kind === id && x.sysId === sys.id)) w *= 0.15;   // not the same one twice
    if (sim.happenings.some(x => x.kind === 'war_front') && id === 'war_front') w *= 2.5;
    table[id] = w;
  }
  const kind = r.weighted(table);
  const h = HAPPENINGS[kind];
  const days = r.range(h.days[0], h.days[1]);
  const hh = {
    id: 'h' + r.int(10000, 99999), kind, sysId: sys.id, name: h.name, tint: h.tint,
    started: sim.hours, ends: sim.hours + days * 24, headline: h.headline(sys.name),
    blurb: h.blurb(sys.name), effect: h.effect, resolved: false,
  };
  sim.happenings.push(hh);
  sys.happenings.push(hh);
  pushNews(sim, sys.id, hh.headline, kind);
  return hh;
}

export function pushNews(sim, sysId, text, tag = 'wire', opts = {}) {
  sim.news.unshift({ at: sim.hours, sysId, text, tag, ...opts });
  if (sim.news.length > 240) sim.news.length = 240;
}

// ── The tick: everything that happens while the player is aboard someone else's wreck ────────
export function tick(sim, hours, opts = {}) {
  const r = opts.rng || rng((sim.seed ^ Math.round(sim.hours * 1000)) >>> 0);
  let t = sim.hours;
  const target = sim.hours + hours;
  while (t <= target) {
    t += 1;
    sim.hours = t;
    sim.day = Math.floor(t / 24) + 1;
    // resolve / expire happenings
    for (const sys of sim.systems) {
      for (const hh of sys.happenings.slice()) {
        if (t >= hh.ends) {
          sys.happenings.splice(sys.happenings.indexOf(hh), 1);
          sim.happenings.splice(sim.happenings.indexOf(hh), 1);
          hh.resolved = true;
          // aftermath: a happening that ends leaves a story behind
          pushNews(sim, sys.id, aftermath(sim, hh, r), 'aftermath', { sys: sys.name });
        }
      }
      // spontaneous new happenings, throttled by how much is already going on
      const load = sys.happenings.length;
      if (r.chance(0.02 / (1 + load)) && sim.happenings.length < 14) spawnHappening(sim, r, sys);
      // drift prices
      for (const c in COMMODITIES) {
        const want = priceFor(r, c, sys, t);
        sys.prices[c] = Math.round(sys.prices[c] + (want - sys.prices[c]) * 0.18);
      }
      // spread: an outbreak or a quiet in one system can cross to a neighbour
      if (sys.happenings.some(h => h.kind === 'outbreak' || h.kind === 'quiet_spread') && r.chance(0.008)) {
        const others = sim.systems.filter(s => s.id !== sys.id && !s.happenings.length);
        if (others.length) spawnHappening(sim, r, r.pick(others));
      }
    }
    // known people move between systems, occasionally do something worth knowing
    if (r.chance(0.5)) {
      const p = r.pick(sim.known);
      p.where = r.pick(sim.systems).id;
      if (p.rival && r.chance(0.25)) pushNews(sim, p.where, rivalActivity(p, r), 'rumour');
    }
    // the player's own heat cools while away
    sim.player.heat = Math.max(0, sim.player.heat - 0.02);
  }
  sim.digest = worldDigest(sim);
  return sim;
}

function aftermath(sim, hh, r) {
  const sysName = sim.systems.find(s => s.id === hh.sysId).name;
  const lines = {
    drug_corridor: `The corridor through ${sysName} is shut. Two dock crews are gone, a crate of manifests has been filed under a false name, and the price of spice just doubled everywhere else.`,
    outbreak: `${sysName} has stopped reporting fevers. The last figure was four hundred, which means either it burned out or nobody is counting.`,
    ai_sealoff: `Engineers got a deck open at ${sysName}. The AI had been keeping the crew on rationed air the whole time, and it had left the names of everyone it killed on a screen, alphabetically.`,
    strike: `The ${sysName} dock crews are back on shift, on terms nobody has published. Two of the organisers have left the system and one is missing.`,
    purge_order: `The burn at ${sysName} went ahead at 04:00. There is nothing left to recover, and three families are asking the Charter who authorised it.`,
    war_front: `The fighting in ${sysName} has stopped. One outfit holds the docks, the other holds nothing, and the salvage rights have been sold twice.`,
    gold_rush: `The rush in ${sysName} is over. The vein was shallow, the claims are worthless, and eleven crews are stuck there with no fuel.`,
    quorum_awake: `${sysName} is answering hails again. The Quorum say the voice has moved on and they will not say where.`,
    ghost_ship: `The drifting hull in ${sysName} has been claimed by a salvage cartel. Whatever was written on it is now somebody's property.`,
    exodus: `The last of the ${sysName} evacuees have been settled somewhere with worse weather and no work.`,
    cordon: `${FACTIONS.wardens.short} have lifted the cordon at ${sysName}. Fourteen holds were impounded and nobody has been charged.`,
    quiet_spread: `${sysName} is transmitting again, an hour late, in a voice the port authority has not identified.`,
  };
  return lines[hh.kind] || `Whatever was happening in ${sysName} has stopped being news.`;
}

function rivalActivity(p, r) {
  const verbs = {
    quiet: ['went aboard a hull in the Long Quiet and came out heavy, alone', 'left a crew behind on a wreck with the airlock open'],
    loud: ['shot up a dock bar and walked out with a case nobody would describe', 'took a Warden inspection team apart and left the cutter with its lights on'],
    patient: ['spent four days on one deck of a derelict and came off with one crate', 'bought a manifest, then bought the ship it belonged to'],
    greedy: ['took a whole hold off a union hauler and the crew\'s boots as well', 'sold the same cargo to two different buyers'],
    sadistic: ['left one survivor of a nine-person crew, and made sure they could describe it'],
  }[p.style];
  return `${p.alias} ${r.pick(verbs)}.`;
}

// ── Read side: what the game and the UI ask the sim ──────────────────────────────────────────
export function priceAt(sim, sysId, c) {
  const sys = sim.systems.find(s => s.id === sysId); if (!sys) return COMMODITIES[c].base;
  const p = sys.prices[c] ?? COMMODITIES[c].base;
  return { buy: Math.round(p * 1.18), sell: Math.round(p * 0.86), mid: p };
}

export function incidentWeights(sim, sysId, kind) {
  // start from the site kind's natural temper, then let the world push it around
  const base = {
    station: { deal: 1.6, mutiny: 1.4, lockdown: 1.2, rogue: 1.2, gas: 1, organism: 1, quiet: 2, purge: 0.8 },
    derelict: { quiet: 3, organism: 2, purge: 1.4, rogue: 1.5, gas: 0.8, deal: 0.7, mutiny: 0.6, lockdown: 0.5 },
    refinery: { gas: 3, mutiny: 2, purge: 1.6, deal: 1, rogue: 0.8, quiet: 1, organism: 0.8, lockdown: 1 },
    lab: { organism: 3.4, rogue: 1.6, lockdown: 1.4, gas: 1.2, quiet: 1, purge: 1.4, deal: 0.4, mutiny: 0.4 },
    mine: { mutiny: 2.4, gas: 2, quiet: 1.6, deal: 1.4, lockdown: 1, organism: 1, purge: 0.9, rogue: 0.5 },
    outpost: { mutiny: 2, quiet: 2.4, organism: 1.6, purge: 1.4, lockdown: 1.2, gas: 0.8, deal: 1, rogue: 0.5 },
  }[kind] || { quiet: 1, deal: 1, mutiny: 1 };
  const w = { ...base };
  const sys = sim.systems.find(s => s.id === sysId);
  if (sys) {
    for (const hh of sys.happenings) {
      const eff = hh.effect.incidents || {};
      for (const k in eff) w[k] = (w[k] || 0.2) * eff[k];
    }
    // a corrupt system breeds deals and mutinies; a lawful one breeds lockdowns and quiets
    if (sys.law < 0.4) { w.deal = (w.deal || 1) * 1.8; w.mutiny = (w.mutiny || 1) * 1.4; }
    if (sys.law > 0.9) { w.lockdown = (w.lockdown || 1) * 1.6; w.quiet = (w.quiet || 1) * 1.3; }
  }
  return w;
}

export function dangerAt(sim, sysId) {
  const sys = sim.systems.find(s => s.id === sysId); if (!sys) return 1;
  let d = 0.7 + sys.threat * 1.2 - sys.law * 0.3;
  for (const hh of sys.happenings) d *= (hh.effect.danger || 1) ** 0.6;
  return Math.max(0.3, Math.min(3, d));
}
export function lootAt(sim, sysId) {
  const sys = sim.systems.find(s => s.id === sysId); if (!sys) return 1;
  let l = 1 + (1 - sys.prosperity) * 0.4;
  for (const hh of sys.happenings) l *= (hh.effect.loot || 1) ** 0.6;
  return Math.max(0.6, Math.min(2.4, l));
}

export function knownAt(sim, sysId) { return sim.known.filter(p => p.where === sysId && p.alive); }
export function rivalsAlive(sim) { return sim.known.filter(p => p.rival && p.alive); }
export function topRivals(sim, n = 4) { return rivalsAlive(sim).slice().sort((a, b) => b.tier - a.tier || b.marks - a.marks).slice(0, n); }

export function notice(sim, p, what, delta = 0) {
  p.rapport = Math.max(-10, Math.min(20, p.rapport + delta));
  p.memory.unshift({ at: sim.hours, what, delta });
  if (p.memory.length > 12) p.memory.length = 12;
  if (delta < 0 && p.rival) {
    p.bounty = Math.max(0, (p.bounty || 0) + Math.round(-delta * 120));
    pushNews(sim, p.where, `${p.alias} has put money on a rimrunner matching your description.`, 'rumour');
  }
  sim.digest = worldDigest(sim);
}

export function credit(sim, sysId, text) { pushNews(sim, sysId, text, 'player'); }
export function addHeat(sim, amount) {
  sim.player.heat = Math.max(0, Math.min(5, sim.player.heat + amount));
  sim.player.notice = Math.round(sim.player.heat);
}

// The player climbed a rank: the world should hear about it.
export function fame(sim, career) {
  // sim.js must not depend on state.js, so derive the handle from the career's own fields.
  const h = typeof career.handle === 'function' ? career.handle()
    : career.nick ? `${career.first} "${career.nick}"` : `${career.first || 'a rimrunner'} ${career.last || ''}`.trim();
  sim.player.name = h;
  sim.player.marks = career.marks || 0;
  credit(sim, career.homeSys || 'waypost', `${h} brought ${career.marks} verified hauls out of the rim and is being talked about in the wrong bars.`);
}

// Cheap digest for change detection / news "since" queries.
export function worldDigest(sim) {
  let h = 0;
  for (const s of sim.systems) h = (h * 31 + Math.round(s.prices.crystal + s.threat * 100 + s.happenings.length * 7)) | 0;
  return h;
}

export function newsSince(sim, hours, filter = {}) {
  return sim.news.filter(n => n.at >= hours && (!filter.tag || n.tag === filter.tag) && (!filter.sysId || !n.sysId || n.sysId === filter.sysId));
}

export function systemById(sim, id) { return sim.systems.find(s => s.id === id) || null; }
export function siteById(sim, id) {
  for (const s of sim.systems) { const f = s.sites.find(x => x.id === id); if (f) return f; }
  return null;
}

// Save/load: the sim is JSON-safe on purpose.
export function serialize(sim) { return JSON.parse(JSON.stringify({ ...sim, known: sim.known.map(stripFns), systems: sim.systems.map(stripFns) })); }
function stripFns(o) {
  const out = {};
  for (const k in o) { const v = o[k]; if (typeof v === 'function') continue; out[k] = v; }
  return out;
}
export function deserialize(data) {
  const sim = data;
  // re-attach the tiny prototype helpers that are not worth serialising
  for (const p of sim.known) if (!p.handle) p.handle = function () { return this.nick ? `${this.name.split(' ')[0]} "${this.nick}"` : this.name; };
  return sim;
}
