// Pixel-art drawing for the two plans. One canvas pixel is 2.5 cm (40 px per metre), and the
// canvases are scaled up with nearest-neighbour in CSS. Everything is drawn with whole-pixel
// rectangles so nothing gets anti-aliased into mush.
import { FREE, OCC } from './grid.js';
import { BOUNDS, BOX_SIZE, DOCK, FURNITURE, PLANT, ROOMS, WALLS } from './world.js';

export const PX = 40;
const W = Math.round((BOUNDS.xmax - BOUNDS.xmin) * PX);
const H = Math.round((BOUNDS.ymax - BOUNDS.ymin) * PX);

const INK = '#2b2128';
const ORANGE = '#f39a2e';
const CYAN = '#5ce1ff';

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
  }

  resize() {}

  X(x) { return Math.round((x - BOUNDS.xmin) * PX); }
  Y(y) { return Math.round((BOUNDS.ymax - y) * PX); }

  toWorld(evt) {
    const rect = this.canvas.getBoundingClientRect();
    return [
      BOUNDS.xmin + (((evt.clientX - rect.left) / rect.width) * W) / PX,
      BOUNDS.ymax - (((evt.clientY - rect.top) / rect.height) * H) / PX,
    ];
  }

  // A world-space box as whole pixels: [x, y, w, h].
  box(cx, cy, sx, sy) {
    const x0 = this.X(cx - sx / 2);
    const y0 = this.Y(cy + sy / 2);
    return [x0, y0, this.X(cx + sx / 2) - x0, this.Y(cy - sy / 2) - y0];
  }
}

function fill(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// A chunky object: 1px ink outline, light top edge, dark bottom edge.
function block(ctx, [x, y, w, h], color) {
  fill(ctx, INK, x, y, w, h);
  fill(ctx, color, x + 1, y + 1, w - 2, h - 2);
  fill(ctx, shade(color, 0.12), x + 1, y + 1, w - 2, 1);
  fill(ctx, shade(color, -0.14), x + 1, y + h - 2, w - 2, 1);
}

function line(ctx, x0, y0, x1, y1, color, every = 1, size = 1) {
  ctx.fillStyle = color;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let n = 0;
  for (;;) {
    if (n++ % every === 0) ctx.fillRect(x0 - (size >> 1), y0 - (size >> 1), size, size);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// Pip seen from above, rotated pixel by pixel: orange body, ink wheels, lidar turret, two eyes.
export function drawRobot(view, r) {
  const ctx = view.ctx;
  const cx = (r.x - BOUNDS.xmin) * PX;
  const cy = (BOUNDS.ymax - r.y) * PX;
  const c = Math.cos(r.th);
  const s = Math.sin(r.th);
  for (let py = Math.floor(cy - 7); py <= cy + 7; py++) {
    for (let px = Math.floor(cx - 7); px <= cx + 7; px++) {
      const dx = (px + 0.5 - cx) / PX;
      const dy = -(py + 0.5 - cy) / PX;
      const lx = c * dx + s * dy;
      const ly = -s * dx + c * dy;
      let col = null;
      if (Math.abs(lx) <= 0.06 && Math.abs(ly) > 0.075 && Math.abs(ly) <= 0.11) col = INK;
      if (Math.abs(lx) <= 0.105 && Math.abs(ly) <= 0.085) {
        const edge = Math.abs(lx) > 0.08 || Math.abs(ly) > 0.06;
        col = edge ? INK : ORANGE;
        if (lx * lx + ly * ly < 0.028 * 0.028) col = INK;
        else if (!edge && lx > 0.045 && Math.abs(Math.abs(ly) - 0.03) < 0.013) col = CYAN;
      }
      if (col) fill(ctx, col, px, py, 1, 1);
    }
  }
}

// --- The apartment -------------------------------------------------------------------------------

const FLOORS = {
  'living room': (ctx, [x, y, w, h]) => { // wooden planks
    fill(ctx, '#e8c99a', x, y, w, h);
    for (let row = 0; row * 6 < h; row++) {
      fill(ctx, '#d4b27f', x, y + row * 6, w, 1);
      for (let jx = (row * 13) % 24; jx < w; jx += 24) fill(ctx, '#d4b27f', x + jx, y + row * 6, 1, 6);
    }
  },
  bedroom: (ctx, [x, y, w, h]) => { // carpet
    fill(ctx, '#ddc3b6', x, y, w, h);
    for (let j = 0; j < h; j++) for (let i = (j * 3) % 5; i < w; i += 5) fill(ctx, '#cfb0a3', x + i, y + j, 1, 1);
  },
  kitchen: (ctx, [x, y, w, h]) => { // tiles
    for (let j = 0; j < h; j += 8) {
      for (let i = 0; i < w; i += 8) {
        fill(ctx, ((i + j) / 8) % 2 ? '#cfd3c6' : '#c2c7b8', x + i, y + j, Math.min(8, w - i), Math.min(8, h - j));
      }
    }
  },
};

function drawFurniture(ctx, view, f) {
  const r = view.box(...f.box);
  const [x, y, w, h] = r;
  block(ctx, r, f.color);
  switch (f.name) {
    case 'bed':
      block(ctx, [x + 3, y + 3, w - 6, 10], '#fff6e6');
      fill(ctx, shade(f.color, -0.1), x + 2, y + 22, w - 4, 1);
      break;
    case 'couch':
      fill(ctx, shade(f.color, -0.12), x + 1, y + 1, w - 2, 9);
      for (let i = 1; i < 3; i++) fill(ctx, shade(f.color, -0.18), x + Math.round((w * i) / 3), y + 10, 1, h - 12);
      break;
    case 'tv':
      fill(ctx, '#4a5a72', x + 3, y + 4, w - 6, h - 8);
      fill(ctx, '#6f86a8', x + 4, y + 5, 2, h - 10);
      break;
    case 'counter':
      block(ctx, [x + 10, y + 4, 22, h - 8], '#9fb3c0');
      for (const ox of [w - 34, w - 20]) block(ctx, [x + ox, y + 6, 10, 10], '#3a3438');
      break;
    case 'wardrobe':
      fill(ctx, shade(f.color, -0.2), x + Math.floor(w / 2), y + 1, 1, h - 2);
      fill(ctx, INK, x + Math.floor(w / 2) - 3, y + Math.floor(h / 2), 1, 2);
      fill(ctx, INK, x + Math.floor(w / 2) + 2, y + Math.floor(h / 2), 1, 2);
      break;
    case 'armchair':
      block(ctx, [x + 5, y + 5, w - 10, h - 10], shade(f.color, 0.06));
      break;
    default:
      fill(ctx, shade(f.color, 0.18), x + 3, y + 3, 4, 2);
  }
}

function drawPlant(ctx, view) {
  const cx = view.X(PLANT.x);
  const cy = view.Y(PLANT.y);
  const R = PLANT.r * PX;
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d > R) continue;
      let col = d > R - 1.2 ? INK : '#5fae5a';
      if (d <= R - 1.2 && ((x * 7 + y * 3) & 7) === 0) col = '#8fd68a';
      if (d <= R - 1.2 && ((x * 5 - y * 9) & 15) === 1) col = '#3f7f42';
      fill(ctx, col, cx + x, cy + y, 1, 1);
    }
  }
}

function drawBox(ctx, view, b) {
  const r = view.box(b.x, b.y, BOX_SIZE, BOX_SIZE);
  const [x, y, w, h] = r;
  block(ctx, r, '#d9a866');
  fill(ctx, '#f2deb0', x + Math.floor(w / 2) - 1, y + 1, 3, h - 2);
  fill(ctx, '#a87a40', x + 1, y + Math.floor(h / 2), w - 2, 1);
}

export class WorldPainter {
  constructor() {
    this.bg = document.createElement('canvas');
    this.bg.width = W;
    this.bg.height = H;
    this.key = null;
  }

  // Everything that doesn't move gets drawn once and reused until a box is added or removed.
  background(view, world) {
    const key = world.boxes.map((b) => `${b.x},${b.y}`).join(';');
    if (key === this.key) return this.bg;
    this.key = key;
    const ctx = this.bg.getContext('2d');
    const v = { ...view, ctx, X: view.X.bind(view), Y: view.Y.bind(view), box: view.box.bind(view) };
    fill(ctx, '#f1e6cf', 0, 0, W, H);
    for (const room of ROOMS) {
      FLOORS[room.name](ctx, v.box((room.x0 + room.x1) / 2, (room.y0 + room.y1) / 2, room.x1 - room.x0, room.y1 - room.y0));
    }
    for (const f of FURNITURE) drawFurniture(ctx, v, f);
    drawPlant(ctx, v);
    for (const b of world.boxes) drawBox(ctx, v, b);
    for (const wall of WALLS) {
      const [x, y, w, h] = v.box(...wall);
      fill(ctx, INK, x, y, w, h);
      fill(ctx, '#4a3c44', x, y, w, 1);
    }
    const [dx, dy, dw, dh] = v.box(...DOCK.box);
    fill(ctx, INK, dx, dy, dw, dh);
    fill(ctx, '#4a3c44', dx + 1, dy + 1, dw - 2, 1);
    return this.bg;
  }

  draw(view, world, robot, scan, now, charging) {
    const ctx = view.ctx;
    ctx.drawImage(this.background(view, world), 0, 0);

    // The dock's light: steady orange, blinking green while Pip charges.
    const [dx, dy, , dh] = view.box(...DOCK.box);
    const lit = !charging || Math.floor(now * 2) % 2 === 0;
    fill(ctx, charging ? (lit ? '#5fae5a' : '#2f5a2e') : ORANGE, dx + 1, dy + 3, 1, dh - 6);

    if (scan) {
      const ox = view.X(scan.x);
      const oy = view.Y(scan.y);
      for (let i = 0; i < scan.ranges.length; i += 6) {
        const r = Number.isFinite(scan.ranges[i]) ? scan.ranges[i] : 8;
        const a = scan.th + scan.angles[i];
        line(ctx, ox, oy, view.X(scan.x + r * Math.cos(a)), view.Y(scan.y + r * Math.sin(a)), 'rgba(224,83,59,0.35)', 3);
      }
      ctx.fillStyle = '#e0533b';
      for (let i = 0; i < scan.ranges.length; i++) {
        if (!Number.isFinite(scan.ranges[i])) continue;
        const a = scan.th + scan.angles[i];
        ctx.fillRect(view.X(scan.x + scan.ranges[i] * Math.cos(a)), view.Y(scan.y + scan.ranges[i] * Math.sin(a)), 1, 1);
      }
    }
    drawRobot(view, robot);
  }
}

// --- Pip's map -----------------------------------------------------------------------------------

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
        if (mask && mask[i]) rgb = [58, 111, 191];
        else if (cls[i] === FREE) rgb = [251, 243, 226];
        else if (cls[i] === OCC) rgb = [43, 33, 40];
        else rgb = (r + c) % 2 ? [216, 200, 168] : [208, 190, 156]; // fog, dithered
        d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
      }
    }
    this.off.getContext('2d').putImageData(this.img, 0, 0);
  }

  draw(view, { robot, nav, blacklist, dock, mask }) {
    const ctx = view.ctx;
    const g = this.grid;
    if (g.version !== this.version) { this.refresh(mask); this.version = g.version; }
    fill(ctx, '#d0be9c', 0, 0, W, H);
    // Each map cell is 5 cm, so exactly 2x2 screen pixels.
    ctx.drawImage(this.off, view.X(g.x0), view.Y(g.y0 + g.h * g.res), g.w * 2, g.h * 2);

    // Graph paper dots every 50 cm.
    ctx.fillStyle = 'rgba(43,33,40,0.18)';
    for (let x = -4; x <= 4.001; x += 0.5) for (let y = -3; y <= 3.001; y += 0.5) ctx.fillRect(view.X(x), view.Y(y), 1, 1);

    // Places Pip gave up on: a little pixel X.
    for (const [bx, by] of blacklist) {
      const x = view.X(bx);
      const y = view.Y(by);
      for (let k = -2; k <= 2; k++) { fill(ctx, '#8a7466', x + k, y + k, 1, 1); fill(ctx, '#8a7466', x + k, y - k, 1, 1); }
    }

    // Home: the dock as a little orange block.
    const hx = view.X(dock.x + 0.17);
    const hy = view.Y(dock.y);
    fill(ctx, INK, hx - 2, hy - 5, 5, 11);
    fill(ctx, ORANGE, hx - 1, hy - 4, 3, 9);

    if (nav.path) {
      let px = view.X(robot.x);
      let py = view.Y(robot.y);
      for (let i = nav.index; i < nav.path.length; i += 2) {
        const qx = view.X(nav.path[i][0]);
        const qy = view.Y(nav.path[i][1]);
        line(ctx, px, py, qx, qy, ORANGE, 1, 2);
        px = qx;
        py = qy;
      }
    }
    // Goal: a tiny flag.
    if (nav.state === 'active' && nav.goal) {
      const gx = view.X(nav.goal[0]);
      const gy = view.Y(nav.goal[1]);
      fill(ctx, INK, gx, gy - 9, 1, 10);
      fill(ctx, INK, gx + 1, gy - 9, 6, 5);
      fill(ctx, ORANGE, gx + 1, gy - 8, 5, 3);
      fill(ctx, INK, gx - 1, gy + 1, 3, 1);
    }
    drawRobot(view, robot);
  }
}
