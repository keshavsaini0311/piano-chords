# piano-chords design system

How the app looks, reads and behaves, so new screens fit without a redesign. Tokens and base
components live in `web/src/theme.css`; layouts and feature styles in `web/src/app.css`.

## 1. Tokens (`theme.css`)

Every colour is a token on `.pc`, defined twice: light, and dark under
`@media (prefers-color-scheme: dark) { .pc[data-theme="auto"] { … } }`. **A new colour means a new
token in both blocks. No raw hex in `app.css`.**

| Token | Means | Use for |
|---|---|---|
| `--paper` / `--surface` / `--surface2` | page / cards and bars / insets, hovers, tracks | backgrounds |
| `--ink` / `--muted` | main text / secondary text, captions | text |
| `--line` / `--line2` | hairlines / control borders | borders |
| `--now` (+ `--on-now`, `--now-soft`) | **what you play right now**: active chord, playhead, current chart line | the single most important thing on screen |
| `--next` (+ `--next-soft`) | what's coming; focus rings; neutral "good" | upcoming chord, Good grade, focus |
| `--edit` (+ `--edit-soft`) | editing: selection, drag handles | anything that changes the song |
| `--unsure` | needs a look: low-confidence chords, Late grade, "learning" | warnings, not errors |
| `--right` / `--wrong` (+ `-soft`) | grades from the mic: hit / miss | verdicts, mastery, scores |
| `--bar`, `--bar-ink`, `--bar-muted` | the always-dark player bar | `.bar` only |
| `--ivory`, `--ebony`, `--key-line` | piano keys | `ui/Keyboard` |
| `--font-ui` / `--font-chord` | Instrument Sans / Bricolage Grotesque | UI text / chord symbols (`.chord-name`) |

Rules:
- **One `--now` thing per region.** If two things compete for orange, one of them is wrong.
- **Grades use `--right` / `--next` / `--unsure` / `--wrong`** in that order
  (Perfect·Great / Good / Late / Missed). Mastery levels reuse them: mastered `--right`,
  solid `--next`, learning `--unsure`, new `--muted`.
- Soft variants (`-soft`) are fills behind text in the same hue; never put text on a solid accent
  except `--on-now` on `--now`.

## 2. Type and spacing

- Base 15px / 1.45 (`.pc`). Captions and secondary text `13px` (`.small`, `.caption`, `.section-title`).
- Chord symbols always through `<ChordName label=… />` (`ui/ChordName.tsx`): it applies
  `--font-chord` and real ♭/♯ glyphs, and keeps the plain label for screen readers.
- Numbers that change (time, scores) use tabular figures (already set on `.pc`).
- Spacing steps: 4 · 6 · 8 · 10 · 12 · 16 · 20 · 24 px. Radii: 8 (small chips, blocks),
  10 (buttons, fields), 12 (popovers, list rows), 16 (dialogs), 999 (pills).
- Touch targets ≥ 40px tall (`.btn`, `.ibtn`, `.seg button` ≥ 34px inside its 40px track).

## 3. Components to reuse (don't restyle them per feature)

| Need | Use | Notes |
|---|---|---|
| A button | `.btn` · `.btn-primary` (one per view, the main action) · `.ibtn` (icon only, needs `aria-label`) | on the dark bar, `.bar .btn` styles apply automatically |
| A toggle | `.btn` with `aria-pressed` | pressed state comes from the attribute; never a separate "active" class |
| Pick one of a few | `.seg` with `<button aria-pressed>` children | e.g. Undo/Redo group, presets |
| A quiet secondary action | `.chip-quiet` (dashed pill) or `.link-button` | "8 flagged · Next ›" |
| Text input | `.field` | |
| A small anchored panel | `.chord-popover` pattern: absolute, `--surface`, `--line2` border, radius 12, shadow `0 10px 28px rgba(0,0,0,.18)` | closes on Escape and outside click |
| A summary that needs attention | `<dialog>` opened with `showModal()`, styled like `.run-card` | native Escape and focus trap; `onClose` updates the store |
| A strip of live status under the timeline | the `.practice` strip pattern: one row, wraps on narrow screens, `--surface`, bottom hairline | keep to one line on desktop |
| A section label | `.section-title` | sentence case |
| A chord | `<ChordName>`; a keyboard drawing: `<Keyboard>` from `ui/` | |

## 4. Layout

- **Studio:** sticky top (`.studio-top`: header, timeline, edit bar, optional practice strip) ·
  scrolling chart (`.studio-main`) · sticky dark player bar (`.player-bar`).
  New per-song controls go in the **header** if they're modes (Check my playing), in the
  **player bar** if they're about audio (speed, volume, mix), in the **practice strip** if they
  only matter while practising.
- **Library:** header with add-song · tabs (All songs, playlists) · song grid (`.song-grid` of `.song-card`).
- Everything wraps down to ~360px wide: use `flex-wrap` and `min-width: 0`, never fixed widths
  wider than the screen.

## 5. Behaviour

- **Keyboard first.** Every frequent action has a single-key shortcut, registered in
  `features/studio/useShortcuts.ts` (ignored while typing) and shown in the control's `title`,
  e.g. `title="Wait for me (W)"`. Taken: Space, ← →, [ ], L, M, Esc, J K, ⌘Z / ⇧⌘Z.
  Reserved by the roadmap: W (wait for me), S (loop this section).
- **State is shown, not hidden:** toggles use `aria-pressed`; anything live (verdicts, waiting)
  sits in an `aria-live="polite"` element.
- **Motion:** 100–200 ms ease-out, and every animation has a
  `@media (prefers-reduced-motion: reduce)` override that turns it off.
- **Empty states teach the next step** in one sentence ("Practise with Check my playing to see
  your chords here."), never a blank panel.
- **Errors say what to do** ("The mic is blocked. Allow it from the icon in the address bar.").
- Destructive actions use `confirm()` only where the existing code already does (deleting a
  song); everything else is undoable instead.

## 6. Copy

- Plain words, sentence case, second person: "Play it on your piano…", "Loop this change".
- Name things by what the player experiences: "Backing track", not "Mute other stem".
- Numbers with units: "0.6 s", "92 BPM", "75% speed".
- No exclamation marks except real celebrations ("New best!", "Clean run!").
