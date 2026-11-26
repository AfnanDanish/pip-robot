// Goal navigation: A* on the inflated map, re-planned every second, followed with pure pursuit.
import { astar, costMap, smoothPath } from './plan.js';
import { clamp, wrap } from './util.js';

export class Navigator {
  constructor(grid) {
    this.grid = grid;
    this.cancel();
  }

  cancel() {
    this.state = 'idle'; // idle | active | succeeded | failed
    this.goal = null;
    this.target = null; // where the plan actually ends (goal nudged out of obstacles)
    this.path = null;
    this.index = 0;
  }

  goTo(x, y, now) {
    this.cancel();
    this.goal = [x, y];
    this.target = [x, y];
    this.state = 'active';
    this.lastPlan = -Infinity;
    this.failures = 0;
    this.bestDist = Infinity;
    this.progressTime = now;
  }

  plan(robot) {
    const cost = costMap(this.grid);
    const raw = astar(this.grid, cost, robot.x, robot.y, this.goal[0], this.goal[1]);
    if (!raw) {
      this.failures++;
      return;
    }
    this.failures = 0;
    this.path = smoothPath(this.grid, cost, raw);
    this.target = raw[raw.length - 1];
    this.index = 0;
  }

  update(robot, now, frontBlocked) {
    if (this.state !== 'active') return { v: 0, w: 0 };
    const dist = Math.hypot(this.target[0] - robot.x, this.target[1] - robot.y);
    if (dist < 0.15) {
      this.state = 'succeeded';
      this.path = null;
      return { v: 0, w: 0 };
    }
    if (now - this.lastPlan > 1.0 || !this.path || (frontBlocked && now - this.lastPlan > 0.4)) {
      this.plan(robot);
      this.lastPlan = now;
      if (this.failures >= 4) {
        this.state = 'failed';
        return { v: 0, w: 0 };
      }
    }
    if (dist < this.bestDist - 0.15) {
      this.bestDist = dist;
      this.progressTime = now;
    } else if (now - this.progressTime > 14) {
      this.state = 'failed';
      return { v: 0, w: 0 };
    }
    if (!this.path) return { v: 0, w: 0 };

    // Pure pursuit: steer at a point 0.35 m ahead along the path.
    const p = this.path;
    let closest = this.index;
    let closestD = Infinity;
    for (let i = this.index; i < Math.min(p.length, this.index + 40); i++) {
      const d = Math.hypot(p[i][0] - robot.x, p[i][1] - robot.y);
      if (d < closestD) { closestD = d; closest = i; }
    }
    this.index = closest;
    let look = p.length - 1;
    for (let i = closest; i < p.length; i++) {
      if (Math.hypot(p[i][0] - robot.x, p[i][1] - robot.y) >= 0.35) { look = i; break; }
    }
    const err = wrap(Math.atan2(p[look][1] - robot.y, p[look][0] - robot.x) - robot.th);
    let v;
    let w;
    if (Math.abs(err) > 0.6) {
      v = 0;
      w = clamp(2.2 * err, -1.4, 1.4);
    } else {
      v = Math.min(0.25, 0.6 * dist + 0.05) * Math.cos(err) ** 2;
      w = clamp(2.4 * err, -1.4, 1.4);
    }
    if (frontBlocked) v = Math.min(v, 0);
    return { v, w };
  }
}
