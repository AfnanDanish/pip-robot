// Frontier detection, obstacle inflation, A* planning and path smoothing on the occupancy grid.
import { FREE, OCC, UNKNOWN } from './grid.js';

const NEIGHBOURS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

export function findFrontiers(g, minSize = 10) {
  const { w, h, cls } = g;
  const mask = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      if (cls[i] !== FREE) continue;
      if ((c > 0 && cls[i - 1] === UNKNOWN) || (c < w - 1 && cls[i + 1] === UNKNOWN)
        || (r > 0 && cls[i - w] === UNKNOWN) || (r < h - 1 && cls[i + w] === UNKNOWN)) mask[i] = 1;
    }
  }
  const seen = new Uint8Array(w * h);
  const frontiers = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    seen[i] = 1;
    const stack = [i];
    const cells = [];
    while (stack.length) {
      const j = stack.pop();
      cells.push(j);
      const c = j % w;
      const r = (j / w) | 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= w || nr >= h) continue;
          const k = nr * w + nc;
          if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
        }
      }
    }
    if (cells.length < minSize) continue;
    let mc = 0;
    let mr = 0;
    for (const j of cells) { mc += j % w; mr += (j / w) | 0; }
    mc /= cells.length;
    mr /= cells.length;
    let best = cells[0];
    let bestD = Infinity;
    for (const j of cells) {
      const d = (j % w - mc) ** 2 + (((j / w) | 0) - mr) ** 2;
      if (d < bestD) { bestD = d; best = j; }
    }
    frontiers.push({ size: cells.length, goal: g.center(best % w, (best / w) | 0) });
  }
  return { frontiers, mask };
}

export function chooseFrontier(frontiers, robot, res, blacklist, radius = 0.5, minDistance = 0.3) {
  let best = null;
  let bestScore = Infinity;
  for (const f of frontiers) {
    if (blacklist.some((b) => Math.hypot(f.goal[0] - b[0], f.goal[1] - b[1]) < radius)) continue;
    const d = Math.hypot(f.goal[0] - robot.x, f.goal[1] - robot.y);
    if (d < minDistance) continue;
    const score = d - f.size * res;
    if (score < bestScore) { bestScore = score; best = f; }
  }
  return best;
}

export function stillFrontier(g, x, y, radius = 0.15) {
  const [c, r] = g.cell(x, y);
  const k = Math.max(1, Math.round(radius / g.res));
  for (let dr = -k; dr <= k; dr++) {
    for (let dc = -k; dc <= k; dc++) {
      if (g.inside(c + dc, r + dr) && g.cls[(r + dr) * g.w + c + dc] === UNKNOWN) return true;
    }
  }
  return false;
}

// Distance to the nearest obstacle turned into a traversal cost. Too close is lethal.
export function costMap(g, lethal = 3, spread = 8) {
  const { w, h, cls } = g;
  const n = w * h;
  const dist = new Uint8Array(n).fill(255);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) if (cls[i] === OCC) { dist[i] = 0; queue[tail++] = i; }
  while (head < tail) {
    const j = queue[head++];
    const d = dist[j];
    if (d >= spread) continue;
    const c = j % w;
    const r = (j / w) | 0;
    for (const [dc, dr] of NEIGHBOURS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= w || nr >= h) continue;
      const k = nr * w + nc;
      if (dist[k] > d + 1) { dist[k] = d + 1; queue[tail++] = k; }
    }
  }
  const cost = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = dist[i];
    if (d <= lethal) cost[i] = Infinity;
    else cost[i] = 1 + (d <= spread ? 10 * Math.exp(-0.8 * (d - lethal - 1)) : 0) + (cls[i] === UNKNOWN ? 1 : 0);
  }
  return cost;
}

class Heap {
  constructor() { this.items = []; this.keys = []; }
  get size() { return this.items.length; }
  push(item, key) {
    const a = this.items;
    const k = this.keys;
    a.push(item);
    k.push(key);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [a[p], a[i]] = [a[i], a[p]];
      [k[p], k[i]] = [k[i], k[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const k = this.keys;
    const top = a[0];
    const lastItem = a.pop();
    const lastKey = k.pop();
    if (a.length) {
      a[0] = lastItem;
      k[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && k[l] < k[m]) m = l;
        if (r < a.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [k[m], k[i]] = [k[i], k[m]];
        i = m;
      }
    }
    return top;
  }
}

function nearestPassable(g, cost, index, maxRing = 30) {
  const c0 = index % g.w;
  const r0 = (index / g.w) | 0;
  for (let ring = 1; ring <= maxRing; ring++) {
    let best = -1;
    let bestD = Infinity;
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const c = c0 + dc;
        const r = r0 + dr;
        if (!g.inside(c, r)) continue;
        const k = r * g.w + c;
        const d = dc * dc + dr * dr;
        if (Number.isFinite(cost[k]) && d < bestD) { bestD = d; best = k; }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

export function astar(g, cost, sx, sy, gx, gy) {
  const { w } = g;
  const [sc, sr] = g.cell(sx, sy);
  const [gc, gr] = g.cell(gx, gy);
  if (!g.inside(sc, sr) || !g.inside(gc, gr)) return null;
  const start = sr * w + sc;
  let goal = gr * w + gc;
  if (!Number.isFinite(cost[goal])) {
    goal = nearestPassable(g, cost, goal);
    if (goal < 0) return null;
  }
  const gcol = goal % w;
  const grow = (goal / w) | 0;
  const n = cost.length;
  const gScore = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new Heap();
  gScore[start] = 0;
  heap.push(start, 0);
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) break;
    const c = cur % w;
    const r = (cur / w) | 0;
    for (const [dc, dr, step] of NEIGHBOURS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!g.inside(nc, nr)) continue;
      const k = nr * w + nc;
      if (closed[k]) continue;
      let ck = cost[k];
      // Let Pip escape if it starts inside an inflated zone (e.g. right after a bump).
      if (!Number.isFinite(ck) && g.cls[k] !== OCC && Math.max(Math.abs(nc - sc), Math.abs(nr - sr)) <= 4) ck = 8;
      if (!Number.isFinite(ck)) continue;
      const ng = gScore[cur] + step * ck;
      if (ng < gScore[k]) {
        gScore[k] = ng;
        came[k] = cur;
        heap.push(k, ng + Math.hypot(nc - gcol, nr - grow));
      }
    }
  }
  if (!closed[goal]) return null;
  const path = [];
  for (let j = goal; j !== -1; j = came[j]) path.push(g.center(j % w, (j / w) | 0));
  return path.reverse();
}

function lineOfSight(g, cost, [x0, y0], [x1, y1]) {
  let [c, r] = g.cell(x0, y0);
  const [c1, r1] = g.cell(x1, y1);
  const dc = Math.abs(c1 - c);
  const dr = -Math.abs(r1 - r);
  const sc = c < c1 ? 1 : -1;
  const sr = r < r1 ? 1 : -1;
  let err = dc + dr;
  for (;;) {
    if (!g.inside(c, r) || !(cost[r * g.w + c] < 4)) return false;
    if (c === c1 && r === r1) return true;
    const e2 = 2 * err;
    if (e2 >= dr) { err += dr; c += sc; }
    if (e2 <= dc) { err += dc; r += sr; }
  }
}

// Shortcut the grid staircase into straight runs, then resample every 5 cm for path following.
export function smoothPath(g, cost, pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = Math.min(pts.length - 1, i + 60);
    while (j > i + 1 && !lineOfSight(g, cost, pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  const dense = [out[0]];
  for (let k = 1; k < out.length; k++) {
    const [ax, ay] = out[k - 1];
    const [bx, by] = out[k];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.05));
    for (let s = 1; s <= steps; s++) dense.push([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps]);
  }
  return dense;
}
