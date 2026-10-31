"""The import job: download -> detect chords and beats -> lyrics -> save."""
import statistics
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from app.audio import AudioFetcher, Meta, to_analysis_wav
from app.detect import ChordDetector, Segment
from app.lyrics import Line, LyricsProvider
from app.store import SongStore

MIN_SEGMENT_SEC = 0.1  # matches the browser's MIN_CHORD_SEC
STAGES = ("downloading", "detecting", "lyrics", "saving")


@dataclass
class Deps:
    fetcher: AudioFetcher
    detector: ChordDetector
    lyrics: LyricsProvider
    beats: Callable[[Path], list[float]]
    store: SongStore
    prepare: Callable[[Path], Path] = field(default=to_analysis_wav)  # audio -> file the models read


def merge_slivers(segments: list[Segment]) -> list[Segment]:
    """Folds segments shorter than MIN_SEGMENT_SEC into the previous one (the next, for the first)."""
    out: list[Segment] = []
    pending_start: float | None = None
    for s in segments:
        if s.end - s.start < MIN_SEGMENT_SEC:
            if out:
                out[-1].end = s.end
            elif pending_start is None:
                pending_start = s.start
            continue
        if pending_start is not None:
            s = Segment(pending_start, s.end, s.label, s.confidence, s.alternatives)
            pending_start = None
        out.append(Segment(s.start, s.end, s.label, s.confidence, s.alternatives))
    return out


def estimate_confidence(segments: list[Segment], beats: list[float]) -> list[float]:
    """ponytail: heuristic, the model gives no scores. A chord lasting under two beats is the classic
    detector blip, so confidence = length / two beats, capped at 1. Silence is never worth reviewing.
    Replace with real model probabilities if a detector exposes them."""
    gaps = [b - a for a, b in zip(beats, beats[1:])]
    beat = statistics.median(gaps) if gaps else 0.5
    return [
        s.confidence if s.confidence is not None else (1.0 if s.label == "N.C." else round(min(1.0, (s.end - s.start) / (2 * beat)), 2))
        for s in segments
    ]


def assemble(meta: Meta, segments: list[Segment], beats: list[float], lines: list[Line]) -> dict:
    confidences = estimate_confidence(segments, beats)
    chords = []
    for i, (s, confidence) in enumerate(zip(segments, confidences)):
        chord = {"id": f"c{i}", "start": s.start, "end": s.end, "label": s.label, "confidence": confidence}
        if s.alternatives:
            chord["alternatives"] = list(s.alternatives)
        chords.append(chord)
    return {
        "id": meta.id,
        "title": meta.title,
        "artist": meta.artist,
        "duration": meta.duration or (segments[-1].end if segments else 0),
        "beats": beats,
        "chords": chords,
        "lyrics": [vars(line) for line in lines],
        "anchors": {},
        "importedAt": time.time(),
    }


def run_pipeline(url: str, song_id: str, deps: Deps, on_stage: Callable[[str], None]) -> str:
    on_stage("downloading")
    audio, meta = deps.fetcher.fetch(url, deps.store.song_dir(song_id))
    meta.id = song_id
    on_stage("detecting")
    wav = deps.prepare(audio)
    segments = merge_slivers(deps.detector.detect(wav))
    beats = deps.beats(wav)
    deps.store.write_detected(song_id, segments)
    on_stage("lyrics")
    lines = deps.lyrics.find(meta.title, meta.artist, meta.duration) or []
    on_stage("saving")
    deps.store.write_song(song_id, assemble(meta, segments, beats, lines))
    return "done" if lines else "done_without_lyrics"
