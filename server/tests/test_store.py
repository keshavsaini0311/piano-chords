import pytest

from app.store import SongStore, keep_server_fields


def test_update_song_applies_the_change(tmp_path):
    store = SongStore(tmp_path)
    store.write_song("abcdefghijk", {"id": "abcdefghijk", "title": "Old"})
    assert store.update_song("abcdefghijk", lambda s: {**s, "title": "New"})["title"] == "New"
    assert store.read_song("abcdefghijk")["title"] == "New"


def test_update_song_on_a_missing_song_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        SongStore(tmp_path).update_song("abcdefghijk", lambda s: s)
    assert not (tmp_path / "songs" / "abcdefghijk").exists()


def test_keep_server_fields():
    stored = {"mixes": ["backing", "novocals", "vocals"], "lyrics": [{"id": "l0", "text": "a b", "words": [{"index": 0, "start": 1, "end": 2}]}, {"id": "l1", "text": "c", "words": [{"index": 0, "start": 3, "end": 4}]}]}
    merged, changed = keep_server_fields(stored, {"lyrics": [{"id": "l0", "text": "a b"}, {"id": "l1", "text": "changed"}]})
    assert merged["mixes"] == stored["mixes"] and merged["lyrics"][0]["words"] and "words" not in merged["lyrics"][1] and changed


def test_keep_server_fields_drops_mixes_the_server_never_wrote():
    merged, changed = keep_server_fields({}, {"mixes": ["x"], "lyrics": [{"id": "l0", "text": "a", "words": []}, {"id": "l1", "text": ""}]})
    assert "mixes" not in merged and "words" not in merged["lyrics"][0] and changed
    assert not keep_server_fields({}, {"lyrics": [{"id": "l1", "text": ""}]})[1]


def test_delete_waits_for_an_update_in_flight_and_the_folder_stays_gone(tmp_path):
    import threading

    store = SongStore(tmp_path)
    store.write_song("abcdefghijk", {"id": "abcdefghijk"})
    inside, release = threading.Event(), threading.Event()

    def change(song):
        inside.set()
        release.wait(2)
        return {**song, "title": "T"}

    updater = threading.Thread(target=store.update_song, args=("abcdefghijk", change))
    updater.start()
    inside.wait(2)
    deleter = threading.Thread(target=store.delete_song, args=("abcdefghijk",))
    deleter.start()
    release.set()
    updater.join()
    deleter.join()
    assert not (tmp_path / "songs" / "abcdefghijk").exists()
