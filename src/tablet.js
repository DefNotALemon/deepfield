// tablet.js — the slab you carry. Contracts, the market, the Office, the wire, the hunter's book and
// everybody you have ever met. This is the only menu in the game and it belongs in your hands.

import { In } from './input.js';
import { money, clamp, stamp, andList } from './util.js';
import { ITEMS, TOOLS, GUNS, FACTIONS, COMMODITIES, itemName, itemKg, itemValue, SITE_KINDS, ROOM_LABEL } from './data.js';
import { priceAt, knownAt, newsSince, topRivals, rivalsAlive, systemById } from './sim.js';
import { RANKS, RANK_NOTES, rankName, rankProgress, quotaFor, hunterBook, gearTiers, buy, sellStash, commodityForItem } from './state.js';
import { objectiveLine, clockWarn2, INCIDENTS } from './contracts.js';
import * as A from './audio.js';

export class Tablet {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.open = null;
    this.selected = null;
    this.onOption = null;
    root.addEventListener('click', e => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      A.play('ui');
      this.action(t.dataset.act, t.dataset);
    });
    root.addEventListener('mousemove', () => {});
  }

  isOpen() { return !!this.open; }

  show(id, extra = {}) {
    this.open = id;
    this.extra = extra;
    const html = this['render_' + id] ? this['render_' + id](extra) : `<div class="pad"><h2>${id}</h2></div>`;
    this.root.innerHTML = html;
    this.root.classList.add('on');
    document.body.classList.add('tablet');
    this.app.modal = true;
  }

  hide() {
    this.open = null;
    this.root.innerHTML = '';
    this.root.classList.remove('on');
    document.body.classList.remove('tablet');
    this.app.modal = false;
  }

  toggle(id) { if (this.open === id) this.hide(); else this.show(id); }

  action(act, data) {
    const app = this.app, c = app.career, sim = c.sim;
    switch (act) {
      case 'close': this.hide(); break;
      case 'tab': this.show(data.tab); break;
      // ── contracts ──
      case 'pick': {
        const board = app.board || [];
        const ct = board[+data.i];
        if (!ct) break;
        this.selected = +data.i;
        app.contract = ct;
        A.play('coin');
        this.show('board');
        break;
      }
      case 'accept': {
        const fromPanel = this.selected != null ? (app.board || [])[this.selected] : app.board?.[+data.i];
        const ct = fromPanel || app.contract;
        if (!ct) break;
        app.contract = ct;
        this.hide();
        app.hud && app.hud.say(`Job taken: ${ct.site}. ${ct.kind} in ${ct.sysName}. Walk to the clamp and launch.`, 6);
        break;
      }
      case 'launch': this.hide(); app.launch && app.launch(); break;
      // ── market ──
      case 'sellall': {
        const r = sellStash(c, sim, c.homeSys);
        this.hide();
        app.hud && app.hud.say(r.total ? `Sold everything for ${money(r.total)}.` : 'Your stash is empty.', 4);
        this.show('market');
        break;
      }
      case 'sellone': {
        const id = data.id;
        const row = c.stash.find(s => s.id === id);
        if (!row) break;
        row.n--;
        const price = Math.round(((ITEMS[id]?.value) || 80) * 1.15);
        c.credits += price;
        if (row.n <= 0) c.stash.splice(c.stash.indexOf(row), 1);
        this.show('market');
        break;
      }
      case 'buygun': case 'buytool': {
        const kind = act === 'buygun' ? 'gun' : 'tool';
        const r = buy(c, kind, data.id);
        this.hide();
        app.hud && app.hud.say(r.ok ? `Bought ${itemName(data.id)} for ${money(r.price)}.` : `Cannot: ${r.why}.`, 4);
        this.show('market');
        break;
      }
      case 'equip': {
        const g = c.gear.guns.find(x => x.uid === data.uid);
        if (g) { c.gear.gun = g.uid; app.hud && app.hud.say(`${itemName(g.id)} in the holster.`, 3); }
        this.show('market');
        break;
      }
      case 'insurance': {
        const price = Math.round(600 + c.rank * 260);
        if (c.insurance) { app.hud && app.hud.say('You are already insured for the next death.', 3); break; }
        if (c.credits < price) { app.hud && app.hud.say(`Insurance is ${money(price)} and you do not have it.`, 4); break; }
        c.credits -= price; c.insurance = true;
        app.hud && app.hud.say('Insured. If you die out there, your gear comes back. Your haul will not.', 5);
        this.show('market');
        break;
      }
      // ── office ──
      case 'payquota': {
        const need = Math.max(0, c.quota.target - c.quota.paid);
        const pay = Math.min(need, Math.max(0, Math.floor(c.credits)));
        if (pay <= 0) { app.hud && app.hud.say('Nothing to pay with.', 3); break; }
        c.credits -= pay; c.quota.paid += pay;
        app.hud && app.hud.say(`Paid ${money(pay)} into the quota. ${money(Math.max(0, c.quota.target - c.quota.paid))} left this cycle.`, 5);
        this.show('office');
        break;
      }
      // ── the book (rank 3+) ──
      case 'hunt': {
        const book = app.bookCache || hunterBook(sim, c);
        const h = book[+data.i];
        if (!h) break;
        app.contract = app.hunterContract(h);
        this.hide();
        app.hud && app.hud.say(`Hunter contract: ${h.name} aboard ${h.siteName}. ${h.crew} guns. Walk to the clamp.`, 7);
        break;
      }
      // ── talk options ──
      case 'opt': {
        const i = +data.i;
        const opt = (this.extra && this.extra.options) ? this.extra.options[i] : null;
        const cb = this.onOption;
        this.hide();
        cb && opt && cb(opt);
        break;
      }
      case 'help': this.show('help'); break;
      default: break;
    }
  }

  header(title, tabs = true) {
    const c = this.app.career;
    return `<div class="thead"><span class="brand">DEEPFIELD</span><span class="who">${c.first}${c.nick ? ` "${c.nick}"` : ''} · ${rankName(c)} · ${money(c.credits)}</span></div>
      <div class="ttitle">${title}</div>
      ${tabs ? `<div class="tabs">
        <button data-act="tab" data-tab="board">Contracts</button>
        <button data-act="tab" data-tab="market">Exchange</button>
        <button data-act="tab" data-tab="office">The Office</button>
        <button data-act="tab" data-tab="news">Wire</button>
        <button data-act="tab" data-tab="people">People</button>
        <button data-act="tab" data-tab="book">Book</button>
        <button data-act="tab" data-tab="help">Controls</button>
        <button class="x" data-act="close">PUT AWAY</button>
      </div>` : ''}`;
  }

  // ── contracts ─────────────────────────────────────────────────────────────────────────────
  render_board() {
    const app = this.app, c = app.career, sim = c.sim;
    if (!app.board || !app.board.length) app.refreshBoard && app.refreshBoard();
    const board = app.board || [];
    const rows = board.map((ct, i) => {
      const sys = systemById(sim, ct.sysId);
      const hot = sys && sys.happenings[0];
      return `<div class="card ${this.selected === i ? 'sel' : ''}" data-act="pick" data-i="${i}">
        <div class="row"><b>${ct.site}</b><span class="tag">${ct.kind} · ${ct.sysName}</span></div>
        <div class="inc" style="--tint:${ct.incident.tint}">${ct.incident.title}</div>
        <div class="why">${ct.incident.reason[0].toUpperCase() + ct.incident.reason.slice(1)}.</div>
        <div class="blurb">${ct.incident.blurb}</div>
        <div class="row small">
          <span>Job: <b>${ct.job.short}</b></span><span>Fee: <b>${money(ct.fee)}</b>${ct.job.obj === 'rescue' ? ` +${money(ct.bonus)}/soul` : ''}</span>
        </div>
        <div class="row small"><span>Payer: ${ct.payer.name} (${ct.payer.role})</span><span>Clock: ${ct.incident.clock.name || 'none'}</span></div>
        <div class="row small"><span>Risk, as they rate it: ${'◆'.repeat(ct.risk)}${'◇'.repeat(Math.max(0, 5 - ct.risk))}</span><span class="hint">${ct.crewHint}</span></div>
        ${hot ? `<div class="hot">the world: ${hot.headline.toLowerCase()}</div>` : ''}
      </div>`;
    }).join('');
    const sel = this.selected != null ? board[this.selected] : app.contract;
    const detail = sel ? `
      <div class="detail">
        <h3>${sel.site} — ${sel.incident.title}</h3>
        <p class="brief">${sel.job.long}</p>
        <ul>
          <li><b>Where:</b> ${SITE_KINDS[sel.siteKind].blurb}, in ${sel.sysName}, owned by ${FACTIONS[sel.siteFaction]?.name || 'nobody'}</li>
          <li><b>Objective:</b> ${objectiveLine(sel)}</li>
          <li><b>If it goes wrong:</b> ${clockWarn2(sel) || 'nothing is coming to end it, which is its own problem'}</li>
          <li><b>What you have heard:</b> ${sel.crewHint}</li>
          ${hot2(sel) ? `<li><b>The world:</b> ${hot2(sel)}</li>` : ''}
        </ul>
        <div class="acc">
          <button class="go" data-act="accept">TAKE THE JOB</button>
          <span class="hint">${app.contract && app.contract.id === sel.id ? 'This is your current job — walk to the clamp and launch.' : 'Then walk to your ship and launch.'}</span>
        </div>
      </div>` : '<div class="detail"><p class="brief">Nothing on the board. Come back after the rim has had another bad week.</p></div>';
    return this.header('contract board') + `<div class="split"><div class="list">${rows}</div>${detail}</div>`;
  }

  // ── market ────────────────────────────────────────────────────────────────────────────────
  render_market() {
    const app = this.app, c = app.career, sim = c.sim;
    const sysId = c.homeSys;
    const tiers = gearTiers(c);
    const price = id => Math.round((itemValue(id) || 100) * 1.25);
    const stashRows = c.stash.length ? c.stash.map(s => `<div class="row small"><span>${s.n}× ${itemName(s.id)} (${itemKg(s.id)} kg)</span>
        <span>${money(Math.round((itemValue(s.id) || 80) * 0.9 * s.n))} <button data-act="sellone" data-id="${s.id}">SELL ONE</button></span></div>`).join('')
      : '<div class="row small">Your stash is empty. Everything you want money for has to be carried out of a bad place first.</div>';
    const guns = tiers.guns.map(id => {
      const owned = c.gear.guns.some(g => g.id === id);
      return `<div class="row small"><span>${itemName(id)} — ${itemKg(id)} kg${owned ? ' <i>(owned)</i>' : ''}</span>
        <span>${money(Math.round(itemValue(id) * 1.1))} <button data-act="buygun" data-id="${id}" ${owned ? 'disabled' : ''}>BUY</button></span></div>`;
    }).join('');
    const tools = tiers.tools.map(id => `<div class="row small"><span>${itemName(id)}${c.gear.tools[id] ? ' <i>(owned)</i>' : ''}</span>
        <span>${money(Math.round(itemValue(id) * 1.1))} <button data-act="buytool" data-id="${id}" ${c.gear.tools[id] ? 'disabled' : ''}>BUY</button></span></div>`).join('');
    const market = Object.keys(COMMODITIES).map(k => {
      const p = priceAt(sim, sysId, k);
      return `<div class="row small"><span>${COMMODITIES[k].name}</span><span>buy ${money(p.buy)} · sell ${money(p.sell)}</span></div>`;
    }).join('');
    const gunsOwned = c.gear.guns.map(g => `<div class="row small"><span>${itemName(g.id)} ${c.gear.gun === g.uid ? '<b>(in the holster)</b>' : ''}</span>
      <span><button data-act="equip" data-uid="${g.uid}" ${c.gear.gun === g.uid ? 'disabled' : ''}>CARRY THIS</button></span></div>`).join('');
    const insPrice = Math.round(600 + c.rank * 260);
    return this.header('the exchange') + `<div class="cols">
      <div class="col"><h3>Your stash — sell here</h3>${stashRows}
        <div class="acc"><button class="go" data-act="sellall">SELL EVERYTHING</button></div>
        <h3>In the yard</h3>${gunsOwned || '<div class="row small">You own no guns. That is a decision.</div>'}
        <h3>Insurance</h3><div class="row small"><span>${c.insurance ? 'Covered for the next death' : 'Gear recovery if you die (haul is never covered)'}</span>
          <span>${money(insPrice)} <button data-act="insurance" ${c.insurance ? 'disabled' : ''}>INSURE</button></span></div>
      </div>
      <div class="col"><h3>Guns you can carry at ${rankName(c)}</h3>${guns}
        <h3>Tools</h3>${tools}
        <h3>Prices at ${systemById(sim, sysId)?.name || 'the Waystop'}</h3>${market}
        <div class="row small hint">Prices move while you are away. A shortage somewhere else is a reason to fly there.</div>
      </div></div>`;
  }

  // ── office ────────────────────────────────────────────────────────────────────────────────
  render_office() {
    const c = this.app.career, sim = c.sim;
    const left = Math.max(0, c.quota.target - c.quota.paid);
    const pr = rankProgress(c);
    const runs = (c.runs || []).slice(0, 8).map(r => `<div class="row small">
        <span>${r.extracted ? '✔' : '✖'} ${r.site} — ${r.incident}</span>
        <span>${r.extracted ? money(r.value + r.fee) : 'nothing recovered'}</span></div>`).join('') || '<div class="row small">No dives yet.</div>';
    return this.header('the office') + `<div class="cols">
      <div class="col">
        <h3>Quota, cycle ${c.quota.cycle}</h3>
        <div class="row"><span>Paid</span><span><b>${money(c.quota.paid)}</b> of ${money(c.quota.target)}</span></div>
        <div class="bar"><div class="fill" style="width:${clamp(c.quota.paid / c.quota.target, 0, 1) * 100}%"></div></div>
        <div class="row small"><span>${c.quota.len - c.quota.used} dive${c.quota.len - c.quota.used === 1 ? '' : 's'} left this cycle</span><span>${left ? money(left) + ' short' : 'met'}</span></div>
        <div class="acc"><button class="go" data-act="payquota">PAY INTO THE QUOTA</button></div>
        <div class="row small hint">${c.handler.name}, ${c.handler.role}: "${c.handler.line}."</div>
        ${c.quota.missed ? `<div class="row small bad">You have come in short ${c.quota.missed} time${c.quota.missed === 1 ? '' : 's'}. The Office remembers arithmetic.</div>` : ''}
      </div>
      <div class="col">
        <h3>Standing</h3>
        <div class="row"><span>${rankName(c)}</span><span>${c.marks} marks</span></div>
        <div class="bar"><div class="fill" style="width:${pr.frac * 100}%"></div></div>
        <div class="row small"><span>${pr.next ? `next: ${pr.next} at ${pr.need} marks` : 'top of the ladder'}</span><span>${c.deaths} deaths · ${c.kills} kills · ${c.rescued} souls out</span></div>
        <div class="row small hint">${RANK_NOTES[c.rank]}</div>
        <h3>Recent work</h3>${runs}
      </div></div>`;
  }

  // ── the wire ──────────────────────────────────────────────────────────────────────────────
  render_news() {
    const sim = this.app.career.sim;
    const items = sim.news.slice(0, 40).map(n => {
      const sys = n.sysId ? systemById(sim, n.sysId) : null;
      return `<div class="row small ${n.tag}"><span class="when">${stamp(n.at)}</span>
        <span>${sys ? `<b>${sys.name}</b> — ` : ''}${n.text}</span></div>`;
    }).join('') || '<div class="row small">The wire is quiet, which has never once meant anything good.</div>';
    const hot = sim.happenings.slice(0, 8).map(hh => {
      const sys = systemById(sim, hh.sysId);
      return `<div class="row small"><span style="color:${hh.tint}"><b>${hh.name}</b></span><span>${sys ? sys.name : ''} — ends ${stamp(hh.ends)}</span></div>`;
    }).join('');
    return this.header('the wire') + `<div class="cols">
      <div class="col"><h3>What is happening out there</h3>${hot || '<div class="row small">Nothing structural. Just people.</div>'}
        <div class="row small hint">Everything on this list is a reason for the board to have work on it.</div></div>
      <div class="col"><h3>The wire</h3><div class="feed">${items}</div></div></div>`;
  }

  // ── people ────────────────────────────────────────────────────────────────────────────────
  render_people() {
    const sim = this.app.career.sim, c = this.app.career;
    const here = knownAt(sim, c.homeSys);
    const rivals = topRivals(sim, 6);
    const person = p => `<div class="card"><div class="row"><b>${p.handle ? p.handle() : p.name}</b><span class="tag">${p.role}${p.rival ? ` · ${p.tier}●` : ''}</span></div>
      <div class="row small"><span>${FACTIONS[p.faction]?.name || p.faction}</span><span>${p.rival ? `crew ${p.crew} · ${p.marks} marks taken` : `rapport ${p.rapport > 0 ? '+' : ''}${p.rapport}`}</span></div>
      ${(p.memory || []).slice(0, 3).map(m => `<div class="row small hint">${stamp(m.at)} — ${m.what}</div>`).join('')}
      ${p.rival && p.bounty ? `<div class="row small bad">there is ${money(p.bounty)} on a rimrunner matching your description</div>` : ''}</div>`;
    return this.header('who is who') + `<div class="cols">
      <div class="col"><h3>In this system</h3>${here.map(person).join('') || '<div class="row small">Nobody you know is here.</div>'}</div>
      <div class="col"><h3>Operators (the ones above you)</h3>${rivals.map(person).join('')}
        <div class="row small hint">${c.rank >= 3 ? 'At your rank you can take work that hunts them. The Book is on the board.' : 'You are below their notice. That will change if you keep bringing hauls out.'}</div></div></div>`;
  }

  // ── the hunter's book ─────────────────────────────────────────────────────────────────────
  render_book() {
    const c = this.app.career, sim = c.sim;
    if (c.rank < 3) {
      return this.header("the hunter's book") + `<div class="pad"><h3>Sealed</h3>
        <p class="brief">The book opens at Operator. People do not hire a Nobody to take an Operator apart — and an Operator does not let one close enough to try. ${c.marks} marks so far; you need 10 for Operator.</p>
        <p class="brief">Until then the top of the ladder will keep boarding your runs. Steal from them anyway. Take their guns off the deck and their cargo out of the airlock. The Book is only the formal version.</p></div>`;
    }
    const book = this.app.bookCache = hunterBook(sim, c);
    const rows = book.map((h, i) => `<div class="card"><div class="row"><b>${h.name}</b><span class="tag">tier ${h.tier} · ${h.crew} guns</span></div>
      <div class="row small"><span>${h.trueName} · ${h.gear}</span><span>fee ${money(h.fee)}${h.bounty ? ` + ${money(h.bounty)} bounty` : ''}</span></div>
      <div class="why">${h.why[0].toUpperCase() + h.why.slice(1)}.</div>
      <div class="blurb">${h.blurb}</div>
      <div class="row small hint">${h.note}</div>
      <div class="acc"><button class="go" data-act="hunt" data-i="${i}">BOARD THEIR RUN</button></div></div>`).join('')
      || '<div class="row small">Nobody is worth hunting this cycle. They will be back.</div>';
    return this.header("the hunter's book") + `<div class="list">${rows}</div>`;
  }

  // ── talk ──────────────────────────────────────────────────────────────────────────────────
  render_talk(extra = {}) {
    const npc = extra.npc || {}, res = extra.res || {};
    const opts = (res.options || []).map((o, i) => `<button data-act="opt" data-i="${i}">${o.label || o.act}</button>`).join('');
    return `<div class="pad talk">
      <h2>${npc.name || npc.handle || 'them'}</h2>
      <div class="said">${res.greeting || 'They look at you the way people look at bad weather.'}</div>
      <div class="opts">${opts || '<span class="hint">They have nothing more to say.</span>'}</div>
      <div class="acc"><button data-act="close">BACK AWAY</button></div>
    </div>`;
  }

  // ── results ───────────────────────────────────────────────────────────────────────────────
  render_results(extra = {}) {
    const r = extra.run || {}, s = extra.settle || {};
    const rows = (r.carried || []).map(it => `<div class="row small"><span>${it.n > 1 ? it.n + '× ' : ''}${itemName(it.id)}</span><span>${money(itemValue(it.id) * (it.n || 1))}</span></div>`).join('')
      || '<div class="row small">Nothing. You came back with empty hands.</div>';
    return `<div class="pad results">
      <h2>${r.extracted ? 'EXTRACTED' : 'YOU DID NOT COME BACK'}</h2>
      <div class="row small"><b>${r.site}</b> — ${r.sysName} · ${r.incidentTitle}</div>
      <div class="row small">${r.objective ? `<b>Job done:</b> ${r.objectiveShort}` : `<b>Job not done:</b> ${r.objectiveShort}`} ${r.reason ? `· ${r.reason}` : ''}</div>
      <h3>Carried out</h3>${rows}
      ${r.rescued ? `<div class="row small">${r.rescued} soul${r.rescued > 1 ? 's' : ''} walked off behind you: ${andList(r.rescuedNames || [])}</div>` : ''}
      ${r.rival ? `<div class="row small bad">${r.rival} was aboard for the same cargo.</div>` : ''}
      <h3>The Office</h3>
      ${(s.notes || []).map(n => `<div class="row small">${n}</div>`).join('')}
      <div class="row"><span>Net</span><span><b>${money(s.net || 0)}</b></span></div>
      <div class="row small hint">${r.died ? 'Everything you were carrying is still in there. Somebody will find it, and it may not be you.' : `${r.lootTaken} items lifted, ${r.kills} bodies, ${Math.round(r.time)} seconds inside.`}</div>
      <div class="acc"><button class="go" data-act="close">BACK TO THE YARD</button></div>
    </div>`;
  }

  // ── controls: generated from the live input scheme (never keyboard-only) ───────────────────
  render_help() {
    const L = a => In.label(a);
    const rows = [
      ['Move', `${L('forward')} ${L('left')} ${L('back')} ${L('right')}`],
      ['Look', In.scheme === 'kb' ? 'Mouse' : In.scheme === 'pad' ? 'Right stick' : 'Drag on the right half'],
      ['Sprint (loud)', L('sprint')], ['Crouch (quiet)', L('crouch')], ['Jump', L('jump')],
      ['Aim', L('aim')], ['Fire', L('fire')], ['Reload', L('reload')],
      ['Use / open / talk', L('interact')], ['Haul (duffel out)', L('bag')], ['Drop the last thing', L('drop')],
      ['Lamp', L('torch')], ['Tool (pinger)', L('tool')], ['Tablet', L('tablet')], ['Swap gun', L('swap')], ['Pause', L('back2')],
    ];
    return this.header('controls — showing ' + (In.scheme === 'kb' ? 'keyboard + mouse' : In.scheme === 'pad' ? `gamepad (${In.brand})` : 'touch')) +
      `<div class="cols"><div class="col">${rows.map(([k, v]) => `<div class="row small"><span>${k}</span><span><b>${v}</b></span></div>`).join('')}</div>
      <div class="col"><h3>How the run works</h3>
        <p class="brief">Everything you want off the site has to be carried: small things go in the duffel (unlimited pocket for chits, tags and chips), loot takes a slot, and heavy things take both hands — no gun, slower feet, louder boots.</p>
        <p class="brief">Sound is the sense everything shares. Crouching is nearly silent. Sprinting, gunfire and dropped cargo are not. The thing in the ducts hunts sound alone.</p>
        <p class="brief">The clock is real: whatever the incident is, it ends when the clock says so, with you aboard or not. The hatch is your ship's clamp — get back to it and extract.</p>
      </div></div>`;
  }
}

function hot2(ct) {
  const app = (globalThis.__df && globalThis.__df.app) || null;
  const sim = app ? app.career.sim : null;
  if (!sim) return null;
  const sys = sim.systems.find(s => s.id === ct.sysId);
  return sys && sys.happenings[0] ? sys.happenings[0].blurb : null;
}
