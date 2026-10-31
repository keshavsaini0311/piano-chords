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
    title = re.split(r"\s(?:ft\.?|feat\.?|featuring|with|prod\.?)\s|@", title, flags=re.IGNORECASE)[0]
    title = re.sub(r"official (?:video|audio|music video)", "", title, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", title).strip(" -")


def song_title(title: str, artist: str) -> str:
    """The bare track name LRCLIB indexes: cleaned, and without a leading "Artist - "."""
    cleaned = clean_title(title)
    left, sep, right = cleaned.partition(" - ")
    return right.strip() if sep and left.strip().lower() == artist.strip().lower() else cleaned


class LyricsProvider(Protocol):
    def find(self, title: str, artist: str, duration: float) -> list[Line] | None: ...


NOISE_WORDS = re.compile(r"\b(full|audio|video|songs?|lyrics?|lyrical|official|remaster(?:ed)?|hd|4k)\b", re.IGNORECASE)
DURATION_TOLERANCE_SEC = 5.0


def title_queries(title: str) -> list[str]:
    """Search texts for a YouTube title, best first. YouTube titles carry channel noise ("Full Song",
    "Lyrics", "(Remastered 2009)") and often "Artist - Title", so each part is tried on its own too."""
    text = re.sub(r"[\(\[][^\)\]]*[\)\]]", " ", title)
    text = re.sub(r"[\"'“”‘’]", "", text)
    text = re.split(r"\s(?:ft\.?|feat\.?|featuring|with|prod\.?)\s|@|\|", text, flags=re.IGNORECASE)[0]
    text = NOISE_WORDS.sub(" ", text)
    parts = [re.sub(r"\s+", " ", part).strip(" -,") for part in re.split(r"\s+-\s+", text)]
    parts = [part for part in parts if len(part) > 2]
    queries = ([" ".join(parts)] if len(parts) > 1 else []) + parts[::-1]  # the title usually follows the dash
    queries += [" ".join(part.split()[:3]) for part in parts[::-1][:1] if len(part.split()) > 3]  # drop a trailing movie name
    return list(dict.fromkeys(queries))


def pick_by_duration(results: list[dict], duration: float, tolerance: float = DURATION_TOLERANCE_SEC) -> dict | None:
    """Song length is a far better match signal than YouTube channel names."""
    synced = [r for r in results if r.get("syncedLyrics") and abs((r.get("duration") or 0) - duration) <= tolerance]
    return min(synced, key=lambda r: abs(r["duration"] - duration), default=None)


class LrclibLyrics:
    BASE = "https://lrclib.net/api"
    HEADERS = {"User-Agent": "piano-chords (personal project)"}

    def find(self, title: str, artist: str, duration: float) -> list[Line] | None:
        try:
            with httpx.Client(timeout=10, headers=self.HEADERS) as client:
                exact = client.get(f"{self.BASE}/get", params={"track_name": title, "artist_name": artist, "duration": round(duration)})
                if exact.status_code == 200 and exact.json().get("syncedLyrics"):
                    return parse_lrc(exact.json()["syncedLyrics"], duration)
                for query in title_queries(title):
                    found = client.get(f"{self.BASE}/search", params={"q": query})
                    results = found.json() if found.status_code == 200 else []
                    match = pick_by_duration(results, duration) if isinstance(results, list) else None
                    if match:
                        return parse_lrc(match["syncedLyrics"], duration)
                return None
        except (httpx.HTTPError, ValueError):
            return None
