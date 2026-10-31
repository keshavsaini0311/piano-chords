"""Timing check on real imports (no ground truth needed): re-run the refinement on each song's raw
detection and report how many chord changes move, which way, and whether the audio fits the chord
names better afterwards (mean cosine fit of each frame to its chord's notes).
Run: cd server && PYTHONPATH=. uv run python eval/timing_real.py
"""
import json
import statistics
import tempfile
from pathlib import Path

import librosa
import numpy as np

from app.audio import to_analysis_wav
from app.detect import Segment
from app.refine import _fit, chord_profile, refine_boundaries

DATA = Path(__file__).resolve().parent.parent / "data"


def mean_fit(segments: list[Segment], notes: np.ndarray, times: np.ndarray) -> float:
    fits = []
    for s in segments:
        if s.label == "N.C.":
            continue
        frames = (times >= s.start) & (times < s.end)
        if frames.any():
            fits.append(_fit(notes[:, frames], chord_profile(s.label)))
    return float(np.concatenate(fits).mean())


def main() -> None:
    rows, moved_all, total_all = [], [], 0
    for song_dir in sorted((DATA / "songs").iterdir()):
        song = json.loads((song_dir / "song.json").read_text())
        segments = [Segment(**s) for s in json.loads((song_dir / "detected.json").read_text())]
        audio = next(song_dir.glob("audio.*"))
        with tempfile.TemporaryDirectory() as tmp:
            copy = Path(tmp) / audio.name
            copy.write_bytes(audio.read_bytes())
            samples, rate = librosa.load(str(to_analysis_wav(copy)), sr=22050, mono=True)
        notes = librosa.feature.chroma_cqt(y=samples, sr=rate, hop_length=512)
        times = librosa.frames_to_time(np.arange(notes.shape[1]), sr=rate, hop_length=512)
        beats = song["beats"]
        beat = statistics.median(np.diff(beats))
        refined = refine_boundaries(segments, notes, times, beats)
        shifts = [r.start - s.start for s, r in zip(segments[1:], refined[1:]) if abs(r.start - s.start) > 0.02]
        moved_all += [x / beat for x in shifts]
        total_all += len(segments) - 1
        before, after = mean_fit(segments, notes, times), mean_fit(refined, notes, times)
        earlier = sum(x < 0 for x in shifts)
        rows.append(f"{song['title'][:34]:34} changes {len(segments) - 1:3}  moved {len(shifts):3} ({earlier} earlier)  fit {before:.3f} -> {after:.3f}")
        print(rows[-1], flush=True)
    print()
    print(f"{len(rows)} songs, {total_all} chord changes: {len(moved_all)} moved ({len(moved_all) / total_all:.0%}), "
          f"{sum(x < 0 for x in moved_all)} earlier / {sum(x > 0 for x in moved_all)} later")
    print(f"typical move: {statistics.median([abs(x) for x in moved_all]):.2f} beats; "
          f"moves of about one beat: {sum(0.75 <= abs(x) <= 1.25 for x in moved_all)}")


if __name__ == "__main__":
    main()
