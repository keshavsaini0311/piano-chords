"""Fill in what songs imported earlier are missing. --stems makes the backing / no-vocals / vocals mixes.
With no ids, every song missing the result. Run: cd server && PYTHONPATH=. uv run python scripts/backfill.py --stems [ids]"""
import sys
import time

from app.main import DATA_DIR
from app.stems import DemucsSeparator, split_song
from app.store import SongStore
from types import SimpleNamespace

args = sys.argv[1:]
ids = [a for a in args if not a.startswith("--")]
store = SongStore(DATA_DIR)
deps = SimpleNamespace(store=store, separator=DemucsSeparator())
if "--stems" in args:
    for song in store.list_songs():
        if (ids and song["id"] not in ids) or (not ids and song.get("mixes")):
            continue
        started = time.time()
        split_song(song["id"], deps)
        print(f"{song['id']}: stems in {time.time() - started:.0f} s")
