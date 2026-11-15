"""The melody, one note at a time: pyin tracks the pitch of the vocals mix, or of the whole song when it has
hardly any singing. Runs when a song without a melody is opened (main.py), on the one worker."""
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

import imageio_ffmpeg
import numpy as np

if TYPE_CHECKING:
    from app.pipeline import Deps

SAMPLE_RATE = 22050
HOP = 512  # ~23 ms per pitch reading
SMOOTH_FRAMES = 3  # median over this many readings removes one-reading wobbles
MIN_NOTE_SEC = 0.08  # shorter than this is a slide or a glitch, not a note to play
JOIN_GAP_SEC = 0.1  # the same pitch again after a gap this short is one held note
FOLD_NEIGHBOURS = 3
FALLBACK_COVERAGE = 0.1  # vocals singing less than this share of the song: follow the whole song instead


class MelodyDetector(Protocol):
    def detect(self, audio: Path) -> list[dict]: ...


def notes_from_pitches(midi: list[int] | np.ndarray, hop_sec: float) -> list[dict]:
    """One rounded MIDI pitch per reading (0 = silence) -> [{start, end, midi}]."""
    from scipy.ndimage import median_filter

    frames = median_filter(np.asarray(midi, dtype=int), size=SMOOTH_FRAMES, mode="nearest")
    runs: list[dict] = []
    start = 0
    for i in range(1, len(frames) + 1):
        if i < len(frames) and frames[i] == frames[start]:
            continue
        if frames[start] and (i - start) * hop_sec >= MIN_NOTE_SEC:
            runs.append({"start": round(start * hop_sec, 3), "end": round(i * hop_sec, 3), "midi": int(frames[start])})
        start = i
    notes: list[dict] = []
    for note in fold_octave_slips(runs):
        if notes and notes[-1]["midi"] == note["midi"] and note["start"] - notes[-1]["end"] < JOIN_GAP_SEC:
            notes[-1]["end"] = note["end"]
        else:
            notes.append(note)
    return notes


def fold_octave_slips(notes: list[dict]) -> list[dict]:
    """pyin sometimes reads a note an octave off, and bass bleed shows up far below the singer: move any note
    more than a fifth from its neighbours (median of three each side) by whole octaves toward them."""
    out = []
    for i, note in enumerate(notes):
        near = [n["midi"] for n in notes[max(0, i - FOLD_NEIGHBOURS):i] + notes[i + 1:i + 1 + FOLD_NEIGHBOURS]]
        pitch, middle = note["midi"], float(np.median(near)) if near else note["midi"]
        while pitch - middle > 7:
            pitch -= 12
        while middle - pitch > 7:
            pitch += 12
        out.append({**note, "midi": pitch})
    return out


class PyinMelody:
    """ponytail: pyin follows one pitch, so instrumentals (no vocals mix) get the loudest line, which is rough.
    Upgrade: basic-pitch's ONNX note model through onnxruntime (installed) once it's worth the pre/post code."""

    def detect(self, audio: Path) -> list[dict]:
        import librosa

        raw = subprocess.run(
            [imageio_ffmpeg.get_ffmpeg_exe(), "-loglevel", "error", "-i", str(audio), "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "-"],
            capture_output=True, check=True,
        ).stdout  # decoded in memory: nothing is written next to the song
        samples = np.frombuffer(raw, dtype=np.float32)
        f0, voiced, _ = librosa.pyin(samples, fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C6"), sr=SAMPLE_RATE, hop_length=HOP, frame_length=2048)
        midi = np.where(voiced, np.round(librosa.hz_to_midi(np.nan_to_num(f0, nan=1.0))), 0)
        return notes_from_pitches(midi, HOP / SAMPLE_RATE)


def melody_song(song_id: str, deps: "Deps") -> None:
    store = deps.store
    song = store.read_song(song_id)  # FileNotFoundError for a deleted song
    if not song.get("mixes") and deps.separator:  # the vocals mix gives a far cleaner line than the full song
        from app.stems import split_song

        split_song(song_id, deps)
    vocals = store.song_dir(song_id) / "mix" / "vocals.m4a"
    notes = deps.melody.detect(vocals) if vocals.exists() else []
    if sum(n["end"] - n["start"] for n in notes) < FALLBACK_COVERAGE * song.get("duration", 0):
        audio = store.audio_path(song_id)
        if not audio:
            raise FileNotFoundError(f"no audio for {song_id}")
        notes = deps.melody.detect(audio)
    store.update_song(song_id, lambda current: {**current, "melody": notes})
