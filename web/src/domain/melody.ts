// The melody as notes to play: transposed, made easy, and placed on your keyboard. Like chords, the
// stored melody is in the original key; everything here is a view.
import type { NoteEvent } from './song';
import { isBlackKey, type KeyRange } from './voicing';

export const EASY_MIN_SEC = 0.15; // quicker notes are runs and ornaments: easy mode leaves them out
const REST_SHARE = 0.25; // a beat sung for less than this share of it is a rest

/** Easiest first: one hand position (on the beat, within 12 keys) → on the beat → fewer notes → as sung. */
export type MelodyLevel = 'hand' | 'beat' | 'easy' | 'full';
export type MelodyView = { semitones: number; level: MelodyLevel; fitTo: KeyRange | null; beats: number[] };

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

/** One note per beat, struck on the beat: the note sung longest in it. A note sung across beats stays one
held note. Needs the notes in order and not overlapping, which a sung line is. */
function onePerBeat(notes: NoteEvent[], beats: number[]): NoteEvent[] {
  const out: NoteEvent[] = [];
  let first = 0;
  let previous: NoteEvent | null = null;
  for (let i = 0; i + 1 < beats.length; i++) {
    const [a, b] = [beats[i], beats[i + 1]];
    while (first < notes.length && notes[first].end <= a) first++;
    let best: NoteEvent | null = null;
    let longest = REST_SHARE * (b - a);
    for (let j = first; j < notes.length && notes[j].start < b; j++) {
      const sung = Math.min(b, notes[j].end) - Math.max(a, notes[j].start);
      if (sung >= longest) [best, longest] = [notes[j], sung];
    }
    if (best && best === previous) out[out.length - 1].end = b;
    else if (best) out.push({ start: a, end: b, midi: best.midi });
    previous = best;
  }
  return out;
}

/** The 12 keys inside the range that already hold the most notes, so the fewest have to move. */
function bestOctave(notes: NoteEvent[], r: KeyRange): KeyRange {
  let best = { low: r.low, high: Math.min(r.high, r.low + 11) };
  let bestCount = -1;
  for (let low = r.low; low + 11 <= r.high; low++) {
    const count = notes.filter((x) => x.midi >= low && x.midi <= low + 11).length;
    if (count > bestCount) [best, bestCount] = [{ low, high: low + 11 }, count];
  }
  return best;
}

export function melodyNotes(notes: NoteEvent[], view: MelodyView): NoteEvent[] {
  let out = notes.map((x) => ({ ...x, midi: x.midi + view.semitones }));
  if (view.level === 'easy') out = out.filter((x) => x.end - x.start >= EASY_MIN_SEC);
  if (view.level === 'beat' || view.level === 'hand') out = onePerBeat(out, view.beats);
  if (!view.fitTo) return out;
  out = fitMelody(out, view.fitTo);
  if (view.level !== 'hand') return out;
  // ponytail: folding into one octave turns a step across its edge into a leap; the window is picked to need the fewest folds
  const octave = bestOctave(out, view.fitTo);
  return out.map((x) => ({ ...x, midi: foldInto(x.midi, octave) }));
}

/** Every transposition from -5 to +6, fewest tune notes on black keys first (nearest the original on a tie). */
export function rankMelodyKeys(notes: NoteEvent[]): { semitones: number; blackKeyNotes: number }[] {
  const ranked = [];
  for (let semitones = -5; semitones <= 6; semitones++) {
    ranked.push({ semitones, blackKeyNotes: notes.filter((x) => isBlackKey(x.midi + semitones)).length });
  }
  return ranked.sort((a, b) => a.blackKeyNotes - b.blackKeyNotes || Math.abs(a.semitones) - Math.abs(b.semitones));
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
