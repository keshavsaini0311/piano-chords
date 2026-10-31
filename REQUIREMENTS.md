# piano-chords: requirements (draft)

A personal chord-chart player for learning songs on a Casio SA-51 (32 mini keys).
Takes the best of Ultimate Guitar and Chordify and adds a piano view.

Status: gathering requirements. Nothing is built yet.

## Why

- Chordify's transpose is limited on the free tier.
- Ultimate Guitar has no chart for some songs he wants (e.g. *Pal Pal*, AFUSIC with Talwiinder).
- Neither one shows how to play a chord on a piano with only 32 keys.

## Layout (decided)

```
+------------------------------------------------+
|  Am        F         C          G              |
|  lyric line one goes here...                   |
|  Am        F         C          G              |
|  lyric line two goes here...                   |   <- chart: chords above lyrics
|                                                |
|  [ piano diagram for the current chord ]       |   <- (to confirm)
+------------------------------------------------+
|  > play  ||  0:42 / 3:15  [transpose -/+]      |   <- song player at the bottom
+------------------------------------------------+
```

## What we take from each

| From Ultimate Guitar | From Chordify |
|---|---|
| Chords written above the lyric lines | The song plays inside the page |
| Readable song structure (verse, chorus) | The current chord is highlighted in time with the audio |
| Transpose, auto-scroll | Transpose, loop a section, slow it down |

## Our additions

- **Free transpose to any key.** Example: Fm to Am, so every chord is on white keys.
- **Piano notes for each chord**, drawn on a keyboard that matches the SA-51's 32-key range.

## Decided (31 Oct 2026)

- **Core flow:** paste a YouTube link → chords are detected automatically from the audio →
  edit any wrong chord → play along with the chart. Transpose works throughout.
- **UI and UX are the top priority**, above extra features.

## Data sources (research, 31 Oct 2026)

- Ultimate Guitar and Chordify have no public API. They are out as data sources.
- Chords from audio: open-source models run locally. Candidates are ChordMiniApp
  (chords + beats, Python backend), lv-chordia (file → JSON chords with timestamps),
  and autochord (simpler, ~67% accurate).
- Lyrics with timestamps: LRCLIB (free API, each line timestamped). Coverage of
  Hindi/Punjabi songs is unverified.
- Transpose and piano notes: done in code with a small music-theory library. No API needed.
- Detection will be wrong on some chords, so editing is a must-have, not a nice-to-have.

## Design patterns worth borrowing (research)

- **Chord highlight in time with the audio** (Chordify, Moises): the current chord is lit
  up, and the view follows playback.
- **Two views of the same song:** chords over lyrics (UG) and a chord grid of
  beats and bars (Chordify / Moises Grid Mode). Moises lets you combine the grid with lyrics.
- **Difficulty levels** (Moises): easy / medium / advanced chord vocabulary. An easy
  setting fits a beginner (simplify 7ths and sus chords to plain triads).
- **Chord popover** (LeadSheet extension for UG): hover or tap a chord to see a small
  diagram, plus a toggle that shows every chord in the song as a diagram strip.
  Transposing updates the diagrams too.
- **Piano chord reference** (Easy Piano Chords): a keyboard with the chord's notes
  highlighted and labelled.
- **Dark media bar** at the bottom with the chord timeline (Chordify's editor).

## Open questions (to settle with Keshav)

1. **Platform:** a local web app in the browser (my default guess), or something else.
2. **Piano view:** chord notes only, or a suggested hand position and fingering for
   beginners as well.
3. **Song library:** save multiple songs locally, or open one song at a time.
4. **Must-have list for v1 vs. later.**

## Non-goals (draft)

- No public hosting of copyrighted charts or audio. It is for personal use only.
- No accounts and no sharing.
