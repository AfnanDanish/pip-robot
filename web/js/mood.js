// Pip's mood engine. Same rules as src/pip_personality/pip_personality/mood.py, plus a few
// reactions that only make sense in the browser (rooms, boxes, being poked).
//
// Pip's voice: small, earnest, a bit dramatic about its battery. Short lines. It's a robot that
// weighs 1.5 kg, it shouldn't monologue.
export const RULES = {
  boot: ['happy', 4, 'greet', ['Morning.', 'Pip, awake. Mostly.']],
  greet: ['happy', 4, 'greet', ['Hi.', 'Oh. Hello.', 'Hi! I live here now.']],
  undocking: ['excited', 3, 'excited', ['Okay. Going.', 'Back in a bit.', 'Off the dock, into the unknown.']],
  exploration_started: ['curious', 5, 'curious', ["Let's see what's behind the doors.", 'Mapping mode.']],
  new_frontier: ['curious', 3, 'curious', []],
  room_bedroom: ['excited', 4, 'excited', ['A bedroom. Very large soft obstacle.', 'Found a bed. Not for me.']],
  room_kitchen: ['curious', 4, 'curious', ["Kitchen. I can't eat, but I respect it.", 'Kitchen. Smells like nothing. No nose.']],
  exploration_done: ['proud', 6, 'proud', ["That's everything. I know this place now.", 'Map done. Every wall accounted for.']],
  patrol_arrived: ['curious', 3, 'hmm', []],
  goto_arrived: ['happy', 3, 'happy', ['Here.', 'Made it. Now what?']],
  nav_failed: ['frustrated', 4, 'frustrated', ["Can't get there.", 'Nope. Blocked.', "That spot doesn't want me."]],
  close_call: ['startled', 2, 'startled', ['Whoa.', 'Close one.']],
  box_dropped: ['startled', 3, 'startled', ['Who put that there?', 'A box. Noted.', 'New obstacle. Rude.']],
  poked: ['happy', 2, 'greet', ['Hey.', 'That tickles.', "I'm working here."]],
  low_battery: ['tired', 6, 'sad', ['Twenty-five percent. Going home.', 'Getting sleepy. Heading to the dock.']],
  docked: ['content', 5, 'happy', ['Home.', 'Contacts. Lovely.', 'Charging.']],
  charged: ['happy', 4, 'happy', ['Full.', 'Battery full. I feel unstoppable.']],
  dock_failed: ['frustrated', 4, 'frustrated', ['Missed. Backing up.', 'Hm. One more go.']],
  stranded: ['sad', 10, 'sad', ["I'm stuck. Little help?"]],
  sleep: ['sleepy', 6, 'sleepy', ['Night.', 'Going to sleep now.']],
  wake: ['happy', 3, 'greet', ["I'm up. I'm up."]],
};

// Things Pip always answers out loud, even if it spoke a moment ago.
const ALWAYS_SPEAK = new Set(['greet', 'boot', 'stranded', 'low_battery', 'goto_arrived', 'poked', 'box_dropped',
  'room_bedroom', 'room_kitchen']);

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
    // 15 s between unprompted lines. Any chattier and Pip turns into a podcast.
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
    // Only celebrate a charge Pip actually did, not booting up on a full dock.
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
