// Pip's mood engine (same rules as src/pip_personality/pip_personality/mood.py).
export const RULES = {
  boot: ['happy', 4, 'greet', ['Hi! I am Pip.', 'Pip online!']],
  greet: ['happy', 4, 'greet', ['Hello!', 'Hi there!', 'Oh, hi!']],
  undocking: ['excited', 3, 'excited', ['Off we go!', 'Adventure time.']],
  exploration_started: ['curious', 5, 'curious', ["Let's see what's out there."]],
  new_frontier: ['curious', 3, 'curious', []],
  exploration_done: ['proud', 6, 'proud', ['I mapped the whole place!', 'Done exploring. I know this place now.']],
  patrol_arrived: ['curious', 3, 'hmm', []],
  goto_arrived: ['happy', 3, 'happy', ['Here I am!', 'Made it.']],
  nav_failed: ['frustrated', 4, 'frustrated', ["Hmm. I can't get there.", 'Blocked.']],
  close_call: ['startled', 2, 'startled', ['Whoa!']],
  low_battery: ['tired', 6, 'sad', ['Running low. Heading home.', 'So sleepy... going to charge.']],
  docked: ['content', 5, 'happy', ['Home sweet home.', 'Charging up.']],
  charged: ['happy', 4, 'happy', ['Fully charged!']],
  dock_failed: ['frustrated', 4, 'frustrated', ['Missed the dock. Trying again.']],
  stranded: ['sad', 10, 'sad', ["I'm stuck. Can someone help me?"]],
  sleep: ['sleepy', 6, 'sleepy', ['Good night.']],
  wake: ['happy', 3, 'greet', ["I'm awake!"]],
};

const ALWAYS_SPEAK = new Set(['greet', 'boot', 'stranded', 'low_battery', 'goto_arrived']);

export class MoodEngine {
  constructor() {
    this.mood = 'neutral';
    this.until = 0;
    this.lastSay = -1e9;
    this.lastSound = -1e9;
    this.battery = 1;
    this.charging = false;
    this.chargeCycle = false;
    this.moving = false;
    this.sleeping = false;
  }

  onEvent(kind, now) {
    const rule = RULES[kind];
    if (!rule) return [];
    const [mood, hold, sound, phrases] = rule;
    if (kind === 'sleep') this.sleeping = true;
    else if (kind === 'wake' || kind === 'undocking' || kind === 'greet') this.sleeping = false;
    this.mood = mood;
    this.until = now + hold;
    const actions = [];
    if (sound && now - this.lastSound >= 0.8) {
      actions.push(['sound', sound]);
      this.lastSound = now;
    }
    if (phrases.length && (ALWAYS_SPEAK.has(kind) || now - this.lastSay >= 15)) {
      actions.push(['say', phrases[Math.floor(Math.random() * phrases.length)]]);
      this.lastSay = now;
    }
    return actions;
  }

  onBattery(level, charging, now) {
    const full = charging && level >= 0.999;
    let actions = [];
    if (charging && !full) this.chargeCycle = true;
    if (full && this.chargeCycle) {
      this.chargeCycle = false;
      actions = this.onEvent('charged', now);
    }
    this.battery = level;
    this.charging = charging;
    return actions;
  }

  onMotion(v, w) {
    this.moving = Math.abs(v) > 0.02 || Math.abs(w) > 0.1;
  }

  baseline() {
    if (this.sleeping) return 'sleepy';
    if (this.charging && !this.moving) return 'content';
    if (this.battery < 0.25) return 'tired';
    return 'neutral';
  }

  tick(now) {
    if (now >= this.until) this.mood = this.baseline();
    return this.mood;
  }
}
