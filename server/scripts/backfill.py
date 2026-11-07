"""Fill in what songs imported earlier are missing. --stems makes the backing / no-vocals / vocals mixes.
With no ids, every song missing the result. Run: cd server && PYTHONPATH=. uv run python scripts/backfill.py --stems [ids]"""
import sys
import time
from types import SimpleNamespace

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


if __name__ == "__main__":
    from app.main import DATA_DIR
    from app.stems import DemucsSeparator
    from app.store import SongStore

    args = sys.argv[1:]
    if "--stems" in args:
        backfill_stems(SongStore(DATA_DIR), DemucsSeparator(), [a for a in args if not a.startswith("--")])
