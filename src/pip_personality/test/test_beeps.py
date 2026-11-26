import os
import tempfile
import wave

import numpy as np

from pip_personality.beeps import SAMPLE_RATE, SOUNDS, synth, write_wav


def test_every_sound_synthesizes_short_clean_audio():
    for name in SOUNDS:
        audio = synth(name)
        assert audio.dtype == np.int16
        assert 0.1 < len(audio) / SAMPLE_RATE < 1.0, name
        assert np.abs(audio).max() <= 0.61 * 32767


def test_unknown_sound_falls_back():
    assert len(synth('definitely-not-a-sound')) > 0


def test_write_wav_round_trip():
    path = os.path.join(tempfile.mkdtemp(), 'beep.wav')
    audio = synth('greet')
    write_wav(path, audio)
    with wave.open(path, 'rb') as f:
        assert f.getframerate() == SAMPLE_RATE
        assert f.getnframes() == len(audio)
