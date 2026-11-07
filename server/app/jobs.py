"""In-memory job tracking with one worker: the chord model is CPU-heavy, so imports run one at a time.
ponytail: jobs are lost on restart; finished songs are on disk, so re-submitting is cheap."""
import logging
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Callable

from app.audio import video_id
from app.pipeline import Deps, run_pipeline

ACTIVE = ("queued", "running")


@dataclass
class Job:
    id: str
    song_id: str
    state: str  # queued | running | done | done_without_lyrics | failed
    stage: str | None = None
    error: str | None = None


class JobRunner:
    def __init__(self, deps: Deps):
        self.deps = deps
        self.jobs: dict[str, Job] = {}
        self.lock = threading.Lock()
        self.pool = ThreadPoolExecutor(max_workers=1)
        self.after_import: list[Callable[[str, Deps], None]] = []
        self.pending: set[tuple[Callable[..., None], str]] = set()  # run_later work queued but not started
        if deps.separator:
            from app.stems import split_song

            self.after_import.append(split_song)
        if deps.aligner:
            from app.align import align_song

            self.after_import.append(align_song)

    def submit(self, url: str) -> Job:
        song_id = video_id(url)  # ValueError for non-YouTube links: the API turns it into a 400
        with self.lock:
            running = next((j for j in self.jobs.values() if j.song_id == song_id and j.state in ACTIVE), None)
            if running:
                return running
            job = Job(id=uuid.uuid4().hex[:12], song_id=song_id, state="queued")
            self.jobs[job.id] = job
            if self.deps.store.has_song(song_id):
                job.state = "done"
                return job
        canonical = f"https://www.youtube.com/watch?v={song_id}"  # drops playlist/timestamp params
        self.pool.submit(self._run, job, canonical)
        return job

    def get(self, job_id: str) -> Job | None:
        return self.jobs.get(job_id)

    def _run(self, job: Job, url: str) -> None:
        job.state = "running"
        try:
            job.state = run_pipeline(url, job.song_id, self.deps, on_stage=lambda stage: setattr(job, "stage", stage))
        except Exception as error:  # surface any failure to the progress screen instead of hanging
            job.state, job.error = "failed", str(error) or type(error).__name__
            return
        if job.state in ("done", "done_without_lyrics"):
            for follow_up in self.after_import:
                self._guarded(follow_up, job.song_id, self.deps)

    def run_later(self, fn: Callable[..., None], song_id: str, *args) -> None:
        """Queue fn(song_id, *args) once: a repeat queued before the first starts is dropped, since the first reads the latest song."""
        key = (fn, song_id)
        with self.lock:
            if key in self.pending:
                return
            self.pending.add(key)

        def start() -> None:
            with self.lock:
                self.pending.discard(key)  # cleared on start, not finish: a later edit must queue a fresh run
            self._guarded(fn, song_id, *args)

        self.pool.submit(start)

    @staticmethod
    def _guarded(fn: Callable[..., None], *args) -> None:
        try:
            fn(*args)
        except Exception:  # a follow-up must never change the import's result
            logging.getLogger(__name__).exception("follow-up %s failed", getattr(fn, "__name__", fn))
