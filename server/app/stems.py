"""Splits a song with Demucs and saves three ready-made mixes as AAC: backing (vocals, drums, bass),
novocals (drums, bass, other) and vocals."""
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

import imageio_ffmpeg
import numpy as np
import soundfile as sf

if TYPE_CHECKING:
    from app.pipeline import Deps

MIXES = ("backing", "novocals", "vocals")
SAMPLE_RATE = 44100
RECIPES = {"backing": ("vocals", "drums", "bass"), "novocals": ("drums", "bass", "other"), "vocals": ("vocals",)}


class StemSeparator(Protocol):
    def separate(self, audio: Path, out_dir: Path) -> dict[str, Path]: ...


class DemucsSeparator:
    """ponytail: the model loads on first use and stays in memory; ~22 s per song on mps (spikes/stems_spike.py)."""

    def __init__(self):
        self._separator = None

    def separate(self, audio: Path, out_dir: Path) -> dict[str, Path]:
        import torch  # imported here so the app and its tests start without loading the model stack
        from demucs.api import Separator

        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()  # Demucs's own loader needs a system ffmpeg
        if self._separator is None:
            device = "mps" if torch.backends.mps.is_available() else "cpu"
            self._separator = Separator(model="htdemucs", device=device)
        wav = out_dir / "decoded.wav"
        subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(audio), "-ac", "2", "-ar", str(SAMPLE_RATE), str(wav)], check=True)
        data, rate = sf.read(wav, dtype="float32", always_2d=True)
        wav.unlink()
        _, stems = self._separator.separate_tensor(torch.from_numpy(data.T.copy()), rate)
        paths = {}
        for mix, parts in RECIPES.items():
            audio_out = sum(stems[part] for part in parts)
            paths[mix] = out_dir / f"{mix}.m4a"
            subprocess.run(
                [ffmpeg, "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "2", "-i", "-", "-c:a", "aac", "-b:a", "128k", str(paths[mix])],
                input=np.ascontiguousarray(audio_out.T.numpy(), dtype="float32").tobytes(),
                check=True,
            )
        return paths


def split_song(song_id: str, deps: "Deps") -> None:
    store = deps.store
    song = store.read_song(song_id)  # raises FileNotFoundError for a deleted song
    audio = store.audio_path(song_id)
    if not audio:
        raise FileNotFoundError(f"no audio for {song_id}")
    with tempfile.TemporaryDirectory() as tmp:
        paths = deps.separator.separate(audio, Path(tmp))

        def change(current: dict) -> dict:
            mix_dir = store.song_dir(song_id) / "mix"
            mix_dir.mkdir(exist_ok=True)
            for path in paths.values():
                shutil.move(path, mix_dir / path.name)
            return {**current, "mixes": list(MIXES)}

        store.update_song(song_id, change)
