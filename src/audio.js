// audio.js — procedural sound, no files. Everything is synthesised: the air handler that never stops,
// a hull ticking as it cools, boots on deck plate, a gunshot in a corridor, and the thing in the ducts.
// Sound is a mechanic in this game, so the mix tells you what is behind the wall.

let ctxA = null, master = null, amb = null, ambNodes = [], listener = { x: 0, z: 0, yaw: 0 };
export const A = { muted: false, volume: 0.7, ready: false };

export function init() {
  if (ctxA) return ctxA;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctxA = new AC();
    master = ctxA.createGain();
    master.gain.value = A.volume;
    master.connect(ctxA.destination);
    amb = ctxA.createGain();
    amb.gain.value = 0.0;
    amb.connect(master);
    A.ready = true;
  } catch (e) { ctxA = null; }
  return ctxA;
}

export function resume() { if (ctxA && ctxA.state === 'suspended') ctxA.resume(); }
export function setVolume(v) { A.volume = v; if (master) master.gain.value = v; }
export function setListener(x, z, yaw) { listener.x = x; listener.z = z; listener.yaw = yaw; }

// distance attenuation + rough stereo, enough to place a sound behind you
function panNode(x, z) {
  const g = ctxA.createGain();
  g.connect(master);
  let panner = null;
  if (ctxA.createStereoPanner) { panner = ctxA.createStereoPanner(); g.disconnect(); g.connect(panner); panner.connect(master); }
  if (x == null) { g.gain.value = 1; return { g, panner }; }
  const dx = x - listener.x, dz = z - listener.z;
  const d = Math.hypot(dx, dz);
  const att = 1 / (1 + d * 0.11);
  g.gain.value = att;
  if (panner) {
    const ang = Math.atan2(dx, dz) - listener.yaw;
    panner.pan.value = Math.max(-1, Math.min(1, Math.sin(ang)));
  }
  return { g, panner, dist: d };
}

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    const len = ctxA.sampleRate * 2;
    noiseBuf = ctxA.createBuffer(1, len, ctxA.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctxA.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  return s;
}

function burst(dur, freq, q, gain, type = 'bandpass', x = null, z = null) {
  if (!ctxA || A.muted) return;
  const { g } = panNode(x, z);
  const s = noise();
  const f = ctxA.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const env = ctxA.createGain();
  env.gain.setValueAtTime(0, ctxA.currentTime);
  env.gain.linearRampToValueAtTime(gain, ctxA.currentTime + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, ctxA.currentTime + dur);
  s.connect(f); f.connect(env); env.connect(g);
  s.start(); s.stop(ctxA.currentTime + dur + 0.02);
}

function tone(dur, f0, f1, gain, type = 'sine', x = null, z = null) {
  if (!ctxA || A.muted) return;
  const { g } = panNode(x, z);
  const o = ctxA.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, ctxA.currentTime);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), ctxA.currentTime + dur);
  const env = ctxA.createGain();
  env.gain.setValueAtTime(0, ctxA.currentTime);
  env.gain.linearRampToValueAtTime(gain, ctxA.currentTime + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, ctxA.currentTime + dur);
  o.connect(env); env.connect(g);
  o.start(); o.stop(ctxA.currentTime + dur + 0.02);
}

// ── the sounds of the game ─────────────────────────────────────────────────────────────────
export function play(name, opts = {}) {
  if (!ctxA) init();
  if (!ctxA || A.muted) return;
  const x = opts.x, z = opts.z, v = opts.vol ?? 1;
  switch (name) {
    case 'step': burst(0.09, 900 + Math.random() * 500, 1.4, 0.2 * v, 'bandpass', x, z); break;
    case 'step_heavy': burst(0.14, 300 + Math.random() * 200, 1.2, 0.4 * v, 'bandpass', x, z); break;
    case 'land': burst(0.2, 200, 1, 0.5 * v, 'lowpass', x, z); break;
    case 'shot': {
      tone(0.16, 220, 60, 0.5 * v, 'square', x, z);
      burst(0.22, 1400, 0.7, 0.65 * v, 'highpass', x, z);
      break;
    }
    case 'shot_far': { burst(0.35, 700, 0.4, 0.3 * v, 'bandpass', x, z); break; }
    case 'shotgun': { tone(0.3, 140, 40, 0.6 * v, 'square', x, z); burst(0.4, 900, 0.5, 0.7 * v, 'highpass', x, z); break; }
    case 'reload': tone(0.06, 1200, 700, 0.25 * v, 'square'); tone(0.05, 500, 300, 0.2 * v, 'square'); break;
    case 'dry': tone(0.05, 900, 400, 0.2 * v, 'square'); break;
    case 'impact': burst(0.09, 2600, 2, 0.35 * v, 'bandpass', x, z); break;
    case 'flesh': burst(0.12, 380, 1.2, 0.4 * v, 'lowpass', x, z); break;
    case 'door': tone(0.7, 220, 520, 0.16 * v, 'sawtooth', x, z); burst(0.6, 400, 0.8, 0.09 * v, 'lowpass', x, z); break;
    case 'door_shut': tone(0.25, 300, 90, 0.3 * v, 'square', x, z); burst(0.2, 260, 1, 0.3 * v, 'lowpass', x, z); break;
    case 'lid': tone(0.22, 700, 320, 0.14 * v, 'triangle', x, z); break;
    case 'drawer': burst(0.3, 700, 0.6, 0.13 * v, 'bandpass', x, z); break;
    case 'pickup': tone(0.09, 700, 1000, 0.16 * v, 'triangle'); break;
    case 'drop': burst(0.16, 350, 1, 0.35 * v, 'lowpass', x, z); break;
    case 'clang': tone(0.5, 640, 280, 0.2 * v, 'triangle', x, z); burst(0.35, 1800, 3, 0.15 * v, 'bandpass', x, z); break;
    case 'scream': { tone(0.9, 500, 700, 0.3 * v, 'sawtooth', x, z); tone(0.8, 760, 640, 0.22 * v, 'triangle', x, z); break; }
    case 'talk': { tone(0.5, 300 + Math.random() * 120, 260, 0.14 * v, 'triangle', x, z); break; }
    case 'skitter': { for (let i = 0; i < 5; i++) setTimeout(() => burst(0.05, 2400, 2.5, 0.22 * v, 'bandpass', x, z), i * 55); break; }
    case 'hiss': burst(1.2, 3200, 0.5, 0.18 * v, 'highpass', x, z); break;
    case 'screech': { tone(0.7, 1400, 400, 0.32 * v, 'sawtooth', x, z); burst(0.7, 2600, 1.5, 0.2 * v, 'bandpass', x, z); break; }
    case 'breath': { burst(1.4, 500, 0.8, 0.16 * v, 'lowpass', x, z); break; }
    case 'alarm': { for (let i = 0; i < 3; i++) setTimeout(() => tone(0.35, 660, 440, 0.22 * v, 'square'), i * 420); break; }
    case 'burn': { tone(2.2, 90, 60, 0.3 * v, 'sawtooth'); burst(2.4, 300, 0.4, 0.25 * v, 'lowpass'); break; }
    case 'ui': tone(0.04, 900, 900, 0.1 * v, 'square'); break;
    case 'ui_bad': tone(0.16, 300, 180, 0.16 * v, 'square'); break;
    case 'clamp': { burst(0.5, 200, 0.7, 0.5 * v, 'lowpass'); tone(0.6, 120, 60, 0.35 * v, 'square'); break; }
    case 'thruster': { burst(2.5, 160, 0.5, 0.3 * v, 'lowpass'); break; }
    case 'coin': { tone(0.09, 1200, 1600, 0.2 * v, 'triangle'); setTimeout(() => tone(0.12, 1700, 1900, 0.18 * v, 'triangle'), 70); break; }
    case 'pinger': { for (let i = 0; i < 2; i++) setTimeout(() => tone(0.06, 1800, 1800, 0.16 * v, 'square'), i * 260); break; }
    default: burst(0.08, 800, 1, 0.1 * v, 'bandpass', x, z);
  }
}

// ── ambience: the hull you are standing in ────────────────────────────────────────────────
export function ambience(kind = 'none', opts = {}) {
  if (!ctxA) init();
  if (!ctxA) return;
  stopAmbience();
  if (kind === 'none') return;
  const g = ctxA.createGain();
  g.gain.value = 0;
  g.connect(amb);
  amb.gain.value = 0.5;
  const s = noise();
  const f = ctxA.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = kind === 'derelict' ? 180 : kind === 'reactor' ? 420 : 260;
  f.Q.value = 0.6;
  s.connect(f); f.connect(g);
  s.start();
  const lfo = ctxA.createOscillator(), lfoGain = ctxA.createGain();
  lfo.frequency.value = kind === 'derelict' ? 0.07 : 0.16;
  lfoGain.gain.value = kind === 'reactor' ? 220 : 90;
  lfo.connect(lfoGain); lfoGain.connect(f.frequency);
  lfo.start();
  g.gain.linearRampToValueAtTime(kind === 'derelict' ? 0.10 : 0.07, ctxA.currentTime + 3);
  ambNodes = [s, f, g, lfo, lfoGain];
  if (kind === 'derelict' || kind === 'wreck') tickTimer = setInterval(() => { if (Math.random() < 0.5) play('clang', { vol: 0.5 }); else burst(0.7, 240, 1.2, 0.06, 'lowpass'); }, 6000);
  if (kind === 'burning') tickTimer = setInterval(() => play('alarm', { vol: 0.6 }), 9000);
}
let tickTimer = null;

export function stopAmbience() {
  for (const n of ambNodes) { try { n.stop && n.stop(); n.disconnect(); } catch {} }
  ambNodes = [];
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  if (amb) amb.gain.value = 0;
}

// A short rising stinger for the moments that matter (a rival's clamp, the burn starting).
export function stinger(kind = 'bad') {
  if (!ctxA) init(); if (!ctxA) return;
  if (kind === 'bad') { tone(1.6, 120, 90, 0.3, 'sawtooth'); tone(1.4, 180, 130, 0.2, 'square'); }
  else if (kind === 'good') { tone(0.3, 520, 780, 0.2, 'triangle'); setTimeout(() => tone(0.4, 780, 1040, 0.18, 'triangle'), 200); }
  else if (kind === 'alert') { tone(0.8, 800, 600, 0.24, 'square'); }
}
