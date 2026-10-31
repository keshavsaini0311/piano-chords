// Turns aligned chart rows into lead-sheet lines. Chord-only stretches become bars of four, and a
// line that repeats is written once with a repeat count (| Fm | Ab | Db | Bbm | ×10), the way a
// printed lead sheet does it. Silence (N.C.) is left out.
import type { ChartRow } from './align';
import { formatChord } from './music';
import type { ChordEvent } from './song';

export type SheetLine =
  | { kind: 'lyric'; row: Extract<ChartRow, { kind: 'lyric' }>; ids: string[] }
  | { kind: 'bars'; chords: ChordEvent[]; repeats: number; ids: string[]; columnOf: Map<string, number> };

const storedLabel = (e: ChordEvent) => formatChord(e.chord, 'sharps');

/** keyOf decides when two lines count as the same: pass the on-screen label so lines that look identical fold. */
export function toLeadSheet(chart: ChartRow[], perLine = 4, keyOf: (e: ChordEvent) => string = storedLabel): SheetLine[] {
  const signature = (events: ChordEvent[]) => events.map(keyOf).join(' ');
  const lines: SheetLine[] = [];
  for (const row of chart) {
    if (row.kind === 'lyric') {
      lines.push({ kind: 'lyric', row, ids: row.chords.map((p) => p.event.id) });
      continue;
    }
    const sounding = row.chords.filter((e) => e.chord.kind !== 'none');
    for (let i = 0; i < sounding.length; i += perLine) {
      const chunk = sounding.slice(i, i + perLine);
      const previous = lines[lines.length - 1];
      if (previous?.kind === 'bars' && previous.chords.length === chunk.length && signature(previous.chords) === signature(chunk)) {
        previous.repeats += 1;
        chunk.forEach((e, col) => {
          previous.ids.push(e.id);
          previous.columnOf.set(e.id, col);
        });
      } else {
        lines.push({ kind: 'bars', chords: chunk, repeats: 1, ids: chunk.map((e) => e.id), columnOf: new Map(chunk.map((e, col) => [e.id, col])) });
      }
    }
  }
  return lines;
}
