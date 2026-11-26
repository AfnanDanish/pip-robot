// Occupancy grid mapping with log-odds updates along each lidar ray.
export const UNKNOWN = -1;
export const FREE = 0;
export const OCC = 100;

const L_FREE = -0.4;
const L_OCC = 0.9;
const L_LIMIT = 4;
const THRESHOLD = 0.7;

export class Grid {
  constructor({ res = 0.05, x0 = -4.3, y0 = -3.3, w = 172, h = 132 } = {}) {
    Object.assign(this, { res, x0, y0, w, h });
    this.L = new Float32Array(w * h);
    this.cls = new Int8Array(w * h).fill(UNKNOWN);
    this.version = 0;
  }

  reset() {
    this.L.fill(0);
    this.cls.fill(UNKNOWN);
    this.version++;
  }

  cell(x, y) {
    return [Math.floor((x - this.x0) / this.res), Math.floor((y - this.y0) / this.res)];
  }

  center(c, r) {
    return [this.x0 + (c + 0.5) * this.res, this.y0 + (r + 0.5) * this.res];
  }

  inside(c, r) {
    return c >= 0 && r >= 0 && c < this.w && r < this.h;
  }

  at(x, y) {
    const [c, r] = this.cell(x, y);
    return this.inside(c, r) ? this.cls[r * this.w + c] : UNKNOWN;
  }

  bump(c, r, delta) {
    if (!this.inside(c, r)) return;
    const i = r * this.w + c;
    const l = Math.max(-L_LIMIT, Math.min(L_LIMIT, this.L[i] + delta));
    this.L[i] = l;
    this.cls[i] = l > THRESHOLD ? OCC : l < -THRESHOLD ? FREE : UNKNOWN;
  }

  // maxRange here is the mapping range, not the sensor's. Far beams are sparse and spread out, so
  // anything past ~4.5 m paints a noisy starburst instead of floor. Better to wait until Pip is closer.
  integrate(scan, maxRange) {
    const [c0, r0] = this.cell(scan.x, scan.y);
    for (let i = 0; i < scan.ranges.length; i++) {
      const hit = Number.isFinite(scan.ranges[i]) && scan.ranges[i] < maxRange;
      const d = hit ? scan.ranges[i] : maxRange;
      const a = scan.th + scan.angles[i];
      const [c1, r1] = this.cell(scan.x + d * Math.cos(a), scan.y + d * Math.sin(a));
      // Bresenham: every cell the beam crosses is free, the cell it hits is occupied.
      let c = c0;
      let r = r0;
      const dc = Math.abs(c1 - c0);
      const dr = -Math.abs(r1 - r0);
      const sc = c0 < c1 ? 1 : -1;
      const sr = r0 < r1 ? 1 : -1;
      let err = dc + dr;
      while (c !== c1 || r !== r1) {
        this.bump(c, r, L_FREE);
        const e2 = 2 * err;
        if (e2 >= dr) { err += dr; c += sc; }
        if (e2 <= dc) { err += dc; r += sr; }
      }
      this.bump(c1, r1, hit ? L_OCC : L_FREE);
    }
    this.version++;
  }

  freeArea() {
    let n = 0;
    for (let i = 0; i < this.cls.length; i++) if (this.cls[i] === FREE) n++;
    return n * this.res * this.res;
  }
}
