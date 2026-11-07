# piano-chords: guide for agents

A personal chord player: paste a YouTube link, the server detects chords, beats and lyrics, and
the browser lets you play along, transpose, fix chords and practise with the mic.

Read first: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (what every file does) and
[docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) (tokens, components, copy). Planned work:
[TODO.md](TODO.md), [docs/ROADMAP-DESIGN.md](docs/ROADMAP-DESIGN.md), plans in `docs/superpowers/plans/`.

## Commands

| Do | Run |
|---|---|
| Everything a change must pass | `npm run check` (repo root) |
| Web tests / one file | `cd web && npm test` · `npx vitest run src/domain/score.test.ts` |
| Web types + build / lint | `cd web && npm run build` · `npm run lint` |
| Server tests / one test | `cd server && uv run pytest -q` · `uv run pytest -q tests/test_api.py::test_name` |
| Run the app | `npm run dev` (root): server on :8000, web on :5173 (Vite proxies `/api`) |
| Redo an imported song's beats or chords | `cd server && PYTHONPATH=. uv run python scripts/redo_beats.py <id>` |

## Rules that keep the code easy to change

- **Layers (web):** `ui/` draws only (no stores) · `features/` screens · `state/` Zustand stores ·
  `services/` server, audio, mic, clock · `domain/` pure functions. `domain/` imports nothing from
  React, stores or services. Put logic in `domain/` and test it there; keep components thin.
- **The stored song is always in its original key.** Transpose, easy/full and spelling are view
  settings applied by `displayChord` / `useDisplay().played`. Edits made in a transposed view go
  back through `setChordFromDisplay`.
- **Every song edit is a pure `(song) => song` in `domain/edits.ts`**, applied with
  `useSongStore.getState().apply(edit)`. That gives undo and autosave for free.
- **Wire format:** chords cross the API as label strings (`"Fm"`, `"C/E"`, `"N.C."`); only
  `services/api.ts` converts. The server converts model labels in `server/app/labels.py`.
- **Time:** components never subscribe to raw `time` (60 updates/s). Subscribe to derived values
  (`useActiveIndex`) or read `usePlaybackStore.getState()` inside loops.
- **Server owns the slow work** (download, models, separation, alignment) and runs it on the one
  worker. Everything interactive or derived happens in the browser.
- **Interfaces only where a second implementation exists or tests need a fake** (`ChordDetector`,
  `AudioFetcher`, `LyricsProvider`, `Player`). Otherwise plain functions.
- **New dependencies only when a plan names them.**
- **Deliberate shortcuts are marked** with a `ponytail:` comment that names the limit and the upgrade path.

## Tests

- TDD: write the failing test first, see it fail, then the code.
- Web tests are plain Vitest on `domain/`, `state/` and `services/` (no DOM library). Server tests
  use the fakes in `server/tests/` via `create_app(Deps(...))`; never call YouTube, LRCLIB or a model in a unit test.
- No real song lyrics in fixtures: invent placeholder lines.
- Measurement scripts that use real audio live in `server/eval/` and are run by hand.

## Data and safety

- `server/data/` is the user's library (git-ignored). **Never write to it from tests or smoke
  checks.** For a real-audio smoke check: `export PC_DATA_DIR=$(mktemp -d)`, copy one song folder
  in, and point the server or script there.
- Models are cached outside the repo: Demucs in `~/.cache/huggingface`, the lyric aligner at
  `~/.cache/piano-chords/ctc-aligner.onnx`.
- Don't push, open PRs or merge unless asked. The user's GitHub account for this repo is `keshavsaini0311`.

## Commits

Conventional style, one task per commit: `feat(web): …`, `fix(server): …`, `docs: …`, `test: …`.
The body says what changed and why in plain words.
