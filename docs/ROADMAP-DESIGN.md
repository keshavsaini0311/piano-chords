# piano-chords: design for the next five features

Status: decided (7 Nov 2026), **minimum-change version**. Plans (local, git-ignored): `docs/superpowers/plans/2026-11-07-*`
(start with the runbook). The two model choices were proven on this Mac first; working reference
code is in `docs/superpowers/plans/spikes/`. Nothing here is built yet.
Read with [ARCHITECTURE.md](ARCHITECTURE.md) (how the app works today).

Rule for every decision below: **the smallest change that gives the feature**. Anything that only
makes a feature fancier is listed under "Later" instead of built.

## 0. Summary

| Feature | Browser | Server | Stored data |
|---|---|---|---|
| 1. Wait-for-me | gate in the clock + pure `waitAction` | none | none |
| 2. Section loops | `findSections()` from lyrics, timeline band | none | none (derived) |
| 3. Chord mastery | `mastery()` over saved runs, library panel | none | none (derived) |
| 4. Stems | Mix button switches the audio source | split after import → 3 mixed files | `song.mixes`, `mix/*.m4a` |
| 5. Word timing | `alignChart` uses word times | align after import / lyrics change | `lyrics[].words` |

## 1. Principles

1. **The server only does slow, once-per-song work** (download, models). Everything interactive or
   derived stays in the browser. Three of the five features don't touch the server.
2. **Derive, don't store.** Sections and mastery are recomputed from data that already exists.
3. **`song.json` only gains optional fields**, so old songs keep working unchanged.
4. **Server-written fields survive autosave.** `mixes` and `lyrics[].words` are written by background
   work; a browser that loaded the song earlier would erase them on its next save. So
   `PUT /api/songs/{id}` keeps the stored `mixes`, and keeps a line's `words` while its `id` and
   `text` are unchanged. All song writes go through `SongStore.update_song(id, change)` under one
   lock (re-read, apply, write atomically; never recreate a deleted song's folder).
5. **Background work runs after an import, on the existing single worker**, after the import job is
   already marked done (`JobRunner.after_import`). No task queue, no task API. Songs imported before
   these features are filled in by `scripts/backfill.py`.

## 2. Features

### 2.1 Wait-for-me (browser only)

With Check my playing on, the song stops exactly at each chord change and carries on when the mic
hears the new chord.

- **The stop is a gate in the clock**, next to looping, so it's frame-accurate (a 20/s practice tick
  would let ~50 ms of the next chord through). It triggers only when playback *crosses* the gate in
  one small step (`time − prev < 0.25 s`), so seeks and loop restarts never trip it.
- **All the rules are one pure function**, `waitAction(...)` → `none | setGate | resume | release |
  clear`, tested on its own; the existing practice interval applies the result. No refactor of the
  practice loop.
- Waiting ≠ paused: `playing` stays true, `waiting` is true, the audio element is paused. Resuming
  moves the gate to the next change *before* playing, so it can't stop twice.
- Chords under ½ beat and N.C. are never waited on. Skip = the same resume a hit does.
- **Wait mode isn't scored.** It's for learning; scores are for performance. The run tracker sees
  "not playing" while wait mode is on.

### 2.2 Section loops (browser only)

- **Lyrics only.** A chorus is a run of 2+ lyric lines that repeats (lines match when ≥ 80% of the
  shorter line's words appear in the other); sung stretches between choruses are verses; long
  instrumental stretches at the edges are Intro/Outro. Lyrics are the reliable signal because many
  pop songs loop the same four chords through verse and chorus.
- Sections start on the chord change under their first sung line, so loops begin cleanly.
- A band above the timeline's chord lane; click or `S` loops a section.
- Songs without lyrics (or fewer than 8 lines) get no sections: a marked shortcut.

### 2.3 Chord mastery (browser only)

- Skill per chord = **average points** (the existing per-chord scoring, so timing counts) over its
  **last 20 attempts** across all songs. Levels: new (< 3 attempts), learning, solid (≥ 65),
  mastered (≥ 85 with ≥ 5 attempts).
- Spelling-free chord keys (`Db` = `C#`). Songs are checked in the key and difficulty you play them,
  from `chordTime` (already in `GET /api/songs`).
- **Playable** = every chord making up ≥ 3% of the song is solid or mastered. **Learn next** = the
  chord that's the last missing one for the most songs.
- A "Your chords" panel on the library, and a "✓ You can play this" badge on song cards.

### 2.4 Stems (server + a small browser change)

- **Demucs `htdemucs` (`demucs==4.1.0`), proven:** Shape Of You (3:55) splits in 22 s on the Mac's
  GPU (`mps`), 74 s on CPU; stems sum back to the mix within 2.8%. No `torchaudio` needed. All audio
  I/O goes through the bundled ffmpeg (Demucs's own loader wants a system ffmpeg).
- **The server saves three ready-made mixes, not four stems:** `backing` (vocals + drums + bass: the
  keys/guitar part is yours), `novocals` (drums + bass + other), `vocals`. About 3.8 MB each.
- **The browser just switches the `<audio>` source** (keeping position, speed and play state) with a
  Mix button that cycles Full song → Backing track → No vocals → Vocals only, like the Speed button.
  No multi-track sync, no player changes. The choice is remembered per song.
- Runs after import; old songs via `scripts/backfill.py --stems`. The waveform still uses the full song.

### 2.5 Word-level lyric timing (server + a small browser change)

- **`ctc-forced-aligner==1.0.2`** (Meta's MMS aligner as ONNX, `unidecode` romanisation). torchaudio
  is out: its forced-alignment API was removed in 2.9. Model at
  `~/.cache/piano-chords/ctc-aligner.onnx` (1.2 GB, downloaded). MMS weights are CC-BY-NC 4.0: fine
  for personal use.
- **Proven:** spoken words at known times over real instrumental stems, line starts jittered ±0.4 s
  → median word-start error 69 ms, 96% within 150 ms. English and Devanagari songs align every line.
- **Run the model once per song** (~42 s for 4 min on CPU), then align each line in its LRCLIB
  window ± 1 s of that output (0.1 s total). Per-line model runs were 10× slower.
- Uses the vocals mix when it exists, else the full song (no accuracy difference in the spike, so it
  doesn't depend on stems). `hin` for lines with Devanagari, else `eng`.
- **Confidence gate per line:** first word within −0.6…+0.8 s of the LRCLIB start, last word ends by
  line end + 1 s, mean per-frame log-probability ≥ −2.5. Lines that fail keep today's estimate.
- Stored as `words: [{ index, start, end }]`, `index` = whitespace-word position, so the browser's
  existing `wordStarts(text)` gives the character offset. `alignChart` keeps its signature; anchors
  still win.
- Runs after import (after the split) and after a lyrics change (`run_later`); old songs via
  `scripts/backfill.py --align`.

## 3. Data and API changes

```ts
type Song = { /* … */ mixes?: ('backing' | 'novocals' | 'vocals')[] };                 // server-written
type LyricLine = { /* … */ words?: { index: number; start: number; end: number }[] };     // server-written
type SongView = { semitones: number; mix?: 'full' | 'backing' | 'novocals' | 'vocals' };  // per-song choice
// playbackStore (not saved): gate: number | null; waiting: boolean
// judgeStore (not saved): waitMode: boolean
```

```
data/songs/<id>/mix/backing.m4a  novocals.m4a  vocals.m4a     new
```

| Method | Path | Change |
|---|---|---|
| GET | `/api/songs/{id}/mix/{name}` | new: one mix, with HTTP Range |
| PUT | `/api/songs/{id}` | keeps server-written fields; a changed lyric line triggers re-alignment |

## 4. Build order

Wait-for-me → Section loops → Chord mastery → Stems → Word timing (needs the stems plan's
`update_song`, `after_import` and `run_later`). Thirteen tasks in total.

## 5. Risks

| Risk | Mitigation |
|---|---|
| Aligner weak on sung Hindi/Punjabi | Per-line gate; failed lines keep today's estimate. Check Chaudhary and AKHIYAAN by eye. |
| "Backing track" keeps the wrong instruments on Bollywood mixes (harmonium in "other" with strings) | Listen on two songs; the mix recipe is one line to change. |
| A brief gap when switching mix | Accepted: it's a deliberate tap, not continuous. |
| A new import waits behind a running split (~22 s) | Accepted: one worker, and splits are short on `mps`. |

## 6. Later (deliberately not built now)

Per-stem volume sliders and multi-track playback · chord-based sections for songs without lyrics ·
scoring wait-mode runs · section names in practice tips · a task queue with priorities and progress
badges · automatic backfill on startup.
