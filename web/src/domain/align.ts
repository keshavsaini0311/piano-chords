// Places chords above lyric words. LRCLIB only times whole lines, so the position inside a line
// is estimated from time; a manual anchor always wins.
// ponytail: proportional estimate; swap for word-level timing behind the same signature later.
import type { ChordEvent, LyricLine, Song } from './song';

export type PlacedChord = { event: ChordEvent; charIndex: number };
export type ChartRow =
  | { kind: 'lyric'; line: LyricLine; chords: PlacedChord[] }
  | { kind: 'instrumental'; chords: ChordEvent[] };

function wordStarts(text: string): number[] {
  const starts: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] !== ' ' && (i === 0 || text[i - 1] === ' ')) starts.push(i);
  return starts.length ? starts : [0];
}

function estimateCharIndex(event: ChordEvent, line: LyricLine): number {
  const ratio = (event.start - line.start) / Math.max(line.end - line.start, 1e-6);
  const target = ratio * line.text.length;
  let best = 0;
  for (const start of wordStarts(line.text)) if (Math.abs(start - target) < Math.abs(best - target)) best = start;
  return best;
}

export function alignChart(song: Song): ChartRow[] {
  const sung = song.lyrics.filter((l) => l.text.trim() !== '');
  const placed = new Map<string, PlacedChord[]>(sung.map((l) => [l.id, []]));
  const loose: ChordEvent[] = [];

  for (const event of song.chords) {
    const anchor = song.anchors[event.id];
    if (anchor && placed.has(anchor.lineId)) {
      placed.get(anchor.lineId)!.push({ event, charIndex: anchor.charIndex });
      continue;
    }
    const line = sung.find((l) => l.start <= event.start && event.start < l.end);
    if (line) placed.get(line.id)!.push({ event, charIndex: estimateCharIndex(event, line) });
    else loose.push(event);
  }

  // Walk lines and loose chords in time order; consecutive loose chords share one instrumental row.
  const rows: ChartRow[] = [];
  let looseIndex = 0;
  const flushLooseBefore = (time: number) => {
    const group: ChordEvent[] = [];
    while (looseIndex < loose.length && loose[looseIndex].start < time) group.push(loose[looseIndex++]);
    if (group.length) rows.push({ kind: 'instrumental', chords: group });
  };
  for (const line of sung) {
    flushLooseBefore(line.start);
    const chords = placed.get(line.id)!.sort((a, b) => a.charIndex - b.charIndex || a.event.start - b.event.start);
    rows.push({ kind: 'lyric', line, chords });
  }
  flushLooseBefore(Infinity);
  return rows;
}
