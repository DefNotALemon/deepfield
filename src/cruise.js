// cruise.js — the legs between the yard and the site. Space is where the rim gets to talk to you:
// hails, beacons that may or may not be real, Warden cutters, wreckage worth diverting for, and the
// news of what happened while you were in a corridor with your hands full.

import { rng, clamp, money, stamp, andList } from './util.js';
import { GUNS, ITEMS, TOOLS, FACTIONS, itemValue, itemName } from './data.js';
import { priceAt, knownAt, notice, pushNews, addHeat, incidentWeights, systemById, rivalsAlive } from './sim.js';
import * as A from './audio.js';

export class Cruise {
  constructor(app, contract) {
    this.app = app;
    this.career = app.career;
    this.contract = contract;
    this.rng = rng((app.career.seed ^ 0x2c07 ^ contract.id.length * 977) >>> 0);
    this.from = career_home(app.career);
    this.to = contract.sysId;
    this.hours = this.from === this.to ? this.rng.range(2, 5) : this.rng.range(9, 26);
    this.events = [];
    this.pending = null;
    this.t = 0;
    this.nextAt = this.rng.range(4, 9);
    this.line = [];
    this.done = false;
    this.scar = 0;
    this.bonus = 0;
    this.stashAdd = [];
  }

  start() {
    const sim = this.career.sim;
    // the world moves while you fly — this is the only reason space is worth showing
    const before = sim.hours;
    this.tickHours = Math.round(this.hours * 0.5);
    // build the itinerary before flying so the trip has a shape
    const pool = ['news', 'news', 'hail', 'beacon', 'cutter', 'wreck', 'known'];
    if (this.career.sim.player.heat > 1.2) pool.push('cutter', 'cutter');
    if (rivalsAlive(sim).length) pool.push('hail');
    const n = this.rng.int(2, 4);
    for (let i = 0; i < n; i++) this.events.push(this.rng.pick(pool));
    this.push(`Clamp released. ${this.hours > 12 ? 'Long leg' : 'Short hop'} to ${systemById(sim, this.to)?.name || 'the site'} — ${this.hours.toFixed(0)} hours of nothing but the drive.`);
    A.ambience('hull');
    A.play('clamp');
    this.render();
    return this;
  }

  push(line, kind = '') { this.line.push({ line, kind }); }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    if (this.pending) return;                     // waiting on a decision
    if (this.t >= this.nextAt) {
      this.t = 0; this.nextAt = this.rng.range(5, 11);
      const kind = this.events.shift();
      const sim = this.career.sim;
      const hours = this.tickHours / Math.max(1, this.events.length + 1);
      this.app.advanceSim && this.app.advanceSim(hours);
      if (!kind) { this.push(this.newsLine(), 'news'); this.render(); if (!this.events.length) this.arrive(); return; }
      this.pending = this.buildEvent(kind);
      this.render();
      A.stinger('alert');
    }
    if (this.t > 30 && !this.events.length && !this.pending) this.arrive();
  }

  newsLine() {
    const sim = this.career.sim;
    const recent = sim.news.filter(n => n.at > sim.hours - 40);
    if (!recent.length) return 'The wire is empty. You fly through somebody else\'s quiet.';
    const n = this.rng.pick(recent);
    const sys = n.sysId ? systemById(sim, n.sysId) : null;
    return `Wire: ${sys ? sys.name + ' — ' : ''}${n.text}`;
  }

  // ── events ───────────────────────────────────────────────────────────────────────────────
  buildEvent(kind) {
    const sim = this.career.sim, c = this.career;
    const r = this.rng;
    const here = knownAt(sim, this.to);
    switch (kind) {
      case 'news': {
        const sys = systemById(sim, this.to);
        const hot = sys?.happenings[0];
        if (hot) return {
          title: hot.headline, text: hot.blurb,
          options: [
            { label: `Stay on course`, act: 'resolve', say: 'You keep the drive lit and file it under somebody else\'s problem.' },
            { label: `Slow down and listen to the traffic`, act: 'resolve', say: 'Half a shift of dock chatter: names, numbers, and two people arguing about a crate.' },
          ],
        };
        return { title: 'Nothing new', text: 'The wire repeats itself. Freight is short, prices are high, and somebody is owed money in every port you pass.', options: [{ label: 'Fly on', act: 'resolve', say: 'You fly on.' }] };
      }
      case 'hail': {
        const rv = rivalsAlive(sim).length ? r.pick(rivalsAlive(sim)) : null;
        if (!rv) return this.buildEvent('news');
        const toll = Math.round(120 + rv.tier * 90 + c.credits * 0.04);
        return {
          title: `${rv.alias} is on the channel`,
          text: `${rv.alias} — ${rv.tier}●, ${rv.crew} crew, flying ${rv.shipName} — opens a channel without announcing purpose. "Rimrunner. You are carrying something I want, or you will be. ${toll} cr to not have a problem today."`,
          options: [
            { label: `Pay the toll (${money(toll)})`, act: 'pay', toll, rv: rv.id, say: 'Credits move. They do not thank you. They log you as somebody who pays.' },
            { label: 'Refuse and keep flying', act: 'refuse', rv: rv.id, say: 'You kill the channel. Something follows you for an hour, then stops.' },
            { label: 'Threaten them back', act: 'threaten', rv: rv.id, say: 'You tell them what you lifted out of your last site. There is a long silence.' },
          ],
        };
      }
      case 'beacon': {
        const real = r.chance(0.55);
        const sysName = systemById(sim, this.to)?.name || 'this system';
        return real ? {
          title: 'Distress beacon',
          text: `A union transponder is squawking ${r.int(2, 9)} hours off your lane: a hauler with a cracked drive and four souls aboard, going nowhere. Their air is fine. Their money is better than their luck.`,
          options: [
            { label: 'Divert and help them', act: 'help', say: 'Four hours of work with a torch. They pay what they have and remember your hull.' },
            { label: 'Log it for the patrol and fly on', act: 'log', say: 'You file the position. Somebody will get there. Probably.' },
          ],
        } : {
          title: 'Distress beacon (thin)',
          text: `A beacon off the lane, squawking too steadily. No engine noise behind it. No transponder history. ${r.chance(0.5) ? 'And the hull signature is bigger than the voice claims.' : 'And the same beacon went quiet two days ago, in another system.'}`,
          options: [
            { label: 'Divert anyway — could be real', act: 'ambush', say: 'It was not real. Pirates, or somebody dressed as pirates — you leave with holes in the hull and a story.' },
            { label: 'Ignore it', act: 'resolve', say: 'You leave the beacon talking to itself.' },
          ],
        };
      }
      case 'cutter': {
        return {
          title: 'Warden cutter on approach',
          text: `${FACTIONS.wardens.name} have a cutter on your transponder and they want a look at your hold and your manifest. ${c.sim.player.heat > 1 ? 'You are already on a list somewhere.' : 'You are not on any list yet.'}`,
          options: [
            { label: 'Comply — let them look', act: 'comply', say: 'Two hours, a bad-tempered inspector, and a small handling fee.' },
            { label: 'Bribe the inspector', act: 'bribe', say: 'The manifest gets lighter and so does your wallet. The inspector never saw you.' },
            { label: 'Run dark through the belt', act: 'run', say: 'You cut the transponder and thread the rocks. It works, and it goes on the record as a transponder gap.' },
          ],
        };
      }
      case 'wreck': {
        const loot = r.pick(['optic', 'bergson', 'dataspool', 'hymncrystal', 'coilspool', 'medkit']);
        return {
          title: 'Wreckage on the drift',
          text: `A hull came apart here sometime in the last decade and the pieces are still moving. One hold is intact enough to read, and there is something in it that has no business on a wreck: ${itemName(loot).toLowerCase()}.`,
          options: [
            { label: 'Go across and take it', act: 'wreck', loot, say: 'You EVA across with a torch. It takes an hour and you come back heavier.' },
            { label: 'Leave it — wrecks are wrecks for a reason', act: 'resolve', say: 'You leave it drifting, and think about it for the rest of the leg.' },
          ],
        };
      }
      case 'known': {
        if (!here.length) return this.buildEvent('news');
        const p = r.pick(here);
        const good = p.rapport >= 2;
        return {
          title: `${p.handle ? p.handle() : p.name} calls`,
          text: good
            ? `${p.handle ? p.handle() : p.name} rings you up: "${r.pick(['You left the last job neat. I owe you a lead.', 'A buyer asked for you by description. I told them what you are like.', 'I have a name for you: somebody is moving cargo they should not. Do not make it obvious.'])}"`
            : `${p.handle ? p.handle() : p.name} rings you up: "${r.pick(['I have not forgotten the last time.', 'Do not come back to this port for a while.', 'You owe somebody money and it is not me. Yet.'])}"`,
          options: [
            { label: 'Take the lead', act: 'lead', who: p.id, say: 'They talk for a while. One of the things they say is worth money.' },
            { label: 'Say nothing and hang up', act: 'resolve', say: 'You let the channel go quiet.' },
          ],
        };
      }
      default: return this.buildEvent('news');
    }
  }

  choose(i) {
    const e = this.pending;
    if (!e) return;
    const opt = e.options[i];
    this.pending = null;
    const sim = this.career.sim, c = this.career;
    const line = (s) => { this.push(s, 'said'); };
    switch (opt.act) {
      case 'pay': {
        const toll = Math.min(opt.toll, c.credits);
        c.credits -= toll;
        const rv = sim.known.find(p => p.id === opt.rv);
        if (rv) { notice(sim, rv, 'paid a toll without a fight', 1); rv.bounty = Math.max(0, (rv.bounty || 0) - 200); }
        line(opt.say);
        break;
      }
      case 'refuse': {
        const rv = sim.known.find(p => p.id === opt.rv);
        if (rv) notice(sim, rv, 'refused a toll and kept flying', -1);
        if (this.rng.chance(0.35)) { this.scar += 12; line('They put two rounds through your cargo hold on the way past. Nothing critical. Nothing that will not be asked about at the yard.'); }
        else line(opt.say);
        break;
      }
      case 'threaten': {
        const rv = sim.known.find(p => p.id === opt.rv);
        if (rv) notice(sim, rv, 'threatened them on an open channel', -2);
        line('They cut the channel and did not answer again. That is either respect or a note being written.');
        break;
      }
      case 'help': {
        const pay = this.rng.int(180, 520);
        c.credits += pay;
        const rv = this.rng.pick(sim.known);
        if (rv) notice(sim, rv, 'pulled a union crew off a dead drive', 3);
        pushNews(sim, this.to, 'A hauler everyone had written off made it to port with four crew alive, towed by a rimrunner.', 'player');
        line(`Four hours with a torch in your hands and cold in your knees. They scrape together ${money(pay)} and one of them writes your handle on their arm so they do not forget it.`);
        A.stinger('good');
        break;
      }
      case 'log': {
        line(opt.say);
        break;
      }
      case 'ambush': {
        this.scar += this.rng.int(18, 34);
        this.lostCargo = true;
        const rv = this.rng.pick(rivalsAlive(sim).concat(sim.known));
        if (rv) notice(sim, rv, 'ran an ambush on a rimrunner who answered a fake beacon', -2);
        line('It was a trap dressed as a beacon. You come out of it with the hull opened in two places and nothing else to show for six hours.');
        A.stinger('bad');
        break;
      }
      case 'comply': {
        const fee = this.rng.int(60, 200);
        c.credits = Math.max(0, c.credits - fee);
        addHeat(sim, -0.3);
        line(`Two hours parked while an inspector looks at every crate you own. ${money(fee)} in handling fees and a lecture about documented cargo.`);
        break;
      }
      case 'bribe': {
        const fee = this.rng.int(240, 620);
        c.credits = Math.max(0, c.credits - fee);
        addHeat(sim, -0.6);
        const rv = this.rng.pick(sim.known);
        if (rv) notice(sim, rv, 'bought an inspector', -1);
        line(`${money(fee)} moves from your hand to theirs. The manifest is suddenly complete and correct.`);
        break;
      }
      case 'run': {
        addHeat(sim, 0.7);
        this.scar += this.rng.int(0, 12);
        line('You cut the transponder and thread the belt for four hours at a speed you would not do with passengers. They lose you. You are on a list now.');
        break;
      }
      case 'wreck': {
        this.stashAdd.push(opt.loot);
        line(`You come back with ${itemName(opt.loot).toLowerCase()} and cold hands. The yard will pay for it and ask nothing.`);
        A.play('coin');
        break;
      }
      case 'lead': {
        const p = sim.known.find(x => x.id === opt.who);
        if (p) notice(sim, p, 'took a lead and used it', 1);
        const rows = Object.keys(incidentWeights(sim, this.to, this.contract.siteKind));
        line(`They talk for twenty minutes. Buried in it: ${this.rng.pick([
          'the site you are flying to has a second way in that is not on any deck plan',
          'the payer has already sent somebody else, and that somebody has their own arrangement',
          'the cargo they asked you for is not what the manifest says it is',
          'the clock on your contract is not the only one running',
        ])}`);
        this.insight = true;
        break;
      }
      default: line(opt.say || '');
    }
    // add any loot the leg produced to the stash
    if (this.stashAdd.length) {
      for (const id of this.stashAdd) {
        const row = c.stash.find(s => s.id === id);
        if (row) row.n++; else c.stash.push({ id, n: 1 });
      }
      this.stashAdd = [];
    }
    this.render();
    if (!this.events.length && this.t > 2) this.arrive();
  }

  arrive() {
    if (this.done) return;
    this.done = true;
    this.push(`Approach: ${this.contract.site}. ${this.contract.kind}, ${systemById(this.career.sim, this.to)?.name}. Their transponder is not answering, and the hull reads as lit.`, 'arrive');
    A.play('clamp');
    this.render(true);
    setTimeout(() => this.app.enterDive && this.app.enterDive(this), 2200);
  }

  render(final = false) {
    const el = document.getElementById('cruise');
    if (!el) return;
    const rows = this.line.slice(-14).map(l => `<div class="crow ${l.kind}">${l.line}</div>`).join('');
    const ev = this.pending ? `
      <div class="cevent">
        <h3>${this.pending.title}</h3>
        <p>${this.pending.text}</p>
        <div class="cops">${this.pending.options.map((o, i) => `<button data-cruise="${i}">${o.label}</button>`).join('')}</div>
      </div>` : `<div class="cskip"><button data-cruise="skip">${final ? 'arriving…' : 'ride the rest in silence'}</button></div>`;
    el.innerHTML = `
      <div class="cabin">
        <div class="stars"></div>
        <div class="dash">
          <div class="leg"><span>DEEPFIELD</span><span>${systemById(this.career.sim, this.from)?.name || 'the yard'} → ${systemById(this.career.sim, this.to)?.name || 'the site'}</span>
          <span>${stamp(this.career.sim.hours)}</span><span>${money(this.career.credits)}</span></div>
          <div class="feed">${rows}</div>
          ${ev}
        </div>
      </div>`;
    el.classList.add('on');
    el.querySelectorAll('button[data-cruise]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.cruise;
      if (v === 'skip') { this.events.length = 0; this.pending = null; this.arrive(); }
      else this.choose(+v);
    }));
  }

  finish() {
    const el = document.getElementById('cruise');
    if (el) { el.classList.remove('on'); el.innerHTML = ''; }
    A.stopAmbience();
    return { scar: this.scar, hours: this.hours, insight: !!this.insight };
  }
}

function career_home(career) { return career.homeSys || 'waypost'; }
