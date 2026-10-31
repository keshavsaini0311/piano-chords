// Turns a chord into keys to press. Voicers are interchangeable strategies; the UI picks one by id.
import { chordPitchClasses, formatChord, simplifyChord, transposeChord, type Chord, type Difficulty, type PitchClass } from './music';

export type KeyRange = { low: number; high: number }; // MIDI note numbers, inclusive
export type Voicing = number[]; // sorted MIDI notes
export type Voicer = (chord: Chord, previous: Voicing | null, range: KeyRange) => Voicing;
export type VoicingId = 'nearest' | 'root';

const MIDDLE_C = 60;
const BLACK_KEYS = new Set<PitchClass>([1, 3, 6, 8, 10]);

export const isBlackKey = (midi: number) => BLACK_KEYS.has((midi % 12) as PitchClass);

/** Semitones the hand travels between two voicings. Same size: pair notes in order; else nearest note. */
export function movement(from: Voicing, to: Voicing): number {
  if (!from.length || !to.length) return 0;
  if (from.length === to.length) return to.reduce((sum, n, i) => sum + Math.abs(n - from[i]), 0);
  return to.reduce((sum, n) => sum + Math.min(...from.map((p) => Math.abs(n - p))), 0);
}

/** Stacks pitch classes upward starting at `base` (a MIDI note with the first pitch class). */
function stackFrom(base: number, pitchClasses: PitchClass[]): Voicing {
  const notes = [base];
  for (const pc of pitchClasses.slice(1)) {
    let n = notes[notes.length - 1] + 1;
    while (n % 12 !== pc) n++;
    notes.push(n);
  }
  return notes;
}

function fitInRange(v: Voicing, range: KeyRange): Voicing {
  let notes = v;
  while (notes[notes.length - 1] > range.high && notes[0] - 12 >= range.low) notes = notes.map((n) => n - 12);
  while (notes[0] < range.low && notes[notes.length - 1] + 12 <= range.high) notes = notes.map((n) => n + 12);
  return notes;
}

/** Root at the bottom, placed nearest the previous chord's lowest note (or middle C). */
export const rootPosition: Voicer = (chord, previous, range) => {
  const pcs = chordPitchClasses(chord);
  if (!pcs.length) return [];
  const anchor = previous?.[0] ?? MIDDLE_C;
  const below = anchor - ((anchor - pcs[0] + 120) % 12);
  const root = anchor - below <= below + 12 - anchor ? below : below + 12;
  return fitInRange(stackFrom(root, pcs), range);
};

/** The inversion that moves the hand least from the previous chord, staying inside the range. */
export const nearestInversion: Voicer = (chord, previous, range) => {
  const pcs = chordPitchClasses(chord);
  if (!pcs.length) return [];
  if (!previous?.length) return rootPosition(chord, null, range);
  let best: { voicing: Voicing; cost: number; average: number } | null = null;
  for (let k = 0; k < pcs.length; k++) {
    const rotated = [...pcs.slice(k), ...pcs.slice(0, k)];
    for (let base = range.low; base <= range.high; base++) {
      if (base % 12 !== rotated[0]) continue;
      const voicing = stackFrom(base, rotated);
      if (voicing[voicing.length - 1] > range.high || voicing[voicing.length - 1] - voicing[0] >= 12) continue;
      const cost = movement(previous, voicing);
      const average = voicing.reduce((a, b) => a + b, 0) / voicing.length;
      if (!best || cost < best.cost || (cost === best.cost && average < best.average)) best = { voicing, cost, average };
    }
  }
  return best?.voicing ?? rootPosition(chord, previous, range);
};

export const voicers: Record<VoicingId, Voicer> = { nearest: nearestInversion, root: rootPosition };

/** Every transposition from -5 to +6, easiest first: fewest distinct chords needing a black key. */
export function rankKeys(chords: Chord[], difficulty: Difficulty): { semitones: number; blackKeyChords: number }[] {
  const unique = new Map<string, Chord>();
  for (const c of chords) {
    const simple = simplifyChord(c, difficulty);
    if (simple.kind === 'chord') unique.set(formatChord(simple, 'sharps'), simple);
  }
  const ranked = [];
  for (let semitones = -5; semitones <= 6; semitones++) {
    let blackKeyChords = 0;
    for (const c of unique.values()) {
      if (chordPitchClasses(transposeChord(c, semitones)).some((pc) => BLACK_KEYS.has(pc))) blackKeyChords++;
    }
    ranked.push({ semitones, blackKeyChords });
  }
  return ranked.sort((a, b) => a.blackKeyChords - b.blackKeyChords || Math.abs(a.semitones) - Math.abs(b.semitones));
}
