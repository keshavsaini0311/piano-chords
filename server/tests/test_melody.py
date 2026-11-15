import time
from pathlib import Path
from types import SimpleNamespace

from app.melody import melody_song, notes_from_pitches
from app.store import SongStore, keep_server_fields
from test_api import SONG_ID, URL, make_client, wait_for

HOP = 0.05


def test_runs_of_one_pitch_become_notes():
    notes = notes_from_pitches([0] + [60] * 5 + [0, 0] + [62] * 6, HOP)
    assert [n["midi"] for n in notes] == [60, 62]
    assert notes[0]["start"] == 0.05 and notes[1]["end"] == 0.7


def test_a_one_frame_wobble_does_not_split_a_held_note():
    notes = notes_from_pitches([60] * 10 + [61] + [60] * 10, HOP)
    assert [(n["midi"], n["start"], n["end"]) for n in notes] == [(60, 0.0, 1.05)]


def test_notes_too_short_to_play_are_dropped():
    assert notes_from_pitches([0] * 5 + [64] + [0] * 5, HOP) == []


class FakeMelody:
    def __init__(self, by_name: dict[str, list[dict]]):
        self.by_name, self.calls = by_name, []

    def detect(self, audio: Path) -> list[dict]:
        self.calls.append(audio.name)
        return self.by_name.get(audio.name, [])


def song_with_audio(tmp_path, mixes: bool) -> SongStore:
    store = SongStore(tmp_path)
    store.write_song(SONG_ID, {"id": SONG_ID, "duration": 10.0, **({"mixes": ["vocals"]} if mixes else {})})
    (store.song_dir(SONG_ID) / "audio.m4a").write_bytes(b"aac")
    if mixes:
        (store.song_dir(SONG_ID) / "mix").mkdir()
        (store.song_dir(SONG_ID) / "mix" / "vocals.m4a").write_bytes(b"aac")
    return store


def test_melody_follows_the_vocals_mix(tmp_path):
    store = song_with_audio(tmp_path, mixes=True)
    sung = [{"start": 1.0, "end": 4.0, "midi": 67}]
    melody_song(SONG_ID, SimpleNamespace(store=store, separator=None, melody=FakeMelody({"vocals.m4a": sung})))
    assert store.read_song(SONG_ID)["melody"] == sung


def test_hardly_any_singing_falls_back_to_the_whole_song(tmp_path):
    store = song_with_audio(tmp_path, mixes=True)
    lead = [{"start": 0.0, "end": 8.0, "midi": 71}]
    detector = FakeMelody({"vocals.m4a": [{"start": 0.0, "end": 0.2, "midi": 60}], "audio.m4a": lead})
    melody_song(SONG_ID, SimpleNamespace(store=store, separator=None, melody=detector))
    assert store.read_song(SONG_ID)["melody"] == lead


def test_keep_server_fields_keeps_the_melody():
    merged, _ = keep_server_fields({"melody": [{"start": 0, "end": 1, "midi": 60}]}, {"melody": [], "lyrics": []})
    assert merged["melody"] == [{"start": 0, "end": 1, "midi": 60}]
    assert "melody" not in keep_server_fields({}, {"melody": [{"start": 0, "end": 1, "midi": 1}]})[0]


def test_opening_a_song_finds_its_melody_once(tmp_path):
    detector = FakeMelody({"audio.m4a": [{"start": 0.0, "end": 5.0, "midi": 64}]})
    client = make_client(tmp_path, melody=detector)
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    for _ in range(100):
        song = client.get(f"/api/songs/{SONG_ID}").json()  # polling, like the browser
        if "melody" in song:
            break
        time.sleep(0.05)
    assert song["melody"] == [{"start": 0.0, "end": 5.0, "midi": 64}]
    assert detector.calls == ["audio.m4a"]


def test_an_octave_slip_is_folded_back_to_its_neighbours():
    frames = [0] + [57] * 4 + [0] + [60] * 4 + [0] + [72] * 4 + [0] + [59] * 4 + [0] + [57] * 4 + [0] + [40] * 4 + [0] + [59] * 4
    assert [n["midi"] for n in notes_from_pitches(frames, HOP)] == [57, 60, 59, 57, 52, 59]  # the slip joins the held 60
