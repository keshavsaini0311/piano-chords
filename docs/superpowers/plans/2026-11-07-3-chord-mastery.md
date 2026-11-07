# Chord Mastery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Start from the [runbook](2026-11-07-overnight-runbook.md).

**Goal:** The library shows how well you know each chord across all your practice, which songs you can already play, and which chord to learn next.

**Architecture:** Pure functions in `domain/mastery.ts` over data that already exists: saved practice runs and each song's `chordTime` from `GET /api/songs`. A chord's skill is its average score (the existing per-chord points) over its last 20 attempts, so timing and correctness count the way runs already count them. Nothing new is stored; the server doesn't change.

**Tech Stack:** TypeScript, Vitest, React, Zustand.

**Spec:** `docs/ROADMAP-DESIGN.md` §4.3.

## Global Constraints

- Everything in the runbook §2. Smallest diff that works.
- Skill = mean of `judgementFor(attempt, run.beat).points` over the chord's **last 20 attempts** across all songs, ordered by `run.at`.
- Levels (exact): fewer than 3 attempts → `new`; score ≥ 85 and ≥ 5 attempts → `mastered`; score ≥ 65 → `solid`; else `learning`.
- Chord keys are spelling-free: `formatChord(parseChord(label), 'sharps')`; N.C. has no key.
- A song is playable when every chord making up ≥ **3%** of its playing time, as you'd play it (that song's transpose, your easy/full setting), is `solid` or `mastered`. A song with no chords is never playable.
- Copy (exact): heading `Your chords`; empty state `Practise with Check my playing to see your chords here.`; `You can play these now`; `Learn next`; `{chord} unlocks {n} song` / `{chord} unlocks {n} songs`; card badge `✓ You can play this`.

## Review Focus

1. **Chords practised while transposed** count for the chord you actually played, and songs are checked in the key you play them in. Pinned in Task 1 (`songChordsAsPlayed`).
2. **No practice yet** → empty map, empty state, no crash. Pinned in Tasks 1 and 2.
3. **A song with no chords** is never playable. Pinned in Task 1.
4. **A passing chord under 3%** doesn't block a song. Pinned in Task 1.
5. **Db vs C#** across songs in different keys are one chord. Pinned in Task 1.

---

### Task 1: Skill, playable songs, next chord

**Files:**
- Create: `web/src/domain/mastery.ts`, `web/src/domain/mastery.test.ts`

**Interfaces:**
- Consumes: `Run`, `judgementFor` (`domain/score.ts`); `parseChord`, `formatChord`, `simplifyChord`, `transposeChord`, `Difficulty` (`domain/music.ts`).
- Produces:
  - `export type Level = 'new' | 'learning' | 'solid' | 'mastered'`
  - `export type ChordSkill = { chord: string; attempts: number; score: number; level: Level }`
  - `export function chordKey(label: string): string | null`
  - `export function mastery(runsBySong: Record<string, Run[]>): Map<string, ChordSkill>`
  - `export function songChordsAsPlayed(chordTime: Record<string, number>, semitones: number, difficulty: Difficulty): Record<string, number>` — simplify → transpose → key; N.C. dropped; equal keys summed.
  - `export function playableSongs(songs: { id: string; chords: Record<string, number> }[], skills: Map<string, ChordSkill>): string[]`
  - `export function nextToLearn(songs: { id: string; chords: Record<string, number> }[], skills: Map<string, ChordSkill>, limit = 3): { chord: string; unlocks: string[] }[]` — for each main (≥ 3%) chord not solid/mastered: `unlocks` = songs where it's the only main chord not solid/mastered. Sort by `unlocks.length` desc, then total seconds across songs desc.

- [x] **Step 1: Write the failing tests**

```ts
it('spellings collapse', () => { expect(chordKey('Db')).toBe('C#'); expect(chordKey('N.C.')).toBeNull(); });
it('levels follow the thresholds', () => {
  // attempts built so each threshold is hit exactly (beat 0.5): 5 × 100 → mastered;
  // 80, 80, 60, 60, 60 (mean 68) → solid; 5 × 40 → learning; 2 attempts → new
});
it('only the last 20 attempts count', () => { /* 20 misses, then 20 Perfect → mastered */ });
it('no runs, no skills', () => expect(mastery({}).size).toBe(0));
it('song chords as played follow key and difficulty', () => expect(songChordsAsPlayed({ Am7: 10, 'N.C.': 5, G: 4 }, 3, 'easy')).toEqual({ Cm: 10, 'A#': 4 }));
it('playable when main chords are solid; passing chords and empty songs', () => { expect(playableSongs([{ id: 'a', chords: { C: 50, G: 48, F: 2 } }], solidCG)).toEqual(['a']); expect(playableSongs([{ id: 'b', chords: {} }], solidCG)).toEqual([]); });
it('learn next favours the chord that unlocks most songs', () => expect(nextToLearn(songs, solidCG)[0]).toEqual({ chord: 'F', unlocks: ['a', 'c'] }));
```
- [x] **Step 2: Run** `cd web && npx vitest run src/domain/mastery.test.ts` — Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run**, then `npm run check` — Expected: PASS.
- [x] **Step 5: Commit** `feat(web): chord skill across practice, playable songs, next chord to learn`

### Task 2: "Your chords" in the library, docs

**Files:**
- Create: `web/src/features/library/ChordMastery.tsx`
- Modify: `web/src/features/library/LibraryScreen.tsx`, `web/src/app.css`, `docs/ARCHITECTURE.md`, `TODO.md`

**Interfaces:**
- Consumes: Task 1; `usePracticeStore` (`runs`); `useViewStore` (`perSong`, `profile.difficulty`); the `songs: SongSummary[]` `LibraryScreen` already loads.
- Produces: `export function ChordMastery({ skills, playable, next, songs })`. `LibraryScreen` computes `skills`, `playable` (a `Set`) and `next` once with `useMemo` and passes `playable` to `SongCard` for its badge.

- [x] **Step 1: Panel.** On the All songs tab, above the grid: `<section className="mastery panel">` with `.panel-head` `<h2>Your chords</h2>`; chord chips (`.mastery-chord`, a `<ChordName>` each, sorted mastered → solid → learning → new, then name) coloured by level per `docs/DESIGN-SYSTEM.md` §1 (`--right`, `--next`, `--unsure`, `--muted` dashed), title `{chord}: {level}`; then `You can play these now` with song links (`openSong`), then `Learn next` with up to 3 `{chord} unlocks {n} song(s)` lines; empty parts hidden; with no runs at all, only the empty-state sentence.
- [x] **Step 2: Badge.** `SongCard` shows `✓ You can play this` (`.song-badge`: `--right`, 12px, 600) when its id is in `playable`.
- [x] **Step 3: Verify** `npm run check` — Expected: PASS. Then `npm run dev` with a temp data copy: the panel (or its empty state) shows. No browser → "needs a human".
- [x] **Step 4: Docs.** `docs/ARCHITECTURE.md` §4.1 `mastery.ts`; §4.4 library row "Your chords". Tick item 3 in `TODO.md`.
- [x] **Step 5: Commit** `feat(web): Your chords panel and You can play this badges`
