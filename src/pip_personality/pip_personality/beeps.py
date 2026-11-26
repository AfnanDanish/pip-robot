"""Pip's beep language: short synthesized chirps for each feeling, no audio files needed."""

import math
import wave

import numpy as np

SAMPLE_RATE = 22050

# Each sound is a list of segments: (start Hz, end Hz, seconds). 0 Hz is a pause.
# An optional 4th value adds vibrato depth (fraction of the pitch).
SOUNDS: dict[str, list[tuple]] = {
    'greet': [(900, 1500, 0.09), (0, 0, 0.04), (1300, 2000, 0.13)],
    'happy': [(1000, 1600, 0.07), (0, 0, 0.03), (1200, 1900, 0.07), (0, 0, 0.03), (1500, 2300, 0.11)],
    'excited': [(1200, 2200, 0.05), (0, 0, 0.02), (1400, 2400, 0.05), (0, 0, 0.02),
                (1600, 2600, 0.05), (0, 0, 0.02), (2000, 2900, 0.09)],
    'curious': [(700, 1400, 0.14, 0.03), (1400, 1100, 0.10)],
    'hmm': [(600, 760, 0.20, 0.02)],
    'proud': [(800, 1000, 0.08), (0, 0, 0.02), (1000, 1300, 0.08), (0, 0, 0.02), (1300, 1750, 0.18)],
    'sad': [(900, 430, 0.50, 0.02)],
    'frustrated': [(520, 430, 0.08), (0, 0, 0.04), (520, 430, 0.08), (0, 0, 0.04), (460, 300, 0.20)],
    'startled': [(2200, 2700, 0.04), (0, 0, 0.02), (2500, 3000, 0.04)],
    'sleepy': [(520, 300, 0.55, 0.015)],
    'thinking': [(800, 900, 0.06), (0, 0, 0.05), (850, 950, 0.06), (0, 0, 0.05), (900, 1000, 0.06)],
}


def _segment(f0: float, f1: float, dur: float, vibrato: float = 0.0,
             sr: int = SAMPLE_RATE) -> np.ndarray:
    n = max(1, int(dur * sr))
    if f0 <= 0 and f1 <= 0:
        return np.zeros(n)
    t = np.arange(n) / sr
    freq = f0 + (f1 - f0) * (t / dur)
    if vibrato:
        freq = freq * (1.0 + vibrato * np.sin(2 * math.pi * 18.0 * t))
    phase = 2 * math.pi * np.cumsum(freq) / sr
    # A little odd harmonic content gives the "robot" timbre.
    sig = np.sin(phase) + 0.25 * np.sin(3 * phase) + 0.08 * np.sin(5 * phase)
    attack, release = min(n, int(0.006 * sr)), min(n, int(0.02 * sr))
    env = np.ones(n)
    env[:attack] = np.linspace(0.0, 1.0, attack)
    env[n - release:] *= np.linspace(1.0, 0.0, release)
    return sig * env


def synth(name: str, sr: int = SAMPLE_RATE) -> np.ndarray:
    """int16 mono samples for a named sound."""
    parts = [_segment(*seg, sr=sr) for seg in SOUNDS.get(name, SOUNDS['hmm'])]
    audio = np.concatenate(parts + [np.zeros(int(0.03 * sr))])
    peak = np.max(np.abs(audio)) or 1.0
    return (audio / peak * 0.6 * 32767).astype(np.int16)


def write_wav(path: str, samples: np.ndarray, sr: int = SAMPLE_RATE) -> None:
    with wave.open(path, 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sr)
        f.writeframes(samples.tobytes())
