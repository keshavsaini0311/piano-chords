"""Chord and beat detection. Detectors are swappable: add one to DETECTORS and set PC_DETECTOR."""
import os
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol

from app.labels import normalize_label


@dataclass
class Segment:
    start: float
    end: float
    label: str  # already normalised to the app's labels
    confidence: float | None = None
    alternatives: tuple[str, ...] = ()


class ChordDetector(Protocol):
    def detect(self, audio: Path) -> list[Segment]: ...


class LvChordiaDetector:
    """ISMIR 2019 large-vocabulary model. Output is start/end/Harte label only: no confidence,
    no alternatives (checked in lv_chordia 1.1.0), so confidence is estimated later in the pipeline."""

    def detect(self, audio: Path) -> list[Segment]:
        from lv_chordia import chord_recognition

        return [
            Segment(start=float(r["start_time"]), end=float(r["end_time"]), label=normalize_label(str(r["chord"])))
            for r in chord_recognition(str(audio))
        ]


# librosa can lock onto a riff's accents instead of the beat. A 3-3-2 sixteenth riff (Shape Of You)
# accents every 3 sixteenths, which reads as 4/3 of the real tempo (129 instead of 96). So the
# 3:4 neighbours of its tempo are scored by how well the music repeats at half a beat, one beat,
# two beats and a 4-beat bar, and one only wins by a clear margin. Measured on the 9 imported
# songs: only Shape Of You changes (score 0.64 -> 1.39); the others' neighbours all score lower.
THREE_FOUR = (3 / 4, 4 / 3)
SWITCH_MARGIN = 0.4


def metrical_score(onset, fps: float, bpm: float) -> float:
    import numpy as np
    import librosa

    ac = librosa.autocorrelate(onset - onset.mean())
    beat = 60 / bpm * fps
    return float(sum(np.interp(m * beat, np.arange(len(ac)), ac) for m in (0.5, 1, 2, 4)) / ac[0])


def pick_tempo(onset, fps: float, bpm: float) -> float:
    base = metrical_score(onset, fps, bpm)
    score, best = max((metrical_score(onset, fps, bpm * f), bpm * f) for f in THREE_FOUR)
    return best if score > base + SWITCH_MARGIN else bpm


def detect_beats(audio: Path) -> list[float]:
    import librosa

    samples, rate = librosa.load(str(audio), sr=22050, mono=True)
    import numpy as np

    onset = librosa.onset.onset_strength(y=samples, sr=rate, aggregate=np.median)  # what beat_track(y=...) uses
    tempo, frames = librosa.beat.beat_track(onset_envelope=onset, sr=rate)
    bpm = float(tempo[0] if hasattr(tempo, "__len__") else tempo)
    better = pick_tempo(onset, rate / 512, bpm)
    if better != bpm:
        _, frames = librosa.beat.beat_track(onset_envelope=onset, sr=rate, bpm=better)
    return [round(float(t), 3) for t in librosa.frames_to_time(frames, sr=rate)]


DETECTORS: dict[str, Callable[[], ChordDetector]] = {"lv-chordia": LvChordiaDetector}


def get_detector(name: str | None = None) -> ChordDetector:
    return DETECTORS[name or os.environ.get("PC_DETECTOR", "lv-chordia")]()


if __name__ == "__main__":  # manual check: uv run python -m app.detect <youtube-url>
    from app.audio import YtDlpFetcher, to_analysis_wav

    with tempfile.TemporaryDirectory() as tmp:
        audio, meta = YtDlpFetcher().fetch(sys.argv[1], Path(tmp))
        wav = to_analysis_wav(audio)
        segments = get_detector().detect(wav)
        print(meta)
        print(f"{len(segments)} segments; first 10:")
        for s in segments[:10]:
            print(f"  {s.start:7.2f}-{s.end:7.2f}  {s.label}")
        print(f"{len(detect_beats(wav))} beats")
