import time
from pathlib import Path

from app.align import accept_line, kept_words, language_of
from test_api import SONG_ID, URL, FakeFetcher, make_client, wait_for


class FakeAligner:
    def __init__(self, during=None):
        self.audio: list[Path] = []
        self.during = during

    def align(self, audio, lines):
        self.audio.append(audio)
        if self.during:
            self.during()
        return {l["id"]: [{"index": i, "start": l["start"] + i * 0.4, "end": l["start"] + i * 0.4 + 0.3} for i, _ in enumerate(l["text"].split())] for l in lines}


def settle(client, ready, tries=100):
    for _ in range(tries):
        song = client.get(f"/api/songs/{SONG_ID}").json()
        if ready(song):
            return song
        time.sleep(0.05)
    return song


def imported(tmp_path, aligner):
    client = make_client(tmp_path, aligner=aligner)
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    return client


def test_language_of():
    assert language_of("नमस्ते दुनिया") == "hin" and language_of("hello there") == "eng"


def test_kept_words():
    assert kept_words(["go", "—", "now"], ["go", "", "now"]) == [0, 2]


def test_accept_line():
    ok = [{"start": 10.1, "end": 10.5}, {"start": 10.6, "end": 11.0}]
    assert accept_line(10.0, 12.0, ok, -1.0)
    assert not accept_line(10.0, 12.0, [{"start": 11.2, "end": 11.5}], -1.0)
    assert not accept_line(10.0, 12.0, ok, -3.0)
    assert not accept_line(10.0, 12.0, [], -1.0)


def test_import_aligns_lyrics(tmp_path):
    client = imported(tmp_path, FakeAligner())
    song = settle(client, lambda s: "words" in s["lyrics"][0])
    assert [w["index"] for w in song["lyrics"][0]["words"]] == [0, 1, 2, 3]


def test_changed_lyrics_drop_words_and_realign(tmp_path):
    aligner = FakeAligner()
    client = imported(tmp_path, aligner)
    song = settle(client, lambda s: "words" in s["lyrics"][1])
    song["lyrics"][1]["text"] = "counting every star tonight"
    client.put(f"/api/songs/{SONG_ID}", json=song)
    song = settle(client, lambda s: len(s["lyrics"][1].get("words", [])) == 4)
    assert len(song["lyrics"][1]["words"]) == 4 and "words" in song["lyrics"][0]
    assert len(aligner.audio) == 2


def test_results_for_changed_text_are_dropped(tmp_path):
    client = make_client(tmp_path)  # import without aligning, then align by hand
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    from app.align import align_song
    from app.store import SongStore

    store = SongStore(tmp_path)

    def reword():
        store.update_song(SONG_ID, lambda s: {**s, "lyrics": [{**s["lyrics"][0], "text": "something new"}, s["lyrics"][1]]})

    class Deps:
        pass

    deps = Deps()
    deps.store, deps.aligner = store, FakeAligner(during=reword)
    align_song(SONG_ID, deps)
    lyrics = store.read_song(SONG_ID)["lyrics"]
    assert "words" not in lyrics[0] and "words" in lyrics[1]


def test_align_prefers_the_vocals_mix(tmp_path, monkeypatch):
    aligner = FakeAligner()
    client = make_client(tmp_path, aligner=aligner)
    mix = tmp_path / "songs" / SONG_ID / "mix"
    original = FakeFetcher.fetch

    def fetch_with_mix(self, url, dest):
        result = original(self, url, dest)
        mix.mkdir(parents=True, exist_ok=True)
        (mix / "vocals.m4a").write_bytes(b"v")
        return result

    monkeypatch.setattr(FakeFetcher, "fetch", fetch_with_mix)
    wait_for(client, client.post("/api/songs", json={"url": URL}).json()["jobId"])
    settle(client, lambda s: "words" in s["lyrics"][0])
    assert aligner.audio == [mix / "vocals.m4a"]
