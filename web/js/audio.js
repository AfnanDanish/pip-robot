// Pip's beep language (same sounds as beeps.py) plus the browser's built-in speech for lines.
const SOUNDS = {
  greet: [[900, 1500, 0.09], [0, 0, 0.04], [1300, 2000, 0.13]],
  happy: [[1000, 1600, 0.07], [0, 0, 0.03], [1200, 1900, 0.07], [0, 0, 0.03], [1500, 2300, 0.11]],
  excited: [[1200, 2200, 0.05], [0, 0, 0.02], [1400, 2400, 0.05], [0, 0, 0.02], [1600, 2600, 0.05], [0, 0, 0.02], [2000, 2900, 0.09]],
  curious: [[700, 1400, 0.14, 0.03], [1400, 1100, 0.1]],
  hmm: [[600, 760, 0.2, 0.02]],
  proud: [[800, 1000, 0.08], [0, 0, 0.02], [1000, 1300, 0.08], [0, 0, 0.02], [1300, 1750, 0.18]],
  sad: [[900, 430, 0.5, 0.02]],
  frustrated: [[520, 430, 0.08], [0, 0, 0.04], [520, 430, 0.08], [0, 0, 0.04], [460, 300, 0.2]],
  startled: [[2200, 2700, 0.04], [0, 0, 0.02], [2500, 3000, 0.04]],
  sleepy: [[520, 300, 0.55, 0.015]],
};

export class Voice {
  constructor() {
    this.enabled = false;
    this.ctx = null;
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) {
      this.ctx = this.ctx || new AudioContext();
      this.ctx.resume();
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  beep(name) {
    if (!this.enabled || !this.ctx) return;
    const sr = this.ctx.sampleRate;
    const parts = [];
    for (const [f0, f1, dur, vib = 0] of SOUNDS[name] || SOUNDS.hmm) {
      const n = Math.max(1, Math.floor(dur * sr));
      const seg = new Float32Array(n);
      if (f0 > 0 || f1 > 0) {
        let phase = 0;
        const attack = Math.min(n, Math.floor(0.006 * sr));
        const release = Math.min(n, Math.floor(0.02 * sr));
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          let f = f0 + ((f1 - f0) * t) / dur;
          if (vib) f *= 1 + vib * Math.sin(2 * Math.PI * 18 * t);
          phase += (2 * Math.PI * f) / sr;
          let env = 1;
          if (i < attack) env = i / attack;
          if (i > n - release) env *= (n - i) / release;
          seg[i] = (Math.sin(phase) + 0.25 * Math.sin(3 * phase) + 0.08 * Math.sin(5 * phase)) * env;
        }
      }
      parts.push(seg);
    }
    const total = parts.reduce((s, p) => s + p.length, 0);
    const buffer = this.ctx.createBuffer(1, total, sr);
    const data = buffer.getChannelData(0);
    let offset = 0;
    let peak = 1e-6;
    for (const p of parts) { data.set(p, offset); offset += p.length; }
    for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(data[i]));
    for (let i = 0; i < total; i++) data[i] *= 0.25 / peak;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);
    src.start();
  }

  say(text) {
    if (!this.enabled || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = 1.7;
    u.rate = 1.05;
    u.volume = 0.9;
    setTimeout(() => window.speechSynthesis.speak(u), 350);
  }
}
