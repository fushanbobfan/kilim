// The overlapping wave function collapse model, after Maxim Gumin's
// description: every output cell starts as a superposition of all patterns,
// the cell with least entropy collapses to one pattern drawn by weight, and
// arc consistency (AC-4 support counts) bans whatever no longer fits.

import { DX, DY } from './patterns.js';

export const PROGRESS = 'progress';
export const DONE = 'done';
export const CONTRADICTION = 'contradiction';

export class OverlapModel {
  constructor({ patterns, weights, propagator, N, width, height, periodic = true }) {
    this.patterns = patterns;
    this.weights = weights;
    this.propagator = propagator;
    this.N = N;
    this.W = width;
    this.H = height;
    this.periodic = periodic;
    this.T = patterns.length;
    const cells = width * height;
    const T = this.T;
    this.wave = new Uint8Array(cells * T);
    this.compatible = new Int32Array(cells * T * 4);
    this.sumsOfOnes = new Int32Array(cells);
    this.sumsOfWeights = new Float64Array(cells);
    this.sumsOfWeightLogWeights = new Float64Array(cells);
    this.entropies = new Float64Array(cells);
    this.stack = new Int32Array(cells * T * 2);
    this.stackSize = 0;
    this.weightLogWeights = new Float64Array(T);
    let sw = 0;
    let swl = 0;
    for (let t = 0; t < T; t++) {
      this.weightLogWeights[t] = weights[t] * Math.log(weights[t]);
      sw += weights[t];
      swl += this.weightLogWeights[t];
    }
    this.startingWeight = sw;
    this.startingWeightLog = swl;
    this.startingEntropy = Math.log(sw) - swl / sw;
    this.clear();
  }

  clear() {
    const { T, W, H } = this;
    for (let i = 0; i < W * H; i++) {
      for (let t = 0; t < T; t++) {
        this.wave[i * T + t] = 1;
        for (let d = 0; d < 4; d++) {
          this.compatible[(i * T + t) * 4 + d] = this.propagator[(d + 2) % 4][t].length;
        }
      }
      this.sumsOfOnes[i] = T;
      this.sumsOfWeights[i] = this.startingWeight;
      this.sumsOfWeightLogWeights[i] = this.startingWeightLog;
      this.entropies[i] = this.startingEntropy;
    }
    this.stackSize = 0;
    this.contradiction = -1;
    this.lastObserved = -1;
    this.decisions = 0;
    this.status = PROGRESS;
  }

  // Cells whose N x N window would run off a non-wrapping output are never
  // observed or constrained; their pixels are read from the last full window.
  onBoundary(x, y) {
    return !this.periodic && (x + this.N > this.W || y + this.N > this.H || x < 0 || y < 0);
  }

  ban(i, t) {
    const T = this.T;
    const k = i * T + t;
    if (!this.wave[k]) return;
    this.wave[k] = 0;
    const c = k * 4;
    this.compatible[c] = this.compatible[c + 1] = this.compatible[c + 2] = this.compatible[c + 3] = 0;
    this.stack[this.stackSize * 2] = i;
    this.stack[this.stackSize * 2 + 1] = t;
    this.stackSize++;
    this.sumsOfOnes[i]--;
    this.sumsOfWeights[i] -= this.weights[t];
    this.sumsOfWeightLogWeights[i] -= this.weightLogWeights[t];
    const sw = this.sumsOfWeights[i];
    this.entropies[i] = sw > 0 ? Math.log(sw) - this.sumsOfWeightLogWeights[i] / sw : 0;
    if (this.sumsOfOnes[i] === 0 && this.contradiction < 0) this.contradiction = i;
  }

  propagate() {
    const { T, W, H, N, propagator, compatible } = this;
    while (this.stackSize > 0) {
      this.stackSize--;
      const i1 = this.stack[this.stackSize * 2];
      const t1 = this.stack[this.stackSize * 2 + 1];
      const x1 = i1 % W;
      const y1 = (i1 - x1) / W;
      for (let d = 0; d < 4; d++) {
        let x2 = x1 + DX[d];
        let y2 = y1 + DY[d];
        if (!this.periodic && (x2 < 0 || y2 < 0 || x2 + N > W || y2 + N > H)) continue;
        if (x2 < 0) x2 += W;
        else if (x2 >= W) x2 -= W;
        if (y2 < 0) y2 += H;
        else if (y2 >= H) y2 -= H;
        const i2 = x2 + y2 * W;
        const list = propagator[d][t1];
        for (let l = 0; l < list.length; l++) {
          const t2 = list[l];
          const c = (i2 * T + t2) * 4 + d;
          compatible[c]--;
          if (compatible[c] === 0) this.ban(i2, t2);
        }
      }
    }
    return this.contradiction < 0;
  }

  // Least-entropy undecided cell, ties broken by a little noise; -1 when all are decided.
  pickCell(rng) {
    let min = Infinity;
    let argmin = -1;
    const { W, H } = this;
    for (let i = 0; i < W * H; i++) {
      if (this.sumsOfOnes[i] <= 1) continue;
      const x = i % W;
      if (this.onBoundary(x, (i - x) / W)) continue;
      const e = this.entropies[i] + 1e-6 * rng.next();
      if (e < min) {
        min = e;
        argmin = i;
      }
    }
    return argmin;
  }

  pickPattern(i, rng) {
    const { T } = this;
    let r = rng.next() * this.sumsOfWeights[i];
    let last = -1;
    for (let t = 0; t < T; t++) {
      if (!this.wave[i * T + t]) continue;
      last = t;
      r -= this.weights[t];
      if (r < 0) return t;
    }
    return last;
  }

  collapse(i, chosen) {
    const { T } = this;
    for (let t = 0; t < T; t++) if (t !== chosen && this.wave[i * T + t]) this.ban(i, t);
    this.lastObserved = i;
    this.decisions++;
  }

  // One observation plus its propagation.
  step(rng) {
    if (this.status !== PROGRESS) return this.status;
    const i = this.pickCell(rng);
    if (i < 0) {
      this.status = DONE;
      return DONE;
    }
    this.collapse(i, this.pickPattern(i, rng));
    if (!this.propagate()) this.status = CONTRADICTION;
    return this.status;
  }

  run(rng, maxSteps = Infinity) {
    for (let s = 0; s < maxSteps && this.status === PROGRESS; s++) this.step(rng);
    return this.status;
  }

  // Share of observable cells already down to a single pattern.
  progress() {
    const { W, H } = this;
    let n = 0;
    let total = 0;
    for (let i = 0; i < W * H; i++) {
      const x = i % W;
      if (this.onBoundary(x, (i - x) / W)) continue;
      total++;
      if (this.sumsOfOnes[i] === 1) n++;
    }
    return n / total;
  }

  // The pattern index of a decided cell, or -1.
  observed(i) {
    if (this.sumsOfOnes[i] !== 1) return -1;
    const { T } = this;
    for (let t = 0; t < T; t++) if (this.wave[i * T + t]) return t;
    return -1;
  }

  // Window cell and offset that supply output pixel (x, y).
  sourceOf(x, y) {
    const { N, W, H } = this;
    let cx = x;
    let cy = y;
    let dx = 0;
    let dy = 0;
    if (!this.periodic) {
      if (x > W - N) {
        cx = W - N;
        dx = x - cx;
      }
      if (y > H - N) {
        cy = H - N;
        dy = y - cy;
      }
    }
    return { cell: cx + cy * W, offset: dx + dy * N };
  }
}

// Check a finished output: every pair of neighbouring decided cells must agree.
export function isConsistent(model) {
  const { W, H, N } = model;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (model.onBoundary(x, y)) continue;
      const t = model.observed(x + y * W);
      if (t < 0) return false;
      for (let d = 0; d < 4; d++) {
        let x2 = x + DX[d];
        let y2 = y + DY[d];
        if (!model.periodic && (x2 < 0 || y2 < 0 || x2 + N > W || y2 + N > H)) continue;
        x2 = (x2 + W) % W;
        y2 = (y2 + H) % H;
        const t2 = model.observed(x2 + y2 * W);
        if (!model.propagator[d][t].includes(t2)) return false;
      }
    }
  }
  return true;
}
