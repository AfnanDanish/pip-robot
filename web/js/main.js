import { Voice } from './audio.js';
import { Brain, STATE_LABELS } from './brain.js';
import { setupCommentary } from './commentary.js';
import { EyeRenderer } from './eyes.js';
import { Grid } from './grid.js';
import { MoodEngine } from './mood.js';
import { Navigator } from './nav.js';
import { findFrontiers } from './plan.js';
import { drawWorld, MapPainter, View } from './render.js';
import { Battery, MAP_RANGE, Robot } from './robot.js';
import { DOCKED_POSE, roomAt, World } from './world.js';

// The physics runs at 50 Hz and the lidar at 10 Hz, same as the Gazebo version. Speeding the page
// up runs more physics steps per frame rather than bigger ones, so 8× behaves like 1×, just sooner.
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
let mood = new MoodEngine();
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
let roomsSeen = new Set(['living room']);

const brain = new Brain({ robot, grid, nav, battery, emit });

function emit(kind) {
  for (const [type, payload] of mood.onEvent(kind, simTime)) {
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
  log(`“${text}”`, 'said');
}

function log(text, kind = '') {
  const li = document.createElement('li');
  if (kind) li.className = kind;
  const m = Math.floor(simTime / 60);
  const s = Math.floor(simTime % 60).toString().padStart(2, '0');
  li.innerHTML = `<time>${m}:${s}</time><span></span>`;
  li.lastChild.textContent = text;
  const list = $('log');
  list.prepend(li);
  while (list.children.length > 8) list.lastChild.remove();
}

function step() {
  simTime += SIM_DT;
  if (simTime >= nextScan) {
    nextScan = simTime + SCAN_DT;
    scan = robot.scan(world);
    grid.integrate(scan, MAP_RANGE);
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
  const room = roomAt(robot.x, robot.y);
  if (room && !roomsSeen.has(room)) {
    roomsSeen.add(room);
    emit(`room_${room}`);
  }
}

let last = performance.now();
let lastState = null;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const steps = Math.min(400, Math.round((dt * speed) / SIM_DT));
  for (let i = 0; i < steps; i++) step();

  // Frontiers only matter while exploring, so don't recompute them every frame after that.
  if (grid.version !== frontierVersion && (brain.state === 'exploring' || frontierVersion < 0 || grid.version - frontierVersion > 20)) {
    frontierMask = findFrontiers(grid, 10).mask;
    frontierVersion = grid.version;
    painter.version = -1;
  }

  drawWorld(worldView, world, robot, scan);
  painter.draw(mapView, {
    robot, nav, dock: DOCKED_POSE,
    blacklist: brain.state === 'exploring' ? brain.blacklist : [],
    mask: brain.explored ? null : frontierMask,
  });

  const currentMood = mood.tick(simTime);
  eyes.update(dt, currentMood, robot.w);
  eyes.draw(eyesCtx, eyesCanvas.width, eyesCanvas.height);

  let label = STATE_LABELS[brain.state] || brain.state;
  if (brain.state === 'docked' && battery.level >= 0.999) label = brain.sleeping ? 'Asleep on the dock' : 'On the dock, fully charged';
  $('st-state').textContent = label;
  $('st-mood').textContent = currentMood;
  $('st-bat').textContent = `${Math.round(battery.level * 100)}%`;
  const bar = $('st-bat-bar');
  bar.style.width = `${battery.level * 100}%`;
  bar.style.background = battery.level < 0.25 ? '#c4452f' : brain.charging() ? '#3f8f5e' : '#2b2620';
  $('st-map').textContent = `${grid.freeArea().toFixed(1)} m²`;
  $('sleepBtn').textContent = brain.sleeping ? 'Wake up' : 'Sleep';
  if (brain.state !== lastState) {
    log(label);
    lastState = brain.state;
  }
  if (now > bubbleUntil) $('bubble').classList.remove('show');
  requestAnimationFrame(frame);
}

// --- Controls -----------------------------------------------------------------------------------

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
  $('sound').setAttribute('aria-pressed', String(voice.enabled));
  if (voice.enabled) voice.beep('greet');
});

const commentary = setupCommentary();
let commentaryOn = true;
$('commentary').addEventListener('click', () => {
  commentaryOn = !commentaryOn;
  commentary.setVisible(commentaryOn);
  $('commentary').textContent = commentaryOn ? 'Commentary on' : 'Commentary off';
  $('commentary').classList.toggle('on', commentaryOn);
  $('commentary').setAttribute('aria-pressed', String(commentaryOn));
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
  mood = new MoodEngine();
  roomsSeen = new Set(['living room']);
  frontierVersion = -1;
  $('log').innerHTML = '';
});

function poked(x, y) {
  return Math.hypot(x - robot.x, y - robot.y) < 0.18;
}

$('map').addEventListener('click', (e) => {
  const [x, y] = mapView.toWorld(e);
  if (!world.inside(x, y)) return;
  if (poked(x, y)) { emit('poked'); return; }
  brain.command('goto', simTime, [x, y]);
  log('You pointed somewhere');
});

$('world').addEventListener('click', (e) => {
  const [x, y] = worldView.toWorld(e);
  if (!world.inside(x, y)) return;
  if (poked(x, y)) { emit('poked'); return; }
  if (Math.hypot(x - robot.x, y - robot.y) < 0.35) return;
  if (Math.hypot(x - DOCKED_POSE.x, y - DOCKED_POSE.y) < 0.8) return; // the dock stays reachable, I'm not that mean
  const before = world.boxes.length;
  world.toggleBox(x, y);
  if (world.boxes.length > before && Math.hypot(x - robot.x, y - robot.y) < 1.5) emit('box_dropped');
});

window.addEventListener('resize', () => {
  worldView.resize();
  mapView.resize();
  painter.version = -1;
});

requestAnimationFrame(frame);
