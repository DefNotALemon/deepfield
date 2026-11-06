// state.js — the career: who you are, what you own, what the Office wants from you this cycle, and
// the climb up the ladder that ends with you being the one who shows up to take somebody else's haul.
// Pure data + localStorage. No three.js, no DOM.

import { rng, clamp, money, andList } from './util.js';
import { FIRST, LAST, NICKNAME, GUNS, TOOLS, ITEMS, COMMODITIES, FACTIONS } from './data.js';
import { newGalaxy, tick, serialize, deserialize, fame, pushNews, addHeat, priceAt, rivalsAlive, notice } from './sim.js';

export const KEY = 'deepfield_career_v1';
export const RANKS = ['Nobody', 'Runner', 'Hand', 'Operator', 'Shot-caller', 'Name'];
export const RANK_AT = [0, 2, 5, 10, 16, 24];       // verified marks needed for each rank
export const RANK_NOTES = [
  'you are cargo with opinions. Rivals step over you.',
  'you are known at one port by one dock hand. Rivals are still a rumour.',
  'you have brought hauls out of places that had no survivors. Somebody is watching your transponder.',
  'you can take work that hunts people. Rivals will start arriving to take yours.',
  'your name gets used as a warning in bars. Rival crews dock on your runs for the gear.',
  'you are the story other rimrunners tell. Rivals come for the name and leave with nothing.',
];

export function newCareer(seedInput) {
  const seed = typeof seedInput === 'number' ? seedInput : Math.floor(Math.random() * 0x7fffffff);
  const r = rng(seed ^ 0xdead);
  const first = r.pick(FIRST), last = r.pick(LAST);
  const nick = r.chance(0.5) ? r.pick(NICKNAME) : null;
  const career = {
    v: 1, seed, first, last, nick,
    homeSys: 'waypost',
    handler: {
      name: `${r.pick(FIRST)} ${r.pick(LAST)}`, role: r.pick(['contract clerk', 'loss adjuster', 'dispatcher', 'acquisitions']),
      line: r.pick(['your numbers are the only part of you the Office has filed', 'do not make me explain a chargeback to the Office', 'the Office is not sentimental and neither am I']),
    },
    credits: 420, rank: 0, marks: 0, xp: 0, dives: 0, deaths: 0, kills: 0, rescued: 0, handed: 0,
    quota: { target: quotaFor(0), paid: 0, cycle: 1, len: 3, used: 0, missed: 0 },
    gear: {
      guns: [{ id: 'pistol', uid: 'g1', mag: GUNS.pistol.mag, ammo: GUNS.pistol.mag }],
      gun: 'g1',
      tools: { flashlight: true, scanner: false, welder: false, spike: false, sling: false },
      bagSlots: 5, suit: 'standard',
    },
    stash: [{ id: 'chit', n: 1 }],
    insurance: false, heat: 0,
    runs: [], log: [],
    sim: newGalaxy(seed),
    found: {},
  };
  return career;
}

export function quotaFor(rank) { return 1200 + rank * 750; }

export function handleFor(c) { return c.nick ? `${c.first} "${c.nick}"` : `${c.first} ${c.last}`; }
export function rankName(c) { return RANKS[clamp(c.rank, 0, 5)]; }
export function rankProgress(c) {
  const at = RANK_AT[clamp(c.rank, 0, 5)];
  const next = RANK_AT[clamp(c.rank + 1, 0, 5)];
  if (c.rank >= 5) return { have: c.marks, need: c.marks, next: null, frac: 1 };
  return { have: c.marks - at, need: next - at, next: RANKS[c.rank + 1], frac: clamp((c.marks - at) / (next - at), 0, 1) };
}

// The ladder: marks are verified hauls and jobs finished, not kills.
export function award(career, run, sim) {
  const notes = [];
  const marks = [];
  if (run.extracted) marks.push({ what: 'haul brought out of ' + run.site, m: 1 });
  if (run.objective) marks.push({ what: 'contract completed: ' + run.objectiveShort, m: 1 });
  if (run.rescued >= 2) marks.push({ what: `${run.rescued} souls brought out alive`, m: 1 });
  if (run.kills >= 4) marks.push({ what: 'a site cleared the hard way', m: 0 });
  career.marks += marks.reduce((a, b) => a + b.m, 0);
  career.xp += run.xp || 0;
  const before = career.rank;
  while (career.rank < 5 && career.marks >= RANK_AT[career.rank + 1]) career.rank++;
  if (career.rank > before) {
    notes.push(`You are an ${rankName(career)} now. ${RANK_NOTES[career.rank]}`);
    if (career.rank === 3) notes.push('The hunter\'s book is open: at the Waystop you can now take work that hunts other operators, and rivals will start arriving on yours.');
    fame(sim, career);
  }
  return { marks, notes };
}

// What the climber needs to be dangerous: gear quality gated by rank, and the fee to match.
export function gearTiers(career) {
  const t = career.rank;
  return {
    guns: [
      { id: 'pistol', at: 0 }, { id: 'rivetgun', at: 0 }, { id: 'smg', at: 1 },
      { id: 'shotgun', at: 2 }, { id: 'rifle', at: 3 },
    ].filter(g => g.at <= t).map(g => g.id),
    tools: ['flashlight', 'scanner', 'welder', 'spike', 'sling'],
    bagSlots: [5, 6, 7, 8, 9, 10][clamp(t, 0, 5)],
  };
}

export function buy(career, kind, id) {
  const table = kind === 'gun' ? GUNS : kind === 'tool' ? TOOLS : ITEMS;
  const item = table[id];
  if (!item) return { ok: false, why: 'no such thing on the shelf' };
  const price = Math.round((item.value || 100) * (kind === 'loot' ? 1.25 : 1.1));
  if (career.credits < price) return { ok: false, why: `you are ${money(price - career.credits)} short` };
  career.credits -= price;
  if (kind === 'gun') {
    const uid = 'g' + (career.gear.guns.length + 1) + '_' + Math.floor(Math.random() * 999);
    career.gear.guns.push({ id, uid, mag: table[id].mag, ammo: table[id].mag });
    if (!career.gear.gun) career.gear.gun = uid;
  } else if (kind === 'tool') {
    career.gear.tools[id] = true;
  } else {
    addToStash(career, id, 1);
  }
  return { ok: true, price };
}

export function addToStash(career, id, n = 1) {
  const row = career.stash.find(s => s.id === id);
  if (row) row.n += n; else career.stash.push({ id, n });
}

export function sellStash(career, sim, sysId) {
  let total = 0; const lines = [];
  for (const row of career.stash.slice()) {
    const c = commodityForItem(row.id);
    if (!c) { const v = (ITEMS[row.id]?.value || 40) * 0.9 * row.n; total += v; lines.push(`${row.n}× ${ITEMS[row.id]?.name || row.id} — ${money(v)}`); }
    else { const p = priceAt(sim, sysId, c); const v = p.sell * row.n * (c === 'spice' ? 3 : 6); total += v; lines.push(`${row.n}× ${COMMODITIES[c].name} — ${money(v)}`); }
  }
  career.stash = [];
  career.credits += Math.round(total);
  return { total: Math.round(total), lines };
}

// Which market commodity an item feeds (so loot sells into the prices the sim moves around)
export function commodityForItem(id) {
  return {
    coilspool: 'parts', servo: 'parts', carchip: 'electronics', optic: 'optics', bergson: 'electronics',
    dataspool: 'data', spicebrick: 'spice', medkit: 'meds', respirator: 'meds', biomatter: 'meds',
    hymncrystal: 'crystal', whisperstone: 'crystal', reactorcore: 'fuel',
  }[id] || null;
}

export function save(career) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...career, sim: serialize(career.sim) })); return true; }
  catch (e) { return false; }
}
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    data.sim = deserialize(data.sim);
    return data;
  } catch (e) { return null; }
}
export function clear() { try { localStorage.removeItem(KEY); } catch {} }

// ── Settling up at the Office ────────────────────────────────────────────────────────────────
// Every dive ends here: the fee, the haul, the wages, the quota, and what the Office thinks of you.
export function settle(career, run, sim) {
  const notes = [];
  let gross = 0;
  // 1. the contract fee
  if (run.objective) { gross += run.fee || 0; notes.push(`Contract fee from ${run.payer}: ${money(run.fee)}`); }
  else if (run.extracted) notes.push(`${run.payer} does not pay for a job they cannot see finished. No fee.`);
  // 2. the haul (sold at the port you came back to)
  const haulValue = Math.round(run.haulValue || 0);
  gross += haulValue;
  if (haulValue > 0) notes.push(`Haul sold into ${sim.systems.find(s => s.id === career.homeSys)?.name || 'port'}: ${money(haulValue)}`);
  // 3. running costs
  const repair = Math.round(40 + (run.damage || 0) * 30);
  const resupply = Math.round(30 + (run.shots || 0) * 0.6);
  const medical = run.hurt > 0.5 ? Math.round(run.hurt * 120) : 0;
  const total = repair + resupply + medical;
  if (total) notes.push(`Repair, resupply and patchwork: ${money(total)}`);
  const net = gross - total;
  career.credits += net;
  if (net < 0 && career.credits < 0) { career.credits = 0; notes.push('The Office carried the shortfall and wrote it in a column with your name at the top.'); }
  // 4. the quota
  career.quota.paid += Math.max(0, run.quotaPaid || 0);
  career.quota.used++;
  career.dives++;
  if (run.extracted) career.handed++;
  if (run.died) career.deaths++;
  career.kills += run.kills || 0;
  career.rescued += run.rescued || 0;
  if (career.quota.used >= career.quota.len) {
    if (career.quota.paid < career.quota.target) {
      const short = career.quota.target - career.quota.paid;
      career.quota.missed++;
      const seized = career.stash.splice(0, career.stash.length);
      if (seized.length) notes.push(`The Office was ${money(short)} short of quota and took the ${seized.length} item${seized.length > 1 ? 's' : ''} in your stash instead.`);
      else notes.push(`The Office was ${money(short)} short of quota. There was nothing left to take, so they took it out of your standing.`);
      career.marks = Math.max(0, career.marks - 1);
      addHeat(sim, 0.2);
      pushNews(sim, career.homeSys, `A rimrunner at ${sim.systems.find(s => s.id === career.homeSys).name} came in under quota and the Office filed it loudly.`);
      if (career.rank > 0 && career.quota.missed >= 2) { career.rank--; notes.push(`They have moved you back to ${rankName(career)}.`); }
    } else {
      const over = career.quota.paid - career.quota.target;
      const bonus = Math.round(career.quota.target * 0.15 + Math.min(600, over * 0.05));
      career.credits += bonus;
      notes.push(`Quota met. The Office paid a completion bonus of ${money(bonus)} and did not thank you.`);
      career.marks++;
    }
    career.quota = { target: quotaFor(career.rank), paid: 0, cycle: career.quota.cycle + 1, len: 3, used: 0, missed: career.quota.missed };
    notes.push(`New cycle: ${money(career.quota.target)} to the Office in three dives.`);
  } else {
    notes.push(`That is ${money(career.quota.paid)} of a ${money(career.quota.target)} quota with ${career.quota.len - career.quota.used} dive${career.quota.len - career.quota.used === 1 ? '' : 's'} left in the cycle.`);
  }
  // 4b. the yard hears about a death (the site itself has already filed what was taken or lost)
  if (run.died) {
    const lostDesc = (run.carried || []).length ? `${run.carried.length} item${run.carried.length === 1 ? '' : 's'} (${(run.carried || []).reduce((a, r) => a + (r.n || 1), 0)} unit${(run.carried || []).reduce((a, r) => a + (r.n || 1), 0) === 1 ? '' : 's'})` : 'nothing';
    pushNews(sim, career.homeSys, `A rimrunner died aboard ${run.site} and their gear is still in there: ${lostDesc}.`, 'aftermath');
  }
  // 5. insurance
  if (run.died) {
    if (career.insurance) {
      career.insurance = false;
      notes.push('Insurance paid out: your gear was recovered from the site by somebody else and posted back to you. The haul was not.');
    } else {
      const lost = career.gear.guns.slice(1);
      if (lost.length) { career.gear.guns = career.gear.guns.slice(0, 1); notes.push(`Gear not insured: ${lost.length} gun${lost.length > 1 ? 's were' : ' was'} entered into the site's manifest as lost property.`); }
      notes.push('Your gear is still aboard, in the hands of whoever finds it first.');
    }
  }
  career.runs.unshift({ at: sim.hours, site: run.site, sys: run.sysName, extracted: !!run.extracted, died: !!run.died, value: haulValue, fee: run.fee || 0, objective: !!run.objective, incident: run.incidentTitle });
  if (career.runs.length > 40) career.runs.length = 40;
  return { gross, net, notes, repair, resupply, medical };
}

// Called at the hub: time passes while you are off the board, so the world moves on.
export function advanceWorld(career, hours) {
  tick(career.sim, hours);
  career.heat = career.sim.player.heat;
  save(career);
}

// ── The hunter's book (rank 3+): work that hunts other operators ───────────────────────────────
export function hunterBook(sim, career) {
  if (career.rank < 3) return [];
  const r = rng((sim.seed ^ 0x9b ^ Math.floor(sim.hours / 12)) >>> 0);
  const rivals = rivalsAlive(sim).slice().sort((a, b) => b.tier - a.tier);
  return rivals.slice(0, 5).map(rv => {
    const sys = sim.systems.find(s => s.id === rv.where) || sim.systems[0];
    const site = sys.sites[0];
    const fee = 900 + rv.tier * 700 + rv.marks * 60;
    return {
      id: 'h' + rv.id, rival: rv.id, name: rv.alias, trueName: rv.name,
      sysId: sys.id, sysName: sys.name, siteId: site.id, siteName: site.name, siteKind: site.kind,
      crew: rv.crew, tier: rv.tier, gear: rv.gear, fee,
      bounty: rv.bounty || 0,
      why: r.pick([
        'took a hull off a union crew and left them on a dead deck',
        'sold a manifest to two buyers and let them settle it',
        'killed a broker who owed everybody money',
        'has been working the same corridor and paying nobody',
      ]),
      blurb: `They are aboard ${site.name} in ${sys.name} for a few hours, working it. ${rv.crew} hired guns, and they will not expect a rimrunner with your record.`,
      note: 'You can take their gear, their cargo and their standing. You cannot take their name unless you finish them yourself.',
    };
  });
}
