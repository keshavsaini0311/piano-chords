"""One folder per song under data/songs/<youtubeId>/: audio.*, analysis.wav, detected.json, song.json."""
import json
import os
import re
from dataclasses import asdict
from pathlib import Path

SONG_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


class SongStore:
    def __init__(self, root: Path):
        self.root = root

    def song_dir(self, song_id: str) -> Path:
        if not SONG_ID.match(song_id):  # ids reach the filesystem: never let one escape root
            raise ValueError("Bad song id")
        return self.root / song_id

    def has_song(self, song_id: str) -> bool:
        return (self.song_dir(song_id) / "song.json").exists()

    def read_song(self, song_id: str) -> dict:
        return json.loads((self.song_dir(song_id) / "song.json").read_text())

    def write_song(self, song_id: str, song: dict) -> None:
        self._write_json(self.song_dir(song_id) / "song.json", song)

    def write_detected(self, song_id: str, segments: list) -> None:
        """Raw model output, never edited: lets the app compare models or reset a chord later."""
        self._write_json(self.song_dir(song_id) / "detected.json", [asdict(s) for s in segments])

    def list_songs(self) -> list[dict]:
        if not self.root.exists():
            return []
        songs = [json.loads(p.read_text()) for p in self.root.glob("*/song.json")]
        songs.sort(key=lambda s: s.get("importedAt", 0), reverse=True)
        return [{k: s[k] for k in ("id", "title", "artist", "duration")} for s in songs]

    def audio_path(self, song_id: str) -> Path | None:
        return next((p for p in self.song_dir(song_id).glob("audio.*")), None)

    @staticmethod
    def _write_json(path: Path, data) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False))
        os.replace(tmp, path)  # atomic: a crash never leaves half a song.json
