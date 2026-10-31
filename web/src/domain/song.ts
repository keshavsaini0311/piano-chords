// The stored song. Always in the original key: transposing is a view, never an edit.
import type { Chord } from './music';

export type ChordEvent = {
  id: string;
  start: number; // seconds
  end: number;
  chord: Chord;
  confidence?: number; // 0..1 from the detector; low values are "unsure"
  alternatives?: Chord[]; // detector's runner-up guesses
};

export type LyricLine = { id: string; start: number; end: number; text: string };

export type Song = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  originalKey: string;
  beats: number[];
  chords: ChordEvent[]; // sorted by start, never overlapping
  lyrics: LyricLine[]; // may be empty
  anchors: Record<string, { lineId: string; charIndex: number }>; // manual chord placement over lyrics
};

export const MIN_CHORD_SEC = 0.1;

/** Invariant check in one place. Empty list means the song is valid. */
export function validate(song: Song): string[] {
  const problems: string[] = [];
  song.chords.forEach((c, i) => {
    if (c.start >= c.end) problems.push(`${c.id}: start ${c.start} is not before end ${c.end}`);
    const prev = song.chords[i - 1];
    if (prev && c.start < prev.end - 1e-9) problems.push(`${c.id}: overlaps ${prev.id}`);
  });
  return problems;
}
