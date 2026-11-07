"""Fill in what songs imported earlier are missing. --stems makes the backing / no-vocals / vocals mixes.
With no ids, every song missing the result. --align times each lyric word.
Run: cd server && PYTHONPATH=. uv run python scripts/backfill.py --stems [ids]"""
import sys
import time
from types import SimpleNamespace

from app.align import align_song
from app.stems import split_song


def stem_targets(store, ids: list[str]) -> list[str]:
    """Given ids, those songs; otherwise every song without mixes (list_songs omits them, so read each record)."""
    if ids:
        return ids
    return [s["id"] for s in store.list_songs() if not store.read_song(s["id"]).get("mixes")]


def backfill_stems(store, separator, ids: list[str]) -> None:
    deps = SimpleNamespace(store=store, separator=separator)
    for song_id in stem_targets(store, ids):
        started = time.time()
        split_song(song_id, deps)
        print(f"{song_id}: stems in {time.time() - started:.0f} s")


def align_targets(store, ids: list[str]) -> list[str]:
    """Given ids, those songs; otherwise every song with sung lyrics and no line with `words`."""
    if ids:
        return ids
    songs = [store.read_song(s["id"]) for s in store.list_songs() if s["hasLyrics"]]
    return [s["id"] for s in songs if any(l.get("text", "").strip() for l in s["lyrics"]) and not any("words" in l for l in s["lyrics"])]


def backfill_align(store, aligner, ids: list[str]) -> None:
    deps = SimpleNamespace(store=store, aligner=aligner)
    for song_id in align_targets(store, ids):
        started = time.time()
        align_song(song_id, deps)
        print(f"{song_id}: aligned in {time.time() - started:.0f} s")


if __name__ == "__main__":
    from app.main import DATA_DIR
    from app.stems import DemucsSeparator
    from app.store import SongStore

    args = sys.argv[1:]
    if "--stems" in args:
        backfill_stems(SongStore(DATA_DIR), DemucsSeparator(), [a for a in args if not a.startswith("--")])
    if "--align" in args:
        from app.align import CtcAligner

        backfill_align(SongStore(DATA_DIR), CtcAligner(), [a for a in args if not a.startswith("--")])
