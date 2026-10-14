// Shareable settings: a link carries only what differs from the defaults,
// plus the sample itself when it was painted by hand.

export const MAX_COLOURS = 8;
export const RECOVERY = ['backtrack', 'restart', 'stop'];
export const MAX_SAMPLE_SIDE = 24;
export const MAX_PINS = 2048;

export const RANGES = {
  N: { min: 2, max: 4, def: 3 },
  symmetry: { values: [1, 2, 4, 8], def: 8 },
  width: { min: 8, max: 96, def: 48 },
  height: { min: 8, max: 96, def: 48 },
  speed: { min: 1, max: 400, def: 20 },
  seed: { min: 0, max: 4294967295, def: 1 },
};

export function defaults() {
  return {
    sample: 'kilim',
    N: RANGES.N.def,
    symmetry: RANGES.symmetry.def,
    periodicInput: true,
    periodicOutput: false,
    width: RANGES.width.def,
    height: RANGES.height.def,
    speed: RANGES.speed.def,
    seed: RANGES.seed.def,
    recovery: RECOVERY[0],
    custom: null,
    pins: [],
  };
}

function clampInt(v, { min, max, def }) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export function sanitize(s) {
  const d = defaults();
  const out = { ...d, ...s };
  out.N = clampInt(out.N, RANGES.N);
  out.symmetry = RANGES.symmetry.values.includes(Number(out.symmetry)) ? Number(out.symmetry) : d.symmetry;
  out.width = clampInt(out.width, RANGES.width);
  out.height = clampInt(out.height, RANGES.height);
  out.speed = clampInt(out.speed, RANGES.speed);
  out.seed = clampInt(out.seed, RANGES.seed);
  out.periodicInput = Boolean(out.periodicInput);
  out.periodicOutput = Boolean(out.periodicOutput);
  out.recovery = RECOVERY.includes(out.recovery) ? out.recovery : d.recovery;
  out.sample = typeof out.sample === 'string' && /^[a-z]+$/.test(out.sample) ? out.sample : d.sample;
  return out;
}

// A painted sample as "w.h.rrggbb-rrggbb-....pixels", one digit per pixel.
export function encodeBitmap(b) {
  const pal = b.palette.map((c) => c.slice(1)).join('-');
  return `${b.width}.${b.height}.${pal}.${Array.from(b.pixels).join('')}`;
}

export function decodeBitmap(text) {
  const m = /^(\d+)\.(\d+)\.([0-9a-f-]+)\.([0-7]+)$/i.exec(text || '');
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  const palette = m[3].split('-').map((h) => `#${h.toLowerCase()}`);
  if (width < 2 || height < 2 || width > MAX_SAMPLE_SIDE || height > MAX_SAMPLE_SIDE) return null;
  if (palette.length < 1 || palette.length > MAX_COLOURS || palette.some((c) => !/^#[0-9a-f]{6}$/.test(c))) return null;
  if (m[4].length !== width * height) return null;
  const pixels = Uint8Array.from(m[4], (ch) => Number(ch));
  if (pixels.some((p) => p >= palette.length)) return null;
  return { width, height, palette, pixels };
}

// Pinned output pixels as "x.y.c" triples joined by underscores.
export function encodePins(pins) {
  return pins.map(([x, y, c]) => `${x}.${y}.${c}`).join('_');
}

export function decodePins(text, width, height, colours) {
  const pins = [];
  const seen = new Set();
  for (const part of (text || '').split('_')) {
    const m = /^(\d+)\.(\d+)\.(\d)$/.exec(part);
    if (!m) continue;
    const [x, y, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (x >= width || y >= height || c >= colours || seen.has(x + y * width)) continue;
    seen.add(x + y * width);
    pins.push([x, y, c]);
    if (pins.length >= MAX_PINS) break;
  }
  return pins;
}

const KEYS = {
  sample: 's', N: 'n', symmetry: 'y', periodicInput: 'pi', periodicOutput: 'po',
  width: 'w', height: 'h', speed: 'v', seed: 'r', recovery: 'k',
};

export function toQuery(settings, base = defaults()) {
  const s = sanitize(settings);
  const q = new URLSearchParams();
  for (const [k, short] of Object.entries(KEYS)) {
    if (s[k] === base[k]) continue;
    q.set(short, typeof s[k] === 'boolean' ? (s[k] ? '1' : '0') : String(s[k]));
  }
  if (s.custom) {
    q.delete('s');
    q.set('c', encodeBitmap(s.custom));
  }
  if (settings.pins && settings.pins.length) q.set('p', encodePins(settings.pins));
  return q.toString();
}

export function fromQuery(query, base = defaults()) {
  const q = new URLSearchParams(query);
  const s = { ...base };
  for (const [k, short] of Object.entries(KEYS)) {
    if (!q.has(short)) continue;
    const v = q.get(short);
    s[k] = typeof base[k] === 'boolean' ? v === '1' : typeof base[k] === 'string' ? v : Number(v);
  }
  const out = sanitize(s);
  out.custom = q.has('c') ? decodeBitmap(q.get('c')) : null;
  // Pins are checked against the palette once the sample is known.
  out.pins = q.has('p') ? decodePins(q.get('p'), out.width, out.height, MAX_COLOURS) : [];
  return out;
}
