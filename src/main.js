import { createRng, randomSeed } from './rng.js';
import { SAMPLES, sampleById, cloneBitmap, resizeBitmap } from './samples.js';
import { extractPatterns, buildPropagator } from './patterns.js';
import { OverlapModel, PROGRESS, DONE, CONTRADICTION } from './model.js';
import { Weaver } from './weaver.js';
import { renderBitmap, renderWave, renderEntropy, renderAtlas } from './render.js';
import { fromQuery, toQuery, sanitize, MAX_COLOURS, MAX_SAMPLE_SIDE } from './settings.js';

const $ = (id) => document.getElementById(id);
const outCanvas = $('output');
const outCtx = outCanvas.getContext('2d');
const editor = $('editor');
const editorCtx = editor.getContext('2d');
const atlas = $('atlas');
const atlasCtx = atlas.getContext('2d');

let settings = fromQuery(location.search);
let bitmap = null;
let tiles = null;
let model = null;
let weaver = null;
let rng = null;
let running = true;
let view = 'wave';
let paint = 0;
let image = null;
let error = '';
// Pinned output pixels: pinKey(x, y) -> [x, y, colour]. Keys do not depend
// on the output width, so pins stay put when the output is resized.
let pins = new Map();
const pinKey = (x, y) => x + y * 4096;
let dirty = true;

function initialBitmap() {
  if (settings.custom) return cloneBitmap(settings.custom);
  return cloneBitmap((sampleById(settings.sample) || SAMPLES[0]).bitmap);
}

// ----- controls -----

function fillSampleSelect() {
  const sel = $('sample');
  sel.innerHTML = '';
  for (const s of SAMPLES) sel.add(new Option(s.name, s.id));
  sel.add(new Option('Painted sample', 'custom'));
}

function syncControls() {
  $('sample').value = settings.custom ? 'custom' : settings.sample;
  $('N').value = String(settings.N);
  $('symmetry').value = String(settings.symmetry);
  $('periodic-input').checked = settings.periodicInput;
  $('periodic-output').checked = settings.periodicOutput;
  $('width').value = settings.width;
  $('height').value = settings.height;
  $('speed').value = settings.speed;
  $('speed-out').textContent = settings.speed;
  $('seed').value = settings.seed;
  $('recovery').value = settings.recovery;
  $('sample-w').value = bitmap.width;
  $('sample-h').value = bitmap.height;
  syncSwatches();
}

function syncSwatches() {
  const box = $('swatches');
  box.innerHTML = '';
  if (paint >= bitmap.palette.length) paint = 0;
  bitmap.palette.forEach((c, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = c;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(k === paint));
    b.setAttribute('aria-label', `Colour ${k + 1}, ${c}`);
    b.title = c;
    b.addEventListener('click', () => {
      paint = k;
      syncSwatches();
    });
    box.appendChild(b);
  });
  $('colour').value = bitmap.palette[paint];
  $('add-colour').disabled = bitmap.palette.length >= MAX_COLOURS;
}

function writeUrl() {
  settings.pins = [...pins.values()];
  const q = toQuery(settings);
  history.replaceState(null, '', q ? `?${q}` : location.pathname);
}

// ----- model -----

function rebuildTiles() {
  error = '';
  try {
    const ex = extractPatterns(bitmap, { N: settings.N, periodic: settings.periodicInput, symmetry: settings.symmetry });
    tiles = { ...ex, propagator: buildPropagator(ex.patterns, ex.N) };
  } catch (e) {
    tiles = null;
    model = null;
    error = e.message;
  }
  drawEditor();
  drawAtlas();
  restart();
}

function restart() {
  for (const [k, [x, y]] of pins) if (x >= settings.width || y >= settings.height) pins.delete(k);
  writeUrl();
  if (!tiles) {
    model = null;
    weaver = null;
    draw();
    return;
  }
  if (!model || model.W !== settings.width || model.H !== settings.height || model.patterns !== tiles.patterns || model.periodic !== settings.periodicOutput) {
    model = new OverlapModel({ ...tiles, width: settings.width, height: settings.height, periodic: settings.periodicOutput });
    outCanvas.width = settings.width;
    outCanvas.height = settings.height;
    // Keep the whole output in view on wide screens.
    const maxWidth = `calc(78vh * ${settings.width / settings.height})`;
    outCanvas.parentElement.style.maxWidth = maxWidth;
    $('bar').parentElement.style.maxWidth = maxWidth;
    image = outCtx.createImageData(settings.width, settings.height);
  }
  weaver = new Weaver(model, { mode: settings.recovery, prepare: pins.size ? applyPins : null });
  syncPinCount();
  rng = createRng(settings.seed);
  dirty = true;
}

function applyPins(m) {
  for (const [x, y, c] of pins.values()) if (!m.restrict(x, y, c)) return false;
  return true;
}

function syncPinCount() {
  $('pin-count').textContent = pins.size ? `${pins.size} pinned pixel${pins.size === 1 ? '' : 's'}` : 'No pins';
  $('clear-pins').disabled = pins.size === 0;
}

function advance(budgetSteps, budgetMs) {
  if (!weaver) return;
  const t0 = performance.now();
  for (let s = 0; s < budgetSteps; s++) {
    const status = weaver.step(rng);
    dirty = true;
    if (status !== PROGRESS) break;
    if (performance.now() - t0 > budgetMs) break;
  }
}

// ----- drawing -----

function drawEditor() {
  editor.width = bitmap.width;
  editor.height = bitmap.height;
  const img = editorCtx.createImageData(bitmap.width, bitmap.height);
  renderBitmap(bitmap, img.data);
  editorCtx.putImageData(img, 0, 0);
}

function drawAtlas() {
  if (!tiles) {
    atlas.width = atlas.height = 1;
    $('tile-count').textContent = '';
    return;
  }
  const a = renderAtlas(tiles.patterns, tiles.weights, tiles.N, bitmap.palette, { columns: 16, scale: Math.max(2, 12 / tiles.N | 0) });
  atlas.width = a.width;
  atlas.height = a.height;
  atlas.style.width = `${a.width * 2}px`;
  atlasCtx.putImageData(new ImageData(a.data, a.width, a.height), 0, 0);
  const shown = a.order.length < tiles.patterns.length ? `, ${a.order.length} most frequent shown` : '';
  $('tile-count').textContent = `${tiles.patterns.length} distinct${shown}`;
}

function statusText() {
  if (error) return `Cannot build tiles: ${error}.`;
  if (!model) return '';
  const pct = Math.round(model.progress() * 100);
  const extra = [];
  if (weaver.backtracks) extra.push(`${weaver.backtracks} backed up`);
  if (weaver.restarts) extra.push(`${weaver.restarts} restarted`);
  const tries = extra.length ? ` · ${extra.join(', ')}` : '';
  if (model.status === DONE) return `Done: ${weaver.choices} choices${tries}.`;
  if (weaver.infeasible) return 'The pinned pixels cannot all hold with these tiles. Remove some pins or clear them.';
  if (model.status === CONTRADICTION) {
    return `Contradiction after ${weaver.choices} choices: a cell ran out of tiles${tries}. Restart or try another seed.`;
  }
  return `${pct}% decided · ${weaver.choices} choices${tries}${running ? '' : ' · paused'}`;
}

function draw() {
  if (model && image) {
    if (view === 'entropy') renderEntropy(model, image.data);
    else renderWave(model, bitmap.palette, image.data);
    outCtx.putImageData(image, 0, 0);
    $('bar').style.width = `${model.progress() * 100}%`;
  } else {
    $('bar').style.width = '0';
  }
  $('status').textContent = statusText();
  $('run').textContent = running ? 'Pause' : 'Run';
  dirty = false;
}

function frame() {
  if (running && model && model.status !== DONE) advance(settings.speed, 14);
  if (dirty) draw();
  requestAnimationFrame(frame);
}

// ----- events -----

function setSetting(key, value, rebuild) {
  settings = sanitize({ ...settings, [key]: value });
  if (rebuild) rebuildTiles();
  else restart();
  syncControls();
}

function chooseSample(id) {
  if (id === 'custom') {
    settings.custom = bitmap;
    writeUrl();
    return;
  }
  const s = sampleById(id);
  bitmap = cloneBitmap(s.bitmap);
  pins.clear();
  settings = sanitize({
    ...settings,
    sample: id,
    custom: null,
    N: s.settings.N,
    symmetry: s.settings.symmetry,
    periodicInput: s.periodic,
    periodicOutput: s.settings.periodicOutput,
  });
  syncControls();
  rebuildTiles();
}

function markPainted() {
  settings.custom = bitmap;
  $('sample').value = 'custom';
}

function editorPixel(e) {
  const r = editor.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * bitmap.width);
  const y = Math.floor(((e.clientY - r.top) / r.height) * bitmap.height);
  if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) return -1;
  return x + y * bitmap.width;
}

let painting = false;
let painted = false;

function paintAt(e) {
  const i = editorPixel(e);
  if (i < 0 || bitmap.pixels[i] === paint) return;
  bitmap.pixels[i] = paint;
  painted = true;
  markPainted();
  drawEditor();
}

editor.addEventListener('pointerdown', (e) => {
  painting = true;
  painted = false;
  editor.setPointerCapture(e.pointerId);
  paintAt(e);
});
editor.addEventListener('pointermove', (e) => {
  if (painting) paintAt(e);
});
const endPaint = () => {
  if (!painting) return;
  painting = false;
  if (painted) rebuildTiles();
};
editor.addEventListener('pointerup', endPaint);
editor.addEventListener('pointercancel', endPaint);

$('sample').addEventListener('change', (e) => chooseSample(e.target.value));
$('N').addEventListener('change', (e) => setSetting('N', Number(e.target.value), true));
$('symmetry').addEventListener('change', (e) => setSetting('symmetry', Number(e.target.value), true));
$('periodic-input').addEventListener('change', (e) => setSetting('periodicInput', e.target.checked, true));
$('periodic-output').addEventListener('change', (e) => setSetting('periodicOutput', e.target.checked, false));
$('width').addEventListener('change', (e) => setSetting('width', e.target.value, false));
$('height').addEventListener('change', (e) => setSetting('height', e.target.value, false));
$('seed').addEventListener('change', (e) => setSetting('seed', e.target.value, false));
$('recovery').addEventListener('change', (e) => setSetting('recovery', e.target.value, false));
$('speed').addEventListener('input', (e) => {
  settings = sanitize({ ...settings, speed: e.target.value });
  $('speed-out').textContent = settings.speed;
  writeUrl();
});

function resizeSample() {
  const w = Math.min(MAX_SAMPLE_SIDE, Math.max(2, Math.round(Number($('sample-w').value)) || bitmap.width));
  const h = Math.min(MAX_SAMPLE_SIDE, Math.max(2, Math.round(Number($('sample-h').value)) || bitmap.height));
  if (w === bitmap.width && h === bitmap.height) return;
  bitmap = resizeBitmap(bitmap, w, h);
  markPainted();
  syncControls();
  rebuildTiles();
}
$('sample-w').addEventListener('change', resizeSample);
$('sample-h').addEventListener('change', resizeSample);

$('colour').addEventListener('change', (e) => {
  const c = e.target.value.toLowerCase();
  if (bitmap.palette.includes(c)) return;
  bitmap.palette[paint] = c;
  markPainted();
  syncSwatches();
  rebuildTiles();
});
$('add-colour').addEventListener('click', () => {
  if (bitmap.palette.length >= MAX_COLOURS) return;
  let c;
  do {
    c = `#${((Math.random() * 0xffffff) | 0).toString(16).padStart(6, '0')}`;
  } while (bitmap.palette.includes(c));
  bitmap.palette.push(c);
  paint = bitmap.palette.length - 1;
  markPainted();
  syncSwatches();
  writeUrl();
});

function reseed() {
  setSetting('seed', randomSeed(), false);
  running = true;
}

$('reseed').addEventListener('click', reseed);
$('restart').addEventListener('click', () => {
  restart();
  running = true;
});
$('run').addEventListener('click', toggleRun);
$('step').addEventListener('click', stepOnce);

// Run after a finished or failed attempt starts a fresh one with a new seed.
function toggleRun() {
  if (model && model.status !== PROGRESS) reseed();
  else running = !running;
  dirty = true;
}

function stepOnce() {
  running = false;
  if (model && model.status !== PROGRESS) restart();
  advance(1, Infinity);
  dirty = true;
}

// ----- pins -----

function outputPixel(e) {
  const r = outCanvas.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * settings.width);
  const y = Math.floor(((e.clientY - r.top) / r.height) * settings.height);
  if (x < 0 || y < 0 || x >= settings.width || y >= settings.height) return null;
  return [x, y];
}

let pinning = false;
let pinsChanged = false;

function pinAt(e) {
  const p = outputPixel(e);
  if (!p || !model) return;
  const [x, y] = p;
  const k = pinKey(x, y);
  if (e.shiftKey) {
    if (pins.delete(k)) pinsChanged = true;
    return;
  }
  const old = pins.get(k);
  if (old && old[2] === paint) return;
  pins.set(k, [x, y, paint]);
  pinsChanged = true;
  // Show the pin straight away; the weave restarts with every pin on release.
  model.restrict(x, y, paint);
  dirty = true;
}

function setDrawing(on) {
  $('draw-pins').checked = on;
  outCanvas.classList.toggle('drawing', on);
}

outCanvas.addEventListener('pointerdown', (e) => {
  if (!$('draw-pins').checked) return;
  pinning = true;
  pinsChanged = false;
  running = false;
  outCanvas.setPointerCapture(e.pointerId);
  pinAt(e);
});
outCanvas.addEventListener('pointermove', (e) => {
  if (pinning) pinAt(e);
});
const endPin = () => {
  if (!pinning) return;
  pinning = false;
  if (pinsChanged) {
    restart();
    running = true;
  }
  syncPinCount();
};
outCanvas.addEventListener('pointerup', endPin);
outCanvas.addEventListener('pointercancel', endPin);
$('draw-pins').addEventListener('change', (e) => setDrawing(e.target.checked));
$('clear-pins').addEventListener('click', () => {
  pins.clear();
  restart();
  running = true;
});

for (const r of document.querySelectorAll('input[name="view"]')) {
  r.addEventListener('change', (e) => {
    view = e.target.value;
    dirty = true;
  });
}

function setView(v) {
  view = v;
  for (const r of document.querySelectorAll('input[name="view"]')) r.checked = r.value === v;
  dirty = true;
}

$('png').addEventListener('click', () => {
  if (!model) return;
  const k = Math.max(1, Math.floor(1024 / Math.max(model.W, model.H)));
  const c = document.createElement('canvas');
  c.width = model.W * k;
  c.height = model.H * k;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(outCanvas, 0, 0, c.width, c.height);
  c.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kilim-${settings.seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
});

$('link').addEventListener('click', async () => {
  writeUrl();
  try {
    await navigator.clipboard.writeText(location.href);
    $('link').textContent = 'Copied';
  } catch {
    $('link').textContent = 'Copy failed';
  }
  setTimeout(() => ($('link').textContent = 'Copy link'), 1500);
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key === ' ') {
    e.preventDefault();
    toggleRun();
  } else if (e.key === 's' || e.key === 'S') {
    stepOnce();
  } else if (e.key === 'r' || e.key === 'R') {
    reseed();
  } else if (e.key === 'e' || e.key === 'E') {
    setView(view === 'entropy' ? 'wave' : 'entropy');
  } else if (e.key === 'p' || e.key === 'P') {
    setDrawing(!$('draw-pins').checked);
  }
});

// ----- start -----

fillSampleSelect();
bitmap = initialBitmap();
for (const [x, y, c] of settings.pins) if (c < bitmap.palette.length) pins.set(pinKey(x, y), [x, y, c]);
if (!settings.custom && location.search === '') {
  const s = sampleById(settings.sample);
  settings = sanitize({ ...settings, ...s.settings, periodicOutput: s.settings.periodicOutput, periodicInput: s.periodic });
}
syncControls();
rebuildTiles();
requestAnimationFrame(frame);
