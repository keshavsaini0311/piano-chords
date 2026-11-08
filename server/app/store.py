"""Everything lives in one data folder, so moving to a new laptop is copying that folder:
  <data>/songs/<youtubeId>/  audio.*, detected.json, song.json
  <data>/settings.json       the app's view settings (key, Simple/Full, hand position)
  <data>/playlists.json      practice playlists"""
import json
import os
import re
import shutil
import threading
from dataclasses import asdict
from pathlib import Path
from typing import Callable

SONG_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
SETTING_NAME = re.compile(r"^[\w:.-]{1,64}$")


def _chord_time(song: dict) -> dict[str, float]:
    """Seconds per chord label, for library cards (key and easiest key are worked out in the browser)."""
    seconds: dict[str, float] = {}
    for c in song.get("chords", []):
        if c["label"] != "N.C.":
            seconds[c["label"]] = round(seconds.get(c["label"], 0) + c["end"] - c["start"], 2)
    return seconds


def keep_server_fields(stored: dict, incoming: dict) -> tuple[dict, bool]:
    """A browser save must not erase what only the server writes: `mixes` and each lyric line's `words`
    (kept only while the line's id and text are unchanged). True when a non-empty line is new or reworded."""
    merged = {k: v for k, v in incoming.items() if k != "mixes"}
    if "mixes" in stored:
        merged["mixes"] = stored["mixes"]
    old = {(l.get("id"), l.get("text")): l for l in stored.get("lyrics", [])}
    changed = False
    lyrics = []
    for line in incoming.get("lyrics", []):
        kept = old.get((line.get("id"), line.get("text")))
        changed = changed or (kept is None and bool(line.get("text", "").strip()))
        lyrics.append({**{k: v for k, v in line.items() if k != "words"}, **({"words": kept["words"]} if kept and "words" in kept else {})})
    if "lyrics" in incoming:
        merged["lyrics"] = lyrics
    return merged, changed


class SongStore:
    def __init__(self, data_dir: Path):
        self.lock = threading.RLock()  # every song.json write goes through it
        self.data_dir = data_dir
        self.root = data_dir / "songs"
        self.settings_file = data_dir / "settings.json"
        self.playlists_file = data_dir / "playlists.json"

    def song_dir(self, song_id: str) -> Path:
        if not SONG_ID.match(song_id):  # ids reach the filesystem: never let one escape root
            raise ValueError("Bad song id")
        return self.root / song_id

    def has_song(self, song_id: str) -> bool:
        return (self.song_dir(song_id) / "song.json").exists()

    def read_song(self, song_id: str) -> dict:
        return json.loads((self.song_dir(song_id) / "song.json").read_text())

    def write_song(self, song_id: str, song: dict) -> None:
        with self.lock:
            self._write_json(self.song_dir(song_id) / "song.json", song)

    def update_song(self, song_id: str, change: Callable[[dict], dict]) -> dict:
        """Read-change-write under the lock. Raises FileNotFoundError for a missing song (never recreates its folder)."""
        with self.lock:
            song = change(self.read_song(song_id))
            self._write_json(self.song_dir(song_id) / "song.json", song)
            return song

    def write_detected(self, song_id: str, segments: list) -> None:
        """Raw model output, never edited: lets the app compare models or reset a chord later."""
        self._write_json(self.song_dir(song_id) / "detected.json", [asdict(s) for s in segments])

    def list_songs(self) -> list[dict]:
        if not self.root.exists():
            return []
        songs = [json.loads(p.read_text()) for p in self.root.glob("*/song.json")]
        songs.sort(key=lambda s: s.get("importedAt", 0), reverse=True)
        return [{**{k: s[k] for k in ("id", "title", "artist", "duration")}, "chordTime": _chord_time(s), "hasLyrics": bool(s.get("lyrics"))} for s in songs]

    def delete_song(self, song_id: str) -> bool:
        with self.lock:  # so an update_song in flight finishes first and can't recreate the folder
            folder = self.song_dir(song_id)
            if not folder.exists():
                return False
            shutil.rmtree(folder)
            self.write_playlists([{**p, "songIds": [i for i in p["songIds"] if i != song_id]} for p in self.read_playlists()])
            return True

    def read_playlists(self) -> list[dict]:
        return json.loads(self.playlists_file.read_text()) if self.playlists_file.exists() else []

    def write_playlists(self, playlists: list[dict]) -> None:
        self._write_json(self.playlists_file, playlists)

    def audio_path(self, song_id: str) -> Path | None:
        return next((p for p in self.song_dir(song_id).glob("audio.*")), None)

    def read_setting(self, name: str) -> str | None:
        if not SETTING_NAME.match(name) or not self.settings_file.exists():
            return None
        return json.loads(self.settings_file.read_text()).get(name)

    def write_setting(self, name: str, value: str) -> None:
        if not SETTING_NAME.match(name):
            raise ValueError("Bad setting name")
        settings = json.loads(self.settings_file.read_text()) if self.settings_file.exists() else {}
        self._write_json(self.settings_file, {**settings, name: value})

    @staticmethod
    def _write_json(path: Path, data) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False))
        os.replace(tmp, path)  # atomic: a crash never leaves half a song.json
