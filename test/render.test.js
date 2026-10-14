import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { parseRows, sampleById } from '../src/samples.js';
import { extractPatterns, buildPropagator } from '../src/patterns.js';
import { OverlapModel } from '../src/model.js';
import { hexToRgb, renderBitmap, renderWave, renderEntropy, CONTRADICTION_RGB } from '../src/render.js';

function model(bitmap, width, height, symmetry = 1) {
  const ex = extractPatterns(bitmap, { N: 2, symmetry });
  return new OverlapModel({ ...ex, propagator: buildPropagator(ex.patterns, 2), width, height });
}

test('hexToRgb reads six-digit colours', () => {
  assert.deepEqual(hexToRgb('#ff8000'), [255, 128, 0]);
});

test('renderBitmap paints palette colours', () => {
  const b = parseRows(['ab'], { a: '#000000', b: '#ffffff' });
  const out = renderBitmap(b, new Uint8ClampedArray(8));
  assert.deepEqual([...out], [0, 0, 0, 255, 255, 255, 255, 255]);
});

test('an undecided wave shows the weighted mean colour of its patterns', () => {
  const b = parseRows(['aaab'], { a: '#000000', b: '#ffffff' });
  const m = model(b, 4, 4);
  const out = renderWave(m, b.palette, new Uint8ClampedArray(64));
  // Windows start on a three times out of four: a quarter white.
  for (let i = 0; i < 16; i++) assert.equal(out[i * 4], 64);
});

test('a finished wave shows each pattern pixel exactly', () => {
  const b = sampleById('maze').bitmap;
  const m = model(b, 12, 12, 8);
  m.run(createRng(3));
  assert.equal(m.status, 'done');
  const out = renderWave(m, b.palette, new Uint8ClampedArray(12 * 12 * 4));
  const rgb = b.palette.map(hexToRgb);
  for (let i = 0; i < 144; i++) {
    const c = rgb[m.patterns[m.observed(i)][0]];
    assert.deepEqual([out[i * 4], out[i * 4 + 1], out[i * 4 + 2]], c);
  }
});

test('emptied cells are painted in the contradiction colour', () => {
  const b = parseRows(['ab', 'ba'], { a: '#000000', b: '#ffffff' });
  const m = model(b, 2, 2);
  for (let t = 0; t < m.T; t++) m.ban(0, t);
  const out = renderWave(m, b.palette, new Uint8ClampedArray(16));
  assert.deepEqual([out[0], out[1], out[2]], CONTRADICTION_RGB);
  const e = renderEntropy(m, new Uint8ClampedArray(16));
  assert.deepEqual([e[0], e[1], e[2]], CONTRADICTION_RGB);
});

test('entropy is brightest before any decision and dark once decided', () => {
  const b = sampleById('islands').bitmap;
  const m = model(b, 6, 6, 8);
  const before = renderEntropy(m, new Uint8ClampedArray(144));
  m.run(createRng(2));
  const after = renderEntropy(m, new Uint8ClampedArray(144));
  assert.ok(before[0] > 200);
  assert.ok(after[0] < 30);
});
