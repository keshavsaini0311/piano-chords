"""Timing check with exact ground truth: synthesize a song whose chord changes happen at known
times, run the real detector and beat tracker, and measure how far off the detected changes are.
Run: cd server && PYTHONPATH=. uv run python eval/timing_synthetic.py
"""
import random
import statistics
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from app.detect import detect_beats, get_detector
from app.refine import refine_timing

SR = 22050
BPM = 100
BEAT = 60 / BPM
TRIADS = {"C": (0, 4, 7), "Dm": (2, 5, 9), "Em": (4, 7, 11), "F": (5, 9, 0), "G": (7, 11, 2), "Am": (9, 0, 4)}


def tone(freq: float, seconds: float) -> np.ndarray:
    t = np.arange(int(seconds * SR)) / SR
    wave = sum(np.sin(2 * np.pi * freq * k * t) / k**1.5 for k in range(1, 6))  # a few harmonics
    return wave * np.exp(-3.0 * t)  # piano-like decay


def strike(chord: str, seconds: float) -> np.ndarray:
    pcs = TRIADS[chord]
    notes = [48 + pcs[0]] + [60 + pc for pc in pcs] + [72 + pcs[0]]  # bass + triad + octave
    out = sum(tone(440 * 2 ** ((n - 69) / 12), seconds) for n in notes)
    return out / len(notes)


def synth(seed: int = 7) -> tuple[np.ndarray, list[tuple[float, str]]]:
    rng = random.Random(seed)
    events, t, previous = [], 1.0, None
    while t < 75:
        chord = rng.choice([c for c in TRIADS if c != previous])
        beats = rng.choice([2, 4, 4, 4, 8])
        offbeat = rng.random() < 0.2  # some changes land half a beat early, as in syncopated pop
        start = t - (BEAT / 2 if offbeat and events else 0)
        events.append((round(start, 3), chord))
        t += beats * BEAT
        previous = chord
    audio = np.zeros(int((t + 2) * SR))
    for i, (start, chord) in enumerate(events):
        end = events[i + 1][0] if i + 1 < len(events) else t
        # re-strike on every beat inside the chord, like a player comping
        hit = start
        while hit < end - 0.05:
            seg = strike(chord, min(BEAT, end - hit) + 0.3)
            a = int(hit * SR)
            audio[a : a + len(seg)] += seg[: len(audio) - a]
            hit = start + BEAT * (int((hit - start) / BEAT + 1e-9) + 1)
    return audio / np.max(np.abs(audio)) * 0.8, events


def report(name: str, segments, truth, beats) -> None:
    detected = [(s.start, s.label) for s in segments if s.label != "N.C."]
    errors = []
    for t, _chord in truth[1:]:
        nearest = min(detected, key=lambda d: abs(d[0] - t))
        if abs(nearest[0] - t) < 1.0:
            errors.append(nearest[0] - t)
    abs_ms = sorted(abs(e) * 1000 for e in errors)

    def label_at(seq, time):
        current = None
        for start, label in seq:
            if start <= time:
                current = label
        return current

    grid = np.arange(truth[0][0], truth[-1][0], 0.05)
    correct = sum(label_at(detected, x) == label_at(truth, x) for x in grid) / len(grid)
    print(f"{name}: mean {statistics.mean(errors) * 1000:+.0f} ms, median |err| {statistics.median(abs_ms):.0f} ms, "
          f"90th pct {abs_ms[int(0.9 * len(abs_ms))]:.0f} ms, max {abs_ms[-1]:.0f} ms | within 50 ms {sum(a <= 50 for a in abs_ms) / len(abs_ms):.0%}, "
          f"within 100 ms {sum(a <= 100 for a in abs_ms) / len(abs_ms):.0%} | right chord over time {correct:.0%}")


def main() -> None:
    audio, truth = synth()
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "synthetic.wav"
        sf.write(wav, audio, SR)
        segments = get_detector().detect(wav)
        beats = detect_beats(wav)
        refined = refine_timing(wav, segments, beats)
    beat_err = [min(abs(b - x) for b in beats) for x in np.arange(1.0, truth[-1][0], BEAT)]
    print(f"{len(truth) - 1} true changes; beat tracker median error {statistics.median(beat_err) * 1000:.0f} ms")
    report("detector only   ", segments, truth, beats)
    report("after refinement", refined, truth, beats)


if __name__ == "__main__":
    main()
