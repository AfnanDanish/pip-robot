import random

from pip_personality.eyes_params import EyeParams, lerp_params, MOOD_EYES, target_for_mood
from pip_personality.mood import MoodEngine, MOODS, RULES


def engine():
    return MoodEngine(rng=random.Random(0), say_cooldown=15.0, sound_cooldown=0.8)


def test_every_rule_uses_a_known_mood_and_sound():
    from pip_personality.beeps import SOUNDS
    for name, rule in RULES.items():
        assert rule.mood in MOODS, name
        assert rule.sound is None or rule.sound in SOUNDS, name
    assert set(MOOD_EYES) == set(MOODS)


def test_event_sets_mood_then_decays_to_baseline():
    e = engine()
    actions = e.on_event('exploration_done', now=0.0)
    assert ('sound', 'proud') in actions
    assert any(kind == 'say' for kind, _ in actions)
    assert e.tick(1.0) == 'proud'
    assert e.tick(10.0) == 'neutral'


def test_speech_is_rate_limited_but_greetings_always_answer():
    e = engine()
    e.on_event('docked', 0.0)
    assert not any(k == 'say' for k, _ in e.on_event('dock_failed', 2.0))
    assert any(k == 'say' for k, _ in e.on_event('greet', 3.0))


def test_baselines():
    e = engine()
    e.on_battery(0.2, charging=False, full=False, now=0.0)
    assert e.tick(1.0) == 'tired'
    e.on_battery(0.5, charging=True, full=False, now=2.0)
    assert e.tick(3.0) == 'content'
    e.on_event('sleep', 4.0)
    assert e.tick(100.0) == 'sleepy'


def test_charged_fires_once_after_a_real_charge():
    e = engine()
    assert e.on_battery(1.0, charging=True, full=True, now=0.0) == []  # boot on a full dock
    e.on_battery(0.6, charging=True, full=False, now=1.0)
    assert ('sound', 'happy') in e.on_battery(1.0, charging=True, full=True, now=50.0)
    assert e.on_battery(1.0, charging=True, full=True, now=51.0) == []


def test_eye_params_interpolate():
    a, b = target_for_mood('neutral'), target_for_mood('sleepy')
    mid = lerp_params(a, b, 0.5)
    assert abs(mid.open - (a.open + b.open) / 2) < 1e-9
    assert abs(lerp_params(a, b, 2.0).open - b.open) < 1e-9  # clamped at the target
    assert target_for_mood('no such mood') == EyeParams()
