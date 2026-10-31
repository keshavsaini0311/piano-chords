"""HTTP API for the browser. Run: uv run uvicorn app.main:app --reload"""
from dataclasses import asdict
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.audio import YtDlpFetcher
from app.detect import detect_beats, get_detector
from app.jobs import JobRunner
from app.lyrics import LrclibLyrics
from app.pipeline import Deps
from app.store import SongStore

DATA_ROOT = Path(__file__).resolve().parent.parent / "data" / "songs"


class ImportRequest(BaseModel):
    url: str


class LyricsRequest(BaseModel):
    title: str
    artist: str


def create_app(deps: Deps | None = None) -> FastAPI:
    deps = deps or Deps(
        fetcher=YtDlpFetcher(), detector=get_detector(), lyrics=LrclibLyrics(), beats=detect_beats, store=SongStore(DATA_ROOT)
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
        store.write_song(song_id, {**song, "id": song_id})
        return {"ok": True}

    @app.get("/api/songs/{song_id}/audio")
    def get_audio(song_id: str):
        existing_song(song_id)
        audio = store.audio_path(song_id)
        if not audio:
            raise HTTPException(404, "Audio not found")
        return FileResponse(audio)  # supports Range, which the <audio> element needs to seek

    @app.post("/api/songs/{song_id}/lyrics")
    def refetch_lyrics(song_id: str, request: LyricsRequest):
        song = existing_song(song_id)
        lines = deps.lyrics.find(request.title, request.artist, song["duration"]) or []
        song.update(title=request.title, artist=request.artist, lyrics=[vars(line) for line in lines] or song["lyrics"])
        store.write_song(song_id, song)
        return song

    return app


app = create_app()
