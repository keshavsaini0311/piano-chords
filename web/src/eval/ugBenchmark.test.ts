/// <reference types="node" />
// Benchmark: our detected chords vs the top-voted Ultimate Guitar chart, using the app's own code.
// Skipped by default. Run after server/eval/fetch_ug.py:
//   UG_EVAL_DATA=../server/data npx vitest run src/eval
// Writes <data>/eval/report.md (git-ignored, like the charts it is built from).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { estimateKey, formatChord, parseChord, simplifyChord, transposeChord, transposeKey, displayChord, type Chord } from '../domain/music';
import { fromWire, type WireSong } from '../services/api';

const DATA = process.env.UG_EVAL_DATA;
const triad = (c: Chord) => simplifyChord(c, 'easy');
const name = (c: Chord) => formatChord(c, 'sharps');
const MIN_SHARE = 0.02; // our chords playing under 2% of the song are noise for set comparison

type Manifest = Record<string, { status: string; songId?: string; ug?: { chords: string[]; capo: number; tonality: string; url: string; votes: number } }>;

/** UG's own spelling of a chord, reduced to a triad: keeps their root text (A# vs Bb). */
function ugTriadLabel(label: string): string | null {
  const root = /^[A-G][#b]?/.exec(label)?.[0];
  const chord = parseChord(label);
  if (!root || chord.kind === 'none') return null;
  const q = triad(chord).kind === 'chord' ? (triad(chord) as Extract<Chord, { kind: 'chord' }>).quality : '';
  return root + q;
}

function jaccard(a: Set<string>, b: Set<string>) {
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / (new Set([...a, ...b]).size || 1);
}

function bigrams(seq: string[]) {
  const collapsed = seq.filter((x, i) => x !== seq[i - 1]);
  return new Set(collapsed.slice(1).map((x, i) => `${collapsed[i]}>${x}`));
}

function sameKey(a: string, b: string) {
  return a.replace('#', '♯') === b.replace('#', '♯') || transposeKey(a, 0) === transposeKey(b, 0);
}

describe.skipIf(!DATA)('Ultimate Guitar benchmark', () => {
  it('compares every imported song with its UG chart', () => {
    const manifest: Manifest = JSON.parse(readFileSync(join(DATA!, 'eval', 'manifest.json'), 'utf8'));
    const rows: string[] = [];
    const totals = { songs: 0, j0: 0, jBest: 0, time: 0, changes: 0, keyExact: 0, keyRelative: 0, keyKnown: 0, shifted: 0, spelling: 0, pitch: 0 };

    for (const [title, entry] of Object.entries(manifest)) {
      const songFile = entry.songId && join(DATA!, 'songs', entry.songId, 'song.json');
      if (!entry.ug || !songFile || !existsSync(songFile) || !entry.status.startsWith('done')) continue;
      const song = fromWire(JSON.parse(readFileSync(songFile, 'utf8')) as WireSong);
      const { capo, chords: ugLabels, tonality } = entry.ug;

      // UG chart chords as they sound (shape + capo), as triads
      const ugSounding = ugLabels.map(parseChord).filter((c) => c.kind === 'chord').map((c) => triad(transposeChord(c, capo)));
      const ugSet = new Set(ugSounding.map(name));

      // Ours, weighted by playing time
      const seconds = new Map<string, number>();
      for (const e of song.chords) {
        const t = triad(e.chord);
        if (t.kind === 'chord') seconds.set(name(t), (seconds.get(name(t)) ?? 0) + e.end - e.start);
      }
      const total = [...seconds.values()].reduce((a, b) => a + b, 0) || 1;
      const ourMain = [...seconds].filter(([, s]) => s / total >= MIN_SHARE).map(([n]) => n);

      // Best transposition between the recording and the chart (0 = same key)
      const shiftSet = (names: string[], s: number) => new Set(names.map((n) => name(transposeChord(parseChord(n), s))));
      let best = { shift: 0, j: jaccard(shiftSet(ourMain, 0), ugSet) };
      for (let s = -5; s <= 6; s++) {
        const j = jaccard(shiftSet(ourMain, s), ugSet);
        if (j > best.j + 1e-9) best = { shift: s, j };
      }
      const j0 = jaccard(shiftSet(ourMain, 0), ugSet);

      // Share of our playing time spent on chords the chart uses (after the best shift)
      const timeAgree = [...seconds].filter(([n]) => ugSet.has(name(transposeChord(parseChord(n), best.shift)))).reduce((a, [, s]) => a + s, 0) / total;

      // Chord changes: how many of the chart's changes (A>B) we also detect
      const ourSeq = song.chords.map((e) => triad(e.chord)).filter((c) => c.kind === 'chord').map((c) => name(transposeChord(c, best.shift)));
      const ugChanges = bigrams(ugSounding.map(name));
      const ourChanges = bigrams(ourSeq);
      const changeRecall = [...ugChanges].filter((b) => ourChanges.has(b)).length / (ugChanges.size || 1);

      // Key: our estimate vs UG's stated (sounding) key
      const ourKey = estimateKey(song.chords);
      const ourKeyAligned = transposeKey(ourKey, best.shift);
      const known = !!tonality;
      const exact = known && sameKey(ourKeyAligned, tonality);
      const relative = known && !exact && (sameKey(transposeKey(ourKeyAligned.endsWith('m') ? ourKeyAligned.slice(0, -1) : ourKeyAligned + 'm', ourKeyAligned.endsWith('m') ? 3 : -3), tonality));

      // Transpose check: our pipeline turning the chart's sounding chords back into its capo shapes.
      // Pitch must always match; spelling matches when we pick the same sharps/flats as the chart.
      const shapeKey = transposeKey(tonality || estimateKey(ugSounding.map((c, i) => ({ chord: c, start: i, end: i + 1 }))), -capo);
      const pairs = ugLabels.map((l) => [l, ugTriadLabel(l)] as const).filter(([, t]) => t !== null);
      const unique = [...new Map(pairs.map(([l, t]) => [t, l])).entries()];
      let spellingOk = 0;
      let pitchOk = 0;
      for (const [ugTriad, raw] of unique) {
        const sounding = transposeChord(parseChord(raw), capo);
        const ours = displayChord(sounding, { semitones: -capo, difficulty: 'easy', spelling: 'auto' }, transposeKey(shapeKey, capo));
        if (ours === ugTriad) spellingOk++;
        if (name(parseChord(ours)) === name(triad(parseChord(raw)))) pitchOk++;
      }
      const spelling = spellingOk / (unique.length || 1);
      const pitch = pitchOk / (unique.length || 1);

      totals.songs++;
      totals.j0 += j0;
      totals.jBest += best.j;
      totals.time += timeAgree;
      totals.changes += changeRecall;
      totals.shifted += best.shift !== 0 ? 1 : 0;
      totals.spelling += spelling;
      totals.pitch += pitch;
      if (known) {
        totals.keyKnown++;
        totals.keyExact += exact ? 1 : 0;
        totals.keyRelative += relative ? 1 : 0;
      }
      const pct = (x: number) => `${Math.round(x * 100)}%`;
      rows.push(
        `| ${title} | ${capo} | ${tonality || '?'} | ${ourKey} | ${best.shift > 0 ? '+' : ''}${best.shift} | ${pct(j0)} | ${pct(best.j)} | ${pct(timeAgree)} | ${pct(changeRecall)} | ${exact ? 'yes' : relative ? 'relative' : known ? 'no' : '?'} | ${pct(pitch)} | ${pct(spelling)} |`,
      );
    }

    const n = totals.songs || 1;
    const avg = (x: number) => `${Math.round((x / n) * 100)}%`;
    const report = [
      `# Chord detection vs Ultimate Guitar (${totals.songs} songs)`,
      '',
      'Triads only (Simple mode). UG chords are taken as they sound (shape + capo).',
      '',
      '| Metric | Average |',
      '|---|---|',
      `| Chord set overlap, as recorded (Jaccard) | ${avg(totals.j0)} |`,
      `| Chord set overlap after best key shift | ${avg(totals.jBest)} |`,
      `| Our playing time on chords the chart uses | ${avg(totals.time)} |`,
      `| Chart's chord changes we also detect | ${avg(totals.changes)} |`,
      `| Songs where the recording and chart differ in key | ${totals.shifted} of ${totals.songs} |`,
      `| Key matches UG's stated key | ${totals.keyExact} of ${totals.keyKnown} (relative major/minor: ${totals.keyRelative}) |`,
      `| Transpose to capo shapes: right notes | ${avg(totals.pitch)} |`,
      `| Transpose to capo shapes: same spelling as UG | ${avg(totals.spelling)} |`,
      '',
      '| Song | Capo | UG key | Our key | Shift | Overlap | Overlap (shifted) | Time on chart chords | Changes found | Key | Transpose notes | Spelling |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|',
      ...rows,
    ].join('\n');
    writeFileSync(join(DATA!, 'eval', 'report.md'), report);
    console.log(report);
    expect(totals.songs).toBeGreaterThan(0);
  });
});
