// Small seeded generator so a run can be replayed from a share link.
// mulberry32: 32-bit state, period 2^32, good enough for scattering seed points.

export function createRng(seed = 1) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (n) => Math.floor(next() * n),
  };
}

export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}
