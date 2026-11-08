// Intro / Verse / Chorus / Outro found from repeated lyrics.
// ponytail: lyrics only; songs without lyrics get no sections. Chord-repeat detection is the upgrade.
import { activeChordIndex } from './timing';
import type { Song } from './song';

export type Section = { id: string; label: string; start: number; end: number };

const wordsOf = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu));

/** Same line: at least 80% of the shorter line's distinct words appear in the other. */
function same(a: Set<string>, b: Set<string>): boolean {
  const [short, long] = a.size <= b.size ? [a, b] : [b, a];
  if (short.size === 0) return false;
  const hits = [...short].filter((w) => long.has(w)).length;
  return hits * 5 >= short.size * 4;
}

export function findSections(song: Song): Section[] {
  const lines = song.lyrics.filter((l) => l.text.trim()).sort((a, b) => a.start - b.start);
  const n = lines.length;
  if (n < 8) return [];
  const words = lines.map((l) => wordsOf(l.text));
  const match = (i: number, j: number, k: number) => {
    for (let t = 0; t < k; t++) if (!same(words[i + t], words[j + t])) return false;
    return true;
  };

  // Chorus: the repeated run of lines that covers the most sung time.
  let best: { starts: number[]; k: number; total: number } | null = null;
  for (let k = Math.min(8, Math.floor(n / 2)); k >= 2; k--) {
    for (let i = 0; i + k <= n; i++) {
      const starts = [i];
      for (let j = i + k; j + k <= n; ) {
        if (match(i, j, k)) {
          starts.push(j);
          j += k;
        } else j++;
      }
      if (starts.length < 2) continue;
      const total = starts.reduce((sum, o) => sum + lines[o + k - 1].end - lines[o].start, 0);
      // Loop order is k descending then i ascending, so strict > keeps the larger k, then the earlier i, on ties.
      if (!best || total > best.total) best = { starts, k, total };
    }
  }
  if (!best) return [];

  // Walk the lines: each occurrence is a Chorus, each run of other lines a Verse.
  const parts: { label: string; line: number }[] = [];
  for (let i = 0; i < n; ) {
    const chorus = best.starts.includes(i);
    parts.push({ label: chorus ? 'Chorus' : 'Verse', line: i });
    i += chorus ? best.k : 1;
    while (!chorus && i < n && !best.starts.includes(i)) i++;
  }

  const snap = (t: number) => {
    const c = activeChordIndex(song.chords, t);
    return c >= 0 ? song.chords[c].start : t;
  };
  const marks = parts.map((p) => ({ label: p.label, start: snap(lines[p.line].start) }));
  const firstChord = song.chords[0]?.start ?? lines[0].start;
  if (marks[0].start - firstChord >= 2) marks.unshift({ label: 'Intro', start: firstChord });
  const lastSung = lines[n - 1].end;
  const songEnd = song.chords.at(-1)?.end ?? lastSung;
  if (songEnd - lastSung >= 4) marks.push({ label: 'Outro', start: lastSung });

  // A section that starts where the next one does (both snapped to one long chord) is empty: drop it.
  const kept = marks.filter((m, i) => m.start < (marks[i + 1]?.start ?? songEnd));
  return kept.map((m, i) => ({ id: `s${i}`, label: m.label, start: m.start, end: kept[i + 1]?.start ?? songEnd }));
}

export function sectionAt(sections: Section[], time: number): Section | null {
  return sections.find((s) => time >= s.start && time < s.end) ?? null;
}
