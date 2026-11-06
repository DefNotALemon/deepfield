// hud.js — everything you read while you are inside somebody else's bad day.
// Deliberately thin: the site, the crew and the loot are the interface. This shows the clock, what
// your hands are doing, what you are carrying, and what just made that noise.

import { In } from './input.js';
import { money, clamp } from './util.js';
import { itemName, ITEMS } from './data.js';

const el = (tag, cls, parent, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
};

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = '';
    this.state = {};
    // crosshair
    this.cross = el('div', 'cross', root);
    this.crossDot = el('div', 'dot', this.cross);
    this.hitmark = el('div', 'hitmark', root);
    this.hoverTag = el('div', 'hovertag', root);
    // top left: the job
    this.job = el('div', 'job', root);
    this.jobTitle = el('div', 'jt', this.job);
    this.jobObj = el('div', 'jo', this.job);
    this.jobSite = el('div', 'js', this.job);
    // top right: the clock and the incident
    this.clock = el('div', 'clock', root);
    this.clockName = el('div', 'cn', this.clock);
    this.clockTime = el('div', 'ct', this.clock);
    // bottom left: body
    this.body = el('div', 'body', root);
    this.hpBar = el('div', 'bar hp', this.body);
    this.hpFill = el('div', 'fill', this.hpBar);
    this.stBar = el('div', 'bar st', this.body);
    this.stFill = el('div', 'fill', this.stBar);
    this.noiseBar = el('div', 'bar nz', this.body);
    this.noiseFill = el('div', 'fill', this.noiseBar);
    // bottom right: haul
    this.haul = el('div', 'haul', root);
    this.haulKg = el('div', 'hk', this.haul);
    this.haulList = el('div', 'hl', this.haul);
    // prompt + warnings
    this.prompt = el('div', 'prompt', root);
    this.warn = el('div', 'warn', root);
    this.toast = el('div', 'toast', root);
    this.feed = el('div', 'feed', root);
    this.vig = el('div', 'vignette', root);
    this.death = el('div', 'death', root);
    this.deathText = el('div', 'dtext', this.death);
    this.deathSub = el('div', 'dsub', this.death);
    this.hint = el('div', 'hint', root);
    // touch + pause layers get their own nodes in index.html
    this.feedLines = [];
    this.toastT = 0;
    this.hitT = 0;
    this.warnT = 0;
    this.frames = 0;
  }

  log(line, kind = '') {
    this.feedLines.push({ line, kind, t: 0 });
    if (this.feedLines.length > 6) this.feedLines.shift();
    this.feed.innerHTML = '';
    for (const f of this.feedLines) el('div', 'fl ' + f.kind, this.feed, f.line);
  }

  say(text, secs = 2.6) { this.toast.textContent = text; this.toastT = secs; }
  alert(text, secs = 5) { this.warn.textContent = text; this.warnT = secs; }
  hitmarker() { this.hitT = 0.22; this.hitmark.classList.add('on'); }

  update(dt, run) {
    this.frames++;
    const p = run.player;
    // crosshair placement + spread read-out
    this.cross.style.transform = `translate(${(run.xh || 0).toFixed(1)}px, ${(run.xhY || 0).toFixed(1)}px)`;
    this.cross.classList.toggle('aim', !!p.aim);
    this.cross.classList.toggle('busy', !!(run.haul && run.haul.handsBusy()));
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.hitmark.classList.remove('on'); }
    // job block
    const c = run.contract;
    if (c) {
      this.set(this.jobTitle, c.incident.title, 'title');
      this.set(this.jobObj, run.objectiveText || c.job.short, 'obj');
      this.set(this.jobSite, `${c.site} · ${c.sysName}`, 'site');
      this.job.dataset.tint = c.incident.tint;
      this.job.style.setProperty('--tint', c.incident.tint);
    }
    // clock
    if (run.clock) {
      const left = Math.max(0, run.clock.left);
      const m = Math.floor(left / 60), s = Math.floor(left % 60);
      this.set(this.clockName, run.clock.name, 'name');
      this.set(this.clockTime, left > 0 ? `${m}:${String(s).padStart(2, '0')}` : 'NOW', 'time');
      const frac = clamp(left / (run.clock.total || 1), 0, 1);
      this.clock.style.setProperty('--frac', frac.toFixed(3));
      this.clock.classList.toggle('hot', left < 120);
      this.clock.classList.toggle('dead', left <= 0);
    } else { this.clockName.textContent = ''; this.clockTime.textContent = ''; }
    // body bars
    this.hpFill.style.width = `${clamp(p.hp / p.maxHp, 0, 1) * 100}%`;
    this.stFill.style.width = `${clamp(p.stamina, 0, 1) * 100}%`;
    this.noiseFill.style.width = `${clamp(p.noise / 1.3, 0, 1) * 100}%`;
    this.noiseFill.classList.toggle('loud', p.noise > 0.45);
    // haul
    const h = run.haul;
    if (h) {
      const s = h.summary();
      this.haulKg.textContent = `${s.items} carried · ${s.kg} kg · ${money(s.value)}`;
      this.haulKg.classList.toggle('full', s.full);
      const want = `${s.items}|${s.kg}|${s.value}|${s.heavy}`;
      if (this._haulKey !== want) {
        this._haulKey = want;
        this.haulList.innerHTML = '';
        for (const it of h.flat()) el('div', 'hrow', this.haulList, `${it.n > 1 ? it.n + '× ' : ''}${itemName(it.id)} — ${ITEMS[it.id]?.kg ?? 1} kg`);
        if (s.heavy) el('div', 'hrow heavy', this.haulList, `BOTH HANDS: ${s.hands.join(', ')} — no gun, slower feet, louder boots`);
      }
    }
    // prompt
    if (run.prompt) this.set(this.prompt, run.prompt, 'p');
    else this.prompt.textContent = '';
    // hover label over loot/containers
    if (run.hover) {
      this.set(this.hoverTag, run.hover.name || '', 'name');
      this.hoverTag.classList.add('on');
      this.hoverTag.style.setProperty('--tint', run.hover.tint || '#ddd');
      this.hoverTag.style.transform = `translate(${run.hover.x}px, ${run.hover.y}px)`;
      this.hoverTag.dataset.act = run.hover.act || '';
    } else this.hoverTag.classList.remove('on');
    // timers
    if (this.toastT > 0) { this.toastT -= dt; this.toast.classList.add('on'); } else this.toast.classList.remove('on');
    if (this.warnT > 0) { this.warnT -= dt; this.warn.classList.add('on'); } else this.warn.classList.remove('on');
    // damage vignette
    const hurt = clamp((100 - p.hp) / 100, 0, 1);
    this.vig.style.opacity = (hurt * 0.75 + (p.hurtT > 0 ? 0.3 : 0)).toFixed(2);
    // hint line shows for the first 20 s of a run, or until the player has moved
    this.hint.classList.toggle('on', run.showHints && this.frames < 60 * 26);
  }

  set(node, text, key) {
    if (this.state[key] !== text) { this.state[key] = text; node.textContent = text; }
  }

  showDeath(title, sub) {
    this.deathText.textContent = title;
    this.deathSub.textContent = sub;
    this.death.classList.add('on');
  }
  hideDeath() { this.death.classList.remove('on'); }
  clear() { this.feedLines = []; this.feed.innerHTML = ''; this.toastT = 0; this.warnT = 0; this.hideDeath(); }
}

// A tiny helper the dive uses for the hover ring + tag over a physical object.
export function screenPos(camera, vec3, w, h) {
  const v = vec3.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind: v.z > 1 };
}
