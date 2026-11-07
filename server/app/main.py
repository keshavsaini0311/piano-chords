"""HTTP API for the browser. Run: uv run uvicorn app.main:app --reload
Set PC_DATA_DIR to keep all songs and settings somewhere else (e.g. an iCloud Drive folder)."""
import os
from dataclasses import asdict
from pathlib import Path

import httpx
from fastapi import Body, FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.audio import YtDlpFetcher
from app.detect import detect_beats, get_detector
from app.jobs import JobRunner
from app.lyrics import LrclibLyrics
from app.pipeline import Deps
from app.stems import DemucsSeparator, MIXES
from app.store import SongStore, keep_server_fields

DATA_DIR = Path(os.environ.get("PC_DATA_DIR") or Path(__file__).resolve().parent.parent / "data").expanduser()


class ImportRequest(BaseModel):
    url: str


class LyricsRequest(BaseModel):
    title: str
    artist: str


class SettingValue(BaseModel):
    value: str


class Playlist(BaseModel):
    id: str
    name: str
    songIds: list[str]


def create_app(deps: Deps | None = None) -> FastAPI:
    deps = deps or Deps(
        fetcher=YtDlpFetcher(), detector=get_detector(), lyrics=LrclibLyrics(), beats=detect_beats, store=SongStore(DATA_DIR),
        separator=DemucsSeparator(),
    )
    store, runner = deps.store, JobRunner(deps)
    app = FastAPI(title="piano-chords")

    def existing_song(song_id: str) -> dict:
        try:
            if store.has_song(song_id):
                return store.read_song(song_id)
        except ValueError:
            pass
        raise HTTPException(404, "Song not found")

    @app.post("/api/songs")
    def import_song(request: ImportRequest):
        try:
            job = runner.submit(request.url)
        except ValueError as error:
            raise HTTPException(400, str(error))
        return {"songId": job.song_id, "jobId": job.id}

    @app.get("/api/jobs/{job_id}")
    def get_job(job_id: str):
        job = runner.get(job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        return asdict(job)

    @app.get("/api/songs")
    def list_songs():
        return store.list_songs()

    @app.get("/api/songs/{song_id}")
    def get_song(song_id: str):
        return existing_song(song_id)

    @app.put("/api/songs/{song_id}")
    def save_song(song_id: str, song: dict = Body(...)):
        existing_song(song_id)
        incoming = {**song, "id": song_id}
        try:
            store.update_song(song_id, lambda stored: keep_server_fields(stored, incoming)[0])
        except FileNotFoundError:
            raise HTTPException(404, "Song not found")
        return {"ok": True}

    @app.get("/api/songs/{song_id}/audio")
    def get_audio(song_id: str):
        existing_song(song_id)
        audio = store.audio_path(song_id)
        if not audio:
            raise HTTPException(404, "Audio not found")
        return FileResponse(audio)  # supports Range, which the <audio> element needs to seek

    @app.get("/api/songs/{song_id}/mix/{name}")
    def get_mix(song_id: str, name: str):
        existing_song(song_id)
        path = store.song_dir(song_id) / "mix" / f"{name}.m4a"
        if name not in MIXES or not path.exists():
            raise HTTPException(404, "Mix not found")
        return FileResponse(path, media_type="audio/mp4")

    @app.post("/api/songs/{song_id}/lyrics")
    def search_lyrics(song_id: str, request: LyricsRequest):
        """Search only. The browser applies the lines as an edit and autosave persists them, so a slow
        LRCLIB call can never overwrite edits made meanwhile."""
        song = existing_song(song_id)
        lines = deps.lyrics.find(request.title, request.artist, song["duration"]) or []
        return {"lyrics": [vars(line) for line in lines]}

    @app.get("/api/songs/{song_id}/cover")
    def get_cover(song_id: str):
        """YouTube's thumbnail, fetched once and kept in the song folder (works offline, moves with the data)."""
        existing_song(song_id)
        cover = store.song_dir(song_id) / "cover.jpg"
        if not cover.exists():
            try:
                image = httpx.get(f"https://i.ytimg.com/vi/{song_id}/mqdefault.jpg", timeout=10)
                image.raise_for_status()
                cover.write_bytes(image.content)
            except httpx.HTTPError:
                raise HTTPException(404, "No cover")
        return FileResponse(cover, media_type="image/jpeg")

    @app.delete("/api/songs/{song_id}")
    def delete_song(song_id: str):
        try:
            removed = store.delete_song(song_id)
        except ValueError:
            removed = False
        if not removed:
            raise HTTPException(404, "Song not found")
        return {"ok": True}

    @app.get("/api/playlists")
    def get_playlists():
        return store.read_playlists()

    @app.put("/api/playlists")
    def put_playlists(playlists: list[Playlist]):
        store.write_playlists([p.model_dump() for p in playlists])
        return {"ok": True}

    @app.get("/api/settings/{name}")
    def get_setting(name: str):
        return {"value": store.read_setting(name)}

    @app.put("/api/settings/{name}")
    def put_setting(name: str, setting: SettingValue):
        try:
            store.write_setting(name, setting.value)
        except ValueError as error:
            raise HTTPException(400, str(error))
        return {"ok": True}

    return app


app = create_app()
