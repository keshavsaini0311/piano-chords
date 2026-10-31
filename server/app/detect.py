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


def detect_beats(audio: Path) -> list[float]:
    import librosa

    samples, rate = librosa.load(str(audio), sr=22050, mono=True)
    _, frames = librosa.beat.beat_track(y=samples, sr=rate)
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
