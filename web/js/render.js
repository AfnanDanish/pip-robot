// Drawing for the two top-down views: the real apartment and Pip's own map.
import { FREE, OCC } from './grid.js';
import { BOUNDS, BOX_SIZE, DOCK, FURNITURE, PLANT, ROOMS, WALLS } from './world.js';

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

  box(cx, cy, sx, sy) {
    this.ctx.fillRect(this.X(cx - sx / 2), this.Y(cy + sy / 2), sx * this.s, sy * this.s);
  }
}

export function drawRobot(view, r, alpha = 1) {
  const { ctx, s } = view;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(view.X(r.x), view.Y(r.y));
  ctx.rotate(-r.th);
  ctx.fillStyle = '#16161b';
  ctx.fillRect(-0.06 * s, -0.11 * s, 0.12 * s, 0.03 * s);
  ctx.fillRect(-0.06 * s, 0.08 * s, 0.12 * s, 0.03 * s);
  ctx.fillStyle = '#f29e2e';
  ctx.strokeStyle = '#6b4310';
  ctx.lineWidth = Math.max(1, 0.006 * s);
  ctx.beginPath();
  ctx.roundRect(-0.1 * s, -0.08 * s, 0.2 * s, 0.16 * s, 0.03 * s);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#26262c';
  ctx.beginPath();
  ctx.arc(0, 0, 0.035 * s, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#0b0b0e';
  ctx.fillRect(0.088 * s, -0.06 * s, 0.014 * s, 0.12 * s);
  ctx.fillStyle = '#5ae1ff';
  ctx.fillRect(0.09 * s, -0.04 * s, 0.01 * s, 0.022 * s);
  ctx.fillRect(0.09 * s, 0.018 * s, 0.01 * s, 0.022 * s);
  ctx.restore();
}

export function drawWorld(view, world, robot, scan) {
  const { ctx, s } = view;
  ctx.fillStyle = '#101014';
  ctx.fillRect(0, 0, view.canvas.width, view.canvas.height);
  for (const room of ROOMS) {
    ctx.fillStyle = room.color;
    view.box((room.x0 + room.x1) / 2, (room.y0 + room.y1) / 2, room.x1 - room.x0, room.y1 - room.y0);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = `${Math.round(0.17 * s)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Living room', view.X(2.0), view.Y(-0.25));
  ctx.fillText('Bedroom', view.X(-1.6), view.Y(0.55));
  ctx.fillText('Kitchen', view.X(-3.0), view.Y(-0.5));

  for (const f of FURNITURE) {
    ctx.fillStyle = f.color;
    view.box(...f.box);
  }
  ctx.fillStyle = '#3f8a4c';
  ctx.beginPath();
  ctx.arc(view.X(PLANT.x), view.Y(PLANT.y), PLANT.r * s, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#2a2a30';
  view.box(...DOCK.box);
  ctx.fillStyle = '#ff9a1f';
  view.box(DOCK.box[0] - 0.05, DOCK.box[1], 0.015, 0.2);
  for (const b of world.boxes) {
    ctx.fillStyle = '#c49a5a';
    view.box(b.x, b.y, BOX_SIZE, BOX_SIZE);
    ctx.fillStyle = '#e6c58f';
    view.box(b.x, b.y, BOX_SIZE, 0.05);
  }
  ctx.fillStyle = '#e8e3d6';
  for (const w of WALLS) view.box(...w);

  if (scan) {
    ctx.strokeStyle = 'rgba(255, 70, 70, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < scan.ranges.length; i += 2) {
      const r = Number.isFinite(scan.ranges[i]) ? scan.ranges[i] : 8;
      const a = scan.th + scan.angles[i];
      ctx.moveTo(view.X(scan.x), view.Y(scan.y));
      ctx.lineTo(view.X(scan.x + r * Math.cos(a)), view.Y(scan.y + r * Math.sin(a)));
    }
    ctx.stroke();
    ctx.fillStyle = '#ff4646';
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
        if (mask && mask[i]) rgb = [90, 225, 255];
        else if (cls[i] === FREE) rgb = [233, 228, 216];
        else if (cls[i] === OCC) rgb = [24, 24, 30];
        else rgb = [44, 44, 54];
        d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
      }
    }
    this.off.getContext('2d').putImageData(this.img, 0, 0);
  }

  draw(view, { robot, nav, blacklist, dock, mask }) {
    const { ctx, s } = view;
    const g = this.grid;
    if (g.version !== this.version) { this.refresh(mask); this.version = g.version; }
    ctx.fillStyle = '#2c2c36';
    ctx.fillRect(0, 0, view.canvas.width, view.canvas.height);
    ctx.imageSmoothingEnabled = false;
    const x = view.X(g.x0);
    const y = view.Y(g.y0 + g.h * g.res);
    ctx.drawImage(this.off, x, y, g.w * g.res * s, g.h * g.res * s);

    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = Math.max(1, 0.012 * s);
    for (const [bx, by] of blacklist) {
      const k = 0.05 * s;
      ctx.beginPath();
      ctx.moveTo(view.X(bx) - k, view.Y(by) - k); ctx.lineTo(view.X(bx) + k, view.Y(by) + k);
      ctx.moveTo(view.X(bx) + k, view.Y(by) - k); ctx.lineTo(view.X(bx) - k, view.Y(by) + k);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff9a1f';
    ctx.beginPath();
    ctx.arc(view.X(dock.x), view.Y(dock.y), 0.06 * s, 0, 2 * Math.PI);
    ctx.fill();

    if (nav.path) {
      ctx.strokeStyle = '#3ddc84';
      ctx.lineWidth = Math.max(2, 0.025 * s);
      ctx.beginPath();
      ctx.moveTo(view.X(robot.x), view.Y(robot.y));
      for (let i = nav.index; i < nav.path.length; i++) ctx.lineTo(view.X(nav.path[i][0]), view.Y(nav.path[i][1]));
      ctx.stroke();
    }
    if (nav.state === 'active' && nav.goal) {
      ctx.strokeStyle = '#3ddc84';
      ctx.lineWidth = Math.max(2, 0.02 * s);
      ctx.beginPath();
      ctx.arc(view.X(nav.goal[0]), view.Y(nav.goal[1]), 0.09 * s, 0, 2 * Math.PI);
      ctx.stroke();
    }
    drawRobot(view, robot);
  }
}
