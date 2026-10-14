// Built-in sample bitmaps. Each is drawn as rows of characters, one character
// per pixel, with a key from character to colour. A bitmap is stored as a
// palette plus one palette index per pixel. Each sample also carries the
// settings that suit it: one whose stripes repeat every few rows cannot wrap
// around an output of arbitrary height, so it starts with a non-wrapping output.

const SOURCES = [
  {
    id: 'kilim',
    settings: { N: 3, symmetry: 8, periodicOutput: false },
    name: 'Kilim diamond',
    periodic: true,
    key: { r: '#a8322d', k: '#2b1d1a', y: '#e0a83a', w: '#f2e6cf' },
    rows: [
      'kkkyrrrykk',
      'kkyrrkrryk',
      'kyrrkykrry',
      'yrrkywykrr',
      'rrkywwwykr',
      'rkywwkwwyk',
      'rrkywwwykr',
      'yrrkywykrr',
      'kyrrkykrry',
      'kkyrrkrryk',
    ],
  },
  {
    id: 'bricks',
    settings: { N: 4, symmetry: 2, periodicOutput: false },
    name: 'Bricks',
    periodic: true,
    key: { m: '#d9d2c3', b: '#9b4a32', d: '#7d3a27' },
    rows: [
      'mmmmmmmm',
      'bbbmdddm',
      'bbbmdddm',
      'mmmmmmmm',
      'dmbbbmdd',
      'dmbbbmdd',
    ],
  },
  {
    id: 'maze',
    settings: { N: 3, symmetry: 8, periodicOutput: true },
    name: 'Maze',
    periodic: true,
    key: { '#': '#1f2a44', '.': '#f4f1e8' },
    rows: [
      '.#.....#',
      '.#.###.#',
      '.#.#...#',
      '...#.###',
      '####.#..',
      '.....#.#',
      '.#####.#',
      '.......#',
    ],
  },
  {
    id: 'pipes',
    settings: { N: 3, symmetry: 2, periodicOutput: true },
    name: 'Pipes',
    periodic: true,
    key: { '.': '#14212b', p: '#4fb3a9', j: '#f0c24b' },
    rows: [
      '..........',
      '.pppppj...',
      '.p....p...',
      '.p....jppp',
      'pj..p.....',
      '....p..p..',
      '.ppjp..p..',
      '.p..p..jpp',
      '.p..jppp..',
      '.p........',
    ],
  },
  {
    id: 'islands',
    settings: { N: 3, symmetry: 8, periodicOutput: true },
    name: 'Islands',
    periodic: true,
    key: { '~': '#2f6f9f', ':': '#e8d39a', g: '#5c9a4a', t: '#2f6b35' },
    rows: [
      '~~~~~~~~~~~~',
      '~~~::::~~~~~',
      '~~:gggg:~~~~',
      '~~:ggtg::~~~',
      '~~:gtttg:~~~',
      '~~~:ggg:~~~~',
      '~~~~:::~~~~~',
      '~~~~~~~~~::~',
      '~~~~~~~~:gg:',
      '~~~~~~~~:gg:',
      '~~~~~~~~~::~',
      '~~~~~~~~~~~~',
    ],
  },
];

export function parseRows(rows, key) {
  const height = rows.length;
  const width = rows[0].length;
  const chars = Object.keys(key);
  const palette = chars.map((c) => key[c]);
  const pixels = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} has ${row.length} pixels, expected ${width}`);
    for (let x = 0; x < width; x++) {
      const k = chars.indexOf(row[x]);
      if (k < 0) throw new Error(`unknown character ${JSON.stringify(row[x])} at ${x},${y}`);
      pixels[y * width + x] = k;
    }
  });
  return { width, height, palette, pixels };
}

export const SAMPLES = SOURCES.map((s) => ({
  id: s.id,
  name: s.name,
  periodic: s.periodic,
  settings: s.settings,
  bitmap: parseRows(s.rows, s.key),
}));

export function sampleById(id) {
  return SAMPLES.find((s) => s.id === id) || null;
}

export function cloneBitmap(b) {
  return { width: b.width, height: b.height, palette: b.palette.slice(), pixels: b.pixels.slice() };
}

// Resize keeping the top-left corner; new pixels take colour 0.
export function resizeBitmap(b, width, height) {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < Math.min(height, b.height); y++) {
    for (let x = 0; x < Math.min(width, b.width); x++) {
      pixels[y * width + x] = b.pixels[y * b.width + x];
    }
  }
  return { width, height, palette: b.palette.slice(), pixels };
}
