import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';

test('the same seed gives the same sequence', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('different seeds diverge', () => {
  const a = createRng(1);
  const b = createRng(2);
  let same = 0;
  for (let i = 0; i < 100; i++) if (a.next() === b.next()) same++;
  assert.ok(same < 3);
});

test('values stay in [0, 1) and cover the interval evenly', () => {
  const rng = createRng(7);
  const bins = new Array(10).fill(0);
  for (let i = 0; i < 100000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1);
    bins[Math.floor(v * 10)]++;
  }
  for (const b of bins) assert.ok(Math.abs(b - 10000) < 500, `bin count ${b}`);
});

test('int and range respect their bounds', () => {
  const rng = createRng(3);
  for (let i = 0; i < 1000; i++) {
    const k = rng.int(5);
    assert.ok(Number.isInteger(k) && k >= 0 && k < 5);
    const r = rng.range(-2, 3);
    assert.ok(r >= -2 && r < 3);
  }
});
