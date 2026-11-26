// Pip's eyes, drawn like two 240x240 round displays (same shapes as eyes_render.py).
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

const EYE = '#5ae1ff';
const EDGE = '#288cbe';
const BG = '#000';

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class EyeRenderer {
  constructor() {
    this.p = target('neutral');
    this.t = 0;
    this.blinkStart = -1;
    this.nextBlink = 2;
    this.lookX = 0;
    this.saccade = [0, 0];
    this.nextSaccade = 1;
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

  // Pip's front panel: the orange shell, the two round screens, screws and the charging contacts.
  // Proportions follow the real body (20 x 10 cm face, two 1.28" screens).
  draw(ctx, W, H) {
    ctx.clearRect(0, 0, W, H);
    const pad = W * 0.04;
    const shellW = W - 2 * pad;
    const shellH = H * 0.86;
    const sx = pad;
    const sy = H * 0.04;
    const radius = shellH * 0.16;

    // Shadow on the desk.
    ctx.fillStyle = 'rgba(31, 27, 22, 0.07)';
    ctx.beginPath();
    ctx.ellipse(W / 2, sy + shellH + H * 0.03, shellW * 0.42, H * 0.022, 0, 0, 2 * Math.PI);
    ctx.fill();

    // Shell, with a slight top-to-bottom tone shift so it reads as a painted object, not a flat box.
    const shell = ctx.createLinearGradient(0, sy, 0, sy + shellH);
    shell.addColorStop(0, '#f6a940');
    shell.addColorStop(1, '#e88f22');
    ctx.fillStyle = shell;
    roundRect(ctx, sx, sy, shellW, shellH, radius);
    ctx.fill();
    ctx.strokeStyle = 'rgba(110, 60, 0, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Bumper lip and charging contacts.
    ctx.fillStyle = 'rgba(80, 40, 0, 0.18)';
    roundRect(ctx, sx + shellW * 0.06, sy + shellH * 0.86, shellW * 0.88, shellH * 0.06, shellH * 0.03);
    ctx.fill();
    ctx.fillStyle = '#d8b65a';
    for (const fx of [0.32, 0.68]) {
      roundRect(ctx, sx + shellW * fx - shellW * 0.04, sy + shellH * 0.865, shellW * 0.08, shellH * 0.05, 3);
      ctx.fill();
    }

    // Screws.
    for (const [fx, fy] of [[0.05, 0.1], [0.95, 0.1], [0.05, 0.76], [0.95, 0.76]]) {
      const x = sx + shellW * fx;
      const y = sy + shellH * fy;
      ctx.fillStyle = 'rgba(80, 40, 0, 0.35)';
      ctx.beginPath();
      ctx.arc(x, y, shellH * 0.022, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 230, 190, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - shellH * 0.012, y);
      ctx.lineTo(x + shellH * 0.012, y);
      ctx.stroke();
    }

    const gap = shellW * 0.07;
    const D = Math.min((shellW * 0.84 - gap) / 2, shellH * 0.66);
    const x0 = W / 2 - D - gap / 2;
    const y0 = sy + shellH * 0.43 - D / 2;
    ['left', 'right'].forEach((side, i) => {
      const cx = x0 + i * (D + gap) + D / 2;
      const cy = y0 + D / 2;
      ctx.fillStyle = '#17140f';
      ctx.beginPath();
      ctx.arc(cx, cy, D / 2 + D * 0.06, 0, 2 * Math.PI);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, D / 2, 0, 2 * Math.PI);
      ctx.clip();
      ctx.fillStyle = BG;
      ctx.fillRect(cx - D / 2, cy - D / 2, D, D);
      ctx.translate(cx - D / 2, cy - D / 2);
      ctx.scale(D / 240, D / 240);
      this.drawEye(ctx, side);
      ctx.restore();
    });
  }

  drawEye(ctx, side) {
    const p = this.p;
    const scale = 1 + (side === 'right' ? p.asym : -p.asym * 0.5);
    const w = 112 * p.width * scale;
    const h = Math.max(6, 150 * p.open * scale * this.blink());
    const cx = 120 + this.lookX;
    const cy = 120 + this.saccade[1] + p.lookY * 30;
    const x = cx - w / 2;
    const y = cy - h / 2;
    const r = Math.min(w, h) * 0.38;

    ctx.fillStyle = EDGE;
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, r + 4);
    ctx.fill();
    ctx.fillStyle = EYE;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();

    ctx.fillStyle = BG;
    if (Math.abs(p.slant) > 0.01) {
      const drop = Math.abs(p.slant) * h * 0.55;
      const [inner, outer] = p.slant > 0 ? [drop, 0] : [0, drop];
      const [leftDrop, rightDrop] = side === 'left' ? [outer, inner] : [inner, outer];
      const top = y - 6;
      ctx.beginPath();
      ctx.moveTo(x - 10, top - 60);
      ctx.lineTo(x + w + 10, top - 60);
      ctx.lineTo(x + w + 10, top + rightDrop);
      ctx.lineTo(x - 10, top + leftDrop);
      ctx.closePath();
      ctx.fill();
    }
    if (p.smile > 0.02) {
      const ew = w * 1.6;
      const eh = h * 1.1;
      const topY = y + h - p.smile * h * 0.55;
      ctx.beginPath();
      ctx.ellipse(cx, topY + eh / 2, ew / 2, eh / 2, 0, 0, 2 * Math.PI);
      ctx.fill();
    }
    if (p.sparkle > 0.05) {
      const phase = 0.5 + 0.5 * Math.sin(this.t * 6 + (side === 'left' ? 0 : 1.7));
      const s = 4 + 6 * p.sparkle * phase;
      ctx.fillStyle = '#ebfcff';
      ctx.beginPath();
      ctx.arc(x + w * 0.28, y + h * 0.25, s, 0, 2 * Math.PI);
      ctx.arc(x + w * 0.45, y + h * 0.42, Math.max(2, s / 2), 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}
