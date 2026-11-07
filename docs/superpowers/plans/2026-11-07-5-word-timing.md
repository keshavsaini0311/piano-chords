# Word-level Lyric Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Start from the [runbook](2026-11-07-overnight-runbook.md). **Needs plan 4 Tasks 1–2** (`update_song`, `keep_server_fields`, `after_import`, `run_later`, `scripts/backfill.py`).

**Goal:** Chords in the chart sit on the word being sung when they change, instead of being spread evenly across each lyric line.

**Architecture:** After an import (and after lyrics change), the server runs Meta's MMS forced aligner (ONNX, via `ctc-forced-aligner`) once over the song, preferring the vocals mix, then aligns each LRCLIB line inside its own time window. Lines that pass a confidence gate get `words: [{ index, start, end }]`; the rest keep today's estimate. `alignChart` uses word times when they're there; anchors still win.

**Tech Stack:** Python 3.12, `ctc-forced-aligner==1.0.2`, `onnxruntime`, `unidecode`, imageio-ffmpeg, pytest · TypeScript, Vitest.

**Spec:** `docs/ROADMAP-DESIGN.md` §4.5. Reference code: `docs/superpowers/plans/spikes/align_spike.py` (proven API usage) and `truth_spike.py` (median 69 ms, 96% within 150 ms).

## Global Constraints

- Everything in the runbook §2. Smallest diff that works.
- Model: `~/.cache/piano-chords/ctc-aligner.onnx` (already downloaded; `ensure_onnx_model(path, MODEL_URL)` only downloads when missing). Never the package default `~/ctc_forced_aligner/`.
- Run the model **once per song** (`generate_emissions` over the whole 16 kHz mono track), then align each line on `emissions[start_frame:end_frame]` for the window `[line.start − 1.0, line.end + 1.0]`.
- Language: `hin` if the line contains a Devanagari character (U+0900–U+097F), else `eng`; `romanize=True` always.
- Confidence gate (all three): first word starts within **−0.6 … +0.8 s** of the line's `start`; last word ends at or before `line.end + 1.0`; mean per-frame log-probability ≥ **−2.5**.
- `index` = position in `line.text.split()` (punctuation-only words included), matching `wordStarts(text)` in the browser.
- Audio: `mix/vocals.m4a` when it exists, else the song's audio file.

## Review Focus

1. **Lyrics re-fetched or edited after alignment**: changed lines lose stale words and get re-aligned. Pinned in Task 2.
2. **A line edited while alignment runs**: that line's result is discarded. Pinned in Task 2.
3. **Punctuation-only words** keep later indexes right. Pinned in Tasks 1 and 2.
4. **Devanagari lines** align as `hin`. Pinned in Task 2.
5. **A chord before the first sung word or after the last** lands on the first or last word. Pinned in Task 1.

---

### Task 1: Chart uses word times (browser)

**Files:**
- Modify: `web/src/domain/song.ts`, `web/src/domain/align.ts`
- Test: `web/src/domain/align.test.ts`

**Interfaces:**
- Produces: `export type WordTime = { index: number; start: number; end: number }`; `LyricLine.words?: WordTime[]`. In `align.ts`, when `line.words?.length`, a chord's character offset is `wordStarts(line.text)[w.index]` for `w` = the last word with `start <= event.start + 0.05` (the first word if none), falling back to the existing estimate when that index doesn't exist. Anchors still win. `alignChart`'s signature is unchanged.

- [x] **Step 1: Write the failing tests** (invented text):

```ts
it('puts the chord on the word being sung', () => { /* "one two three four" 0–4 s, words at 0, 0.4, 2.8, 3.2; chord at 2.9 → charIndex 8 */ });
it('before the first word / after the last', () => { /* chord at -0.5 → 0; chord at 3.9 → 14 */ });
it('index counts punctuation words', () => { /* "go — now", word index 2 → charIndex 5 */ });
it('no word times: unchanged estimate; anchor beats word times', () => { ... });
```
- [x] **Step 2: Run** `cd web && npx vitest run src/domain/align.test.ts` — Expected: the new tests FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run**, then `npm run check` — Expected: PASS.
- [x] **Step 5: Commit** `feat(web): chart places chords on the sung word when word times exist`

### Task 2: Align after import and after lyrics change (server)

**Files:**
- Create: `server/app/align.py`, `server/tests/test_align.py`
- Modify: `server/pyproject.toml` (`uv add ctc-forced-aligner==1.0.2 "unidecode>=1.3"`), `server/app/pipeline.py` (`Deps.aligner`), `server/app/jobs.py` (`after_import`), `server/app/main.py` (real aligner; PUT), `server/scripts/backfill.py` (`--align`)
- Test: `server/tests/test_api.py`

**Interfaces:**
- Consumes: `update_song`, `keep_server_fields`, `after_import`, `run_later` (plan 4).
- Produces:
  - `def language_of(text: str) -> str`; `def kept_words(words: list[str], normalized: list[str]) -> list[int]` (indexes whose normalized form isn't blank); `def accept_line(line_start: float, line_end: float, words: list[dict], mean_logprob: float) -> bool` (the gate; empty `words` → `False`).
  - `class LyricAligner(Protocol): def align(self, audio: Path, lines: list[dict]) -> dict[str, list[dict]]: ...` — `{line_id: [{"index", "start", "end"}]}` for accepted lines only.
  - `class CtcAligner(model_path: Path = Path.home() / ".cache/piano-chords/ctc-aligner.onnx")` — lazy `onnxruntime.InferenceSession`; decodes with the bundled ffmpeg to 16 kHz mono float32; `generate_emissions` once; per line: `text.split()`, normalise each word with `ctc_forced_aligner.text_normalize(word, lang)`, align the kept words joined by spaces (`preprocess_text(..., romanize=True, language=lang)` → `get_alignments` → `get_spans` → `postprocess_results`, as in `spikes/align_spike.py`), map result *k* to `kept[k]`, add the window start, keep the line if `accept_line(...)`. Mean per-frame log-probability = mean over words of `score / max(1, (end - start) * 1000 / stride)`.
  - `def align_song(song_id: str, deps: Deps) -> None` — read the song; skip if it has no sung lines; align; then `update_song` sets `words` on each aligned line whose `text` is still what was aligned, and removes `words` from rejected lines with unchanged text.
  - `Deps.aligner: LyricAligner | None = None`; the real app sets `CtcAligner()`. `after_import` appends `align_song` when `deps.aligner` is set (after `split_song`, so the vocals mix is used when it exists).
  - PUT `/api/songs/{id}`: when `keep_server_fields` reports changed lyrics and `deps.aligner` is set → `runner.run_later(align_song, id, deps)`.
  - `scripts/backfill.py --align`: aligns songs that have sung lyrics but no line with `words`.

- [x] **Step 1: Write the failing tests** (a `FakeAligner` returning fixed words and optionally running a callback mid-align; extend `make_client` with `aligner=None`; never load the real model in unit tests):

```python
def test_language_of(): assert language_of("नमस्ते दुनिया") == "hin" and language_of("hello there") == "eng"
def test_kept_words(): assert kept_words(["go", "—", "now"], ["go", "", "now"]) == [0, 2]
def test_accept_line():
    ok = [{"start": 10.1, "end": 10.5}, {"start": 10.6, "end": 11.0}]
    assert accept_line(10.0, 12.0, ok, -1.0)
    assert not accept_line(10.0, 12.0, [{"start": 11.2, "end": 11.5}], -1.0)
    assert not accept_line(10.0, 12.0, ok, -3.0)
    assert not accept_line(10.0, 12.0, [], -1.0)
def test_import_aligns_lyrics(tmp_path): ...                   # FakeAligner → lyrics[0]["words"] present after the follow-up
def test_changed_lyrics_drop_words_and_realign(tmp_path): ...  # PUT with l1's text changed → l1 has no words, then gets fresh ones
def test_results_for_changed_text_are_dropped(tmp_path): ...   # FakeAligner edits l0's text via update_song mid-align → l0 has no words
def test_align_prefers_the_vocals_mix(tmp_path): ...           # mix/vocals.m4a present → FakeAligner got that path
```
- [x] **Step 2: Run** `cd server && uv run pytest -q tests/test_align.py tests/test_api.py` — Expected: the new tests FAIL.
- [x] **Step 3: Implement**, adding the dependencies with `uv add ctc-forced-aligner==1.0.2 "unidecode>=1.3"`; confirm `torch` is still `2.15.0` and there's no `torchaudio`.
- [x] **Step 4: Run**, then `npm run check` — Expected: PASS.
- [x] **Step 5: Commit** `feat(server): align lyrics word by word after import and lyric changes`

### Task 3: Measure, smoke, document

**Files:**
- Create: `server/eval/align_synthetic.py`
- Modify: `docs/ARCHITECTURE.md`, `TODO.md`

- [x] **Step 1: Ground-truth check.** Turn `spikes/truth_spike.py` into `server/eval/align_synthetic.py [instrumental_dir]`, reusing `CtcAligner`'s decode and per-line alignment instead of its own copy. Without a directory it uses the spoken track alone; it exits with a clear message when macOS `say` is missing. Run `cd server && PYTHONPATH=. uv run python eval/align_synthetic.py`. Expected: median ≤ 120 ms and ≥ 90% within 150 ms. If it misses, the per-line slicing or time offsets are wrong: fix before going on.
- [x] **Step 2: Real-song smoke check** on temp copies of the English and the Devanagari song:

```bash
cd server && T=$(mktemp -d) && mkdir -p $T/songs && cp -R data/songs/_dK2tDK9grQ data/songs/1gukvtH_a3I $T/songs/ && PC_DATA_DIR=$T PYTHONPATH=. uv run python scripts/backfill.py --align _dK2tDK9grQ 1gukvtH_a3I
```
Then count lines with `words` per song (a one-line Python read of each `song.json`). Expected: finishes in about 40–80 s per song, with some lines aligned in each. Put the numbers in the report; under 30% on either song → "needs a human" (don't change the gate overnight).
- [x] **Step 3: Docs.** `docs/ARCHITECTURE.md`: §3 `align.py`, `words` as a server-written field, `--align`; §4.1 `align.ts` uses word times; §7 `align_synthetic.py`. Tick item 5 in `TODO.md`.
- [x] **Step 4: Verify** `npm run check` — Expected: PASS.
- [x] **Step 5: Commit** `test(server): word-timing accuracy check; docs`
