// test/_stub.mjs — headless stubs so modules that touch three.js/canvas can be imported in node.
// Usage:  import './_stub.mjs';   (do this FIRST, before importing anything that imports three)
import { createCanvas } from './_canvas.mjs';

const noop = () => {};
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), style: {}, dataset: {}, children: [], childNodes: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    width: 1024, height: 1024, clientWidth: 1024, clientHeight: 768,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop, hasAttribute: () => false,
    appendChild(c) { this.children.push(c); return c; }, removeChild: noop, remove: noop,
    addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
    getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 1024, bottom: 768, width: 1024, height: 768 }),
    focus: noop, blur: noop, click: noop, querySelector: () => null, querySelectorAll: () => [],
    insertBefore(c) { this.children.push(c); return c; }, cloneNode() { return makeEl(tag); },
  };
  if (tag === 'canvas') { el.getContext = () => createCanvas(el).getContext('2d'); el.toDataURL = () => 'data:,'; }
  return el;
}

const document = {
  createElement: makeEl, createElementNS: (ns, tag) => makeEl(tag),
  createTextNode: t => ({ nodeType: 3, textContent: t }),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener: noop, removeEventListener: noop, body: makeEl('body'),
  documentElement: makeEl('html'), hidden: false, visibilityState: 'visible',
  exitPointerLock: noop, pointerLockElement: null, fonts: { ready: Promise.resolve() },
};

globalThis.document = globalThis.document || document;
globalThis.window = globalThis.window || {
  document, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener: noop, removeEventListener: noop, requestAnimationFrame: cb => setTimeout(() => cb(performance.now()), 16),
  cancelAnimationFrame: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
  location: { href: 'http://localhost/', search: '', hash: '' }, navigator: { userAgent: 'node', maxTouchPoints: 0 },
  getComputedStyle: () => ({ getPropertyValue: () => '' }), localStorage: null,
};
if (!globalThis.navigator) globalThis.navigator = { userAgent: 'node', maxTouchPoints: 0, getGamepads: () => [] };
if (!globalThis.self) globalThis.self = globalThis;
if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);
if (!globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame = noop;
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };

// Minimal localStorage (career saves are tested round-trip). Node 26 ships a real-but-unavailable
// localStorage global, so define over it rather than assigning.
const store = new Map();
const memStore = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k), clear: () => store.clear(), key: i => [...store.keys()][i],
  get length() { return store.size; },
};
try { Object.defineProperty(globalThis, 'localStorage', { value: memStore, configurable: true, writable: true }); }
catch { /* already writable */ }
if (globalThis.window) { try { Object.defineProperty(globalThis.window, 'localStorage', { value: memStore, configurable: true, writable: true }); } catch {} }


export const PASS = (name, ok, extra = '') => {
  if (!ok) { console.log(`FAIL ${name} ${extra}`); process.exitCode = 1; } else console.log(`PASS ${name} ${extra}`);
  return ok;
};
export function done(label) {
  if (process.exitCode) console.log(`\n${label}: FAILURES`); else console.log(`\n${label}: all good`);
}
