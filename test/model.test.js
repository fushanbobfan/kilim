import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { parseRows, sampleById } from '../src/samples.js';
import { extractPatterns, buildPropagator } from '../src/patterns.js';
import { OverlapModel, isConsistent, DONE, CONTRADICTION, PROGRESS } from '../src/model.js';

function makeModel(bitmap, { N = 3, symmetry = 8, periodicInput = true, width = 24, height = 24, periodic = true } = {}) {
  const ex = extractPatterns(bitmap, { N, periodic: periodicInput, symmetry });
  return new OverlapModel({ ...ex, propagator: buildPropagator(ex.patterns, N), width, height, periodic });
}

function solve(bitmap, opts, seed = 1, attempts = 20) {
  for (let a = 0; a < attempts; a++) {
    const m = makeModel(bitmap, opts);
    if (m.run(createRng(seed + a)) === DONE) return m;
  }
  return null;
}

test('a fresh model holds every pattern in every cell at full entropy', () => {
  const m = makeModel(sampleById('maze').bitmap, { width: 8, height: 8 });
  assert.equal(m.progress(), 0);
  for (let i = 0; i < 64; i++) {
    assert.equal(m.sumsOfOnes[i], m.T);
    assert.ok(Math.abs(m.entropies[i] - m.startingEntropy) < 1e-12);
  }
  assert.ok(m.startingEntropy > 0);
});

test('a checkerboard collapses to a valid checkerboard after one decision', () => {
  const b = parseRows(['ab', 'ba'], { a: '#000000', b: '#ffffff' });
  const m = makeModel(b, { N: 2, symmetry: 1, width: 6, height: 6 });
  assert.equal(m.step(createRng(5)), PROGRESS);
  assert.equal(m.progress(), 1);
  assert.equal(m.step(createRng(5)), DONE);
  assert.equal(m.decisions, 1);
  assert.ok(isConsistent(m));
});

test('the same seed replays the same result', () => {
  const b = sampleById('bricks').bitmap;
  const a = makeModel(b, { width: 16, height: 16 });
  const c = makeModel(b, { width: 16, height: 16 });
  a.run(createRng(9));
  c.run(createRng(9));
  assert.equal(a.status, c.status);
  assert.deepEqual([...a.wave], [...c.wave]);
});

test('finished outputs are consistent for every built-in sample', () => {
  for (const id of ['kilim', 'bricks', 'maze', 'pipes', 'islands']) {
    const { bitmap, settings } = sampleById(id);
    const m = solve(bitmap, { N: settings.N, symmetry: settings.symmetry, periodic: settings.periodicOutput, width: 20, height: 20 });
    assert.ok(m, `${id} never finished`);
    assert.ok(isConsistent(m), id);
    assert.equal(m.progress(), 1);
  }
});

test('every output window of a finished periodic run is a window of the sample', () => {
  const b = sampleById('islands').bitmap;
  const m = solve(b, { width: 16, height: 16, symmetry: 1 });
  assert.ok(m);
  const keys = new Set(m.patterns.map((p) => p.join()));
  const N = m.N;
  const pixel = (x, y) => {
    const { cell, offset } = m.sourceOf(x % m.W, y % m.H);
    return m.patterns[m.observed(cell)][offset];
  };
  for (let y = 0; y < m.H; y++) {
    for (let x = 0; x < m.W; x++) {
      const w = [];
      for (let dy = 0; dy < N; dy++) for (let dx = 0; dx < N; dx++) w.push(pixel(x + dx, y + dy));
      assert.ok(keys.has(w.join()), `window at ${x},${y}`);
    }
  }
});

test('a non-wrapping output leaves its last N - 1 rows and columns to the boundary windows', () => {
  const m = solve(sampleById('maze').bitmap, { width: 12, height: 10, periodic: false });
  assert.ok(m);
  assert.ok(m.onBoundary(11, 0) && m.onBoundary(0, 9) && !m.onBoundary(9, 7));
  assert.deepEqual(m.sourceOf(11, 9), { cell: 9 + 7 * 12, offset: 2 + 2 * 3 });
  assert.deepEqual(m.sourceOf(4, 3), { cell: 4 + 3 * 12, offset: 0 });
  assert.ok(isConsistent(m));
});

test('incompatible patterns end in a contradiction instead of looping', () => {
  // Two patterns that can only sit beside themselves horizontally and only
  // beside each other vertically cannot fill a 3-row torus.
  const patterns = [Uint8Array.from([0]), Uint8Array.from([1])];
  const same = [Int32Array.from([0]), Int32Array.from([1])];
  const other = [Int32Array.from([1]), Int32Array.from([0])];
  const m = new OverlapModel({
    patterns, weights: Float64Array.from([1, 1]), propagator: [same, other, same, other],
    N: 1, width: 3, height: 3, periodic: true,
  });
  assert.equal(m.run(createRng(1)), CONTRADICTION);
  assert.ok(m.contradiction >= 0);
  assert.equal(m.step(createRng(1)), CONTRADICTION);
});

test('clear resets a finished model', () => {
  const m = solve(sampleById('pipes').bitmap, { width: 10, height: 10 });
  m.clear();
  assert.equal(m.status, PROGRESS);
  assert.equal(m.progress(), 0);
  assert.equal(m.decisions, 0);
});

test('pattern choice follows the weights', () => {
  const patterns = [Uint8Array.from([0]), Uint8Array.from([1])];
  const all = [Int32Array.from([0, 1]), Int32Array.from([0, 1])];
  const m = new OverlapModel({
    patterns, weights: Float64Array.from([3, 1]), propagator: [all, all, all, all],
    N: 1, width: 40, height: 40, periodic: true,
  });
  m.run(createRng(4));
  let zeros = 0;
  for (let i = 0; i < 1600; i++) if (m.observed(i) === 0) zeros++;
  assert.ok(Math.abs(zeros / 1600 - 0.75) < 0.05, `share ${zeros / 1600}`);
});

function snapshot(m) {
  return {
    wave: m.wave.slice(), compatible: m.compatible.slice(), ones: m.sumsOfOnes.slice(),
    entropies: m.entropies.slice(), decisions: m.decisions,
  };
}

test('undo returns the wave, support counts and entropies to a mark exactly', () => {
  for (const periodic of [true, false]) {
    const m = makeModel(sampleById('pipes').bitmap, { symmetry: 2, width: 20, height: 16, periodic });
    m.run(createRng(6), 30);
    const before = snapshot(m);
    const mark = m.mark();
    m.run(createRng(7), 40);
    assert.ok(m.decisions > before.decisions);
    m.undo(mark);
    const after = snapshot(m);
    assert.deepEqual([...after.wave], [...before.wave]);
    assert.deepEqual([...after.compatible], [...before.compatible]);
    assert.deepEqual([...after.ones], [...before.ones]);
    assert.equal(after.decisions, before.decisions);
    for (let i = 0; i < before.entropies.length; i++) assert.ok(Math.abs(after.entropies[i] - before.entropies[i]) < 1e-9);
  }
});

test('undo to the start gives a fresh model', () => {
  const b = sampleById('islands').bitmap;
  const m = makeModel(b, { width: 12, height: 12 });
  const fresh = snapshot(m);
  const mark = m.mark();
  m.run(createRng(1));
  m.undo(mark);
  assert.deepEqual([...m.compatible], [...fresh.compatible]);
  assert.deepEqual([...m.entropies], [...fresh.entropies]);
  assert.equal(m.progress(), 0);
});

test('undo clears a contradiction and the run can go on', () => {
  const m = makeModel(sampleById('maze').bitmap, { width: 10, height: 10 });
  const mark = m.mark();
  for (let t = 0; t < m.T; t++) m.ban(0, t);
  m.propagate();
  m.status = CONTRADICTION;
  m.undo(mark);
  assert.equal(m.status, PROGRESS);
  assert.equal(m.contradiction, -1);
  assert.equal(m.progress(), 0);
  assert.notEqual(m.run(createRng(2)), PROGRESS);
});
