// Pip's behaviour: the same state machine as brain.py + docking.py + explorer.py, in one place.
import { approachCommand, fitDockFace, scanPoints } from './dock.js';
import { chooseFrontier, findFrontiers, stillFrontier } from './plan.js';
import { CONTACT_OFFSET, DOCKED_POSE } from './world.js';
import { clamp, wrap } from './util.js';

const STAGING = { x: DOCKED_POSE.x - 0.6, y: DOCKED_POSE.y };
const FACE = { x: DOCKED_POSE.x + CONTACT_OFFSET, y: DOCKED_POSE.y };
const LOW_BATTERY = 0.25;
const RESUME_BATTERY = 0.9;
const CREEP_START = 0.28;
const MAX_RETRIES = 3;

export const STATE_LABELS = {
  docked: 'Charging on the dock',
  undocking: 'Leaving the dock',
  exploring: 'Exploring',
  patrolling: 'Wandering around',
  going: 'Going where you clicked',
  returning: 'Heading home',
  aligning: 'Lining up with the dock',
  creeping: 'Docking',
  backoff: 'Backing up to try again',
  idle: 'Waiting',
  stranded: 'Stuck, needs help',
};

export class Brain {
  constructor({ robot, grid, nav, battery, emit }) {
    Object.assign(this, { robot, grid, nav, battery, emit });
    this.reset();
  }

  reset() {
    this.state = 'docked';
    this.t0 = 0;
    this.activity = 'explore';
    this.explored = false;
    this.sleeping = false;
    this.booted = false;
    this.blacklist = [];
    this.emptyChecks = 0;
    this.nextDecision = 0;
    this.nextFrontierCheck = 0;
    this.pauseUntil = 0;
    this.retries = 0;
    this.lowAnnounced = false;
    this.pendingGoto = null;
    this.move = null;
    this.lastCloseCall = -1e9;
    this.nav.cancel();
  }

  set(state, now) {
    this.state = state;
    this.t0 = now;
  }

  charging() {
    const r = this.robot;
    return Math.hypot(r.x - DOCKED_POSE.x, r.y - DOCKED_POSE.y) < 0.06 && Math.abs(wrap(r.th - DOCKED_POSE.th)) < 0.25;
  }

  // --- commands from the buttons and map clicks -------------------------------------------------

  command(cmd, now, arg) {
    if (cmd === 'hello') { this.emit('greet'); return; }
    if (cmd === 'sleep') {
      this.sleeping = true;
      this.emit('sleep');
      this.goHome(now);
      return;
    }
    if (cmd === 'wake') { this.sleeping = false; this.emit('wake'); return; }
    if (cmd === 'home') { this.goHome(now); return; }
    if (cmd === 'stop') {
      this.activity = 'idle';
      this.nav.cancel();
      if (!['docked', 'undocking'].includes(this.state)) this.set('idle', now);
      return;
    }
    this.sleeping = false;
    if (cmd === 'explore' || cmd === 'patrol') {
      this.activity = cmd;
      if (cmd === 'explore') { this.explored = false; this.blacklist = []; }
    } else if (cmd === 'goto') {
      this.pendingGoto = arg;
    }
    if (this.state === 'docked') {
      if (this.battery.level > LOW_BATTERY + 0.1) this.undock(now);
    } else if (!['undocking', 'backoff'].includes(this.state)) {
      this.startActivity(now);
    }
  }

  // --- transitions -------------------------------------------------------------------------------

  undock(now) {
    this.emit('undocking');
    this.startMove(-0.35, 'undocking', now);
  }

  goHome(now) {
    this.nav.cancel();
    if (this.charging()) { this.set('docked', now); return; }
    this.retries = 0;
    this.set('returning', now);
  }

  startActivity(now) {
    this.nav.cancel();
    if (this.pendingGoto) {
      const [x, y] = this.pendingGoto;
      this.pendingGoto = null;
      this.nav.goTo(x, y, now);
      this.set('going', now);
    } else if (this.activity === 'explore' && !this.explored) {
      this.emptyChecks = 0;
      this.emit('exploration_started');
      this.set('exploring', now);
    } else if (this.activity !== 'idle') {
      this.pauseUntil = now + 1;
      this.set('patrolling', now);
    } else {
      this.set('idle', now);
    }
  }

  startMove(distance, state, now, speed = 0.08) {
    this.move = { origin: this.robot.odom, target: Math.abs(distance), speed: Math.sign(distance) * speed };
    this.set(state, now);
  }

  moved() {
    return this.robot.odom - this.move.origin;
  }

  retry(now, reason) {
    this.retries++;
    this.emit('dock_failed', { reason });
    if (this.retries > MAX_RETRIES) {
      this.emit('stranded');
      this.set('stranded', now);
    } else if (this.state === 'aligning') {
      this.set('returning', now);
    } else {
      this.startMove(-0.3, 'backoff', now);
    }
  }

  // --- main update, called every simulation step -------------------------------------------------

  update(now, scan) {
    const front = frontClearance(scan);
    if (this.robot.v > 0.05 && front < 0.2 && !['aligning', 'creeping'].includes(this.state) && now - this.lastCloseCall > 5) {
      this.lastCloseCall = now;
      this.emit('close_call');
    }
    if (!this.booted && now > 1.5) {
      this.booted = true;
      this.emit('boot');
    }
    if (this.battery.level > LOW_BATTERY + 0.05) this.lowAnnounced = false;
    if (this.battery.level < LOW_BATTERY && ['exploring', 'patrolling', 'going', 'idle'].includes(this.state)) {
      if (!this.lowAnnounced) { this.emit('low_battery'); this.lowAnnounced = true; }
      this.goHome(now);
    }

    const blocked = front < 0.18;
    switch (this.state) {
      case 'docked':
        if (!this.charging()) { this.set('idle', now); break; }
        if (this.booted && !this.sleeping && this.activity !== 'idle' && this.battery.level >= RESUME_BATTERY && now - this.t0 > 3) {
          this.undock(now);
        }
        return stop;
      case 'undocking':
      case 'backoff':
      case 'creeping':
        return this.moveStep(now);
      case 'exploring':
        return this.exploreStep(now, blocked);
      case 'patrolling':
        return this.patrolStep(now, blocked);
      case 'going': {
        const cmd = this.nav.update(this.robot, now, blocked);
        if (this.nav.state === 'succeeded') { this.emit('goto_arrived'); this.resumeAfter(now); }
        if (this.nav.state === 'failed') { this.emit('nav_failed'); this.resumeAfter(now); }
        return cmd;
      }
      case 'returning':
        return this.returnStep(now, blocked);
      case 'aligning':
        return this.alignStep(now, scan);
      default:
        return stop;
    }
    return stop;
  }

  resumeAfter(now) {
    this.startActivity(now);
    this.pauseUntil = now + 3;
  }

  moveStep(now) {
    const s = this.state;
    const done = this.moved() >= this.move.target;
    if (s === 'creeping') {
      if (this.charging()) {
        this.retries = 0;
        this.set('docked', now);
        this.emit('docked');
        return stop;
      }
      if (done || now - this.t0 > 8 || (this.robot.bumped && now - this.t0 > 0.5)) {
        this.retry(now, 'no charging contact');
        return stop;
      }
      return { v: this.move.speed, w: 0 };
    }
    if (done || now - this.t0 > 10) {
      if (s === 'backoff') this.set('aligning', now);
      else this.startActivity(now);
      return stop;
    }
    return { v: this.move.speed, w: 0 };
  }

  exploreStep(now, blocked) {
    const nav = this.nav;
    if (nav.state === 'active') {
      if (now >= this.nextFrontierCheck) {
        this.nextFrontierCheck = now + 1;
        if (!stillFrontier(this.grid, nav.goal[0], nav.goal[1])) nav.cancel();
      }
      if (nav.state === 'active') return nav.update(this.robot, now, blocked);
    }
    if (nav.state === 'failed') {
      this.blacklist.push(nav.goal);
      this.emit('nav_failed');
      nav.cancel();
    } else if (nav.state === 'succeeded') {
      this.blacklist.push(nav.goal);
      nav.cancel();
    }
    if (now < this.nextDecision) return stop;
    this.nextDecision = now + 0.5;
    const { frontiers } = findFrontiers(this.grid, 10);
    const pick = chooseFrontier(frontiers, this.robot, this.grid.res, this.blacklist);
    if (!pick) {
      if (++this.emptyChecks >= 3) {
        this.explored = true;
        this.emit('exploration_done');
        this.pauseUntil = now + 2;
        this.set('patrolling', now);
      }
      return stop;
    }
    this.emptyChecks = 0;
    nav.goTo(pick.goal[0], pick.goal[1], now);
    this.emit('new_frontier');
    return stop;
  }

  patrolStep(now, blocked) {
    const nav = this.nav;
    if (nav.state === 'active') return nav.update(this.robot, now, blocked);
    if (nav.state === 'succeeded') { this.emit('patrol_arrived'); this.pauseUntil = now + 4; nav.cancel(); }
    if (nav.state === 'failed') { this.pauseUntil = now + 1; nav.cancel(); }
    if (now < this.pauseUntil) return { v: 0, w: 0.35 * Math.sin(now * 1.3) }; // look around
    const point = this.randomFreePoint();
    if (point) nav.goTo(point[0], point[1], now);
    else this.pauseUntil = now + 2;
    return stop;
  }

  randomFreePoint() {
    const g = this.grid;
    for (let tries = 0; tries < 300; tries++) {
      const c = Math.floor(Math.random() * g.w);
      const r = Math.floor(Math.random() * g.h);
      const [x, y] = g.center(c, r);
      if (Math.hypot(x - this.robot.x, y - this.robot.y) < 1.5) continue;
      let clear = true;
      for (let dr = -6; dr <= 6 && clear; dr++) {
        for (let dc = -6; dc <= 6 && clear; dc++) {
          if (dr * dr + dc * dc > 36) continue;
          if (!g.inside(c + dc, r + dr) || g.cls[(r + dr) * g.w + c + dc] !== 0) clear = false;
        }
      }
      if (clear) return [x, y];
    }
    return null;
  }

  returnStep(now, blocked) {
    const nav = this.nav;
    if (Math.hypot(this.robot.x - STAGING.x, this.robot.y - STAGING.y) < 0.2) {
      nav.cancel();
      this.set('aligning', now);
      return stop;
    }
    if (nav.state === 'idle') nav.goTo(STAGING.x, STAGING.y, now);
    if (nav.state === 'succeeded') { nav.cancel(); this.set('aligning', now); return stop; }
    if (nav.state === 'failed') {
      nav.cancel();
      if (++this.retries > MAX_RETRIES) { this.emit('stranded'); this.set('stranded', now); }
      return stop;
    }
    return nav.update(this.robot, now, blocked);
  }

  alignStep(now, scan) {
    const r = this.robot;
    const c = Math.cos(-r.th);
    const s = Math.sin(-r.th);
    const dx = FACE.x - r.x;
    const dy = FACE.y - r.y;
    const expected = [c * dx - s * dy, s * dx + c * dy];
    const obs = scan ? fitDockFace(scanPoints(scan), expected) : null;
    if (!obs) {
      if (now - this.t0 > 4) this.retry(now, 'dock not visible');
      return stop;
    }
    this.dockObs = obs;
    const cmd = approachCommand(obs, CONTACT_OFFSET);
    if (cmd.dist <= CREEP_START) {
      if (Math.abs(cmd.lateral) > 0.03) { this.retry(now, 'off the centre line'); return stop; }
      if (Math.abs(cmd.headingErr) > 0.05) return { v: 0, w: clamp(1.5 * cmd.headingErr, -0.5, 0.5) };
      this.startMove(cmd.dist - CONTACT_OFFSET + 0.01, 'creeping', now, 0.04);
      return stop;
    }
    return { v: cmd.v, w: cmd.w };
  }
}

const stop = { v: 0, w: 0 };

function frontClearance(scan) {
  if (!scan) return Infinity;
  let best = Infinity;
  for (let i = 0; i < scan.ranges.length; i++) {
    if (Math.abs(scan.angles[i]) < 0.6 && scan.ranges[i] < best) best = scan.ranges[i];
  }
  return best;
}
