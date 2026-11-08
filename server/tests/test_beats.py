import numpy as np

from app.detect import pick_tempo

FPS = 22050 / 512


def envelope(bpm: float, hits: dict[int, float], seconds: float = 30) -> np.ndarray:
    """Onset strength for a repeating bar: {sixteenth index in a 16-step bar: loudness}."""
    env = np.zeros(int(seconds * FPS))
    sixteenth = 60 / bpm / 4
    for bar in range(int(seconds / (16 * sixteenth))):
        for step, amp in hits.items():
            env[int((bar * 16 + step) * sixteenth * FPS)] += amp
    return np.convolve(env, [0.25, 1, 0.25], mode="same")


def test_riff_accents_at_four_thirds_snap_back_to_the_beat():
    # Shape Of You-style: loud 3-3-2 riff, softer kick on beats 1 and 3, snare on 2 and 4.
    riff = {0: 1.0, 3: 1.0, 6: 1.0, 8: 1.0, 11: 1.0, 14: 1.0}
    groove = {0: 0.6, 8: 0.6, 4: 0.5, 12: 0.5}
    env = envelope(96, {k: riff.get(k, 0) + groove.get(k, 0) for k in {*riff, *groove}})
    assert abs(pick_tempo(env, FPS, 128) - 96) < 1


def test_a_steady_beat_is_left_alone():
    four_on_the_floor = {0: 1.0, 4: 1.0, 8: 1.0, 12: 1.0, 2: 0.3, 6: 0.3, 10: 0.3, 14: 0.3}
    assert pick_tempo(envelope(120, four_on_the_floor), FPS, 120) == 120
    assert pick_tempo(envelope(96, four_on_the_floor), FPS, 96) == 96
