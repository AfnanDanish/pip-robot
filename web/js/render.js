// Drawing for the two plans: the real apartment (a floor plan) and Pip's own map (graph paper).
import { FREE, OCC } from './grid.js';
import { BOUNDS, BOX_SIZE, DOCK, FURNITURE, PLANT, ROOMS, WALLS } from './world.js';

const INK = '#2b2620';
const PAPER = '#fdfbf7';
const PIP = '#f29e2e';
const FONT = '"Instrument Sans", system-ui, sans-serif';

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = w * ((BOUNDS.ymax - BOUNDS.ymin) / (BOUNDS.xmax - BOUNDS.xmin));
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.s = this.canvas.width / (BOUNDS.xmax - BOUNDS.xmin);
  }

  X(x) { return (x - BOUNDS.xmin) * this.s; }
  Y(y) { return (BOUNDS.ymax - y) * this.s; }

  toWorld(evt) {
    const rect = this.canvas.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * this.canvas.width;
    const py = ((evt.clientY - rect.top) / rect.height) * this.canvas.height;
    return [BOUNDS.xmin + px / this.s, BOUNDS.ymax - py / this.s];
  }

  rect(cx, cy, sx, sy) {
    this.ctx.beginPath();
    this.ctx.rect(this.X(cx - sx / 2), this.Y(cy + sy / 2), sx * this.s, sy * this.s);
  }
}

// Top-down Pip: orange body, wheels, lidar turret, two eye slits at the front.
export function drawRobot(view, r) {
  const { ctx, s } = view;
  ctx.save();
  ctx.translate(view.X(r.x), view.Y(r.y));
  ctx.rotate(-r.th);
  ctx.fillStyle = INK;
  ctx.fillRect(-0.06 * s, -0.11 * s, 0.12 * s, 0.025 * s);
  ctx.fillRect(-0.06 * s, 0.085 * s, 0.12 * s, 0.025 * s);
  ctx.fillStyle = PIP;
  ctx.strokeStyle = '#7a4300';
  ctx.lineWidth = Math.max(1, 0.006 * s);
  ctx.beginPath();
  ctx.roundRect(-0.1 * s, -0.08 * s, 0.2 * s, 0.16 * s, 0.03 * s);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0, 0, 0.034 * s, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#5ae1ff';
  ctx.fillRect(0.086 * s, -0.045 * s, 0.012 * s, 0.025 * s);
  ctx.fillRect(0.086 * s, 0.02 * s, 0.012 * s, 0.025 * s);
  ctx.restore();
}

function label(view, text, x, y, size = 0.15, color = 'rgba(43,38,32,0.45)') {
  const { ctx, s } = view;
  ctx.fillStyle = color;
  ctx.font = `500 ${Math.round(size * s)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, view.X(x), view.Y(y));
}

export function drawWorld(view, world, robot, scan) {
  const { ctx, s } = view;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, view.canvas.width, view.canvas.height);

  for (const room of ROOMS) {
    ctx.fillStyle = room.color;
    view.rect((room.x0 + room.x1) / 2, (room.y0 + room.y1) / 2, room.x1 - room.x0, room.y1 - room.y0);
    ctx.fill();
  }

  ctx.lineWidth = Math.max(1, 0.012 * s);
  for (const f of FURNITURE) {
    ctx.fillStyle = f.color;
    ctx.strokeStyle = 'rgba(43,38,32,0.5)';
    view.rect(...f.box);
    ctx.fill();
    ctx.stroke();
    if (f.label) label(view, f.label, f.box[0], f.box[1], 0.11, 'rgba(43,38,32,0.6)');
  }
  ctx.fillStyle = '#9cbf8a';
  ctx.strokeStyle = 'rgba(43,38,32,0.5)';
  ctx.beginPath();
  ctx.arc(view.X(PLANT.x), view.Y(PLANT.y), PLANT.r * s, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  label(view, 'living room', 2.0, -0.3);
  label(view, 'bedroom', -1.55, 0.5);
  label(view, 'kitchen', -3.0, -0.45);

  for (const b of world.boxes) {
    ctx.fillStyle = '#d9b27a';
    ctx.strokeStyle = '#8a6a3a';
    view.rect(b.x, b.y, BOX_SIZE, BOX_SIZE);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,250,235,0.7)';
    view.rect(b.x, b.y, BOX_SIZE, 0.05);
    ctx.fill();
  }

  // Lidar beams first so the walls sit on top of them.
  if (scan) {
    ctx.strokeStyle = 'rgba(217, 72, 43, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < scan.ranges.length; i += 2) {
      const r = Number.isFinite(scan.ranges[i]) ? scan.ranges[i] : 8;
      const a = scan.th + scan.angles[i];
      ctx.moveTo(view.X(scan.x), view.Y(scan.y));
      ctx.lineTo(view.X(scan.x + r * Math.cos(a)), view.Y(scan.y + r * Math.sin(a)));
    }
    ctx.stroke();
  }

  ctx.fillStyle = INK;
  for (const w of WALLS) { view.rect(...w); ctx.fill(); }
  ctx.fillStyle = INK;
  view.rect(...DOCK.box);
  ctx.fill();
  ctx.fillStyle = PIP;
  view.rect(DOCK.box[0] - 0.045, DOCK.box[1], 0.02, 0.2);
  ctx.fill();

  if (scan) {
    ctx.fillStyle = '#d9482b';
    const dot = Math.max(1.5, 0.018 * s);
    for (let i = 0; i < scan.ranges.length; i++) {
      if (!Number.isFinite(scan.ranges[i])) continue;
      const a = scan.th + scan.angles[i];
      ctx.fillRect(view.X(scan.x + scan.ranges[i] * Math.cos(a)) - dot / 2, view.Y(scan.y + scan.ranges[i] * Math.sin(a)) - dot / 2, dot, dot);
    }
  }
  drawRobot(view, robot);
}

export class MapPainter {
  constructor(grid) {
    this.grid = grid;
    this.off = document.createElement('canvas');
    this.off.width = grid.w;
    this.off.height = grid.h;
    this.img = this.off.getContext('2d').createImageData(grid.w, grid.h);
    this.version = -1;
  }

  refresh(mask) {
    const { w, h, cls } = this.grid;
    const d = this.img.data;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const i = r * w + c;
        const o = ((h - 1 - r) * w + c) * 4;
        let rgb;
        if (mask && mask[i]) rgb = [47, 111, 179];
        else if (cls[i] === FREE) rgb = [255, 253, 248];
        else if (cls[i] === OCC) rgb = [43, 38, 32];
        else rgb = [228, 222, 210];
        d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
      }
    }
    this.off.getContext('2d').putImageData(this.img, 0, 0);
  }

  draw(view, { robot, nav, blacklist, dock, mask }) {
    const { ctx, s } = view;
    const g = this.grid;
    if (g.version !== this.version) { this.refresh(mask); this.version = g.version; }
    ctx.fillStyle = '#e4ded2';
    ctx.fillRect(0, 0, view.canvas.width, view.canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, view.X(g.x0), view.Y(g.y0 + g.h * g.res), g.w * g.res * s, g.h * g.res * s);

    // Graph paper: a faint line every 50 cm so you can read distances off the map.
    ctx.strokeStyle = 'rgba(43,38,32,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -4; x <= 4.001; x += 0.5) { ctx.moveTo(view.X(x), 0); ctx.lineTo(view.X(x), view.canvas.height); }
    for (let y = -3; y <= 3.001; y += 0.5) { ctx.moveTo(0, view.Y(y)); ctx.lineTo(view.canvas.width, view.Y(y)); }
    ctx.stroke();

    // Places Pip gave up on, crossed out in pencil.
    ctx.strokeStyle = 'rgba(43,38,32,0.35)';
    ctx.lineWidth = Math.max(1, 0.012 * s);
    for (const [bx, by] of blacklist) {
      const k = 0.05 * s;
      ctx.beginPath();
      ctx.moveTo(view.X(bx) - k, view.Y(by) - k); ctx.lineTo(view.X(bx) + k, view.Y(by) + k);
      ctx.moveTo(view.X(bx) + k, view.Y(by) - k); ctx.lineTo(view.X(bx) - k, view.Y(by) + k);
      ctx.stroke();
    }

    // Home.
    ctx.fillStyle = PIP;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, 0.01 * s);
    ctx.beginPath();
    ctx.arc(view.X(dock.x + 0.17), view.Y(dock.y), 0.055 * s, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    if (nav.path) {
      ctx.strokeStyle = PIP;
      ctx.lineWidth = Math.max(2, 0.03 * s);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(view.X(robot.x), view.Y(robot.y));
      for (let i = nav.index; i < nav.path.length; i++) ctx.lineTo(view.X(nav.path[i][0]), view.Y(nav.path[i][1]));
      ctx.stroke();
    }
    if (nav.state === 'active' && nav.goal) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, 0.015 * s);
      const k = 0.07 * s;
      const gx = view.X(nav.goal[0]);
      const gy = view.Y(nav.goal[1]);
      ctx.beginPath();
      ctx.moveTo(gx - k, gy); ctx.lineTo(gx + k, gy);
      ctx.moveTo(gx, gy - k); ctx.lineTo(gx, gy + k);
      ctx.stroke();
    }
    drawRobot(view, robot);
  }
}
