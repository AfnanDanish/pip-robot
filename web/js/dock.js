// Find the dock's flat 30 cm face in the lidar scan (RANSAC line fit) and steer onto it.
// Same algorithm as src/pip_brain/pip_brain/dock_detect.py.
import { mulberry32 } from './util.js';

export function scanPoints(scan) {
  const pts = [];
  for (let i = 0; i < scan.ranges.length; i++) {
    const r = scan.ranges[i];
    if (!Number.isFinite(r)) continue;
    pts.push([r * Math.cos(scan.angles[i]), r * Math.sin(scan.angles[i])]);
  }
  return pts;
}

export function fitDockFace(points, expected, { window = 0.25, width = 0.3, widthTol = 0.12, maxRms = 0.015 } = {}) {
  const near = points.filter((p) => Math.hypot(p[0] - expected[0], p[1] - expected[1]) < window);
  if (near.length < 5) return null;
  const rand = mulberry32(7);
  let inliers = [];
  for (let it = 0; it < 60; it++) {
    const a = near[Math.floor(rand() * near.length)];
    const b = near[Math.floor(rand() * near.length)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = -dy / len;
    const ny = dx / len;
    const inl = near.filter((p) => Math.abs((p[0] - a[0]) * nx + (p[1] - a[1]) * ny) < 0.012);
    if (inl.length > inliers.length) inliers = inl;
  }
  if (inliers.length < 5) return null;

  // Principal direction of the inliers (2x2 covariance eigenvector).
  const mx = inliers.reduce((s, p) => s + p[0], 0) / inliers.length;
  const my = inliers.reduce((s, p) => s + p[1], 0) / inliers.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of inliers) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dir = [Math.cos(angle), Math.sin(angle)];
  let nrm = [-dir[1], dir[0]];
  let lo = Infinity;
  let hi = -Infinity;
  let res2 = 0;
  for (const [x, y] of inliers) {
    const along = (x - mx) * dir[0] + (y - my) * dir[1];
    const across = (x - mx) * nrm[0] + (y - my) * nrm[1];
    lo = Math.min(lo, along);
    hi = Math.max(hi, along);
    res2 += across * across;
  }
  const rms = Math.sqrt(res2 / inliers.length);
  const w = hi - lo;
  if (rms > maxRms || Math.abs(w - width) > widthTol) return null;
  const mid = (hi + lo) / 2;
  const center = [mx + dir[0] * mid, my + dir[1] * mid];
  if (nrm[0] * -center[0] + nrm[1] * -center[1] < 0) nrm = [-nrm[0], -nrm[1]];
  return { center, normal: nrm, width: w, rms };
}

// Steer at a carrot on the dock's centre line that slides towards the face as Pip gets closer.
export function approachCommand(obs, stopDist, { lookahead = 0.25, kTurn = 1.6, vMax = 0.1, vMin = 0.03 } = {}) {
  const [cx, cy] = obs.center;
  const [nx, ny] = obs.normal;
  const dist = -(nx * cx + ny * cy);
  const lateral = -(-ny * cx + nx * cy);
  const headingErr = Math.atan2(-ny, -nx);
  const along = Math.max(dist - lookahead, stopDist);
  const carrot = [cx + nx * along, cy + ny * along];
  const bearing = Math.atan2(carrot[1], carrot[0]);
  const w = Math.max(-0.8, Math.min(0.8, kTurn * bearing));
  const v = Math.max(vMin, Math.min(vMax, 0.5 * (dist - stopDist))) * Math.max(0, Math.cos(bearing));
  return { v, w, dist, lateral, headingErr };
}
