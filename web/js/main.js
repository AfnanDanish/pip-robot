import { Brain, STATE_LABELS } from './brain.js';
import { EyeRenderer } from './eyes.js';
import { Grid } from './grid.js';
import { MoodEngine } from './mood.js';
import { Navigator } from './nav.js';
import { findFrontiers } from './plan.js';
import { drawWorld, MapPainter, View } from './render.js';
import { Battery, MAX_RANGE, Robot } from './robot.js';
import { Voice } from './audio.js';
import { DOCKED_POSE, World } from './world.js';

const SIM_DT = 0.02;
const SCAN_DT = 0.1;

const $ = (id) => document.getElementById(id);
const worldView = new View($('world'));
const mapView = new View($('map'));
const eyesCanvas = $('eyes');
const eyesCtx = eyesCanvas.getContext('2d');

const world = new World();
const grid = new Grid();
const robot = new Robot(DOCKED_POSE);
const battery = new Battery();
const nav = new Navigator(grid);
const mood = new MoodEngine();
const eyes = new EyeRenderer();
const voice = new Voice();
const painter = new MapPainter(grid);

let simTime = 0;
let nextScan = 0;
let scan = null;
let speed = 1;
let frontierMask = null;
let frontierVersion = -1;
let bubbleUntil = 0;

const brain = new Brain({ robot, grid, nav, battery, emit });

function emit(kind) {
  const actions = mood.onEvent(kind, simTime);
  for (const [type, payload] of actions) {
    if (type === 'sound') voice.beep(payload);
    if (type === 'say') say(payload);
  }
}

function say(text) {
  voice.say(text);
  const bubble = $('bubble');
  bubble.textContent = text;
  bubble.classList.add('show');
  bubbleUntil = performance.now() + 3500;
  log(`“${text}”`);
}

function log(text) {
  const li = document.createElement('li');
  const m = Math.floor(simTime / 60);
  const s = Math.floor(simTime % 60).toString().padStart(2, '0');
  li.innerHTML = `<time>${m}:${s}</time> ${text}`;
  const list = $('log');
  list.prepend(li);
  while (list.children.length > 7) list.lastChild.remove();
}

function step() {
  simTime += SIM_DT;
  if (simTime >= nextScan) {
    nextScan = simTime + SCAN_DT;
    scan = robot.scan(world);
    grid.integrate(scan, MAX_RANGE);
  }
  const cmd = brain.update(simTime, scan);
  robot.move(cmd.v, cmd.w, SIM_DT, world);
  const charging = brain.charging();
  battery.update(SIM_DT, robot.v, robot.w, charging);
  mood.onMotion(robot.v, robot.w);
  for (const [type, payload] of mood.onBattery(battery.level, charging, simTime)) {
    if (type === 'sound') voice.beep(payload);
    else say(payload);
  }
}

let last = performance.now();
let lastState = null;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const steps = Math.min(400, Math.round((dt * speed) / SIM_DT));
  for (let i = 0; i < steps; i++) step();

  if (grid.version !== frontierVersion && (brain.state === 'exploring' || frontierVersion < 0 || grid.version - frontierVersion > 20)) {
    frontierMask = findFrontiers(grid, 10).mask;
    frontierVersion = grid.version;
    painter.version = -1;
  }

  drawWorld(worldView, world, robot, scan);
  painter.draw(mapView, { robot, nav, blacklist: brain.state === 'exploring' ? brain.blacklist : [], dock: DOCKED_POSE, mask: brain.explored ? null : frontierMask });

  const currentMood = mood.tick(simTime);
  eyes.update(dt, currentMood, robot.w);
  eyes.draw(eyesCtx, eyesCanvas.width, eyesCanvas.height);

  let label = STATE_LABELS[brain.state] || brain.state;
  if (brain.state === 'docked' && battery.level >= 0.999) label = brain.sleeping ? 'Sleeping on the dock' : 'Resting on the dock';
  $('st-state').textContent = label;
  $('st-mood').textContent = currentMood;
  $('st-bat').textContent = `${Math.round(battery.level * 100)}%`;
  const bar = $('st-bat-bar');
  bar.style.width = `${battery.level * 100}%`;
  bar.style.background = battery.level < 0.25 ? '#ff6b5a' : brain.charging() ? '#3ddc84' : '#5ae1ff';
  $('st-map').textContent = `${grid.freeArea().toFixed(1)} m²`;
  $('sleepBtn').textContent = brain.sleeping ? 'Wake up' : 'Sleep';
  if (brain.state !== lastState) {
    log(label);
    lastState = brain.state;
  }
  if (now > bubbleUntil) $('bubble').classList.remove('show');
  requestAnimationFrame(frame);
}

// --- UI -------------------------------------------------------------------------------------------

document.querySelectorAll('[data-cmd]').forEach((btn) => btn.addEventListener('click', () => {
  let cmd = btn.dataset.cmd;
  if (cmd === 'sleep' && brain.sleeping) cmd = 'wake';
  brain.command(cmd, simTime);
}));

document.querySelectorAll('[data-speed]').forEach((btn) => btn.addEventListener('click', () => {
  speed = Number(btn.dataset.speed);
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', b === btn));
}));

$('sound').addEventListener('click', () => {
  voice.setEnabled(!voice.enabled);
  $('sound').textContent = voice.enabled ? 'Sound on' : 'Sound off';
  $('sound').classList.toggle('on', voice.enabled);
  if (voice.enabled) voice.beep('greet');
});

$('reset').addEventListener('click', () => {
  simTime = 0;
  nextScan = 0;
  scan = null;
  robot.reset(DOCKED_POSE);
  battery.level = 1;
  grid.reset();
  world.boxes = [];
  world.rebuild();
  brain.reset();
  Object.assign(mood, new MoodEngine());
  frontierVersion = -1;
  $('log').innerHTML = '';
});

$('map').addEventListener('click', (e) => {
  const [x, y] = mapView.toWorld(e);
  if (!world.inside(x, y)) return;
  brain.command('goto', simTime, [x, y]);
  log('You sent Pip somewhere');
});

$('world').addEventListener('click', (e) => {
  const [x, y] = worldView.toWorld(e);
  if (!world.inside(x, y) || Math.hypot(x - robot.x, y - robot.y) < 0.35) return;
  if (Math.hypot(x - DOCKED_POSE.x, y - DOCKED_POSE.y) < 0.8) return; // keep the dock reachable
  world.toggleBox(x, y);
});

window.addEventListener('resize', () => {
  worldView.resize();
  mapView.resize();
  painter.version = -1;
});

requestAnimationFrame(frame);
