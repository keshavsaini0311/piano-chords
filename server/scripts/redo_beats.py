"""Redo an imported song's beats with the current beat tracker. Only `beats` changes: chords, your
chord edits and lyrics are kept. Backs up song.json to song.json.beats.bak first.
Run: cd server && PYTHONPATH=. uv run python scripts/redo_beats.py <youtube-id> [more ids]
"""
import json
import shutil
import statistics
import sys
import tempfile
from pathlib import Path

from app.audio import to_analysis_wav
from app.detect import detect_beats

DATA = Path(__file__).resolve().parent.parent / "data" / "songs"


def bpm(beats: list[float]) -> float:
    return 60 / statistics.median(b - a for a, b in zip(beats, beats[1:]))


for song_id in sys.argv[1:]:
    folder = DATA / song_id
    song = json.loads((folder / "song.json").read_text())
    audio = next(folder.glob("audio.*"))
    with tempfile.TemporaryDirectory() as tmp:
        copy = Path(tmp) / audio.name
        shutil.copy(audio, copy)
        beats = detect_beats(to_analysis_wav(copy))
    shutil.copy(folder / "song.json", folder / "song.json.beats.bak")
    old = song["beats"]
    song["beats"] = beats
    (folder / "song.json").write_text(json.dumps(song, ensure_ascii=False))
    print(f"{song['title']}: {bpm(old):.1f} -> {bpm(beats):.1f} BPM (backup: song.json.beats.bak)")
