import time
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.store import SongStore
from app.stems import MIXES, split_song
from test_api import SONG_ID, URL, FakeFetcher, make_client, wait_for


class FakeSeparator:
    def __init__(self):
        self.calls = 0

    def separate(self, audio: Path, out_dir: Path) -> dict[str, Path]:
        self.calls += 1
        paths = {name: out_dir / f"{name}.m4a" for name in MIXES}
        for path in paths.values():
            path.write_bytes(b"aac")
        return paths


def test_import_then_split_marks_the_song(tmp_path):
    client = make_client(tmp_path, separator=FakeSeparator())
    assert wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])["state"] == "done"
    for _ in range(100):
        song = client.get(f"/api/songs/{SONG_ID}").json()
        if song.get("mixes"):
            break
        time.sleep(0.05)
    assert song["mixes"] == ["backing", "novocals", "vocals"]
    for name in MIXES:
        assert (tmp_path / "songs" / SONG_ID / "mix" / f"{name}.m4a").exists()


def test_split_of_a_deleted_song_leaves_no_folder(tmp_path):
    client = make_client(tmp_path, separator=FakeSeparator())
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    client.delete(f"/api/songs/{SONG_ID}")
    deps = SimpleNamespace(store=SongStore(tmp_path), separator=FakeSeparator())
    with pytest.raises(FileNotFoundError):
        split_song(SONG_ID, deps)
    assert not (tmp_path / "songs" / SONG_ID).exists()


def test_failed_import_runs_no_split(tmp_path, monkeypatch):
    separator = FakeSeparator()
    client = make_client(tmp_path, separator=separator)
    monkeypatch.setattr(FakeFetcher, "fetch", lambda self, url, dest: (_ for _ in ()).throw(RuntimeError("offline")))
    assert wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])["state"] == "failed"
    time.sleep(0.2)
    assert separator.calls == 0


def test_mix_endpoint(tmp_path):
    client = make_client(tmp_path, separator=FakeSeparator())
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    for _ in range(100):
        if client.get(f"/api/songs/{SONG_ID}/mix/backing").status_code == 200:
            break
        time.sleep(0.05)
    assert client.get(f"/api/songs/{SONG_ID}/mix/backing").content == b"aac"
    assert client.get(f"/api/songs/{SONG_ID}/mix/piano").status_code == 404
    assert client.get("/api/songs/nope/mix/backing").status_code == 404


def test_backfill_with_no_ids_skips_songs_that_have_mixes(tmp_path):
    from scripts.backfill import backfill_stems

    store = SongStore(tmp_path)
    for song_id, extra in (("doneSong001", {"mixes": list(MIXES)}), ("newSong0001", {})):
        store.write_song(song_id, {"id": song_id, "title": "t", "artist": "a", "duration": 1, "importedAt": 1, **extra})
        (store.song_dir(song_id) / "audio.m4a").write_bytes(b"x")
    separator = FakeSeparator()
    backfill_stems(store, separator, [])
    assert separator.calls == 1
    assert store.read_song("newSong0001")["mixes"] == list(MIXES)
