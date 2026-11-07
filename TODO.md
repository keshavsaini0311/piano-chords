# To do

Agreed 7 Nov 2026, in this order. Minimum-change design for all five: [docs/ROADMAP-DESIGN.md](docs/ROADMAP-DESIGN.md).
Overnight plans (start with the runbook): [docs/superpowers/plans/2026-11-07-overnight-runbook.md](docs/superpowers/plans/2026-11-07-overnight-runbook.md).

1. ✅ done on overnight/roadmap — **Wait-for-me** · [plan](docs/superpowers/plans/2026-11-07-1-wait-for-me.md): the song stops at each chord change until the mic hears you play it. Gate in the clock, rules in one pure function; wait mode isn't scored.
2. ✅ done on overnight/roadmap — **Section loops** · [plan](docs/superpowers/plans/2026-11-07-2-section-loops.md): Intro / Verse / Chorus / Outro from repeated lyrics, as a band on the timeline; click or `S` loops one.
3. ✅ done on overnight/roadmap — **Chord mastery** · [plan](docs/superpowers/plans/2026-11-07-3-chord-mastery.md): "Your chords" on the library (level per chord from your scores), songs you can play now, the chord to learn next.
4. ✅ done on overnight/roadmap — **Stems** · [plan](docs/superpowers/plans/2026-11-07-4-stems.md): Demucs splits each song after import into Backing track, No vocals and Vocals only mixes; a Mix button switches between them.
5. ✅ done on overnight/roadmap — **Word-level lyric timing** · [plan](docs/superpowers/plans/2026-11-07-5-word-timing.md): the MMS aligner times each word, so chords sit on the sung word.

## Parked

- **Hosting for a few friends:** one container (FastAPI also serving the built web app) behind
  Cloudflare Tunnel + Access (email login, ≤50 users free). Songs shared; settings, playlists and
  practice per user (keyed by the Access email header). Run at home first: YouTube blocks downloads
  from cloud servers. Data: local disk, with an rclone copy to Cloudflare R2.
- Other ideas from the same list: speed trainer, metronome / count-in, practice home with
  spaced repetition, pitch-shifted audio, YouTube video, Ultimate Guitar chords lined up to the
  audio, better key detection, iPad/phone layout, PDF chord sheet.
