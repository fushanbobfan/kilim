import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRows, SAMPLES } from '../src/samples.js';
import {
  patternAt, rotate, reflect, variants, extractPatterns, agrees, buildPropagator, DX, DY,
} from '../src/patterns.js';

const KEY = { a: '#000000', b: '#ffffff', c: '#ff0000' };

test('patternAt wraps around the sample edges', () => {
  const b = parseRows(['ab', 'ca'], KEY);
  assert.deepEqual([...patternAt(b, 1, 1, 2)], [0, 2, 1, 0]);
});

test('four quarter turns and two reflections return the original', () => {
  const p = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...rotate(rotate(rotate(rotate(p, 3), 3), 3), 3)], [...p]);
  assert.deepEqual([...reflect(reflect(p, 3), 3)], [...p]);
  assert.deepEqual([...reflect(p, 3)], [2, 1, 0, 5, 4, 3, 8, 7, 6]);
  assert.deepEqual([...rotate(Uint8Array.from([0, 1, 2, 3]), 2)], [1, 3, 0, 2]);
});

test('an asymmetric pattern has eight distinct variants', () => {
  const p = Uint8Array.from([0, 1, 0, 0, 0, 0, 0, 0, 2]);
  const keys = new Set(variants(p, 3).map((v) => v.join()));
  assert.equal(keys.size, 8);
});

test('a checkerboard yields two patterns of equal weight', () => {
  const b = parseRows(['ab', 'ba'], KEY);
  const { patterns, weights } = extractPatterns(b, { N: 2, periodic: true, symmetry: 1 });
  assert.equal(patterns.length, 2);
  assert.deepEqual([...weights], [2, 2]);
});

test('weights sum to windows times symmetry count', () => {
  const b = SAMPLES[0].bitmap;
  for (const symmetry of [1, 2, 4, 8]) {
    const { weights } = extractPatterns(b, { N: 3, periodic: true, symmetry });
    const total = weights.reduce((s, w) => s + w, 0);
    assert.equal(total, b.width * b.height * symmetry);
  }
  const np = extractPatterns(b, { N: 3, periodic: false, symmetry: 1 });
  assert.equal(np.weights.reduce((s, w) => s + w, 0), (b.width - 2) * (b.height - 2));
});

test('extraction rejects N below 2 and samples smaller than the window', () => {
  const b = parseRows(['ab'], KEY);
  assert.throws(() => extractPatterns(b, { N: 1 }), /at least 2/);
  assert.throws(() => extractPatterns(b, { N: 2, periodic: false }), /smaller/);
});

test('agrees compares only the overlap', () => {
  const p = Uint8Array.from([0, 1, 0, 1]);
  const q = Uint8Array.from([1, 2, 1, 2]);
  assert.ok(agrees(p, q, 1, 0, 2));
  assert.ok(!agrees(p, q, -1, 0, 2));
  assert.ok(agrees(q, p, -1, 0, 2));
});

test('the propagator is symmetric under opposite directions', () => {
  const { N, patterns } = extractPatterns(SAMPLES[2].bitmap, { N: 3, symmetry: 8 });
  const prop = buildPropagator(patterns, N);
  for (let d = 0; d < 4; d++) {
    const o = (d + 2) % 4;
    assert.equal(DX[d] + DX[o], 0);
    assert.equal(DY[d] + DY[o], 0);
    for (let t = 0; t < patterns.length; t++) {
      for (const t2 of prop[d][t]) assert.ok(prop[o][t2].includes(t), `d${d} ${t}->${t2}`);
    }
  }
});

test('every pattern from a periodic sample has a neighbour in each direction', () => {
  for (const s of SAMPLES) {
    const { N, patterns } = extractPatterns(s.bitmap, { N: 3, periodic: s.periodic, symmetry: 1 });
    const prop = buildPropagator(patterns, N);
    for (let d = 0; d < 4; d++) for (let t = 0; t < patterns.length; t++) assert.ok(prop[d][t].length > 0, s.id);
  }
});
