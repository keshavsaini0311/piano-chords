"""Redo an imported song's chords with the current fill + timing steps, from its saved raw detection.
Backs up song.json to song.json.bak first. Chord edits made in the app are replaced; lyrics are kept.
Run: cd server && PYTHONPATH=. uv run python scripts/redo_chords.py <youtube-id> [more ids]
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

from app.audio import to_analysis_wav
from app.detect import Segment
from app.pipeline import estimate_confidence
from app.refine import refine_timing

DATA = Path(__file__).resolve().parent.parent / "data" / "songs"

for song_id in sys.argv[1:]:
    folder = DATA / song_id
    song = json.loads((folder / "song.json").read_text())
    raw = [Segment(**s) for s in json.loads((folder / "detected.json").read_text())]
    audio = next(folder.glob("audio.*"))
    with tempfile.TemporaryDirectory() as tmp:
        copy = Path(tmp) / audio.name
        shutil.copy(audio, copy)
        segments = refine_timing(to_analysis_wav(copy), raw, song["beats"])
    shutil.copy(folder / "song.json", folder / "song.json.bak")
    song["chords"] = [
        {"id": f"c{i}", "start": s.start, "end": s.end, "label": s.label, "confidence": c}
        for i, (s, c) in enumerate(zip(segments, estimate_confidence(segments, song["beats"])))
    ]
    song["anchors"] = {}  # anchors pointed at the old chord ids
    (folder / "song.json").write_text(json.dumps(song, ensure_ascii=False))
    print(f"{song['title']}: {len(raw)} -> {len(segments)} chords (backup: song.json.bak)")
