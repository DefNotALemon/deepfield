// contracts.js — the WHY and the ASK. Every dive is a mission: an incident (what is happening to the
// people aboard, derived from the living sim) and a job (what somebody off-site is paying you to do
// about it). Pure data + text, headless-testable, no three.js.

import { rng, money, andList } from './util.js';
import {
  ITEMS, TOOLS, GUNS, FACTIONS, SITE_KINDS, COMMODITIES, ROOM_LABEL, itemName, itemValue,
} from './data.js';
import { incidentWeights, dangerAt, lootAt, priceAt, knownAt, systemById } from './sim.js';

// ── Incidents ────────────────────────────────────────────────────────────────────────────────
// Each one is a whole situation: it decides the crew's mood, who is armed, whether something is in
// the ducts, what the clock means, and what jobs make sense.
export const INCIDENTS = {
  deal: {
    title: 'DEAL GONE LOUD', tint: '#ffb26b', mood: 'dealing',
    crewMood: 'dealing', hostileMix: { syndicate: 4, crew_gun: 1 }, alien: 0.18, vault: 0.55,
    clock: { kind: 'rival', name: 'SHIP INBOUND', warn2: 'A second transponder just lit up on the approach. Somebody else is coming for the same case — two minutes.', warn30: 'Their clamp is on the hull. Thirty seconds.' },
    reason: (s, site) => `a transaction is happening aboard ${site.name} and it is not going well`,
    blurb: (s, site) => `There is a deal running through ${site.name}: spice, papers, a hard case of custody tags, and men paid to stand where they can see the doors. Someone on one side has decided to change the terms. Whatever you walk into, half of them will assume you are the other half's problem.`,
    jobs: [
      { obj: 'item', item: 'evidence', short: 'Take the case', long: (f) => `Bring me the case. The one with the chain-of-custody tags on it, before it is emptied and burned. ${f} for the case alone, and anything else you carry out is yours.` },
      { obj: 'haul', short: 'Clean out the deal', long: (f) => `I want the corridor broken. Take what you can carry off that site and walk away — the value is in the spice and I want it in my hands, not theirs. ${f} on delivery.` },
      { obj: 'item', item: 'spicebrick', short: 'Recover a spice brick', long: (f) => `One brick, intact, with their stamp still on it. That is all I need to prove who was selling. ${f}.` },
    ],
  },
  rogue: {
    title: 'ROGUE AI', tint: '#ff5a4a', mood: 'sealed',
    crewMood: 'trapped', hostileMix: { robot_drone: 3, robot_walker: 2, guard: 1 }, alien: 0.12, vault: 0.8,
    clock: { kind: 'vent', name: 'PURGE', warn2: (c) => `${c.ai} has started venting the decks. Two minutes of air left aboard.`, warn30: () => 'Thirty seconds of air. Get to the hatch.' },
    reason: (s, site) => `the station AI aboard ${site.name} stopped taking orders and sealed the crew in`,
    blurb: (s, site) => `${site.name} has an AI that decided three days ago that it knew better. It sealed the bulkheads, cut the air to the decks it called non-essential, and its security units shoot anything that moves wrong. Some of the crew are still alive in there, behind doors that only open for the thing that locked them.`,
    jobs: [
      { obj: 'item', item: 'dataspool', short: "Pull the core's log", long: (f) => `The AI keeps a spool of everything it decided and why. I want it. ${f} for the spool, and I do not care what happens to the AI.` },
      { obj: 'item', item: 'reactorcore', short: 'Take its power core', long: (f) => `Kill it by taking its heart. The core housing is the machine's own life support. ${f}, if you can carry it out.` },
      { obj: 'rescue', n: 2, short: 'Get crew off alive', long: (f) => `${f} for every soul you get off that deck alive and standing at your hatch. Two minimum. I want witnesses, not graves.` },
    ],
  },
  organism: {
    title: 'UNKNOWN ORGANISM', tint: '#c7ff5a', mood: 'hunted',
    crewMood: 'hunted', hostileMix: { crew_gun: 1 }, alien: 1.0, vault: 0.6,
    clock: { kind: 'burn', name: 'BURN', warn2: (c) => `${c.corp} sterilisation burn starts in two minutes.`, warn30: () => 'The burn is lighting the outer decks. Thirty seconds.' },
    reason: (s, site) => `something alive got loose aboard ${site.name} and the crew stopped answering`,
    blurb: (s, site) => `A sample on ${site.name} was not dead when they filed it as dead. Whatever grew out of it has been working through the crew, and it hunts by sound — it does not need to see you, it needs to hear you. The rest of the crew have stopped talking to each other for that reason. ${FACTIONS.halcyon.short} has already booked the burn.`,
    jobs: [
      { obj: 'item', item: 'biomatter', short: 'Take a tissue sample', long: (f) => `A sample from the nest, sealed, before the burn. ${f}. Do not open the jar on my account or yours.` },
      { obj: 'item', item: 'blackbox', short: 'Recover the recorder', long: (f) => `The flight recorder has the last eleven minutes of this hull and I want them. ${f}. You will hear some of it while you are in there.` },
      { obj: 'rescue', n: 1, short: 'Bring out a survivor', long: (f) => `There are people still alive in there and they have stopped moving so it cannot hear them. Get one out. ${f}.` },
    ],
  },
  gas: {
    title: 'CHEMICAL BREACH', tint: '#e6d84a', mood: 'gassed',
    crewMood: 'gassed', hostileMix: { crew_gun: 1 }, alien: 0.25, vault: 0.5,
    clock: { kind: 'housing', name: 'HOUSING', warn2: () => 'The gas has reached the reactor housing. It gives way in two minutes.', warn30: () => 'Housing failing. Thirty seconds.' },
    reason: (s, site) => `a chemical breach is moving through the decks of ${site.name} room by room`,
    blurb: (s, site) => `A process line let go on ${site.name} and the gas is walking from room to room through the vents. The crew who got a mask on in time are barricaded in whatever room is still clean. The ones who did not are lying where they fell. You will want a respirator, or a plan that involves holding your breath.`,
    jobs: [
      { obj: 'item', item: 'blackbox', short: 'Fetch the recorder', long: (f) => `The recorder will say which line failed and who signed it off. ${f} before the housing goes.` },
      { obj: 'haul', short: 'Get the medical stock out', long: (f) => `Their store rooms are full of medical stock that will be worth nothing after the burn. Carry out what you can. ${f} on delivery.` },
      { obj: 'item', item: 'evidence', short: 'Bring out the paperwork', long: (f) => `Somebody in that office kept the real maintenance schedule. It is in a tagged case. ${f}.` },
    ],
  },
  mutiny: {
    title: 'MUTINY', tint: '#ff9a3a', mood: 'fighting',
    crewMood: 'fighting', hostileMix: { mutineer: 4, crew_gun: 3 }, alien: 0.15, vault: 0.5,
    clock: { kind: 'security', name: 'SECURITY', warn2: (c) => `${c.corp} security shuttle is on final approach. Two minutes.`, warn30: () => 'They are at the clamp. Thirty seconds.' },
    reason: (s, site) => `the crew aboard ${site.name} have split in half and started shooting at each other`,
    blurb: (s, site) => `Half the crew on ${site.name} have taken the ship from the other half, and things have gone past words. They are in different rooms, they are armed, and neither side can tell whether you are here to help the other one. There is a wounded man in a corridor who has been shouting for a while.`,
    jobs: [
      { obj: 'item', item: 'evidence', short: 'Take the grievance file', long: (f) => `Both sides filed complaints about each other. Whoever holds the paper decides who is a mutineer. ${f} for the file.` },
      { obj: 'rescue', n: 2, short: 'Get the wounded out', long: (f) => `${f} per survivor you bring back to your hatch, two minimum. I do not care which side they are on.` },
      { obj: 'item', item: 'guncase', short: 'Recover the armory case', long: (f) => `There is a weapon case in there that belongs to the company and not to whoever is currently holding it. ${f}, and bring it out closed.` },
    ],
  },
  lockdown: {
    title: 'CORPORATE LOCKDOWN', tint: '#7fd0ff', mood: 'locked',
    crewMood: 'hunted', hostileMix: { guard: 4, crew_gun: 1 }, alien: 0.1, vault: 0.85,
    clock: { kind: 'scuttle', name: 'SCUTTLE', warn2: (c) => `${c.corp} has armed the scuttling charges. Two minutes.`, warn30: () => 'Thirty seconds to scuttle. Back to the hatch.' },
    reason: (s, site) => `${site.name} has been locked down by its own corporate security and they are firing on the crew`,
    blurb: (s, site) => `Somebody on ${site.name} leaked something the company wanted kept. Now the company's own security has the place sealed: everyone stays in quarters, anyone in a corridor gets shot, and there is a charge set on the reactor that the company intends to call an accident.`,
    jobs: [
      { obj: 'rescue', n: 1, short: 'Get a witness off', long: (f) => `${f} if you get even one of them off alive to testify, plus a bonus for every extra you bring. They will be hiding behind locked doors. Talk them out.` },
      { obj: 'item', item: 'dataspool', short: 'Take the leak itself', long: (f) => `The thing they wanted quiet is on a data spool in that site. Bring it to me before the charges go. ${f}.` },
      { obj: 'item', item: 'evidence', short: 'Recover the scuttle order', long: (f) => `I want the signed order that armed those charges. It is in a case with a red tag. ${f}.` },
    ],
  },
  purge: {
    title: 'STERILISATION BURN', tint: '#ff6b6b', mood: 'fleeing',
    crewMood: 'fleeing', hostileMix: { guard: 2, crew_gun: 2 }, alien: 0.3, vault: 0.7,
    clock: { kind: 'burn', name: 'BURN', warn2: (c) => `${c.corp} lights the burn in two minutes and they are not checking it twice.`, warn30: () => 'The burn ships are in range. Thirty seconds.' },
    reason: (s, site) => `${site.name} is scheduled for a burn and its crew only found out this morning`,
    blurb: (s, site) => `Somebody at ${site.name} decided whatever is aboard is cheaper to destroy than to explain, and filed for a sterilisation burn. The crew found out this morning. Half of them are packing, half of them are refusing to leave without the others, and the company has already stopped answering the radio.`,
    jobs: [
      { obj: 'item', item: 'blackbox', short: 'Save the recorder', long: (f) => `The recorder is the only thing that will survive the burn with the truth on it, if somebody carries it out. ${f}.` },
      { obj: 'rescue', n: 2, short: 'Evacuate the stubborn ones', long: (f) => `${f} per soul standing at your hatch before the burn. They will not all want to come. Convince them.` },
      { obj: 'haul', short: 'Strip what you can', long: (f) => `Nobody is coming for that hull's cargo. Carry out what you can in the time you have. ${f} on delivery.` },
    ],
  },
  quiet: {
    title: 'NO ANSWER', tint: '#8fb6d8', mood: 'quiet',
    crewMood: 'normal', hostileMix: {}, alien: 0.45, vault: 0.4,
    clock: { kind: 'none', name: '', warn2: null, warn30: null },
    reason: (s, site) => `nobody has heard from ${site.name} in a while, and nothing looks wrong`,
    blurb: (s, site) => `${site.name} is intact, lit, and answering questions nobody has asked. Its shift is running. Its logs are current. It simply stopped sending its hourly, and the person who noticed booked a rimrunner instead of a patrol because a patrol would file a report. Nothing is visibly wrong. Bring a light.`,
    jobs: [
      { obj: 'item', item: 'blackbox', short: 'Find out what it stopped saying', long: (f) => `The recorder is the only thing aboard that will not lie to me about what happened on that hull. ${f}.` },
      { obj: 'haul', short: 'Take whatever is loose', long: (f) => `Quiet hulls are the best ones for cargo and the worst ones to be on. Fill up and do not overstay. ${f}.` },
      { obj: 'item', item: 'corpse', short: 'Recover the body', long: (f) => `There is a crew member aboard who did not make it. Bring them back and I will pay the union rate and my own on top. ${f}.` },
    ],
  },
};
export const INCIDENT_IDS = Object.keys(INCIDENTS);

// ── Payers ───────────────────────────────────────────────────────────────────────────────────
const PAYER_KINDS = {
  union: { label: 'union rep', line: 'the crew union pays for its own', faction: 'freehaul' },
  insurer: { label: 'loss adjuster', line: 'the insurer wants the loss written down', faction: 'charter' },
  rival_corp: { label: 'corporate fixer', line: 'a competitor pays for the evidence', faction: 'tallow' },
  lab: { label: 'research broker', line: 'a lab wants the sample before the burn', faction: 'halcyon' },
  family: { label: 'next of kin', line: 'a family pooled their money', faction: 'charter' },
  syndicate: { label: 'buyer with no letterhead', line: 'the Syndicate pays for silence it can hold', faction: 'syndicate' },
  journalist: { label: 'freelance journalist', line: 'somebody wants it on the record', faction: 'charter' },
  salvage: { label: 'salvage cartel', line: 'a cartel wants the hull stripped', faction: 'tallow' },
  official: { label: 'port authority clerk', line: 'the port authority wants it filed properly', faction: 'wardens' },
  quorum: { label: 'Quorum elder', line: 'the Quorum want a thing returned', faction: 'quorum' },
};
const PAYER_FOR_INCIDENT = {
  deal: ['syndicate', 'journalist', 'official', 'rival_corp'],
  rogue: ['union', 'insurer', 'lab', 'rival_corp'],
  organism: ['lab', 'rival_corp', 'journalist', 'insurer'],
  gas: ['insurer', 'official', 'union', 'salvage'],
  mutiny: ['union', 'official', 'family', 'journalist'],
  lockdown: ['journalist', 'union', 'family', 'rival_corp'],
  purge: ['family', 'union', 'journalist', 'insurer'],
  quiet: ['family', 'insurer', 'journalist', 'quorum', 'salvage'],
};

// ── Contract generation ──────────────────────────────────────────────────────────────────────
export function makeContract(sim, site, opts = {}) {
  const career = opts.career || { rank: 1, credits: 0, marks: 0 };
  const seedString = `${sim.seed}|${site.id}|${Math.floor(sim.hours / 6)}|${opts.salt || 0}`;
  const r = rng(seedString);
  const sys = systemById(sim, site.sysId);
  // which situation is happening aboard — pushed around by the world's happenings
  const w = incidentWeights(sim, site.sysId, site.kind);
  // rookies get quieter work; operators get the purges
  const rankBias = { purge: 1 + career.rank * 0.18, lockdown: 1 + career.rank * 0.15, war_front: 1, deal: 1 + career.rank * 0.1, quiet: 1.6 - career.rank * 0.16, organism: 1 + career.rank * 0.12, mutiny: 1 + career.rank * 0.1, gas: 1, rogue: 1 + career.rank * 0.12 };
  for (const k in w) w[k] = Math.max(0.05, w[k] * (rankBias[k] ?? 1));
  let incidentId = r.weighted(w);
  if (opts.avoid && opts.avoid.has(incidentId)) {
    // the board should offer different kinds of bad day when it can
    const alt = { ...w };
    for (const k of opts.avoid) delete alt[k];
    if (Object.keys(alt).length) incidentId = r.weighted(alt);
  }
  const inc = INCIDENTS[incidentId];
  const jobDef = r.pick(inc.jobs);
  const payerKey = r.pick(PAYER_FOR_INCIDENT[incidentId]);
  const payerKind = PAYER_KINDS[payerKey];
  const locals = knownAt(sim, site.sysId).filter(p => !p.rival);
  const payer = locals.length && r.chance(0.55)
    ? { name: locals[0].handle(), role: payerKind.label, faction: locals[0].faction, person: locals[0].id, kind: payerKey, line: payerKind.line }
    : { name: 'a broker at the Exchange', role: payerKind.label, faction: payerKind.faction, kind: payerKey, line: payerKind.line };

  const danger = dangerAt(sim, site.sysId);
  const loot = lootAt(sim, site.sysId);
  const riskTrue = Math.max(0, Math.min(5, Math.round((danger * 1.5 + (inc.alien ? 0.8 : 0) + (incidentId === 'purge' || incidentId === 'lockdown' ? 0.7 : 0)) - 0.3)));
  const riskGuess = Math.max(1, Math.min(5, Math.round(riskTrue + r.range(-1.1, 1.1))));
  const base = 260 + riskTrue * 190 + career.rank * 120;
  const fee = Math.round((base * r.range(0.85, 1.25)) / 10) * 10;
  const bonus = jobDef.obj === 'rescue' ? Math.round(fee * 0.4) : Math.round(fee * 0.25);

  // hidden truth: what is actually aboard
  const crewCount = Math.round(r.range(3, 11) * (site.kind === 'outpost' ? 0.6 : 1) * (incidentId === 'quiet' ? 1.2 : 1));
  let hostileCount = 0;
  for (const k in inc.hostileMix) hostileCount += inc.hostileMix[k];
  hostileCount = Math.max(0, Math.round(hostileCount * r.range(0.8, 1.3)) + (career.rank >= 3 ? 1 : 0));
  const alien = r.chance(inc.alien);
  const rivalRisk = rivalChance(sim, career, { danger, loot, fee });

  const wants = wantsFor(jobDef);
  const contract = {
    id: `c${Math.abs(hashStr(seedString)) % 99999}`,
    seed: seedString,
    sysId: site.sysId, sysName: sys?.name || 'the rim',
    siteId: site.id, site: site.name, siteKind: site.kind, siteFaction: site.faction,
    kind: SITE_KINDS[site.kind].name,
    incidentId, incident: {
      id: incidentId, title: inc.title, tint: inc.tint,
      reason: inc.reason(sim, site),
      blurb: inc.blurb(sim, site),
      clock: inc.clock,
      mood: inc.mood,
    },
    job: {
      obj: jobDef.obj, short: jobDef.short, item: jobDef.item || null, n: jobDef.n || 1,
      long: jobDef.long(money(fee)),
      wants,
    },
    payer, fee, bonus,
    risk: riskGuess, riskTrue,
    truth: { crew: crewCount, hostiles: hostileCount, alien, danger, loot },
    crewHint: crewHintFor(incidentId, r),
    corp: FACTIONS[site.faction] ? FACTIONS[site.faction].short : 'the company',
    ai: r.pick(['SEXTANT', 'CAIRN', 'HALO-7', 'LANTERN', 'ORISON', 'WARDEN-2', 'TALLY', 'MERIT']),
    issued: sim.hours,
    expires: sim.hours + r.range(18, 60),
    tag: tagFor(sim, site, incidentId, r),
  };
  return contract;
}

function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h | 0; }

function wantsFor(job) {
  if (job.obj === 'item') return [{ id: job.item, n: 1 }];
  if (job.obj === 'rescue') return [];              // verified by bodies at the hatch
  return [];                                        // 'haul' is verified by value carried out
}

function rivalChance(sim, career, ctx) {
  const rank = career.rank || 0;
  let c = [0.04, 0.07, 0.1, 0.17, 0.24, 0.3][Math.min(5, rank)] ?? 0.3;
  c *= 1 + Math.max(0, ctx.danger - 1) * 0.5;
  c *= 1 + Math.max(0, ctx.loot - 1) * 0.4;
  c *= 1 + Math.min(1.2, (sim.player.heat || 0) * 0.28);
  c *= 1 + Math.min(0.6, ctx.fee / 6000);
  return Math.max(0, Math.min(0.55, c));
}

function crewHintFor(incidentId, r) {
  const hints = {
    deal: ['manifests are being rewritten in the port decks', 'two dock crews were paid in cash this week', 'somebody bought a case of custody tags'],
    rogue: ['the deck doors are answering to something else', 'the crew have stopped using the intercom', 'security units are patrolling a corridor they have no reason to patrol'],
    organism: ['they stopped taking calls, then they stopped taking them together', 'a specimen log has a correction on it', 'a delivery of specimen jars went out with too many'],
    gas: ['the vents are pulling the wrong way', 'a respirator order was topped up twice this month', 'the night shift asked for masks and got told no'],
    mutiny: ['the crew have split into two payrolls', 'somebody bought out a share of the ship last week', 'a complaint was filed and then withdrawn'],
    lockdown: ['the company recalled its own auditors', 'a courier arrived and did not leave', 'somebody has been buying silence in bulk'],
    purge: ['a burn order was filed on a Tuesday, which is where they hide them', 'the crew have booked passage out but not for all of them', 'a certified letter arrived at 04:00'],
    quiet: ['the hourly stopped at the same minute two days running', 'the shift roster has not changed in eleven days', 'nothing at all, which is the part that bothers me'],
  };
  return r.pick(hints[incidentId] || hints.quiet);
}

function tagFor(sim, site, incidentId, r) {
  const sys = systemById(sim, site.sysId);
  const hot = sys.happenings[0];
  if (hot && r.chance(0.7)) return `${hot.name}: ${hot.headline}`;
  return `${site.name} — ${r.pick(['no beacon', 'half a manifest', 'one survivor on the radio', 'payment on delivery', 'quiet since Tuesday'])}`;
}

// The board: what is on offer right now, given the world and the career.
export function contractBoard(sim, career, n = 4) {
  const r = rng((sim.seed ^ Math.floor(sim.hours / 6) ^ ((career.marks || 0) * 7919)) >>> 0);
  const pool = [];
  for (const sys of sim.systems) {
    const reach = 1;                                  // every system is flyable; distance costs time only
    for (const site of sys.sites) {
      if (site.drifting && r.chance(0.4)) continue;    // wrecks you cannot reach the airlock on
      let w = 1 * reach;
      w *= 1 + sys.happenings.length * 0.7;            // the world's problems are the jobs
      w *= 0.6 + sys.prosperity * 0.8;
      if (career.rank >= 3) w *= 1 + (1 - sys.law) * 0.6;
      else w *= 0.4 + sys.law * 0.8;                   // rookies get sent somewhere with a port close by
      pool.push({ site, w });
    }
  }
  const picked = [];
  let guard = 200;
  while (picked.length < n && guard-- > 0) {
    const table = {}; pool.forEach((p, i) => { table[i] = p.w; });
    const idx = +r.weighted(table);
    const entry = pool[idx];
    if (!entry) break;
    if (picked.some(p => p.site.id === entry.site.id)) { pool.splice(idx, 1); continue; }
    picked.push(entry);
  }
  const seen = new Set();
  return picked.map((p, i) => {
    const c = makeContract(sim, p.site, { career, salt: i, avoid: seen });
    seen.add(c.incidentId);
    return c;
  });
}

// ── The dive spec handed to gen.js, and the objective injection ──────────────────────────────
export function siteSpec(contract, career, seed) {
  const inc = INCIDENTS[contract.incidentId];
  const t = contract.truth;
  const r = rng((seed ^ 0x7a11) >>> 0);
  const size = SITE_KINDS[contract.siteKind].size;
  return {
    seed,
    kind: contract.siteKind,
    size,
    name: contract.site,
    faction: contract.siteFaction,
    incident: contract.incidentId,
    lootTier: Math.max(1, Math.min(4, Math.round(1 + contract.truth.loot + (career.rank || 0) * 0.25))),
    crewCount: t.crew,
    hostileCount: t.hostiles,
    alien: t.alien,
    vault: r.chance(inc.vault),
    power: true,
  };
}

// Clock lines are written per incident; some need to know who is burning the site.
export function clockWarn2(contract) {
  const c = contract.incident.clock;
  if (!c.warn2) return null;
  return typeof c.warn2 === 'function' ? c.warn2({ ai: contract.ai, corp: contract.corp }) : c.warn2;
}
export function clockWarn30(contract) {
  const c = contract.incident.clock;
  if (!c.warn30) return null;
  return typeof c.warn30 === 'function' ? c.warn30({ ai: contract.ai, corp: contract.corp }) : c.warn30;
}
export function clockDoom(contract) {
  const c = contract.incident.clock;
  const who = contract.corp, ai = contract.ai;
  const map = {
    vent: () => `${ai} vented the site with you still aboard.`,
    burn: () => `${who}'s sterilisation burn swept the decks with you still aboard.`,
    housing: () => 'The reactor housing gave way with you still aboard.',
    scuttle: () => `${who} scuttled the site with you still aboard.`,
    security: () => `${who} security found you in a corridor and you were not on the list of people who belong here.`,
    rival: () => 'The other crew took the case, sealed the hatch and left you on a dead hull.',
  };
  return (map[c.kind] || (() => 'Whatever was coming arrived, and you were still aboard.'))();
}

// Put the job item where it makes sense, so the objective is always findable and always diegetic.
const JOB_PLACEMENT = {
  evidence: ['office', 'portside', 'control', 'storage'],
  spicebrick: ['portside', 'freight', 'storage'],
  dataspool: ['server', 'control', 'office'],
  reactorcore: ['reactor', 'engineering'],
  biomatter: ['research', 'medical', 'storage'],
  blackbox: ['control', 'office', 'server'],
  guncase: ['storage', 'brig', 'barracks'],
  corpse: ['canteen', 'barracks', 'galley', 'medical'],
};

export function placeJobItem(site, contract, r) {
  const job = contract.job;
  if (job.obj !== 'item' || !site.containers || !site.containers.length) return null;
  const want = JOB_PLACEMENT[job.item] || ['storage', 'office', 'freight'];
  const scored = site.containers.map((c, i) => {
    const room = site.rooms[c.roomId] || site.rooms[0];
    const s = want.indexOf(room.kind) >= 0 ? 3 - want.indexOf(room.kind) * 0.4 : 0;
    return { c, i, s: s + (c.sealed ? -0.5 : 0) + r.range(0, 0.3) };
  }).sort((a, b) => b.s - a.s);
  const target = scored[0].c;
  target.contents = target.contents || [];
  target.contents.push({ id: job.item, n: 1, job: true });
  target.jobItem = job.item;
  return target;
}

// ── Reading a contract back to the player ────────────────────────────────────────────────────
export function contractLines(contract, sim) {
  const out = [];
  out.push({ k: 'site', v: `${contract.site} — ${contract.kind} in ${contract.sysName}` });
  out.push({ k: 'incident', v: contract.incident.title, tint: contract.incident.tint });
  out.push({ k: 'reason', v: `According to ${contract.payer.name}: ${contract.incident.reason}.` });
  out.push({ k: 'job', v: contract.job.short });
  out.push({ k: 'fee', v: money(contract.fee) });
  out.push({ k: 'clock', v: contract.incident.clock.name || 'no clock — nothing is coming to end it' });
  return out;
}

export function objectiveLine(contract) {
  const j = contract.job;
  if (j.obj === 'item') return `Bring out: ${itemName(j.item)}`;
  if (j.obj === 'rescue') return `Get ${j.n} survivor${j.n > 1 ? 's' : ''} to your hatch alive`;
  if (j.obj === 'haul') return `Carry out at least ${money(Math.round(contract.fee * 0.35))} of cargo`;
  return 'Do the job';
}

export function objectiveMet(contract, run) {
  const j = contract.job;
  if (j.obj === 'item') {
    if (j.item === 'body') return (run.bodiesOut || 0) >= 1 || (run.carried || []).some(it => it.id === 'corpse') || (run.banked || []).some(it => it.id === 'corpse');
    return (run.carried || []).some(it => it.id === j.item) || (run.banked || []).some(it => it.id === j.item);
  }
  if (j.obj === 'rescue') return (run.rescued || 0) >= j.n;
  if (j.obj === 'haul') return (run.haulValue || 0) >= Math.round(contract.fee * 0.35);
  return false;
}
