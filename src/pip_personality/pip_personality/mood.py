"""Pip's mood engine.

Events from the rest of the robot (docked, exploration done, close call, ...) push Pip into a mood
for a few seconds and may trigger a beep and a short line. When the mood expires Pip falls back
to a baseline set by its battery, whether it's charging, and whether it's sleeping.

Pure Python: no ROS, so it's easy to test and reuse on the real robot.
"""

from dataclasses import dataclass
import random


@dataclass(frozen=True)
class Rule:
    mood: str
    hold: float  # seconds the mood lasts
    sound: str | None
    phrases: tuple[str, ...] = ()


# Pip's voice: small, earnest, a bit dramatic about its battery. Short lines. It's a 1.5 kg robot,
# it shouldn't monologue. The browser version (web/js/mood.js) uses the same lines.
RULES = {
    'boot': Rule('happy', 4.0, 'greet', ('Morning.', 'Pip, awake. Mostly.')),
    'greet': Rule('happy', 4.0, 'greet', ('Hi.', 'Oh. Hello.', 'Hi! I live here now.')),
    'undocking': Rule('excited', 3.0, 'excited',
                      ('Okay. Going.', 'Back in a bit.', 'Off the dock, into the unknown.')),
    'exploration_started': Rule('curious', 5.0, 'curious',
                                ("Let's see what's behind the doors.", 'Mapping mode.')),
    'new_frontier': Rule('curious', 3.0, 'curious'),
    'exploration_done': Rule('proud', 6.0, 'proud',
                             ("That's everything. I know this place now.",
                              'Map done. Every wall accounted for.')),
    'patrol_arrived': Rule('curious', 3.0, 'hmm'),
    'nav_failed': Rule('frustrated', 4.0, 'frustrated',
                       ("Can't get there.", 'Nope. Blocked.', "That spot doesn't want me.")),
    'close_call': Rule('startled', 2.0, 'startled', ('Whoa.', 'Close one.')),
    'low_battery': Rule('tired', 6.0, 'sad',
                        ('Twenty-five percent. Going home.', 'Getting sleepy. Heading to the dock.')),
    'docked': Rule('content', 5.0, 'happy', ('Home.', 'Contacts. Lovely.', 'Charging.')),
    'charged': Rule('happy', 4.0, 'happy', ('Full.', 'Battery full. I feel unstoppable.')),
    'dock_failed': Rule('frustrated', 4.0, 'frustrated', ('Missed. Backing up.', 'Hm. One more go.')),
    'stranded': Rule('sad', 10.0, 'sad', ("I'm stuck. Little help?",)),
    'sleep': Rule('sleepy', 6.0, 'sleepy', ('Night.', 'Going to sleep now.')),
    'wake': Rule('happy', 3.0, 'greet', ("I'm up. I'm up.",)),
}

# Events Pip always answers out loud, even if it spoke recently.
ALWAYS_SPEAK = {'greet', 'boot', 'stranded', 'low_battery'}

MOODS = ('neutral', 'happy', 'content', 'excited', 'curious', 'proud', 'sleepy', 'tired',
         'startled', 'frustrated', 'sad')


class MoodEngine:
    def __init__(self, rng: random.Random | None = None, say_cooldown: float = 15.0,
                 sound_cooldown: float = 0.8):
        self.rng = rng or random.Random()
        self.say_cooldown = say_cooldown
        self.sound_cooldown = sound_cooldown
        self.mood = 'neutral'
        self.until = 0.0
        self.last_say = -1e9
        self.last_sound = -1e9
        self.battery = 1.0
        self.charging = False
        self.full = False
        self.charge_cycle = False
        self.moving = False
        self.sleeping = False

    def on_event(self, kind: str, now: float) -> list[tuple[str, str]]:
        """Returns actions like [('sound', 'happy'), ('say', 'Hello!')]."""
        rule = RULES.get(kind)
        if rule is None:
            return []
        if kind == 'sleep':
            self.sleeping = True
        elif kind in ('wake', 'undocking', 'greet'):
            self.sleeping = False
        self.mood = rule.mood
        self.until = now + rule.hold

        actions = []
        if rule.sound and now - self.last_sound >= self.sound_cooldown:
            actions.append(('sound', rule.sound))
            self.last_sound = now
        if rule.phrases and (kind in ALWAYS_SPEAK or now - self.last_say >= self.say_cooldown):
            actions.append(('say', self.rng.choice(rule.phrases)))
            self.last_say = now
        return actions

    def on_battery(self, fraction: float, charging: bool, full: bool, now: float) -> list:
        actions = []
        if charging and not full:
            self.charge_cycle = True
        if full and charging and self.charge_cycle:
            self.charge_cycle = False
            actions = self.on_event('charged', now)
        self.battery, self.charging, self.full = fraction, charging, full
        return actions

    def on_motion(self, linear: float, angular: float) -> None:
        self.moving = abs(linear) > 0.02 or abs(angular) > 0.1

    def baseline(self) -> str:
        if self.sleeping:
            return 'sleepy'
        if self.charging and not self.moving:
            return 'content'
        if self.battery < 0.25:
            return 'tired'
        return 'neutral'

    def tick(self, now: float) -> str:
        if now >= self.until:
            self.mood = self.baseline()
        return self.mood
