// The melody as notes to play: transposed, made easy, and placed on your keyboard. Like chords, the
// stored melody is in the original key; everything here is a view.
import type { NoteEvent } from './song';
import { isBlackKey, type KeyRange } from './voicing';

export const EASY_MIN_SEC = 0.15; // quicker notes are runs and ornaments: easy mode leaves them out

export type MelodyView = { semitones: number; easy: boolean; fitTo: KeyRange | null };

const inRange = (midi: number, r: KeyRange) => midi >= r.low && midi <= r.high;

function foldInto(midi: number, r: KeyRange): number {
  let m = midi;
  while (m > r.high && m - 12 >= r.low) m -= 12;
  while (m < r.low && m + 12 <= r.high) m += 12;
  return m;
}

/** Moves the whole tune by octaves to land the most notes on the keys, then folds the rest one by one,
so a phrase only jumps where it would have fallen off the keyboard anyway. */
function fitMelody(notes: NoteEvent[], r: KeyRange): NoteEvent[] {
  let best = 0;
  let bestCount = -1;
  for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
    const count = notes.filter((x) => inRange(x.midi + 12 * k, r)).length;
    if (count > bestCount) [best, bestCount] = [k, count];
  }
  return notes.map((x) => ({ ...x, midi: foldInto(x.midi + 12 * best, r) }));
}

export function melodyNotes(notes: NoteEvent[], view: MelodyView): NoteEvent[] {
  let out = notes.map((x) => ({ ...x, midi: x.midi + view.semitones }));
  if (view.easy) out = out.filter((x) => x.end - x.start >= EASY_MIN_SEC);
  return view.fitTo ? fitMelody(out, view.fitTo) : out;
}

/** Both hands: chords in the bottom octave, the tune above. Under two octaves, both hands share the keys. */
export function handRanges(r: KeyRange): { left: KeyRange; right: KeyRange } {
  if (r.high - r.low < 23) return { left: r, right: r };
  return { left: { low: r.low, high: r.low + 11 }, right: { low: r.low + 12, high: r.high } };
}

/** The keyboard to draw: your range, widened to fit every note, starting and ending on white keys. */
export function displayRange(midis: number[], r: KeyRange): KeyRange {
  let low = Math.min(r.low, ...midis);
  let high = Math.max(r.high, ...midis);
  if (isBlackKey(low)) low--;
  if (isBlackKey(high)) high++;
  return { low, high };
}

// ponytail: linear scan; a few hundred notes per song makes it ~free at 60 fps. Binary search if songs get long.
export const soundingAt = <T extends NoteEvent>(notes: T[], time: number): T[] => notes.filter((x) => x.start <= time && time < x.end);
