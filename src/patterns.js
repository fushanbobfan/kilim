// Pattern extraction for the overlapping model: every N x N window of the
// sample (wrapping at the edges when the sample tiles), optionally with its
// rotations and reflections, counted so frequent windows weigh more.

export function patternAt(bitmap, x0, y0, N) {
  const { width, height, pixels } = bitmap;
  const p = new Uint8Array(N * N);
  for (let dy = 0; dy < N; dy++) {
    for (let dx = 0; dx < N; dx++) {
      p[dx + dy * N] = pixels[((x0 + dx) % width) + ((y0 + dy) % height) * width];
    }
  }
  return p;
}

// Quarter turn: new (x, y) reads old (N - 1 - y, x).
export function rotate(p, N) {
  const r = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) r[x + y * N] = p[N - 1 - y + x * N];
  return r;
}

export function reflect(p, N) {
  const r = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) r[x + y * N] = p[N - 1 - x + y * N];
  return r;
}

// The eight symmetries in the order the symmetry setting takes them:
// 1 = as drawn, 2 = plus mirror, 4 = plus half turn pair, 8 = all.
export function variants(p, N) {
  const v = [p];
  v[1] = reflect(v[0], N);
  v[2] = rotate(v[0], N);
  v[3] = reflect(v[2], N);
  v[4] = rotate(v[2], N);
  v[5] = reflect(v[4], N);
  v[6] = rotate(v[4], N);
  v[7] = reflect(v[6], N);
  return v;
}

export function extractPatterns(bitmap, { N = 3, periodic = true, symmetry = 8 } = {}) {
  if (!Number.isInteger(N) || N < 2) throw new Error('N must be an integer of at least 2');
  const xmax = periodic ? bitmap.width : bitmap.width - N + 1;
  const ymax = periodic ? bitmap.height : bitmap.height - N + 1;
  if (xmax < 1 || ymax < 1) throw new Error(`sample is smaller than ${N} x ${N}`);
  const index = new Map();
  const patterns = [];
  const counts = [];
  for (let y = 0; y < ymax; y++) {
    for (let x = 0; x < xmax; x++) {
      const vs = variants(patternAt(bitmap, x, y, N), N);
      for (let k = 0; k < symmetry; k++) {
        const key = vs[k].join(',');
        const at = index.get(key);
        if (at === undefined) {
          index.set(key, patterns.length);
          patterns.push(vs[k]);
          counts.push(1);
        } else {
          counts[at]++;
        }
      }
    }
  }
  return { N, patterns, weights: Float64Array.from(counts) };
}

// Directions as (dx, dy): left, down, right, up. Opposite of d is (d + 2) % 4.
export const DX = [-1, 0, 1, 0];
export const DY = [0, 1, 0, -1];

// Pattern q may sit at offset (dx, dy) from p when their overlap agrees.
export function agrees(p, q, dx, dy, N) {
  const xmin = Math.max(0, dx);
  const xmax = Math.min(N, N + dx);
  const ymin = Math.max(0, dy);
  const ymax = Math.min(N, N + dy);
  for (let y = ymin; y < ymax; y++) {
    for (let x = xmin; x < xmax; x++) {
      if (p[x + N * y] !== q[x - dx + N * (y - dy)]) return false;
    }
  }
  return true;
}

// propagator[d][t] lists every pattern that may sit one step in direction d of t.
export function buildPropagator(patterns, N) {
  const T = patterns.length;
  const propagator = [];
  for (let d = 0; d < 4; d++) {
    propagator[d] = [];
    for (let t = 0; t < T; t++) {
      const list = [];
      for (let t2 = 0; t2 < T; t2++) if (agrees(patterns[t], patterns[t2], DX[d], DY[d], N)) list.push(t2);
      propagator[d][t] = Int32Array.from(list);
    }
  }
  return propagator;
}
