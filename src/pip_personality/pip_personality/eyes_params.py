"""Eye shapes for each mood (no pygame here, so it can be tested anywhere)."""

from dataclasses import dataclass, fields, replace


@dataclass
class EyeParams:
    open: float = 1.0  # eye height as a fraction of normal
    width: float = 1.0  # eye width as a fraction of normal
    slant: float = 0.0  # + angry (inner corners down), - sad (outer corners down)
    smile: float = 0.0  # 0..1, lower lid pushes up into a happy arc
    look_y: float = 0.0  # -1 up .. +1 down
    sparkle: float = 0.0  # 0..1 twinkle highlights
    asym: float = 0.0  # one eye bigger than the other (curious)


MOOD_EYES = {
    'neutral': EyeParams(),
    'happy': EyeParams(open=0.85, smile=0.6),
    'content': EyeParams(open=0.65, smile=0.5, look_y=0.1),
    'excited': EyeParams(open=1.1, width=1.05, smile=0.35, sparkle=1.0),
    'curious': EyeParams(open=1.05, asym=0.18, look_y=-0.2),
    'proud': EyeParams(open=0.75, smile=0.7, sparkle=1.0),
    'sleepy': EyeParams(open=0.18, look_y=0.25),
    'tired': EyeParams(open=0.5, slant=-0.35, look_y=0.15),
    'startled': EyeParams(open=1.25, width=0.85),
    'frustrated': EyeParams(open=0.7, slant=0.45),
    'sad': EyeParams(open=0.65, slant=-0.5, look_y=0.3),
}


def target_for_mood(mood: str) -> EyeParams:
    return replace(MOOD_EYES.get(mood, MOOD_EYES['neutral']))


def lerp_params(a: EyeParams, b: EyeParams, k: float) -> EyeParams:
    k = max(0.0, min(1.0, k))
    return EyeParams(**{f.name: getattr(a, f.name) + (getattr(b, f.name) - getattr(a, f.name)) * k
                        for f in fields(EyeParams)})
