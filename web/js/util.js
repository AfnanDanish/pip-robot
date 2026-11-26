export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function wrap(a) {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

// Small seeded PRNG so RANSAC is repeatable.
export function mulberry32(seed) {
  return function next() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const ex = x2 - x1;
  const ey = y2 - y1;
  const len2 = ex * ex + ey * ey;
  let t = len2 > 0 ? ((px - x1) * ex + (py - y1) * ey) / len2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * ex), py - (y1 + t * ey));
}
