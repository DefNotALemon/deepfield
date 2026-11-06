// test/_canvas.mjs — a small canvas 2D stub, enough for procedural texture painting in node.
// three.js will call getContext('2d'|'webgl2'|'webgl'); webgl returns null (we never render headless).

export function createCanvas(el = {}) {
  const w = el.width || 1024, h = el.height || 1024;
  const imageData = () => ({
    width: w, height: h, data: new Uint8ClampedArray(w * h * 4),
    colorSpace: 'srgb',
  });
  const ctx2d = {
    canvas: el, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: 'source-over', font: '10px sans-serif', textAlign: 'left',
    textBaseline: 'alphabetic', imageSmoothingEnabled: true, shadowBlur: 0, shadowColor: '#000',
    filter: 'none', lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, lineDashOffset: 0,
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {},
    arcTo() {}, rect() {}, roundRect() {}, ellipse() {}, bezierCurveTo() {}, quadraticCurveTo() {},
    fill() {}, stroke() {}, clip() {}, fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {},
    strokeText() {}, translate() {}, rotate() {}, scale() {}, transform() {}, setTransform() {},
    resetTransform() {}, drawImage() {}, setLineDash() {}, getLineDash: () => [], measureText: t => ({ width: (t || '').length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createConicGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({ setTransform() {} }),
    createImageData: (a, b) => ({ width: a || w, height: b || h, data: new Uint8ClampedArray((a || w) * (b || h) * 4) }),
    getImageData: (x, y, gw, gh) => ({ width: gw || w, height: gh || h, data: new Uint8ClampedArray((gw || w) * (gh || h) * 4) }),
    putImageData() {}, drawFocusIfNeeded() {}, isPointInPath: () => false,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  };
  el.getContext = kind => (kind === '2d' ? ctx2d : null);
  el.width = w; el.height = h;
  el.toDataURL = () => 'data:,';
  el.toBlob = cb => cb && cb(null);
  return el;
}
