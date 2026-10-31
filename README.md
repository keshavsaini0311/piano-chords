# piano-chords

A personal chord player for learning songs on a small keyboard. Paste a YouTube link: this
computer downloads the audio, works out the chords and the beat, and looks for synced lyrics.
Then you play along, transpose to an easier key, and fix any chord it got wrong.

Everything runs locally. Songs, edits and settings stay in `server/data/` (git-ignored).

## Setup (once)

Needs Node 22+ and [uv](https://docs.astral.sh/uv/).

```bash
cd server && uv sync        # Python 3.12, FastAPI, yt-dlp, the chord model (PyTorch, large)
cd ../web && npm install
```

## Run

Two terminals:

```bash
cd server && uv run uvicorn app.main:app --port 8000
cd web && npm run dev       # open http://localhost:5173
```

The first import of a song takes about a minute (download, then chord detection on the CPU).

## Using it

- **Play:** Space plays or pauses. ← → jump between chords. `L` loops the current change
  (this chord and the next). Speed 50/75/100% keeps the pitch.
- **Key:** `[` and `]`, or click the key to see every key ranked by how many chords need black keys.
- **Simple / Full:** plain three-note chords, or chords as detected (7ths, sus).
- **Edit chords (`E`):** click a chord to change its root or type, drag the handle on its left
  edge to move the change (snaps to the beat), split, merge or remove. `J`/`K` step through chords
  the detector was unsure about. ⌘Z / ⇧⌘Z undo and redo. Edits save automatically.
- You always edit in the key you're viewing. The song is stored in its original key.

## Your data, and moving to a new laptop

Everything lives in one folder, `server/data/`:

```
server/data/
  settings.json            key per song, Simple/As detected, hand position, note names
  songs/<youtube-id>/      audio, detected chords (untouched), your edited song.json
```

**Move to a new laptop:** do the setup above on the new laptop, then copy that folder across.

```bash
tar czf piano-chords-data.tgz -C server data         # old laptop: one file to AirDrop or copy
tar xzf piano-chords-data.tgz -C server              # new laptop, inside the repo
```

**Or keep it in iCloud Drive** so it is always there on whichever Mac you use. Start the server with
`PC_DATA_DIR` pointing at the synced folder (move your existing `server/data` there first):

```bash
PC_DATA_DIR=~/Library/Mobile\ Documents/com~apple~CloudDocs/piano-chords uv run uvicorn app.main:app --port 8000
```

Run the app on one Mac at a time when using a synced folder; two running at once can overwrite each other.

## Calibrate your keyboard

The key range defaults to F3–C6 (32 keys), a guess for the Casio SA-51. If your lowest or highest
key differs, change `defaultRange` in `web/src/domain/instruments.ts`.

## Tests

```bash
cd web && npm test          # domain, stores, wire format (vitest)
cd server && uv run pytest  # labels, lyrics, link parsing, pipeline and API with fakes
```

## How it's built

Design notes and the reasoning behind each decision are in [docs/LLD.md](docs/LLD.md);
requirements in [REQUIREMENTS.md](REQUIREMENTS.md). In short:

- `web/src/domain/` is pure TypeScript (music theory, edits, alignment, voicing, timing). Nothing
  in it knows about React or the server.
- Three Zustand stores split by how often they change: `song` (with undo), `view`, `playback`.
- `server/app/` turns a link into `data/songs/<id>/song.json` through swappable parts
  (`AudioFetcher`, `ChordDetector`, `LyricsProvider`).

### Extending it

| To add | Change |
|---|---|
| Another instrument (guitar) | an entry in `domain/instruments.ts` + a diagram in `features/instrument/diagrams.ts` |
| Another voicing style | an entry in `voicers` in `domain/voicing.ts` |
| A metronome click | subscribe to the beat (`beatIndex` over `usePlaybackStore`) and play a click |
| Profiles | `domain/profile.ts` already holds per-player settings; store a list instead of one |
| Another chord model | a class in `server/app/detect.py`, registered in `DETECTORS`, picked with `PC_DETECTOR` |
