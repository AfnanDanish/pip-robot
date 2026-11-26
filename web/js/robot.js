import { clamp, gaussian, wrap } from './util.js';

export const RADIUS = 0.105; // collision radius [m]
export const RAYS = 180;
export const MAX_RANGE = 8.0;
export const MIN_RANGE = 0.12;

export class Robot {
  constructor(pose) {
    this.reset(pose);
  }

  reset({ x, y, th }) {
    this.x = x;
    this.y = y;
    this.th = th;
    this.v = 0;
    this.w = 0;
    this.bumped = false;
    this.odom = 0; // distance travelled, like wheel odometry
  }

  move(vCmd, wCmd, dt, world) {
    const k = Math.min(1, dt / 0.12); // motors don't change speed instantly
    this.v += (clamp(vCmd, -0.3, 0.35) - this.v) * k;
    this.w += (clamp(wCmd, -2, 2) - this.w) * k;
    this.th = wrap(this.th + this.w * dt);
    const nx = this.x + this.v * Math.cos(this.th) * dt;
    const ny = this.y + this.v * Math.sin(this.th) * dt;
    if (world.clearance(nx, ny) >= RADIUS) {
      this.odom += Math.hypot(nx - this.x, ny - this.y);
      this.x = nx;
      this.y = ny;
      this.bumped = false;
    } else {
      this.bumped = Math.abs(this.v) > 0.01;
      this.v = 0;
    }
  }

  // 360 degree lidar. Angles are relative to the robot's heading, like a real LaserScan.
  scan(world) {
    const angles = new Float64Array(RAYS);
    const ranges = new Float64Array(RAYS);
    for (let i = 0; i < RAYS; i++) {
      const a = -Math.PI + (i * 2 * Math.PI) / RAYS;
      const wa = this.th + a;
      const r = world.raycast(this.x, this.y, Math.cos(wa), Math.sin(wa), MAX_RANGE);
      angles[i] = a;
      ranges[i] = r >= MAX_RANGE ? Infinity : Math.max(MIN_RANGE, r + 0.006 * gaussian());
    }
    return { x: this.x, y: this.y, th: this.th, angles, ranges };
  }
}

export class Battery {
  constructor() {
    this.level = 1;
  }

  update(dt, v, w, charging) {
    if (charging) this.level = Math.min(1, this.level + 0.02 * dt);
    else this.level = Math.max(0, this.level - (0.0012 + 0.006 * Math.abs(v) + 0.0008 * Math.abs(w)) * dt);
  }
}
