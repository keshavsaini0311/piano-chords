# Section Loops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Start from the [runbook](2026-11-07-overnight-runbook.md).

**Goal:** Songs with lyrics get Intro / Verse / Chorus / Outro sections on the timeline; click one, or press `S`, to loop it.

**Architecture:** One pure function, `findSections(song)`, in `domain/sections.ts`, derived in the browser, never stored. A chorus is a run of lyric lines that repeats; sung stretches between choruses are verses. Lyrics are the reliable signal: many pop songs loop the same four chords through verse and chorus. Songs without lyrics get no sections (a marked shortcut). No server change.

**Tech Stack:** TypeScript, Vitest, React.

**Spec:** `docs/ROADMAP-DESIGN.md` §4.2.

## Global Constraints

- Everything in the runbook §2. Smallest diff that works.
- Needs at least **8** sung lines (non-empty `text`), else `[]`.
- Two lines are "the same" when ≥ **80%** of the shorter line's distinct words (lowercase, letters and digits only) appear in the other.
- Labels (exact): `Intro`, `Verse`, `Chorus`, `Outro`.
- A section starts at the start of the chord sounding at its first line's `start` (`activeChordIndex`), or at the line's `start` when no chord is sounding, so loops begin on a chord change.
- Copy (exact): section button title `Loop {label} (S)`.
- Mark the no-lyrics limit in `sections.ts`: `// ponytail: lyrics only; songs without lyrics get no sections. Chord-repeat detection is the upgrade.`

## Review Focus

1. **No lyrics, or fewer than 8 lines** → `[]`, no band. Pinned in Task 1.
2. **No repeated run** (every line different) → `[]`. Pinned in Task 1.
3. **Lyric lines that differ by a word** across choruses still match. Pinned in Task 1.
4. **Sections are contiguous and in time order**, so the band has no gaps or overlaps. Pinned in Task 1.
5. **Clicking a section that's already looping** turns the loop off. Pinned in Task 2 (`loopSection` toggles).

---

### Task 1: `findSections` from lyrics

**Files:**
- Create: `web/src/domain/sections.ts`, `web/src/domain/sections.test.ts`

**Interfaces:**
- Consumes: `Song` (`domain/song.ts`), `activeChordIndex` (`domain/timing.ts`).
- Produces:
  - `export type Section = { id: string; label: string; start: number; end: number }` (`id` = `s0`, `s1`… in time order)
  - `export function findSections(song: Song): Section[]`
  - `export function sectionAt(sections: Section[], time: number): Section | null`

Algorithm (the tests don't pin every choice):
1. `lines` = sung lines in time order; fewer than 8 → `[]`.
2. Chorus run: for `k` from `min(8, floor(lines / 2))` down to 2, for each start `i`, collect every later non-overlapping start `j ≥ i + k` (left to right) where lines `i+t` and `j+t` are the same for all `t < k`. Each `(i, k)` with ≥ 2 occurrences is a candidate. Pick the one with the largest total sung time (sum of last line `end` − first line `start` over occurrences); ties → larger `k`, then earlier `i`. None → `[]`.
3. Each occurrence is a `Chorus`; each maximal run of other lines is a `Verse`.
4. Starts snap as in Global Constraints. Each section ends where the next starts. If the first section starts ≥ 2 s after the first chord's start, an `Intro` covers the time before it. The last section ends at the last chord's `end`; if the time after the last sung line's `end` is ≥ 4 s, it becomes an `Outro`.

- [x] **Step 1: Write the failing tests** (invented lyric text; a helper builds a song whose chords are one repeating 4-chord loop):

```ts
it('names verses and choruses even when the chords never change', () => expect(findSections(song).map((s) => s.label)).toEqual(['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Outro']));
it('choruses match despite a changed word', () => { /* second chorus has one word different per line */ expect(labels).toContain('Chorus'); });
it('too few lines or no repeats, no sections', () => { expect(findSections(shortSong)).toEqual([]); expect(findSections(allDifferent)).toEqual([]); });
it('sections are contiguous and start on chord changes', () => { const s = findSections(song); s.slice(1).forEach((x, i) => expect(x.start).toBe(s[i].end)); expect(song.chords.some((c) => c.start === s[1].start)).toBe(true); });
it('sectionAt', () => { const s = findSections(song); expect(sectionAt(s, s[2].start + 0.1)?.label).toBe('Chorus'); });
```
- [x] **Step 2: Run** `cd web && npx vitest run src/domain/sections.test.ts` — Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — Expected: PASS.
- [x] **Step 5: Commit** `feat(web): find verse and chorus from repeated lyrics`

### Task 2: Section band on the timeline, `S`, docs

**Files:**
- Modify: `web/src/features/timeline/Timeline.tsx`, `web/src/features/player/PlayerBar.tsx`, `web/src/features/studio/useShortcuts.ts`, `web/src/app.css`, `docs/ARCHITECTURE.md`, `TODO.md`

**Interfaces:**
- Consumes: `findSections`, `sectionAt` (Task 1).
- Produces: `export function loopSection(section: Section)` in `PlayerBar.tsx` next to `toggleLoop` — sets the loop to the section and seeks to its start; if that exact loop is already on, clears it.

- [x] **Step 1: Band.** In `Timeline`, `const sections = useMemo(() => findSections(song), [song])`. A `.section-lane` row above `.chord-lane`, positioned with the same `px()` as chord blocks: one `<button className="section-block">` per section with its label, title `Loop {label} (S)`, `aria-pressed` when the current loop equals it, `onClick={() => !justPanned.current && loopSection(s)}`. Style: height 22px, `--surface2` fill, `--line` border, radius 6, 12px `--muted` text; pressed: `--next-soft` fill, `--next` text. Render nothing when `sections` is empty.
- [x] **Step 2: Shortcut.** `s` → `loopSection(sectionAt(findSections(song), time))` when there is one.
- [x] **Step 3: Verify** `npm run check` — Expected: PASS. Then `npm run dev` with a temp data copy (runbook §2): a song with lyrics shows the band; clicking it toggles the loop on and off; `S` loops. No browser → "needs a human".
- [x] **Step 4: Docs.** `docs/ARCHITECTURE.md` §4.1: `sections.ts` ("verse/chorus from repeated lyrics; derived, never stored"); §4.4 timeline row: section band. Tick item 2 in `TODO.md`.
- [x] **Step 5: Commit** `feat(web): section band on the timeline; S loops a section`
