// input.js — keyboard+mouse, gamepad (brand-aware button names), touch. The active scheme is
// auto-detected live and every prompt in the game comes from In.label(action), so only the controls
// for the scheme in your hands are ever shown. (Lemon's standing rule for all his games.)

const KEYS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC', 'ControlLeft'], jump: ['Space'],
  interact: ['KeyE'], bag: ['Tab'], torch: ['KeyF'], tool: ['KeyT'], swap: ['KeyQ'], drop: ['KeyG'],
  reload: ['KeyR'], tablet: ['KeyM'], map: ['KeyN'], back2: ['Escape'], call: ['KeyY'], help: ['Slash'],
};
const PAD = {
  jump: 0, crouch: 1, interact: 2, bag: 3, torch: 4, tool: 5, aim: 6, fire: 7, tablet: 8, call: 9, sprint: 10, swap: 11,
  forward: 12, back: 13, left: 14, right: 15,
};
const PADNAMES = {
  xbox: { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'View', 9: 'Menu', 10: 'L3', 11: 'R3', 12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right' },
  ps: { 0: 'Cross', 1: 'Circle', 2: 'Square', 3: 'Triangle', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'Create', 9: 'Options', 10: 'L3', 11: 'R3', 12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right' },
  switch: { 0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR', 8: '−', 9: '+', 10: 'L-Stick', 11: 'R-Stick', 12: 'Up', 13: 'Down', 14: 'Left', 15: 'Right' },
  steam: { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'Menu', 9: 'Options', 10: 'L3', 11: 'R3', 12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right' },
};
const KBNAMES = {
  forward: 'W', back: 'S', left: 'A', right: 'D', sprint: 'Shift', crouch: 'C', jump: 'Space',
  interact: 'E', bag: 'Tab', torch: 'F', tool: 'T', swap: 'Q', drop: 'G', reload: 'R', tablet: 'M', map: 'N',
  back2: 'Esc', call: 'Y', aim: 'Right Mouse', fire: 'Left Mouse', help: '/',
};
const TOUCHNAMES = {
  forward: 'STICK', back: 'STICK', left: 'STICK', right: 'STICK', sprint: 'RUN', crouch: 'DUCK', jump: 'JUMP',
  interact: 'USE', bag: 'HAUL', torch: 'LAMP', tool: 'TOOL', swap: 'SWAP', drop: 'DROP', reload: 'RELOAD',
  tablet: 'TABLET', map: 'MAP', back2: 'BACK', call: 'CALL', aim: 'AIM', fire: 'FIRE', help: 'HELP',
};

export const In = {
  scheme: 'kb', brand: 'xbox', down: {}, pressed: {}, released: {}, move: { x: 0, y: 0 }, look: { x: 0, y: 0 },
  locked: false, listeners: [], _padPrev: {}, _rawPrev: [], anyInput: 0,
  label(a) {
    if (this.scheme === 'touch') return TOUCHNAMES[a] || a;
    if (this.scheme === 'pad') { const i = PAD[a]; return i === undefined ? a : (PADNAMES[this.brand] || PADNAMES.xbox)[i]; }
    return KBNAMES[a] || a;
  },
  tap(a) { this.pressed[a] = true; this.down[a] = true; this.anyInput = performance.now(); },
  onScheme(fn) { this.listeners.push(fn); },
  setScheme(s) {
    if (s === this.scheme) return;
    this.scheme = s;
    if (typeof document !== 'undefined' && document.body) document.body.dataset.scheme = s;
    this.listeners.forEach(f => f(s));
  },
  consume() { const p = this.pressed; this.pressed = {}; return p; },
  take() { const l = this.look; this.look = { x: 0, y: 0 }; return l; },
  reset() { this.down = {}; this.pressed = {}; this.move = { x: 0, y: 0 }; this.look = { x: 0, y: 0 }; },
};

const kbDown = {};
let touchMove = { x: 0, y: 0 };

export function initInput(canvas) {
  if (typeof document === 'undefined' || !canvas) return;
  document.body.dataset.scheme = In.scheme;
  const press = a => { if (!In.down[a]) In.pressed[a] = true; In.down[a] = true; In.anyInput = performance.now(); };
  const release = a => { In.down[a] = false; In.released[a] = true; };
  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === 'Tab') e.preventDefault();
    In.setScheme('kb'); kbDown[e.code] = true;
    for (const a in KEYS) if (KEYS[a].includes(e.code)) press(a);
    if (e.code === 'Escape') press('back2');
  });
  addEventListener('keyup', e => { kbDown[e.code] = false; for (const a in KEYS) if (KEYS[a].includes(e.code)) release(a); });
  canvas.addEventListener('mousedown', e => {
    if (!document.pointerLockElement && In.scheme !== 'touch') { try { canvas.requestPointerLock?.(); } catch {} return; }
    In.setScheme('kb');
    if (e.button === 0) press('fire'); if (e.button === 2) press('aim');
  });
  addEventListener('mouseup', e => { if (e.button === 0) release('fire'); if (e.button === 2) release('aim'); });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => { if (document.pointerLockElement) { In.setScheme('kb'); In.look.x += e.movementX; In.look.y += e.movementY; } });
  document.addEventListener('pointerlockchange', () => { In.locked = !!document.pointerLockElement; });
  addEventListener('gamepadconnected', e => { In.brand = brandOf(e.gamepad.id); });
  // touch
  const tp = document.getElementById('touch');
  addEventListener('touchstart', () => In.setScheme('touch'), { passive: true });
  let lookId = null, lx = 0, ly = 0, stickId = null, sx = 0, sy = 0;
  canvas.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.4 && stickId === null) { stickId = t.identifier; sx = t.clientX; sy = t.clientY; }
      else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) touchMove = { x: clamp1((t.clientX - sx) / 60), y: clamp1((t.clientY - sy) / 60) };
      if (t.identifier === lookId) { In.look.x += (t.clientX - lx) * 1.6; In.look.y += (t.clientY - ly) * 1.6; lx = t.clientX; ly = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  const end = e => { for (const t of e.changedTouches) { if (t.identifier === stickId) { stickId = null; touchMove = { x: 0, y: 0 }; } if (t.identifier === lookId) lookId = null; } };
  canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);
  if (tp) tp.querySelectorAll('button').forEach(b => {
    const a = b.dataset.a;
    b.addEventListener('touchstart', e => { In.setScheme('touch'); press(a); e.preventDefault(); }, { passive: false });
    b.addEventListener('touchend', e => { release(a); e.preventDefault(); }, { passive: false });
  });
}

const clamp1 = v => (v < -1 ? -1 : v > 1 ? 1 : v);

export function pollInput() {
  let x = (kbDown.KeyD || kbDown.ArrowRight ? 1 : 0) - (kbDown.KeyA || kbDown.ArrowLeft ? 1 : 0);
  let y = (kbDown.KeyS || kbDown.ArrowDown ? 1 : 0) - (kbDown.KeyW || kbDown.ArrowUp ? 1 : 0);
  const gp = readPad();
  if (gp) {
    const dz = v => (Math.abs(v) < 0.15 ? 0 : v);
    const ax = dz(gp.axes[0]), ay = dz(gp.axes[1]), rx = dz(gp.axes[2]), ry = dz(gp.axes[3]);
    let any = ax || ay || rx || ry, tapped = false;
    for (const a in PAD) {
      const b = gp.buttons[PAD[a]]; const d = !!b && b.pressed; const was = !!In._padPrev[a];
      if (d && !was) { In.pressed[a] = true; any = true; tapped = true; }
      if (d) In.down[a] = true; else if (was) In.down[a] = false;
      In._padPrev[a] = d;
    }
    gp.buttons.forEach((b, i) => { const d = !!b?.pressed, was = !!In._rawPrev[i]; if (d && !was) any = true; In._rawPrev[i] = d; });
    if (any) { In.brand = gp.brand; In.setScheme('pad'); In.anyInput = performance.now(); }
    if (In.scheme === 'pad') { x += ax; y += ay; In.look.x += rx * 18; In.look.y += ry * 18; }
    if (tapped && gp.src) haptic(gp.src, 'tap');
  }
  if (In.scheme === 'touch') { x += touchMove.x; y += touchMove.y; }
  const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
  In.move.x = x; In.move.y = y;
  // "has the player touched anything at all lately" — used to decide when to show hints
  if (m > 0.1 || In.look.x || In.look.y) In.anyInput = performance.now();
}

export function haptic(pad, kind = 'tap') {
  const act = pad?.vibrationActuator;
  if (!act || !act.playEffect) return;
  const dur = { tap: 60, shot: 120, hit: 200, alarm: 400 }[kind] || 60;
  const mag = { tap: 0.25, shot: 0.5, hit: 0.9, alarm: 0.7 }[kind] || 0.25;
  try { act.playEffect('dual-rumble', { startDelay: 0, duration: dur, weakMagnitude: mag, strongMagnitude: mag * 0.8 }); } catch {}
}

const brandOf = id => /045e|xbox|xinput/i.test(id) ? 'xbox'
  : /054c|dualsense|dualshock|playstation|wireless controller/i.test(id) ? 'ps'
  : /057e|switch|pro controller|joy-con/i.test(id) ? 'switch'
  : /28de|steam/i.test(id) ? 'steam' : 'xbox';

// Firefox (until its DualSense remap ships) gives Sony pads the raw layout: square,cross,circle,triangle,
// L1,R1,L2,R2, create,options,L3,R3, PS,touchpad; axes LX,LY,RX,L2,R2,RY; hat on axis 9.
function sonyRaw(gp) {
  const B = gp.buttons, A = gp.axes, b = i => B[i] || { pressed: false, value: 0 };
  const trig = (i, bi) => { const v = A[i] === undefined ? b(bi).value : (A[i] + 1) / 2; return { pressed: b(bi).pressed || v > 0.12, value: v }; };
  let up = 0, down = 0, left = 0, right = 0; const h = A[9];
  if (h !== undefined && h >= -1.05 && h <= 1.05) { const k = Math.round((h + 1) * 3.5) & 7; up = k === 7 || k <= 1 ? 1 : 0; right = k >= 1 && k <= 3 ? 1 : 0; down = k >= 3 && k <= 5 ? 1 : 0; left = k >= 5 && k <= 7 ? 1 : 0; }
  const d = v => ({ pressed: !!v, value: v ? 1 : 0 });
  return { buttons: [b(1), b(2), b(0), b(3), b(4), b(5), trig(3, 6), trig(4, 7), b(8), b(9), b(10), b(11), d(up), d(down), d(left), d(right), b(12), b(13)], axes: [A[0] || 0, A[1] || 0, A[2] || 0, A[5] || 0] };
}
function norm(gp) {
  const brand = brandOf(gp.id);
  if (gp.mapping !== 'standard' && brand === 'ps' && gp.axes.length >= 6) return { id: gp.id, brand, src: gp, ...sonyRaw(gp) };
  return { id: gp.id, brand, src: gp, buttons: [...gp.buttons], axes: [gp.axes[0] || 0, gp.axes[1] || 0, gp.axes[2] || 0, gp.axes[3] || 0] };
}
// One merged, standard-mapped pad: buttons OR'd, each stick taken from whichever pad pushes hardest.
export function readPad() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  const list = [];
  for (const gp of navigator.getGamepads()) if (gp && gp.connected !== false) list.push(norm(gp));
  if (!list.length) return null;
  const out = { id: list[0].id, brand: list[0].brand, buttons: [], axes: [0, 0, 0, 0], src: list[0].src }; let best = -1;
  for (const p of list) {
    let act = 0;
    p.buttons.forEach((b, i) => { const o = out.buttons[i] || (out.buttons[i] = { pressed: false, value: 0 }); if (b?.pressed) { o.pressed = true; act++; } o.value = Math.max(o.value, b?.value || 0); });
    for (const s of [0, 2]) { const m2 = Math.hypot(p.axes[s], p.axes[s + 1]); act += m2 > 0.3 ? 1 : 0; if (m2 > Math.hypot(out.axes[s], out.axes[s + 1])) { out.axes[s] = p.axes[s]; out.axes[s + 1] = p.axes[s + 1]; } }
    if (act > best) { best = act; out.id = p.id; out.brand = p.brand; out.src = p.src; }
  }
  return out;
}
