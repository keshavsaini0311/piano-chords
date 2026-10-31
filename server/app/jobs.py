"""In-memory job tracking with one worker: the chord model is CPU-heavy, so imports run one at a time.
ponytail: jobs are lost on restart; finished songs are on disk, so re-submitting is cheap."""
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

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
