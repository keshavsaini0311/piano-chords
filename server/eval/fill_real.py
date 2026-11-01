"""Effect of fill_long_segments on real imports: long-chord and no-chord coverage before/after, and
how much playing time sits on chords the song's UG chart uses (guards against inventing wrong chords).
Run: cd server && PYTHONPATH=. uv run python eval/fill_real.py
"""
import json
import re
import statistics
import tempfile
from pathlib import Path

import librosa
import numpy as np

from app.audio import to_analysis_wav
from app.detect import Segment
from app.refine import LONG_SEGMENT_BEATS, fill_long_segments

DATA = Path(__file__).resolve().parent.parent / "data"
PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def triad(label: str, shift: int = 0) -> str | None:
    m = re.match(r"^([A-G])([#b]?)(.*)$", label)
    if not m:
        return None
    pc = (PC[m[1]] + {"#": 1, "b": -1}.get(m[2], 0) + shift) % 12
    minor = m[3].startswith("m") and not m[3].startswith("maj")
    return f"{pc}{'m' if minor else ''}"


def stats(segments, beat, ug_set):
    total = sum(s.end - s.start for s in segments)
    long = sum(s.end - s.start for s in segments if s.label != "N.C." and s.end - s.start > LONG_SEGMENT_BEATS * beat)
    silent = sum(s.end - s.start for s in segments if s.label == "N.C.")
    playing = [(triad(s.label), s.end - s.start) for s in segments if s.label != "N.C."]
    best = 0.0
    if ug_set:
        for shift in range(12):
            on = sum(d for t, d in playing if t and triad_shift(t, shift) in ug_set)
            best = max(best, on / (sum(d for _, d in playing) or 1))
    return long / total, silent / total, best


def triad_shift(t: str, shift: int) -> str:
    minor = t.endswith("m")
    return f"{(int(t.rstrip('m')) + shift) % 12}{'m' if minor else ''}"


def main() -> None:
    manifest = json.loads((DATA / "eval" / "manifest.json").read_text())
    ug_by_id = {e["songId"]: e["ug"] for e in manifest.values() if e.get("songId") and e.get("ug")}
    totals = []
    for song_dir in sorted((DATA / "songs").iterdir()):
        song = json.loads((song_dir / "song.json").read_text())
        raw = [Segment(**s) for s in json.loads((song_dir / "detected.json").read_text())]
        audio = next(song_dir.glob("audio.*"))
        with tempfile.TemporaryDirectory() as tmp:
            copy = Path(tmp) / audio.name
            copy.write_bytes(audio.read_bytes())
            samples, rate = librosa.load(str(to_analysis_wav(copy)), sr=22050, mono=True)
        notes = librosa.feature.chroma_cqt(y=samples, sr=rate, hop_length=512)
        loudness = librosa.feature.rms(y=samples, hop_length=512)[0][: notes.shape[1]]
        times = librosa.frames_to_time(np.arange(notes.shape[1]), sr=rate, hop_length=512)
        beats = song["beats"]
        beat = statistics.median(np.diff(beats))
        filled = fill_long_segments(raw, notes, loudness, times, beats)
        ug = ug_by_id.get(song_dir.name)
        ug_set = {t for t in (triad(c, ug["capo"]) for c in ug["chords"]) if t} if ug else set()
        before, after = stats(raw, beat, ug_set), stats(filled, beat, ug_set)
        totals.append((before, after, bool(ug_set)))
        print(f"{song['title'][:30]:30} long {before[0]:4.0%}->{after[0]:4.0%}  no-chord {before[1]:4.0%}->{after[1]:4.0%}"
              + (f"  on UG chords {before[2]:4.0%}->{after[2]:4.0%}" if ug_set else ""), flush=True)
    n = len(totals)
    avg = lambda k, i, only_ug=False: statistics.mean(t[k][i] for t in totals if t[2] or not only_ug)
    print(f"\n{n} songs  long chords {avg(0, 0):.0%} -> {avg(1, 0):.0%}  no-chord {avg(0, 1):.0%} -> {avg(1, 1):.0%}  "
          f"on UG chords {avg(0, 2, True):.0%} -> {avg(1, 2, True):.0%}")


if __name__ == "__main__":
    main()
