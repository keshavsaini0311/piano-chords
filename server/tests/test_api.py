import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.audio import Meta
from app.detect import Segment
from app.lyrics import Line
from app.main import create_app
from app.pipeline import Deps, estimate_confidence, merge_slivers
from app.store import SongStore

URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
SONG_ID = "dQw4w9WgXcQ"


class FakeFetcher:
    def fetch(self, url: str, dest: Path):
        dest.mkdir(parents=True, exist_ok=True)
        audio = dest / "audio.m4a"
        audio.write_bytes(b"0123456789")
        return audio, Meta(id=SONG_ID, title="Demo Song", artist="Nobody", duration=6.0)


class FakeDetector:
    def __init__(self, gate: threading.Event | None = None):
        self.gate = gate

    def detect(self, audio: Path):
        if self.gate:
            self.gate.wait(5)
        return [Segment(0, 2, "Fm"), Segment(2, 4, "Db"), Segment(4, 6, "N.C.")]


class FakeLyrics:
    def __init__(self, lines: list[Line] | None):
        self.lines = lines
        self.asked: list[tuple[str, str]] = []

    def find(self, title, artist, duration):
        self.asked.append((title, artist))
        return self.lines


def make_client(tmp_path, lyrics=None, gate=None, separator=None):
    deps = Deps(
        fetcher=FakeFetcher(),
        detector=FakeDetector(gate),
        lyrics=lyrics or FakeLyrics([Line("l0", 0, 3, "walking down the road"), Line("l1", 3, 6, "counting every light")]),
        beats=lambda wav: [i * 0.5 for i in range(12)],
        store=SongStore(tmp_path),
        prepare=lambda audio: audio,
        refine=lambda wav, segments, beats: segments,
        separator=separator,
    )
    return TestClient(create_app(deps))


def wait_for(client, job_id):
    for _ in range(100):
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["state"] not in ("queued", "running"):
            return job
        time.sleep(0.05)
    raise AssertionError("job never finished")


def test_import_runs_the_pipeline_and_saves_the_song(tmp_path):
    client = make_client(tmp_path)
    started = client.post("/api/songs", json={"url": URL}).json()
    assert started["songId"] == SONG_ID
    assert wait_for(client, started["jobId"])["state"] == "done"
    song = client.get(f"/api/songs/{SONG_ID}").json()
    assert [c["id"] for c in song["chords"]] == ["c0", "c1", "c2"]
    assert [c["label"] for c in song["chords"]] == ["Fm", "Db", "N.C."]
    assert song["title"] == "Demo Song" and len(song["lyrics"]) == 2
    assert client.get("/api/songs").json()[0]["id"] == SONG_ID


def test_non_youtube_link_is_a_400_not_a_job(tmp_path):
    response = make_client(tmp_path).post("/api/songs", json={"url": "hello"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Not a YouTube link"


def test_same_link_twice_reuses_the_running_job(tmp_path):
    gate = threading.Event()
    client = make_client(tmp_path, gate=gate)
    first = client.post("/api/songs", json={"url": URL}).json()
    second = client.post("/api/songs", json={"url": "https://youtu.be/dQw4w9WgXcQ"}).json()
    assert second["jobId"] == first["jobId"]
    gate.set()
    wait_for(client, first["jobId"])
    again = client.post("/api/songs", json={"url": URL}).json()
    assert client.get(f"/api/jobs/{again['jobId']}").json()["state"] == "done"


def test_missing_lyrics_still_saves_a_usable_song(tmp_path):
    client = make_client(tmp_path, lyrics=FakeLyrics(None))
    job = wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    assert job["state"] == "done_without_lyrics"
    assert client.get(f"/api/songs/{SONG_ID}").json()["lyrics"] == []


def test_audio_supports_range_requests_for_seeking(tmp_path):
    client = make_client(tmp_path)
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    response = client.get(f"/api/songs/{SONG_ID}/audio", headers={"Range": "bytes=0-1"})
    assert response.status_code == 206
    assert response.content == b"01"


def test_put_then_get_round_trips_edits(tmp_path):
    client = make_client(tmp_path)
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    song = client.get(f"/api/songs/{SONG_ID}").json()
    song["chords"][0]["label"] = "Am"
    assert client.put(f"/api/songs/{SONG_ID}", json=song).status_code == 200
    assert client.get(f"/api/songs/{SONG_ID}").json()["chords"][0]["label"] == "Am"


def test_lyrics_search_returns_lines_without_touching_the_saved_song(tmp_path):
    lyrics = FakeLyrics(None)
    client = make_client(tmp_path, lyrics=lyrics)
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    before = client.get(f"/api/songs/{SONG_ID}").json()
    lyrics.lines = [Line("l0", 0, 6, "a new line")]
    found = client.post(f"/api/songs/{SONG_ID}/lyrics", json={"title": "Real Title", "artist": "Real Artist"}).json()
    assert lyrics.asked[-1] == ("Real Title", "Real Artist")
    assert found["lyrics"][0]["text"] == "a new line"
    assert client.get(f"/api/songs/{SONG_ID}").json() == before  # the browser saves; the server only searches


def test_song_ids_cannot_escape_the_data_folder(tmp_path):
    client = make_client(tmp_path)
    assert client.get("/api/songs/..%2F..%2Fetc").status_code in (400, 404)
    with pytest.raises(ValueError):
        SongStore(tmp_path).song_dir("../outside")


def test_estimate_confidence_flags_short_chords():
    beats = [i * 0.5 for i in range(20)]
    segments = [Segment(0, 1, "C"), Segment(1, 1.25, "G"), Segment(1.25, 3, "N.C.")]
    assert estimate_confidence(segments, beats) == [1.0, 0.25, 1.0]


def test_merge_slivers_folds_tiny_segments_into_a_neighbour():
    merged = merge_slivers([Segment(0, 0.09, "N.C."), Segment(0.09, 4, "Fm"), Segment(4, 4.05, "C"), Segment(4.05, 8, "Db")])
    assert [(s.start, s.end, s.label) for s in merged] == [(0, 4.05, "Fm"), (4.05, 8, "Db")]


def test_settings_live_in_the_data_folder(tmp_path):
    client = make_client(tmp_path)
    assert client.get("/api/settings/view").json() == {"value": None}
    assert client.put("/api/settings/view", json={"value": "{\"semitones\":4}"}).status_code == 200
    assert client.get("/api/settings/view").json() == {"value": "{\"semitones\":4}"}
    assert (tmp_path / "settings.json").exists()


def test_import_deletes_the_temporary_analysis_audio(tmp_path):
    def prepare(audio):
        wav = audio.with_name("analysis.wav")
        wav.write_bytes(b"pcm")
        return wav

    deps = Deps(
        fetcher=FakeFetcher(), detector=FakeDetector(), lyrics=FakeLyrics(None),
        beats=lambda wav: [0.0, 0.5], store=SongStore(tmp_path), prepare=prepare,
        refine=lambda wav, segments, beats: segments,
    )
    client = TestClient(create_app(deps))
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    song_dir = tmp_path / "songs" / SONG_ID
    assert (song_dir / "audio.m4a").exists()
    assert not (song_dir / "analysis.wav").exists()


def test_data_folder_can_be_moved_with_an_env_var(tmp_path, monkeypatch):
    import importlib
    import app.main as main
    monkeypatch.setenv("PC_DATA_DIR", str(tmp_path / "synced"))
    assert importlib.reload(main).DATA_DIR == tmp_path / "synced"
    monkeypatch.delenv("PC_DATA_DIR")
    importlib.reload(main)


def test_import_refines_chord_timing_before_saving(tmp_path):
    def shift_second_change(wav, segments, beats):
        segments[1].start = segments[0].end = 1.5  # stand-in refinement: prove its result is what gets saved
        return segments

    deps = Deps(
        fetcher=FakeFetcher(), detector=FakeDetector(), lyrics=FakeLyrics(None), beats=lambda wav: [0.0, 0.5],
        store=SongStore(tmp_path), prepare=lambda audio: audio, refine=shift_second_change,
    )
    client = TestClient(create_app(deps))
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    chords = client.get(f"/api/songs/{SONG_ID}").json()["chords"]
    assert chords[0]["end"] == 1.5 and chords[1]["start"] == 1.5


def test_song_list_summarises_chords_and_lyrics(tmp_path):
    client = make_client(tmp_path)
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    summary = client.get("/api/songs").json()[0]
    assert summary["chordTime"] == {"Fm": 2, "Db": 2}  # seconds per chord, silence left out
    assert summary["hasLyrics"] is True


def test_playlists_round_trip_and_live_in_the_data_folder(tmp_path):
    client = make_client(tmp_path)
    assert client.get("/api/playlists").json() == []
    playlists = [{"id": "p1", "name": "Warm up", "songIds": [SONG_ID]}]
    assert client.put("/api/playlists", json=playlists).status_code == 200
    assert client.get("/api/playlists").json() == playlists
    assert (tmp_path / "playlists.json").exists()
    assert client.put("/api/playlists", json=[{"id": "p1"}]).status_code == 422  # malformed is rejected


def test_removing_a_song_deletes_its_folder_and_takes_it_out_of_playlists(tmp_path):
    client = make_client(tmp_path)
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    client.put("/api/playlists", json=[{"id": "p1", "name": "Warm up", "songIds": [SONG_ID, "otherSongId"]}])
    assert client.delete(f"/api/songs/{SONG_ID}").status_code == 200
    assert not (tmp_path / "songs" / SONG_ID).exists()
    assert client.get("/api/songs").json() == []
    assert client.get("/api/playlists").json()[0]["songIds"] == ["otherSongId"]
    assert client.delete(f"/api/songs/{SONG_ID}").status_code == 404


def test_cover_is_served_from_the_song_folder(tmp_path):
    client = make_client(tmp_path)
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    (tmp_path / "songs" / SONG_ID / "cover.jpg").write_bytes(b"jpeg-bytes")
    response = client.get(f"/api/songs/{SONG_ID}/cover")
    assert response.status_code == 200 and response.content == b"jpeg-bytes"


def test_put_keeps_server_written_fields(tmp_path):
    client = make_client(tmp_path)
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    song = client.get(f"/api/songs/{SONG_ID}").json()
    mixes = ["backing", "novocals", "vocals"]
    SongStore(tmp_path).update_song(SONG_ID, lambda s: {**s, "mixes": mixes})
    assert "mixes" not in song
    assert client.put(f"/api/songs/{SONG_ID}", json=song).status_code == 200
    assert client.get(f"/api/songs/{SONG_ID}").json()["mixes"] == mixes


def test_put_of_a_missing_song_is_404_and_creates_no_folder(tmp_path):
    client = make_client(tmp_path)
    assert client.put(f"/api/songs/{SONG_ID}", json={"title": "x"}).status_code == 404
    assert not (tmp_path / "songs" / SONG_ID).exists()


def test_put_keeps_words_on_unchanged_lines_and_drops_them_on_reworded_ones(tmp_path):
    client = make_client(tmp_path)
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    song = client.get(f"/api/songs/{SONG_ID}").json()
    words = [{"index": 0, "start": 0.5, "end": 1.0}]
    SongStore(tmp_path).update_song(SONG_ID, lambda s: {**s, "lyrics": [{**l, "words": words} for l in s["lyrics"]]})
    song["lyrics"][1]["text"] = "something else"
    assert client.put(f"/api/songs/{SONG_ID}", json=song).status_code == 200
    saved = client.get(f"/api/songs/{SONG_ID}").json()["lyrics"]
    assert saved[0]["words"] == words and "words" not in saved[1]
