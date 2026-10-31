"""Getting audio from a YouTube link. yt-dlp downloads; imageio-ffmpeg ships its own ffmpeg binary."""
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import imageio_ffmpeg

from app.lyrics import song_title

ID_PATTERNS = [
    r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/))([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])",
    r"youtu\.be/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])",
]


def video_id(url: str) -> str:
    for pattern in ID_PATTERNS:
        match = re.search(pattern, url.strip())
        if match:
            return match.group(1)
    raise ValueError("Not a YouTube link")


@dataclass
class Meta:
    id: str
    title: str
    artist: str
    duration: float


class AudioFetcher(Protocol):
    def fetch(self, url: str, dest: Path) -> tuple[Path, Meta]: ...


class YtDlpFetcher:
    def fetch(self, url: str, dest: Path) -> tuple[Path, Meta]:
        import yt_dlp

        dest.mkdir(parents=True, exist_ok=True)
        options = {
            "format": "bestaudio[ext=m4a]/bestaudio",
            "outtmpl": str(dest / "audio.%(ext)s"),
            "ffmpeg_location": imageio_ffmpeg.get_ffmpeg_exe(),
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
        }
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=True)
        if "entries" in info:  # a search or playlist result wraps the video
            info = info["entries"][0]
        audio = Path(info["requested_downloads"][0]["filepath"])
        meta = Meta(
            id=info["id"],
            title=info.get("track") or song_title(info.get("title", ""), info.get("artist") or info.get("uploader", "")),
            artist=info.get("artist") or info.get("uploader", ""),
            duration=float(info.get("duration") or 0),
        )
        return audio, meta


def to_analysis_wav(audio: Path) -> Path:
    """Mono 22.05 kHz WAV: what the models want, decodable without a system ffmpeg."""
    wav = audio.with_name("analysis.wav")
    subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-i", str(audio), "-ac", "1", "-ar", "22050", str(wav)],
        check=True,
    )
    return wav
