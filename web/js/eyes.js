// Pip's face as pixel art. Every pixel is decided by hand (no anti-aliasing): the canvas is
// 184 x 112 and gets scaled up with nearest-neighbour, so each pixel stays a crisp square.
// The eye shapes and moods are the same as eyes_render.py, just rasterized at screen resolution.

const MOOD_EYES = {
  neutral: {},
  happy: { open: 0.85, smile: 0.6 },
  content: { open: 0.65, smile: 0.5, lookY: 0.1 },
  excited: { open: 1.1, width: 1.05, smile: 0.35, sparkle: 1 },
  curious: { open: 1.05, asym: 0.18, lookY: -0.2 },
  proud: { open: 0.75, smile: 0.7, sparkle: 1 },
  sleepy: { open: 0.18, lookY: 0.25 },
  tired: { open: 0.5, slant: -0.35, lookY: 0.15 },
  startled: { open: 1.25, width: 0.85 },
  frustrated: { open: 0.7, slant: 0.45 },
  sad: { open: 0.65, slant: -0.5, lookY: 0.3 },
};
const DEFAULTS = { open: 1, width: 1, slant: 0, smile: 0, lookY: 0, sparkle: 0, asym: 0 };
const target = (mood) => ({ ...DEFAULTS, ...(MOOD_EYES[mood] || {}) });

const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const C = {
  ink: rgb('#2b2128'),
  shell: rgb('#f39a2e'),
  shellHi: rgb('#ffc35c'),
  shellLo: rgb('#c26a1a'),
  bumper: rgb('#a85a14'),
  gold: rgb('#e3c15a'),
  goldHi: rgb('#fff0a8'),
  screen: rgb('#0e0b10'),
  bezelHi: rgb('#5a4a52'),
  eye: rgb('#5ce1ff'),
  eyeEdge: rgb('#2a8fb8'),
  eyeShine: rgb('#d2f8ff'),
  sparkle: rgb('#ffffff'),
  shadow: rgb('#dcc7a0'),
};

// Face layout in canvas pixels.
const SHELL = { x: 6, y: 6, w: 172, h: 90, r: 10 };
const SCREEN_R = 28;
const SCREENS = [{ x: 57.5, y: 45.5, side: 'left' }, { x: 126.5, y: 45.5, side: 'right' }];

export class EyeRenderer {
  constructor() {
    this.p = target('neutral');
    this.t = 0;
    this.blinkStart = -1;
    this.nextBlink = 2;
    this.lookX = 0;
    this.saccade = [0, 0];
    this.nextSaccade = 1;
    this.img = null;
  }

  update(dt, mood, turnRate) {
    this.t += dt;
    const goal = target(mood);
    const k = Math.min(1, dt * 8);
    for (const key of Object.keys(DEFAULTS)) this.p[key] += (goal[key] - this.p[key]) * k;
    if (this.t >= this.nextBlink) {
      this.blinkStart = this.t;
      this.nextBlink = this.t + (Math.random() < 0.15 ? 0.35 : 2.5 + Math.random() * 3.5);
    }
    if (this.t >= this.nextSaccade) {
      this.saccade = [Math.random() * 36 - 18, Math.random() * 16 - 8];
      this.nextSaccade = this.t + 0.8 + Math.random() * 2.2;
    }
    const goalX = Math.max(-40, Math.min(40, -turnRate * 30)) + this.saccade[0];
    this.lookX += (goalX - this.lookX) * Math.min(1, dt * 10);
  }

  blink() {
    const d = this.t - this.blinkStart;
    return d < 0 || d > 0.16 ? 1 : Math.abs(d - 0.08) / 0.08;
  }

  draw(ctx, W, H) {
    if (!this.img || this.img.width !== W) this.img = ctx.createImageData(W, H);
    const data = this.img.data;
    data.fill(0);
    const put = (x, y, c) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const o = (y * W + x) * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
    };

    // Shadow on the desk, dithered.
    for (let y = 98; y < 106; y++) {
      const half = Math.round(74 * Math.sqrt(1 - ((y - 101.5) / 4.5) ** 2));
      for (let x = 92 - half; x < 92 + half; x++) if ((x + y) % 2 === 0) put(x, y, C.shadow);
    }

    // Shell with a 1px ink outline and stepped rounded corners.
    const inShell = (x, y) => {
      const { x: sx, y: sy, w, h, r } = SHELL;
      if (x < sx || y < sy || x >= sx + w || y >= sy + h) return false;
      const cx = Math.min(Math.max(x + 0.5, sx + r), sx + w - r);
      const cy = Math.min(Math.max(y + 0.5, sy + r), sy + h - r);
      return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r;
    };
    for (let y = SHELL.y; y < SHELL.y + SHELL.h; y++) {
      for (let x = SHELL.x; x < SHELL.x + SHELL.w; x++) {
        if (!inShell(x, y)) continue;
        const edge = !inShell(x - 1, y) || !inShell(x + 1, y) || !inShell(x, y - 1) || !inShell(x, y + 1);
        let c = C.shell;
        if (edge) c = C.ink;
        else if (!inShell(x, y - 3) || !inShell(x - 2, y)) c = C.shellHi;
        else if (!inShell(x, y + 5) || !inShell(x + 2, y)) c = C.shellLo;
        put(x, y, c);
      }
    }

    // Bumper strip and the two charging contacts.
    for (let y = 82; y < 87; y++) for (let x = 18; x < 166; x++) put(x, y, y === 82 ? C.shellLo : C.bumper);
    for (const cx of [58, 126]) {
      for (let y = 83; y < 86; y++) for (let x = cx - 7; x < cx + 7; x++) put(x, y, y === 83 ? C.goldHi : C.gold);
    }

    // Screws: a ring with a slot.
    for (const [sx, sy] of [[14, 14], [169, 14], [14, 74], [169, 74]]) {
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5) put(sx + x, sy + y, C.shellLo);
      for (let x = -1; x <= 1; x++) put(sx + x, sy, C.shellHi);
    }

    for (const s of SCREENS) this.drawScreen(put, s);
    ctx.putImageData(this.img, 0, 0);
  }

  drawScreen(put, { x: cx, y: cy, side }) {
    const R = SCREEN_R;
    // Bezel ring, then the black glass.
    for (let y = Math.floor(cy - R - 3); y <= cy + R + 3; y++) {
      for (let x = Math.floor(cx - R - 3); x <= cx + R + 3; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= R) put(x, y, C.screen);
        else if (d <= R + 3) put(x, y, d <= R + 1 && y < cy ? C.bezelHi : C.ink);
      }
    }

    // The eye, in the same 240x240 coordinates the real display uses, sampled once per pixel.
    const p = this.p;
    const scale = (2 * R) / 240;
    const sc = 1 + (side === 'right' ? p.asym : -p.asym * 0.5);
    const w = 112 * p.width * sc;
    const h = Math.max(10, 150 * p.open * sc * this.blink());
    const ex = 120 + this.lookX;
    const ey = 120 + this.saccade[1] + p.lookY * 30;
    const x0 = ex - w / 2;
    const y0 = ey - h / 2;
    const r = Math.min(w, h) * 0.38;
    const drop = Math.abs(p.slant) * h * 0.55;
    const [inner, outer] = p.slant > 0 ? [drop, 0] : [0, drop];
    const [leftDrop, rightDrop] = side === 'left' ? [outer, inner] : [inner, outer];
    const top = y0 - 6;
    const ew = w * 1.6;
    const eh = h * 1.1;
    const smileY = y0 + h - p.smile * h * 0.55 + eh / 2;

    const inside = (u, v) => {
      if (u < x0 || u > x0 + w || v < y0 || v > y0 + h) return false;
      const qx = Math.min(Math.max(u, x0 + r), x0 + w - r);
      const qy = Math.min(Math.max(v, y0 + r), y0 + h - r);
      if ((u - qx) ** 2 + (v - qy) ** 2 > r * r) return false;
      if (Math.abs(p.slant) > 0.01) {
        const lid = top + leftDrop + ((u - (x0 - 10)) / (w + 20)) * (rightDrop - leftDrop);
        if (v < lid) return false;
      }
      if (p.smile > 0.02 && ((u - ex) / (ew / 2)) ** 2 + ((v - smileY) / (eh / 2)) ** 2 <= 1) return false;
      return true;
    };

    const left = Math.floor(cx - R);
    const topPx = Math.floor(cy - R);
    const size = 2 * R + 1;
    const mask = new Uint8Array(size * size);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const px = left + i;
        const py = topPx + j;
        if (Math.hypot(px + 0.5 - cx, py + 0.5 - cy) > R - 1) continue;
        if (inside((px + 0.5 - (cx - R)) / scale, (py + 0.5 - (cy - R)) / scale)) mask[j * size + i] = 1;
      }
    }
    const at = (i, j) => i >= 0 && j >= 0 && i < size && j < size && mask[j * size + i] === 1;
    const shineX0 = x0 + w * 0.16;
    const shineY0 = y0 + h * 0.12;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        if (!at(i, j)) continue;
        const edge = !at(i - 1, j) || !at(i + 1, j) || !at(i, j - 1) || !at(i, j + 1);
        const u = (left + i + 0.5 - (cx - R)) / scale;
        const v = (topPx + j + 0.5 - (cy - R)) / scale;
        let c = edge ? C.eyeEdge : C.eye;
        if (!edge && u > shineX0 && u < shineX0 + w * 0.14 && v > shineY0 && v < shineY0 + h * 0.18) c = C.eyeShine;
        put(left + i, topPx + j, c);
      }
    }

    // Sparkles: a little pixel plus that twinkles.
    if (p.sparkle > 0.3) {
      const on = Math.sin(this.t * 6 + (side === 'left' ? 0 : 1.7)) > -0.2;
      if (on) {
        const sx = Math.round(cx - R + (x0 + w * 0.3) * scale);
        const sy = Math.round(cy - R + (y0 + h * 0.3) * scale);
        for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) put(sx + dx, sy + dy, C.sparkle);
      }
    }
  }
}
