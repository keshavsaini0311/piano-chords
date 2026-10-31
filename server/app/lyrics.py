"""Timestamped lyrics from LRCLIB (free, no key). Lyrics are optional: a miss returns None."""
import re
from dataclasses import dataclass
from typing import Protocol

import httpx

LAST_LINE_SEC = 6.0
TIMESTAMP = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\]")


@dataclass
class Line:
    id: str
    start: float
    end: float
    text: str


def parse_lrc(text: str, duration: float) -> list[Line]:
    timed: list[tuple[float, str]] = []
    for raw in text.splitlines():
        stamps = TIMESTAMP.findall(raw)
        if not stamps:
            continue  # tag lines like [ar:...] and blank lines
        words = TIMESTAMP.sub("", raw).strip()
        timed += [(int(m) * 60 + float(s), words) for m, s in stamps]
    timed.sort(key=lambda t: t[0])
    lines = []
    for i, (start, words) in enumerate(timed):
        end = timed[i + 1][0] if i + 1 < len(timed) else min(start + LAST_LINE_SEC, duration)
        lines.append(Line(id=f"l{i}", start=start, end=max(end, start), text=words))
    return lines


def clean_title(title: str) -> str:
    """YouTube titles carry noise LRCLIB can't match. ponytail: drops every bracketed part, (Remix) too."""
    title = re.sub(r"[\(\[][^\)\]]*[\)\]]", "", title)
    title = title.split("|")[0]
    title = re.split(r"\s(?:ft\.?|feat\.?|featuring)\s", title, flags=re.IGNORECASE)[0]
    title = re.sub(r"official (?:video|audio|music video)", "", title, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", title).strip(" -")


class LyricsProvider(Protocol):
    def find(self, title: str, artist: str, duration: float) -> list[Line] | None: ...


class LrclibLyrics:
    BASE = "https://lrclib.net/api"
    HEADERS = {"User-Agent": "piano-chords (personal project)"}

    def find(self, title: str, artist: str, duration: float) -> list[Line] | None:
        try:
            with httpx.Client(timeout=10, headers=self.HEADERS) as client:
                exact = client.get(f"{self.BASE}/get", params={"track_name": title, "artist_name": artist, "duration": round(duration)})
                if exact.status_code == 200 and exact.json().get("syncedLyrics"):
                    return parse_lrc(exact.json()["syncedLyrics"], duration)
                found = client.get(f"{self.BASE}/search", params={"track_name": title, "artist_name": artist})
                if found.status_code != 200:
                    return None
                synced = next((r["syncedLyrics"] for r in found.json() if r.get("syncedLyrics")), None)
                return parse_lrc(synced, duration) if synced else None
        except (httpx.HTTPError, ValueError):
            return None
