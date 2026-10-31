"""Benchmark input: for each song, the top-voted Ultimate Guitar chord chart and our own import.

Personal, small-scale and read-only: two UG requests per song, throttled. Charts are cached in
<data>/eval/ (git-ignored) and never committed. Needs the API server running on :8000.
Run: cd server && uv run python eval/fetch_ug.py
"""
import html
import json
import re
import sys
import time
from pathlib import Path

import httpx
import yt_dlp

SONGS = [
    ("Tum Hi Ho", "Arijit Singh"), ("Kesariya", "Arijit Singh"), ("Channa Mereya", "Arijit Singh"),
    ("Agar Tum Saath Ho", "Arijit Singh"), ("Raabta", "Arijit Singh"), ("Hawayein", "Arijit Singh"),
    ("Phir Le Aya Dil", "Arijit Singh"), ("Kun Faya Kun", "A.R. Rahman"), ("Ilahi", "Arijit Singh"),
    ("Choo Lo", "The Local Train"), ("Kho Gaye Hum Kahan", "Prateek Kuhad"), ("cold/mess", "Prateek Kuhad"),
    ("Shayad", "Arijit Singh"), ("Pehla Nasha", "Udit Narayan"), ("Perfect", "Ed Sheeran"),
    ("Photograph", "Ed Sheeran"), ("Let Her Go", "Passenger"), ("Someone You Loved", "Lewis Capaldi"),
    ("Riptide", "Vance Joy"), ("Stand By Me", "Ben E. King"), ("Let It Be", "The Beatles"),
    ("Wonderwall", "Oasis"), ("Yellow", "Coldplay"), ("Viva La Vida", "Coldplay"),
    ("Hallelujah", "Jeff Buckley"), ("Counting Stars", "OneRepublic"), ("Shape of You", "Ed Sheeran"),
    ("Thinking Out Loud", "Ed Sheeran"),
]
DATA = Path(__file__).resolve().parent.parent / "data"
OUT = DATA / "eval"
API = "http://127.0.0.1:8000"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"}
UG_DELAY_SEC = 2.0


def js_store(page: str) -> dict:
    match = re.search(r'class="js-store" data-content="([^"]+)"', page)
    if not match:
        raise RuntimeError("UG page had no data (blocked or layout changed)")
    return json.loads(html.unescape(match.group(1)))["store"]["page"]["data"]


def ug_chart(client: httpx.Client, title: str, artist: str) -> dict:
    query = re.sub(r"[^\w ]", " ", title)
    results = js_store(client.get("https://www.ultimate-guitar.com/search.php", params={"search_type": "title", "value": query}).text).get("results", [])
    time.sleep(UG_DELAY_SEC)
    chords = [r for r in results if r.get("type") == "Chords" and r.get("tab_url")]
    by_artist = [r for r in chords if artist.split()[0].lower() in (r.get("artist_name") or "").lower()]
    pool = by_artist or chords
    if not pool:
        raise RuntimeError("no UG chord chart found")
    best = max(pool, key=lambda r: (r.get("votes") or 0) * (r.get("rating") or 0))
    data = js_store(client.get(best["tab_url"]).text)
    time.sleep(UG_DELAY_SEC)
    content = data["tab_view"]["wiki_tab"]["content"]
    meta = data["tab_view"].get("meta") or {}
    capo = meta.get("capo") or 0
    return {
        "url": best["tab_url"], "song": best.get("song_name"), "artist": best.get("artist_name"),
        "votes": best.get("votes"), "rating": best.get("rating"),
        "capo": int(capo) if str(capo).isdigit() else 0,
        "tonality": data.get("tab", {}).get("tonality_name") or "",
        "chords": re.findall(r"\[ch\](.*?)\[/ch\]", content),
    }


def youtube_url(title: str, artist: str) -> str:
    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "extract_flat": True}) as ydl:
        info = ydl.extract_info(f"ytsearch1:{artist} {title} official audio", download=False)
    return f"https://www.youtube.com/watch?v={info['entries'][0]['id']}"


def import_song(api: httpx.Client, url: str) -> tuple[str, str]:
    started = api.post("/api/songs", json={"url": url}).json()
    for _ in range(600):
        job = api.get(f"/api/jobs/{started['jobId']}").json()
        if job["state"] not in ("queued", "running"):
            return started["songId"], job["state"] + (f": {job['error']}" if job.get("error") else "")
        time.sleep(2)
    return started["songId"], "timeout"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    with httpx.Client(headers=UA, timeout=30, follow_redirects=True) as ug, httpx.Client(base_url=API, timeout=30) as api:
        for title, artist in SONGS:
            key = f"{artist} - {title}"
            entry = manifest.get(key, {})
            if entry.get("status", "").startswith("done"):
                continue
            try:
                if "ug" not in entry:
                    entry["ug"] = ug_chart(ug, title, artist)
                if "songId" not in entry:
                    entry["youtube"] = youtube_url(title, artist)
                entry["songId"], entry["status"] = import_song(api, entry["youtube"])
            except Exception as error:  # record and move on; one bad song must not stop the run
                entry["status"] = f"error: {error}"
            manifest[key] = entry
            manifest_path.write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
            print(f"{key}: {entry['status']} (UG chords: {len(entry.get('ug', {}).get('chords', []))}, capo {entry.get('ug', {}).get('capo')})", flush=True)
    print("done", sum(1 for e in manifest.values() if e.get("status", "").startswith("done")), "of", len(SONGS))


if __name__ == "__main__":
    sys.exit(main())
