import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES, parseRows, sampleById, resizeBitmap, cloneBitmap } from '../src/samples.js';

test('every built-in sample parses into a rectangular bitmap with a palette', () => {
  assert.ok(SAMPLES.length >= 5);
  for (const s of SAMPLES) {
    const b = s.bitmap;
    assert.equal(b.pixels.length, b.width * b.height, s.id);
    for (const p of b.pixels) assert.ok(p < b.palette.length, s.id);
    for (const c of b.palette) assert.match(c, /^#[0-9a-f]{6}$/);
    assert.equal(new Set(b.palette).size, b.palette.length, `${s.id} repeats a colour`);
  }
});

test('ids are unique and found by lookup', () => {
  const ids = SAMPLES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(sampleById('maze').name, 'Maze');
  assert.equal(sampleById('nope'), null);
});

test('parseRows rejects ragged rows and unknown characters', () => {
  assert.throws(() => parseRows(['ab', 'a'], { a: '#000000', b: '#ffffff' }), /row 1/);
  assert.throws(() => parseRows(['ac'], { a: '#000000' }), /unknown character/);
});

test('resize keeps the top-left corner and fills with colour 0', () => {
  const b = parseRows(['ab', 'ba'], { a: '#000000', b: '#ffffff' });
  const r = resizeBitmap(b, 3, 1);
  assert.deepEqual([...r.pixels], [0, 1, 0]);
  const c = cloneBitmap(b);
  c.pixels[0] = 1;
  assert.equal(b.pixels[0], 0);
});
