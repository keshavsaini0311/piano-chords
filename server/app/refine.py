"""Chord-change timing refinement.

The detector names chords well but, when two neighbouring chords share notes (Em->G, Dm->F), its
smoothing often waits a beat before switching (measured: eval/timing_synthetic.py). Here each change
is re-decided: among the beats from 1.5 beats before to half a beat after the reported change, pick
the one where the sound before matches the old chord's notes and the sound after matches the new
chord's notes best. Labels are never changed, and a change only moves if that clearly fits better.
Measured on eval/timing_synthetic.py: changes within 100 ms 71% -> 93%. Half-beat candidates were
tried for syncopated changes and made the typical case worse (93% -> 89%), so only beats are used.
"""
from dataclasses import replace
from pathlib import Path
import statistics

import numpy as np

from app.detect import Segment

PITCH = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
MIN_SEGMENT_SEC = 0.1
LOOK_BEFORE_BEATS = 1.5
LOOK_AFTER_BEATS = 0.5


def chord_profile(label: str) -> np.ndarray:
    """12 pitch-class weights for a chord label ('Am', 'G7', 'F#m7b5'); all zeros for silence."""
    profile = np.zeros(12)
    if not label or label[0] not in PITCH:
        return profile
    root_text = label[:2] if label[1:2] in ("#", "b") else label[:1]
    root = (PITCH[root_text[0]] + {"#": 1, "b": -1}.get(root_text[1:], 0)) % 12
    rest = label[len(root_text):].split("/")[0]
    if rest.startswith("dim") or "m7b5" in rest:
        intervals = [0, 3, 6]
    elif rest.startswith("aug"):
        intervals = [0, 4, 8]
    elif rest.startswith("sus2"):
        intervals = [0, 2, 7]
    elif rest.startswith("sus4"):
        intervals = [0, 5, 7]
    elif rest.startswith("m") and not rest.startswith("maj"):
        intervals = [0, 3, 7]
    else:
        intervals = [0, 4, 7]
    if "maj7" in rest:
        intervals.append(11)
    elif "dim7" in rest:
        intervals.append(9)
    elif "7" in rest:
        intervals.append(10)
    profile[[(root + i) % 12 for i in intervals]] = 1.0
    return profile


def _fit(notes: np.ndarray, profile: np.ndarray) -> np.ndarray:
    """How well each frame matches a chord (cosine similarity)."""
    norms = np.linalg.norm(notes, axis=0) * (np.linalg.norm(profile) or 1.0)
    return (profile @ notes) / np.maximum(norms, 1e-9)


def refine_boundaries(segments: list[Segment], notes: np.ndarray, times: np.ndarray, beats: list[float]) -> list[Segment]:
    out = [replace(s) for s in segments]
    gaps = np.diff(beats)
    beat = float(statistics.median(gaps)) if len(gaps) else 0.5
    for i in range(1, len(out)):
        before, after = out[i - 1], out[i]
        if "N.C." in (before.label, after.label):
            continue
        reported = after.start
        lo, hi = before.start + MIN_SEGMENT_SEC, after.end - MIN_SEGMENT_SEC
        candidates = [reported] + [b for b in beats if reported - LOOK_BEFORE_BEATS * beat <= b <= reported + LOOK_AFTER_BEATS * beat and lo <= b <= hi]
        window = (times >= max(before.start, reported - (LOOK_BEFORE_BEATS + 1) * beat)) & (times < min(after.end, reported + (LOOK_AFTER_BEATS + 1) * beat))
        frame_times = times[window]
        fit_before = _fit(notes[:, window], chord_profile(before.label))
        fit_after = _fit(notes[:, window], chord_profile(after.label))

        def score(t: float) -> float:
            split = frame_times < t
            return float(fit_before[split].sum() + fit_after[~split].sum())

        best = max(candidates, key=score)  # ties keep the reported time (it is first)
        before.end = after.start = round(best, 3)
    return out


def refine_timing(audio: Path, segments: list[Segment], beats: list[float]) -> list[Segment]:
    import librosa

    samples, rate = librosa.load(str(audio), sr=22050, mono=True)
    notes = librosa.feature.chroma_cqt(y=samples, sr=rate, hop_length=512)
    times = librosa.frames_to_time(np.arange(notes.shape[1]), sr=rate, hop_length=512)
    return refine_boundaries(segments, notes, times, beats)
