// Headless run: weave a sample at a given size and report tile counts, how
// many attempts and choices it took, and optionally save the result as PNG.
// Usage: node scripts/probe.js [--sample maze] [--size 48] [--seed 1]
//        [--N 3] [--symmetry 8] [--wrap 0|1] [--runs 10] [--png out.png]

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createRng } from '../src/rng.js';
import { sampleById, SAMPLES } from '../src/samples.js';
import { extractPatterns, buildPropagator } from '../src/patterns.js';
import { OverlapModel, DONE } from '../src/model.js';
import { renderWave } from '../src/render.js';

function args() {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
  return a;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng(rgba, width, height, scale = 1) {
  const W = width * scale;
  const H = height * scale;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const s = ((Math.floor(y / scale) * width) + Math.floor(x / scale)) * 4;
      rgba.slice(s, s + 4).forEach((v, k) => (raw[y * (W * 4 + 1) + 1 + x * 4 + k] = v));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const a = args();
const sample = sampleById(a.sample || 'kilim');
if (!sample) {
  console.error(`unknown sample; choose one of ${SAMPLES.map((s) => s.id).join(', ')}`);
  process.exit(1);
}
const N = Number(a.N || sample.settings.N);
const symmetry = Number(a.symmetry || sample.settings.symmetry);
const periodic = a.wrap === undefined ? sample.settings.periodicOutput : a.wrap === '1';
const size = Number(a.size || 48);
const seed = Number(a.seed || 1);
const runs = Number(a.runs || 1);

const t0 = performance.now();
const ex = extractPatterns(sample.bitmap, { N, periodic: sample.periodic, symmetry });
const propagator = buildPropagator(ex.patterns, N);
console.log(`${sample.name}: ${ex.patterns.length} tiles of ${N} x ${N}, symmetry ${symmetry}, built in ${(performance.now() - t0).toFixed(0)} ms`);

let done = 0;
let last = null;
for (let r = 0; r < runs; r++) {
  const model = new OverlapModel({ ...ex, propagator, width: size, height: size, periodic });
  const t1 = performance.now();
  const status = model.run(createRng(seed + r));
  if (status === DONE) done++;
  console.log(`seed ${seed + r}: ${status} after ${model.decisions} choices in ${(performance.now() - t1).toFixed(0)} ms`);
  if (status === DONE && !last) last = model;
}
console.log(`${done} of ${runs} runs finished at ${size} x ${size}${periodic ? ', wrapping' : ''}`);

if (a.png && last) {
  const rgba = renderWave(last, sample.bitmap.palette, new Uint8ClampedArray(size * size * 4));
  writeFileSync(a.png, encodePng(rgba, size, size, Number(a.scale || 4)));
  console.log(`wrote ${a.png}`);
}
