// The apartment, identical to src/pip_gazebo/worlds/apartment.sdf. Metres, x east, y north.
import { pointSegmentDistance } from './util.js';

export const BOUNDS = { xmin: -4.15, xmax: 4.15, ymin: -3.15, ymax: 3.15 };

export const ROOMS = [
  { name: 'living room', x0: 0.05, x1: 4.0, y0: -3.0, y1: 3.0, color: '#efe4d3' },
  { name: 'bedroom', x0: -4.0, x1: -0.05, y0: 0.05, y1: 3.0, color: '#ece2dc' },
  { name: 'kitchen', x0: -4.0, x1: -0.05, y0: -3.0, y1: -0.05, color: '#e5e6df' },
];

export function roomAt(x, y) {
  return ROOMS.find((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1)?.name ?? null;
}

// [centre x, centre y, size x, size y]
export const WALLS = [
  [0, 3.05, 8.2, 0.1], [0, -3.05, 8.2, 0.1], [-4.05, 0, 0.1, 6.0], [4.05, 0, 0.1, 6.0],
  [0, -2.45, 0.1, 1.1], [0, 0, 0.1, 2.0], [0, 2.45, 0.1, 1.1],
  [-3.225, 0, 1.55, 0.1], [-0.8, 0, 1.5, 0.1],
];

export const FURNITURE = [
  { name: 'bed', box: [-3.25, 1.95, 1.4, 2.0], color: '#c9d3e6', label: 'bed' },
  { name: 'wardrobe', box: [-0.6, 2.7, 1.0, 0.5], color: '#d6c3ae' },
  { name: 'counter', box: [-2.2, -2.65, 2.6, 0.6], color: '#dedcd6', label: 'counter' },
  { name: 'table', box: [-2.0, -1.2, 0.9, 0.7], color: '#d8c2a4', label: 'table' },
  { name: 'couch', box: [2.6, 2.55, 1.8, 0.8], color: '#c4d9c9', label: 'couch' },
  { name: 'coffee table', box: [2.6, 1.3, 0.9, 0.5], color: '#d8c2a4' },
  { name: 'tv', box: [0.3, 0, 0.4, 1.4], color: '#b9b5ad', label: 'tv' },
  { name: 'armchair', box: [1.2, -2.4, 0.8, 0.8], color: '#e3bfb5' },
];

export const PLANT = { x: 3.65, y: -2.65, r: 0.2 };
export const DOCK = { box: [3.94, -1.0, 0.12, 0.3] };
export const CONTACT_OFFSET = 0.11; // robot centre to dock face when docked
export const DOCKED_POSE = { x: 3.77, y: -1.0, th: 0 };
export const BOX_SIZE = 0.35;

function boxSegments([cx, cy, sx, sy]) {
  const x0 = cx - sx / 2;
  const x1 = cx + sx / 2;
  const y0 = cy - sy / 2;
  const y1 = cy + sy / 2;
  return [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
}

function circleSegments(cx, cy, r, n = 16) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI;
    const a1 = ((i + 1) / n) * 2 * Math.PI;
    out.push([cx + r * Math.cos(a0), cy + r * Math.sin(a0), cx + r * Math.cos(a1), cy + r * Math.sin(a1)]);
  }
  return out;
}

export class World {
  constructor() {
    this.boxes = [];
    this.rebuild();
  }

  rebuild() {
    const segs = [];
    for (const w of WALLS) segs.push(...boxSegments(w));
    for (const f of FURNITURE) segs.push(...boxSegments(f.box));
    segs.push(...circleSegments(PLANT.x, PLANT.y, PLANT.r));
    segs.push(...boxSegments(DOCK.box));
    for (const b of this.boxes) segs.push(...boxSegments([b.x, b.y, BOX_SIZE, BOX_SIZE]));
    this.segs = new Float64Array(segs.flat());
  }

  inside(x, y) {
    return x > -4 && x < 4 && y > -3 && y < 3;
  }

  // Drop a box, or pick it up again if one is already there.
  toggleBox(x, y) {
    const i = this.boxes.findIndex((b) => Math.abs(b.x - x) < BOX_SIZE / 2 && Math.abs(b.y - y) < BOX_SIZE / 2);
    if (i >= 0) this.boxes.splice(i, 1);
    else this.boxes.push({ x, y });
    this.rebuild();
  }

  raycast(ox, oy, dx, dy, maxRange) {
    const s = this.segs;
    let best = maxRange;
    for (let k = 0; k < s.length; k += 4) {
      const x1 = s[k];
      const y1 = s[k + 1];
      const ex = s[k + 2] - x1;
      const ey = s[k + 3] - y1;
      const det = -dx * ey + ex * dy;
      if (Math.abs(det) < 1e-12) continue;
      const px = x1 - ox;
      const py = y1 - oy;
      const t = (-px * ey + ex * py) / det;
      if (t <= 0 || t >= best) continue;
      const u = (dx * py - dy * px) / det;
      if (u >= 0 && u <= 1) best = t;
    }
    return best;
  }

  clearance(x, y) {
    const s = this.segs;
    let best = Infinity;
    for (let k = 0; k < s.length; k += 4) {
      const d = pointSegmentDistance(x, y, s[k], s[k + 1], s[k + 2], s[k + 3]);
      if (d < best) best = d;
    }
    return best;
  }
}
