import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { sampleById } from '../src/samples.js';
import { extractPatterns, buildPropagator } from '../src/patterns.js';
import { OverlapModel, isConsistent, DONE, CONTRADICTION } from '../src/model.js';
import { Weaver, STOP, RESTART, BACKTRACK } from '../src/weaver.js';

function makeModel(id, { symmetry = 1, size = 32, periodic = true } = {}) {
  const ex = extractPatterns(sampleById(id).bitmap, { N: 3, symmetry });
  return new OverlapModel({ ...ex, propagator: buildPropagator(ex.patterns, 3), width: size, height: size, periodic });
}

function impossible() {
  const patterns = [Uint8Array.from([0]), Uint8Array.from([1])];
  const same = [Int32Array.from([0]), Int32Array.from([1])];
  const other = [Int32Array.from([1]), Int32Array.from([0])];
  return new OverlapModel({
    patterns, weights: Float64Array.from([1, 1]), propagator: [same, other, same, other],
    N: 1, width: 3, height: 3, periodic: true,
  });
}

test('stop mode halts at the first contradiction', () => {
  const w = new Weaver(impossible(), { mode: STOP });
  assert.equal(w.run(createRng(1)), CONTRADICTION);
  assert.equal(w.restarts, 0);
  assert.equal(w.backtracks, 0);
});

test('an impossible output gives up after the restart limit', () => {
  for (const mode of [RESTART, BACKTRACK]) {
    const w = new Weaver(impossible(), { mode, maxRestarts: 5 });
    assert.equal(w.run(createRng(1)), CONTRADICTION, mode);
    assert.equal(w.restarts, 5, mode);
  }
});

test('backtracking finishes runs that contradict, with consistent results', () => {
  let rescued = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const plain = makeModel('maze');
    if (plain.run(createRng(seed)) !== CONTRADICTION) continue;
    const w = new Weaver(makeModel('maze'), { mode: BACKTRACK });
    assert.equal(w.run(createRng(seed)), DONE, `seed ${seed}`);
    assert.ok(isConsistent(w.model), `seed ${seed}`);
    if (w.restarts === 0) rescued++;
  }
  assert.ok(rescued > 0, 'no contradicting seed was rescued without a full restart');
});

test('on loosely constrained pipes, backtracking spends fewer choices than restarting', () => {
  let back = 0;
  let restart = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const a = new Weaver(makeModel('pipes', { size: 40 }), { mode: BACKTRACK });
    const b = new Weaver(makeModel('pipes', { size: 40 }), { mode: RESTART });
    assert.equal(a.run(createRng(seed)), DONE);
    assert.equal(b.run(createRng(seed)), DONE);
    back += a.choices;
    restart += b.choices;
  }
  assert.ok(back < restart, `backtrack ${back} vs restart ${restart}`);
});

test('the same seed replays the same woven result', () => {
  const a = new Weaver(makeModel('maze'));
  const b = new Weaver(makeModel('maze'));
  a.run(createRng(3));
  b.run(createRng(3));
  assert.deepEqual([...a.model.wave], [...b.model.wave]);
  assert.equal(a.backtracks, b.backtracks);
});

test('only a bounded number of saves is kept', () => {
  const w = new Weaver(makeModel('islands', { symmetry: 8, size: 40 }), { interval: 2, keep: 3 });
  w.run(createRng(2), 200);
  assert.ok(w.saves.length <= 3);
  assert.ok(w.saves.every((s, k) => k === 0 || s.decisions > w.saves[k - 1].decisions));
});

test('the backtracking budget hands a stubborn attempt over to a restart', () => {
  const w = new Weaver(impossible(), { mode: BACKTRACK, budget: 2, maxRestarts: 3 });
  w.run(createRng(1));
  assert.equal(w.restarts, 3);
  assert.ok(w.backtracks <= 2 * 4, `backtracks ${w.backtracks}`);
});

test('reset clears saves and counters', () => {
  const w = new Weaver(makeModel('maze'));
  w.run(createRng(4));
  w.reset();
  assert.equal(w.saves.length, 0);
  assert.equal(w.choices + w.backtracks + w.restarts, 0);
  assert.equal(w.model.progress(), 0);
});

test('prepared pins hold through backtracking and restarts', () => {
  const pins = [[0, 0, 1], [7, 3, 0], [20, 20, 1], [31, 31, 0]];
  const prepare = (m) => pins.every(([x, y, c]) => m.restrict(x, y, c));
  for (const mode of [BACKTRACK, RESTART]) {
    for (let seed = 1; seed <= 6; seed++) {
      const w = new Weaver(makeModel('maze'), { mode, prepare });
      assert.equal(w.run(createRng(seed)), DONE, `${mode} seed ${seed}`);
      for (const [x, y, c] of pins) {
        const { cell, offset } = w.model.sourceOf(x, y);
        assert.equal(w.model.patterns[w.model.observed(cell)][offset], c);
      }
      assert.ok(isConsistent(w.model));
    }
  }
});

test('pins that cannot all hold stop at once instead of restarting', () => {
  const prepare = (m) => {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (!m.restrict(x, y, 0)) return false;
    return true;
  };
  const w = new Weaver(makeModel('maze'), { prepare });
  assert.ok(w.infeasible);
  assert.equal(w.run(createRng(1)), CONTRADICTION);
  assert.equal(w.restarts, 0);
  assert.equal(w.backtracks, 0);
});
