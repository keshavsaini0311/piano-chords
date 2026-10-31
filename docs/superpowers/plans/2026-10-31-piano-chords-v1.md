# piano-chords v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste a YouTube link, get its chords detected and lyrics fetched locally, then fix and play along in the Studio layout with transpose, a Now/Next count-in and a 32-key piano strip.

**Architecture:** A local Python FastAPI server downloads audio (yt-dlp), detects chords and beats, fetches LRCLIB lyrics and stores JSON per song. A React + TS browser app keeps a pure `domain/` core (music theory, edits, alignment, voicing, timing) under three Zustand stores and feature folders. Data flows one way: the stored song stays in the original key, and every view is derived from it.

**Tech Stack:** Node 22, React 19.3, Vite 8.3, Vitest 5.0, tonal 6.5, zustand 5.0 · Python 3.12 (via `uv`), FastAPI 0.162, uvicorn, httpx, yt-dlp 2026.10.26, imageio-ffmpeg 0.7, lv-chordia 1.1, librosa, pytest.

**Spec:** `docs/LLD.md` (read sections 1–10) + `REQUIREMENTS.md`. Visual reference: `docs/mockups/Studio-*.dc.html`, `Stage-Play.dc.html` (Now/Next card), `Sheet-Edit.dc.html` (chord popover), `Keyboard.dc.html`; colour/type tokens in `docs/mockups/theme.css`.

## Global Constraints

- `web/src/domain/**` imports nothing from React, stores or services. `web/src/ui/**` never imports a store.
- Dependency direction: `features → state → domain`; `services` are used by `state`/`features` only.
- The stored `Song` is always in the **original key**. Transpose, difficulty and spelling are view settings.
- Default `KeyRange` is `{ low: 53, high: 84 }` (F3–C6, 32 keys). It lives in the profile (calibration knob, unverified).
- Wire format between server and browser: chords are **label strings** (`"Fm"`, `"C/E"`, `"N.C."`). The browser converts at the `services/api.ts` boundary only.
- No real song lyrics in fixtures or tests. Invent placeholder text.
- `server/data/` (audio, songs) is gitignored and never committed.
- Names: TS modules are lowercase nouns (`music.ts`, `edits.ts`), components are PascalCase (`NowNextCard.tsx`), Python is snake_case. No abbreviations beyond `id`, `ms`, `sec`.
- No new dependencies beyond the Tech Stack line without a stated reason.
- Pitch-shifting audio is out of scope for v1 (LLD §10).

## Review Focus

1. **A song with no lyrics** (LRCLIB miss): the Studio still opens, and the chart preview shows chord-only rows. Pinned in Task 3 (`align`, empty lyrics) and Task 8 (`done_without_lyrics`).
2. **Editing while transposed** must save the chord in the original key. Pinned in Task 2 (`setChordFromDisplay`).
3. **A pasted link that isn't YouTube**, or junk text: expect a 400 with a readable message, never a stuck job. Pinned in Task 7 (`video_id`) and Task 8 (API 400).
4. **The same link pasted twice**, including while its job is still running: no duplicate job; return the existing one. Pinned in Task 8.
5. **Dragging a chord boundary past its neighbour**: the boundary is clamped, and no chord ever reaches zero or negative length. Pinned in Task 2 (`moveChordStart`).

---

## Phase A: domain core (pure TypeScript)

### Task 1: Scaffold web app + music theory core

**Files:**
- Create: `web/` via `npm create vite@latest web -- --template react-ts`, then `npm i tonal zustand` and `npm i -D vitest`
- Create: `web/src/domain/music.ts`
- Test: `web/src/domain/music.test.ts`
- Modify: `web/package.json` (add `"test": "vitest run"`), `web/vite.config.ts` (proxy `/api` → `http://127.0.0.1:8000`)
- Create: `.gitignore` at repo root (`node_modules`, `dist`, `server/data/`, `.venv`, `__pycache__`)

**Interfaces:**
- Produces:
  - `type PitchClass = 0|1|...|11`, `type Quality = string` (display suffix: `''`, `'m'`, `'dim'`, `'aug'`, `'sus2'`, `'sus4'`, `'7'`, `'maj7'`, `'m7'`, `'m7b5'`, …)
  - `type Chord = { kind: 'chord'; root: PitchClass; quality: Quality; bass?: PitchClass } | { kind: 'none' }`
  - `type Difficulty = 'easy' | 'full'`, `type Spelling = 'auto' | 'sharps' | 'flats'`
  - `parseChord(label: string): Chord` (`'N.C.'`, `'N'`, `''` → none; aliases `min→m`, `maj→''`, `M7→maj7`, `min7→m7`)
  - `formatChord(chord: Chord, accidentals: 'sharps' | 'flats'): string` (none → `'N.C.'`)
  - `transposeChord(chord: Chord, semitones: number): Chord`
  - `simplifyChord(chord: Chord, difficulty: Difficulty): Chord` (easy: `m7,m9,m6,m11→m`; `7,maj7,9,6,add9,sus2,sus4→''`; `m7b5,dim7→dim`; slash bass dropped)
  - `chordPitchClasses(chord: Chord): PitchClass[]` (root first; via tonal `Chord.getChord`)
  - `transposeKey(key: string, semitones: number): string` (`'Fm' +4 → 'Am'`)
  - `accidentalsForKey(key: string): 'sharps' | 'flats'` (flat keys: F Bb Eb Ab Db Gb, Dm Gm Cm Fm Bbm Ebm)
  - `displayChord(chord: Chord, view: { semitones: number; difficulty: Difficulty; spelling: Spelling }, originalKey: string): string`. Pipeline order is simplify → transpose → spell. `'auto'` spelling uses `accidentalsForKey(transposeKey(originalKey, semitones))`.
  - `estimateKey(chords: { chord: Chord; start: number; end: number }[]): string`. Scores all 24 keys by the summed duration of chords diatonic to the key, plus the tonic chord's duration again as a tie-break bonus.

- [ ] **Step 1: Scaffold, then write failing tests** in `music.test.ts`:
  - `formatChord(parseChord(l), 'sharps') === l` for `['C','Fm','F#m7','Bdim','Gsus4','Cmaj7','C/E']`; `formatChord(parseChord('Bb'),'flats') === 'Bb'`
  - `parseChord('N.C.').kind === 'none'`; `transposeChord(parseChord('N.C.'), 3).kind === 'none'`
  - for every root 0–11 and quality in `['', 'm', '7', 'dim']`: `transposeChord(transposeChord(c, n), -n)` deep-equals `c` for n in −11..11
  - `formatChord(simplifyChord(parseChord('Fm7'),'easy'),'flats') === 'Fm'`; `'Dbsus2' → 'Db'`; `'full'` returns input unchanged
  - `displayChord(parseChord('Fm'), {semitones:4, difficulty:'easy', spelling:'auto'}, 'Fm') === 'Am'`; `displayChord(parseChord('Db'), …same) === 'F'`
  - `transposeKey('Fm', 4) === 'Am'`; `accidentalsForKey('Fm') === 'flats'`; `accidentalsForKey('A') === 'sharps'`
  - `estimateKey` on `Fm(0–8s), Db(8–12), Ab(12–16), Eb(16–20)` returns `'Fm'`
- [ ] **Step 2:** Run `cd web && npm test`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `music.ts`. Parse with a regex `^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$` plus an alias table; use tonal only for chord intervals (`chordPitchClasses`).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `git add -A && git commit -m "feat(web): scaffold app and music theory core"`

### Task 2: Song model and pure edits

**Files:**
- Create: `web/src/domain/song.ts`, `web/src/domain/edits.ts`
- Test: `web/src/domain/edits.test.ts`

**Interfaces:**
- Consumes: `Chord`, `parseChord`, `transposeChord` (Task 1)
- Produces:
  - `type ChordEvent = { id: string; start: number; end: number; chord: Chord; confidence?: number; alternatives?: Chord[] }`
  - `type LyricLine = { id: string; start: number; end: number; text: string }`
  - `type Song = { id: string; title: string; artist: string; duration: number; originalKey: string; beats: number[]; chords: ChordEvent[]; lyrics: LyricLine[]; anchors: Record<string, { lineId: string; charIndex: number }> }`
  - `const MIN_CHORD_SEC = 0.1`
  - `validate(song: Song): string[]` (problems: unsorted, overlap, `start >= end`; `[]` means valid)
  - `setChord(song, id, chord): Song`
  - `setChordFromDisplay(song, id, label: string, semitones: number): Song` (parse, then transpose by `-semitones`)
  - `moveChordStart(song, id, newStart: number): Song` (moves the boundary shared with the previous chord; clamps so both keep `>= MIN_CHORD_SEC`; first chord: clamps to `>= 0` and `< end - MIN_CHORD_SEC`)
  - `splitChord(song, id, at: number): Song` (second half gets `crypto.randomUUID()`, same chord, no confidence)
  - `mergeWithNext(song, id): Song`
  - `deleteChord(song, id): Song` (previous chord absorbs its time; the first chord is absorbed by the next)
  - `moveAnchor(song, chordId, lineId, charIndex): Song`

- [ ] **Step 1: Write failing tests:**
  - a 4-chord fixture song (contiguous 0–2–4–6–8s) has `validate(...) === []`; every edit below also returns a song with `validate === []`
  - `setChordFromDisplay(song, id, 'G', 4)` stores `root === 3` (Eb): the original key
  - `moveChordStart(song, 'c2', 0.05)` clamps: `c2.start === 0.1` and `c1.end === 0.1`. `moveChordStart(song, 'c2', 99)` clamps to `c2.start === 3.9` (c2 is `[2,4]`)
  - `splitChord(song,'c1',1)` gives 5 chords: `[0,1]` and `[1,2]`, same chord
  - `deleteChord(song,'c2')` makes c1 `[0,4]` with 3 chords; `deleteChord(song,'c1')` makes the next chord start at 0
  - edits never mutate their input (`Object.freeze` the fixture deeply)
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement with `map`/`filter`/spread. No immer.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): song model and pure edits`

### Task 3: Chord-to-lyrics alignment

**Files:** Create `web/src/domain/align.ts`; Test `web/src/domain/align.test.ts`

**Interfaces:**
- Consumes: `Song`, `ChordEvent`, `LyricLine` (Task 2)
- Produces:
  - `type ChartRow = { kind: 'lyric'; line: LyricLine; chords: { event: ChordEvent; charIndex: number }[] } | { kind: 'instrumental'; chords: ChordEvent[] }`
  - `alignChart(song: Song): ChartRow[]`

Rules: a chord belongs to the line where `line.start <= chord.start < line.end`. Lines whose `text.trim() === ''`, and chords outside every line, become `instrumental` rows (consecutive ones grouped). Position = `(chord.start - line.start) / (line.end - line.start) × text.length`, snapped to the nearest word start (index 0, or the index after a space). `song.anchors[chord.id]` overrides both line and position.

- [ ] **Step 1: Failing tests:** `lyrics: []` gives a single instrumental row holding all chords · a chord at 50% of `"walking down the road"` snaps to a word start · an anchor moves a chord to another line and index · chords before the first line give a leading instrumental row · an empty-text line gives an instrumental row
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** PASS
- [ ] **Step 5:** Commit `feat(web): align chords to lyric lines`

### Task 4: Instruments, voicers and easy-key ranking

**Files:** Create `web/src/domain/voicing.ts`, `web/src/domain/instruments.ts`, `web/src/domain/profile.ts`; Test `web/src/domain/voicing.test.ts`

**Interfaces:**
- Consumes: `Chord`, `chordPitchClasses`, `transposeChord`, `simplifyChord` (Task 1)
- Produces:
  - `type KeyRange = { low: number; high: number }` (MIDI), `type Voicing = number[]` (sorted MIDI)
  - `type Voicer = (chord: Chord, previous: Voicing | null, range: KeyRange) => Voicing` (none → `[]`)
  - `rootPosition: Voicer` (root octave nearest the previous root, or nearest MIDI 60 with no previous; stacked upward)
  - `nearestInversion: Voicer`. Candidates are every inversion at every octave that fits inside `range` with span < 12. Cost is `Σ|sorted_new[i] − sorted_prev[i]|` when sizes match, else `Σ over new notes of the distance to the nearest previous note`. With no previous, it returns `rootPosition`'s result. Ties go to the lower average pitch. If nothing fits, fall back to `rootPosition`.
  - `type VoicingId = 'nearest' | 'root'`; `const voicers: Record<VoicingId, Voicer>`
  - `movement(a: Voicing, b: Voicing): number` (same cost function as above, exported for tests and the UI)
  - `type InstrumentId = 'piano'`; `type InstrumentSpec = { id: InstrumentId; label: string; defaultRange: KeyRange; voicingIds: VoicingId[] }`; `const instruments: Record<InstrumentId, InstrumentSpec>`; `getInstrument(id: InstrumentId): InstrumentSpec`
  - `type Profile = { id: string; name: string; instrumentId: InstrumentId; keyRange: KeyRange; difficulty: Difficulty; voicing: VoicingId; showNoteNames: boolean }`; `const defaultProfile: Profile` (`{ id:'default', name:'Me', instrumentId:'piano', keyRange:{low:53,high:84}, difficulty:'easy', voicing:'nearest', showNoteNames:true }`)
  - `rankKeys(chords: Chord[], difficulty: Difficulty): { semitones: number; blackKeyChords: number }[]`. Covers all 12 transpositions (−5..+6). `blackKeyChords` = unique simplified chords whose pitch classes include 1/3/6/8/10. Sort ascending, then by `|semitones|`.

- [ ] **Step 1: Failing tests** (range `{low:48, high:84}`):
  - root position C→Am→F→G starting fresh: voicings `[60,64,67] → [57,60,64] → [53,57,60] → [55,59,62]`, total `movement` = 27
  - nearest inversion over the same sequence: total `movement` = 9, and the second voicing is `[60,64,69]`
  - every voicing from either voicer stays within `range` for all 12 roots × `['', 'm']`
  - `rankKeys([Fm, Db, Ab, Eb], 'easy')[0]` is `{ semitones: 4, blackKeyChords: 0 }`
  - `getInstrument('piano').defaultRange` deep-equals `{low:53, high:84}`
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** PASS
- [ ] **Step 5:** Commit `feat(web): voicers, instrument registry, profile, key ranking`

### Task 5: Timing helpers

**Files:** Create `web/src/domain/timing.ts`; Test `web/src/domain/timing.test.ts`

**Interfaces:**
- Produces:
  - `activeChordIndex(chords: ChordEvent[], time: number): number` (binary search; −1 before the first chord or after the last chord's end)
  - `beatIndex(beats: number[], time: number): number` (last beat `<= time`, −1 if none)
  - `beatsUntilNextChord(chords, beats, time): number | null` (count of beats in `(time, nextChord.start]`; null when there's no next chord)
  - `reviewQueue(chords: ChordEvent[], threshold = 0.6): string[]` (ids with `confidence < threshold`, in time order; chords without a confidence are excluded)
  - `type Loop = { start: number; end: number }`
  - `loopSeekTarget(time: number, loop: Loop | null): number | null` (returns `loop.start` when `time >= loop.end`)
  - `computePeaks(samples: Float32Array, buckets: number): number[]` (max abs per bucket, normalised so the max is 1; all zeros stays zeros)

- [ ] **Step 1: Failing tests:** boundary times (exactly at a chord start, at the last chord's end, before 0) · beats `[0,.5,1,1.5,2]`, chord at 2, time 0.6 → 3 · reviewQueue order and exclusion · loop at, before and after the end · peaks of `[0,-1,0.5,0]` with 2 buckets → `[1,0.5]`
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** PASS
- [ ] **Step 5:** Commit `feat(web): timing helpers`

---

## Phase B: local server

### Task 6: Server scaffold, label normalisation, lyrics

**Files:**
- Create: `server/pyproject.toml` (`uv init --python 3.12 server`, then `uv add fastapi uvicorn httpx yt-dlp imageio-ffmpeg librosa lv-chordia` and `uv add --dev pytest`)
- Create: `server/app/__init__.py`, `server/app/labels.py`, `server/app/lyrics.py`
- Test: `server/tests/test_labels.py`, `server/tests/test_lyrics.py`

**Interfaces:**
- Produces:
  - `normalize_label(raw: str) -> str`: Harte/MIREX label → app label
  - `@dataclass Line(id: str, start: float, end: float, text: str)`
  - `parse_lrc(text: str, duration: float) -> list[Line]` (`[mm:ss.xx] text`; `end` = next line's start; the last line ends at `min(start + 6.0, duration)`; ids `l0, l1, …`)
  - `clean_title(title: str) -> str` (strips `(Official Video)`, `[Lyrics]`, `| …`, `ft./feat. …`, `Official Audio`; trims)
  - `class LyricsProvider(Protocol): def find(self, title: str, artist: str, duration: float) -> list[Line] | None`
  - `class LrclibLyrics`: `GET https://lrclib.net/api/get?track_name=&artist_name=&duration=`, falling back to `GET /api/search?track_name=&artist_name=` and taking the first result with `syncedLyrics`. Sends header `User-Agent: piano-chords (personal project)`. 10s timeout. Returns None on miss or error.

- [ ] **Step 1: Failing tests.** Table for `normalize_label`: `C:maj→C`, `C:min→Cm`, `A:maj7→Amaj7`, `G:7→G7`, `D:min7→Dm7`, `E:sus4→Esus4`, `B:dim→Bdim`, `Bb:hdim7→Bbm7b5`, `C:maj/3→C/E`, `F#:min→F#m`, `N→N.C.`, `X→N.C.`, `C→C`. `parse_lrc` of a 3-line invented LRC gives the right starts and ends, and the last line is capped by duration. `clean_title("AFUSIC - Pal Pal (Official Video) ft. Talwiinder") == "AFUSIC - Pal Pal"`.
- [ ] **Step 2:** `cd server && uv run pytest`. Expected: FAIL.
- [ ] **Step 3:** Implement. (`/3` = major third above the root. Map Harte degree bass: `3→+4`, `b3→+3`, `5→+7`, `b7→+10`, `7→+11`, using sharps for spelling.)
- [ ] **Step 4:** PASS. Do not unit-test `LrclibLyrics` against the network.
- [ ] **Step 5:** Commit `feat(server): scaffold, label normalisation, LRCLIB lyrics`

### Task 7: Audio fetch and chord detection

**Files:** Create `server/app/audio.py`, `server/app/detect.py`; Test `server/tests/test_audio.py`

**Interfaces:**
- Produces:
  - `video_id(url: str) -> str`: accepts `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `music.youtube.com/watch?v=`; raises `ValueError("Not a YouTube link")` otherwise
  - `@dataclass Meta(id: str, title: str, artist: str, duration: float)` (artist/title from yt-dlp `artist`/`track` when present, else `uploader` / `clean_title(title)`)
  - `class AudioFetcher(Protocol): def fetch(self, url: str, dest: Path) -> tuple[Path, Meta]`
  - `class YtDlpFetcher`: yt-dlp Python API, `format='bestaudio[ext=m4a]/bestaudio'`, output `dest/audio.%(ext)s`, `ffmpeg_location=imageio_ffmpeg.get_ffmpeg_exe()`
  - `@dataclass Segment(start: float, end: float, label: str, confidence: float | None = None, alternatives: tuple[str, ...] = ())` (labels already normalised)
  - `class ChordDetector(Protocol): def detect(self, audio: Path) -> list[Segment]`
  - `class LvChordiaDetector` (runs `normalize_label` on every model label)
  - `detect_beats(audio: Path) -> list[float]` (`librosa.beat.beat_track`, times in seconds)
  - `DETECTORS: dict[str, Callable[[], ChordDetector]] = {"lv-chordia": LvChordiaDetector}`; `get_detector(name: str = os.environ.get("PC_DETECTOR", "lv-chordia")) -> ChordDetector`

- [ ] **Step 1: Failing tests** for `video_id`: all four URL shapes give `"dQw4w9WgXcQ"`-style ids; `"hello"` and `"https://vimeo.com/1"` raise `ValueError`.
- [ ] **Step 2:** FAIL · **Step 3:** implement `video_id`, `Meta`, `YtDlpFetcher` · **Step 4:** PASS
- [ ] **Step 5 (spike):** Read lv-chordia's README or `help()` for its entry point and output shape, then implement `LvChordiaDetector`. Record in a docstring whether it exposes per-segment confidence; if not, leave `confidence=None`.
- [ ] **Step 6 (manual check):** `uv run python -m app.detect <youtube-url>` (add a small `__main__`: fetch to a temp dir, print the first 10 segments and the beat count). Expected: labels like `Fm`, `Db`, `N.C.`, plus a beat count > 100 for a 3-minute song. If lv-chordia fails to install or run on arm64, add an essentia `ChordsDetection` detector under the key `"essentia"` instead, set it as the default, and note why in the docstring.
- [ ] **Step 7:** Commit `feat(server): YouTube audio fetch, chord and beat detection`

### Task 8: Store, job runner, API

**Files:** Create `server/app/store.py`, `server/app/jobs.py`, `server/app/pipeline.py`, `server/app/main.py`; Test `server/tests/test_api.py`

**Interfaces:**
- Consumes: Tasks 6–7 protocols
- Produces:
  - `class SongStore(root: Path)`: `song_dir(id)`, `has_song(id) -> bool`, `read_song(id) -> dict`, `write_song(id, song: dict)` (atomic: tmp file + `os.replace`), `write_detected(id, segments)`, `list_songs() -> list[dict]` (`id, title, artist, duration`), `audio_path(id) -> Path`
  - `@dataclass Deps(fetcher: AudioFetcher, detector: ChordDetector, lyrics: LyricsProvider, beats: Callable[[Path], list[float]], store: SongStore)`
  - `run_pipeline(url: str, song_id: str, deps: Deps, on_stage: Callable[[str], None]) -> str`. Stages in order: `"downloading"`, `"detecting"`, `"lyrics"`, `"saving"`. Returns `"done"` or `"done_without_lyrics"`. Writes song.json in the wire format below.
  - `@dataclass Job(id: str, song_id: str, state: str, stage: str | None, error: str | None)`; states: `queued | running | done | done_without_lyrics | failed`
  - `class JobRunner(deps)`: `ThreadPoolExecutor(max_workers=1)`. `submit(url) -> Job`: a `ValueError` from `video_id` propagates; if the song is already stored, returns an immediately-`done` job; if a job for the same `song_id` is queued or running, returns that job. `get(job_id) -> Job | None`.
  - `create_app(deps: Deps | None = None) -> FastAPI` (real deps when None; data root `server/data/songs`)
  - Routes: `POST /api/songs {url}` → `{songId, jobId}` (400 `{detail}` on ValueError) · `GET /api/jobs/{id}` → Job JSON · `GET /api/songs` · `GET /api/songs/{id}` · `PUT /api/songs/{id}` (body replaces song.json) · `GET /api/songs/{id}/audio` (`FileResponse`, Range supported) · `POST /api/songs/{id}/lyrics {title, artist}` (re-fetch, update song, return it)
  - Wire song JSON: `{ id, title, artist, duration, beats: number[], chords: [{id, start, end, label, confidence?, alternatives?: string[]}], lyrics: [{id, start, end, text}], anchors: {} }`. Chord ids are `c0, c1, …`. `originalKey` is NOT on the wire (the browser estimates it).

- [ ] **Step 1: Failing tests** with `TestClient(create_app(fake_deps))`. Fakes write a tiny bytes file as audio, return 3 segments, 0–2 lyric lines and beats `[0,0.5,…]`.
  - POST a valid URL, poll until done; `GET /api/songs/{id}` has 3 chords with ids `c0..c2`, and labels pass through
  - POST `"hello"` → 400 with `detail == "Not a YouTube link"`
  - POST the same URL twice while the fake detector is blocked on a `threading.Event` → the same `jobId`; POST after done → state `done` immediately
  - lyrics fake returns None → state `done_without_lyrics`, and the song has `lyrics == []`
  - `GET /api/songs/{id}/audio` with `Range: bytes=0-1` → 206
  - PUT then GET round-trips the body
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** PASS
- [ ] **Step 5 (manual):** `uv run uvicorn app.main:app --reload`, then `curl -X POST localhost:8000/api/songs -d '{"url":"<real link>"}' -H 'content-type: application/json'` and poll until done.
- [ ] **Step 6:** Commit `feat(server): song store, job runner and API`

---

## Phase C: Studio UI

Match the mockups' structure and the tokens in `docs/mockups/theme.css` (copy the CSS variables into `web/src/theme.css`). Light and dark themes come from those tokens. Every interactive element is a real `<button>`/`<input>` with a visible focus ring.

### Task 9: Services and stores

**Files:** Create `web/src/services/api.ts`, `web/src/services/player.ts`, `web/src/services/clock.ts`, `web/src/state/songStore.ts`, `web/src/state/viewStore.ts`, `web/src/state/playbackStore.ts`; Test `web/src/state/songStore.test.ts`

**Interfaces:**
- Consumes: domain (Tasks 1–5), API (Task 8)
- Produces:
  - `api`: `createSong(url) -> Promise<{songId, jobId}>` (throws `Error(detail)` on 400), `getJob(id)`, `listSongs()`, `getSong(id) -> Promise<Song>` (wire → `Song`: `parseChord` on labels, `originalKey = estimateKey(...)`), `saveSong(song)` (`Song` → wire), `refetchLyrics(id, title, artist)`, `audioUrl(id) -> string`
  - `interface Player { load(src): Promise<void>; play(); pause(); seek(t); currentTime(): number; duration(): number; setRate(r); onEnded(cb) }`; `createPlayer(): Player` (an `HTMLAudioElement` with `preservesPitch = true`). `setPitch` is omitted until pitch shift is decided (YAGNI).
  - `startClock(player: Player, onTick: (time: number) => void, getLoop: () => Loop | null): () => void` (rAF loop; applies `loopSeekTarget`)
  - `useSongStore`: `{ song: Song | null; past: Song[]; future: Song[]; load(song); apply(edit: (s: Song) => Song); undo(); redo() }` (history capped at 100; `apply` clears `future`)
  - `useViewStore` (zustand `persist`, localStorage wrapped in try/catch): `{ profile: Profile; perSong: Record<string, { semitones: number; view: 'sheet' | 'grid' }>; mode: 'play' | 'edit'; selectedChordId: string | null; ...setters }`
  - `usePlaybackStore`: `{ time; playing; rate; loop: Loop | null; ...setters }` (`Loop` from `domain/timing.ts`)
  - Autosave: `subscribeAutosave(): () => void` in `songStore.ts` (debounced 800ms `api.saveSong` when `song` changes after `load`)

- [ ] **Step 1: Failing tests:** `apply` then `undo` restores the exact previous object; `redo` re-applies it; a new `apply` after `undo` clears `future`; history never exceeds 100.
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** PASS
- [ ] **Step 5:** Commit `feat(web): api client, player, clock and stores`

### Task 10: Library and import screens

**Files:** Create `web/src/features/import/ImportScreen.tsx` (URL field, recent songs list), `web/src/features/import/JobProgress.tsx`, `web/src/App.tsx` (hash routing: `#/` = import, `#/song/<id>` = studio). Reference: `docs/mockups/Studio-Import.dc.html`.

**Interfaces:**
- Consumes: `api.createSong`, `api.getJob`, `api.listSongs` (Task 9)
- Produces: `<App />`; navigates to `#/song/<id>` when a job reaches `done` or `done_without_lyrics`

Behaviour: the stage list shows `Downloading → Detecting chords → Fetching lyrics → Saving`, with the current stage animated and finished ones ticked. Polls `getJob` every 1000ms. `failed` shows the error and a Retry button. A 400 shows its message under the field. A lyrics miss shows "No synced lyrics found. You can add them later." and still continues.

- [ ] **Step 1:** Implement.
- [ ] **Step 2 (verify):** Run both servers. Paste junk → inline error. Paste a real link → stages advance and it lands on `#/song/<id>`. The recent list shows the song.
- [ ] **Step 3:** Commit `feat(web): import and library screens`

### Task 11: Studio play mode: timeline, player bar, Now/Next, piano strip

**Files:** Create `web/src/features/studio/StudioScreen.tsx` (layout + mode switch), `web/src/features/timeline/Timeline.tsx` (canvas waveform + chord blocks + playhead), `web/src/features/player/PlayerBar.tsx` (play/pause, scrubber, speed 0.5–1.0, loop current chord), `web/src/features/coach/NowNextCard.tsx`, `web/src/features/coach/PianoStrip.tsx`, `web/src/ui/Keyboard.tsx`, `web/src/features/instrument/diagrams.ts`, `web/src/features/studio/useShortcuts.ts`. References: `Studio-Play.dc.html`, `Stage-Play.dc.html` (Now/Next), `Keyboard.dc.html`.

**Interfaces:**
- Consumes: stores, `activeChordIndex`, `beatsUntilNextChord`, `computePeaks`, `voicers`, `displayChord`, `getInstrument`
- Produces:
  - `<Keyboard range: KeyRange; now: number[]; next?: number[]; showNoteNames: boolean; size?: 'strip' | 'mini' />` (pure props: now = orange keys with names, next = blue dots)
  - `diagrams: Record<InstrumentId, ComponentType<DiagramProps>>` with `piano: Keyboard` (the UI half of the instrument registry; the domain half is `instruments`)
  - Shortcuts: Space play/pause · ←/→ previous/next chord · `[`/`]` transpose −/+ · ⌘Z/⇧⌘Z undo/redo · `E` edit mode · `L` loop current chord

Behaviour: chord blocks show `displayChord(...)`, and blocks with `confidence < 0.6` are dashed. Clicking a block or the waveform seeks. The Now/Next card shows the current chord large, the next chord with up to 4 beat dots counting down, using `beatsUntilNextChord`. The piano voices now and next with the profile's voicer, chaining `previous` so voicings are stable. Components subscribe to derived values (active index, beat index), never to raw `time`, except the playhead and scrubber.

- [ ] **Step 1:** Implement.
- [ ] **Step 2 (verify):** On a real song: the highlight moves in sync with the audio, the beat dots count down into each change, and Space and arrow keys work. In React DevTools "Highlight updates", chord blocks don't flash every frame.
- [ ] **Step 3:** Commit `feat(web): studio play mode`

### Task 12: Transpose, difficulty and chart preview

**Files:** Create `web/src/features/transpose/KeyMenu.tsx` (12 keys, each with a black-key-chord count, sorted easiest first via `rankKeys`, current and original key marked, Easy/Full toggle, voicing toggle), `web/src/features/chart/ChartPreview.tsx` (chords over lyrics via `alignChart`; current row shaded; clicking a chord seeks and selects it), `web/src/features/chart/ChordChip.tsx` (hover/focus popover with a `mini` `Keyboard`). References: `Studio-Transpose.dc.html`, `Sheet-Edit.dc.html` (popover).

**Interfaces:**
- Consumes: `rankKeys`, `transposeKey`, `alignChart`, `useViewStore` setters
- Produces: `<KeyMenu />`, `<ChartPreview />`, `<ChordChip event: ChordEvent; active: boolean />`

- [ ] **Step 1:** Implement.
- [ ] **Step 2 (verify):** On an Fm song, the key menu lists Am first with 0. Picking it updates the timeline, Now/Next, piano, chart and popovers together, and the header shows "Am (from Fm)". A song with no lyrics shows a chord-only chart.
- [ ] **Step 3:** Commit `feat(web): transpose menu and chart preview`

### Task 13: Edit mode: inspector and review queue

**Files:** Create `web/src/features/editor/Inspector.tsx` (selected chord: alternatives with confidence bars, root + quality picker, nudge start ±0.1s, split at playhead, merge with next, delete), `web/src/features/editor/ReviewQueue.tsx` (unsure chords, J/K to step, Enter to accept as-is), and drag-to-retime in `Timeline.tsx` (drag a block's left edge, snapping to the nearest beat within 0.15s). Reference: `Studio-Edit.dc.html`.

**Interfaces:**
- Consumes: `setChordFromDisplay`, `moveChordStart`, `splitChord`, `mergeWithNext`, `deleteChord`, `reviewQueue`, `useSongStore.apply/undo/redo`
- Produces: none for later tasks

Behaviour: every change goes through `useSongStore.apply(edit)`, so undo/redo and autosave come for free. Accepting a chord from the queue sets its `confidence` to 1, so it leaves the queue (it's an edit, so it's undoable). The picker shows transposed names; saving uses `setChordFromDisplay` with the current `semitones`. The header shows "saved" or "saving…".

- [ ] **Step 1:** Implement.
- [ ] **Step 2 (verify):** Transpose to Am, change a chord to G, reload the page: it shows G, and switching to the original key shows Eb. Drag a boundary into its neighbour: it stops at the minimum length. J/K walks the unsure chords. ⌘Z undoes each step.
- [ ] **Step 3:** Commit `feat(web): edit mode with inspector and review queue`

### Task 14: README and full run

**Files:** Create `README.md` (what it is, a `uv`/`npm` one-time setup, how to run both servers, `PC_DETECTOR`, where data lives, the KeyRange calibration note, the extension points table linked to LLD §10).

- [ ] **Step 1:** Write the README.
- [ ] **Step 2 (verify):** From a fresh clone, follow the README exactly. Import Pal Pal, play along, transpose to the easiest key, fix one chord. `cd web && npm test` and `cd server && uv run pytest` both pass.
- [ ] **Step 3:** Commit `docs: README and run instructions`, then `git push`.
