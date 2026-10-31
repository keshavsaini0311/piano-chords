// Music theory core: chords as pitch classes, plus the display pipeline.
// Pure functions only. Nothing here knows about React, stores or the server.
import { ChordType, Interval } from 'tonal';

export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
/** Display suffix after the root: '' (major), 'm', '7', 'maj7', 'm7', 'dim', 'sus4', ... */
export type Quality = string;
export type Chord =
  | { kind: 'chord'; root: PitchClass; quality: Quality; bass?: PitchClass }
  | { kind: 'none' };

export type Difficulty = 'easy' | 'full';
export type Spelling = 'auto' | 'sharps' | 'flats';
/** 'mixed' is for C major / A minor: borrowed chords as musicians write them (Bb, Eb, Ab, but F#). */
export type Accidentals = 'sharps' | 'flats' | 'mixed';
export type DisplaySettings = { semitones: number; difficulty: Difficulty; spelling: Spelling };

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const MIXED_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY_ALIASES: Record<string, Quality> = {
  maj: '', M: '', min: 'm', mi: 'm', '-': 'm', M7: 'maj7', min7: 'm7', 'ø': 'm7b5', hdim7: 'm7b5', o: 'dim',
};
const NO_CHORD_LABELS = new Set(['', 'N', 'N.C.', 'NC', 'X']);
// Keys conventionally written with flats; everything else uses sharps.
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);
const MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEY_NAMES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

export const toPitchClass = (n: number): PitchClass => ((((n % 12) + 12) % 12) as PitchClass);

export function noteName(pc: PitchClass, accidentals: Accidentals): string {
  return (accidentals === 'flats' ? FLAT_NAMES : accidentals === 'mixed' ? MIXED_NAMES : SHARP_NAMES)[pc];
}

function parseNote(name: string): PitchClass {
  const shift = name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0;
  return toPitchClass(LETTER_PC[name[0]] + shift);
}

export function parseChord(label: string): Chord {
  const text = label.trim();
  if (NO_CHORD_LABELS.has(text)) return { kind: 'none' };
  const match = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(text);
  if (!match) return { kind: 'none' };
  const [, root, rawQuality, bass] = match;
  const chord: Chord = { kind: 'chord', root: parseNote(root), quality: QUALITY_ALIASES[rawQuality] ?? rawQuality };
  if (bass) chord.bass = parseNote(bass);
  return chord;
}

export function formatChord(chord: Chord, accidentals: Accidentals): string {
  if (chord.kind === 'none') return 'N.C.';
  const bass = chord.bass === undefined ? '' : `/${noteName(chord.bass, accidentals)}`;
  return noteName(chord.root, accidentals) + chord.quality + bass;
}

export function transposeChord(chord: Chord, semitones: number): Chord {
  if (chord.kind === 'none') return chord;
  const moved: Chord = { ...chord, root: toPitchClass(chord.root + semitones) };
  if (chord.bass !== undefined) moved.bass = toPitchClass(chord.bass + semitones);
  return moved;
}

/** The plain triad a quality belongs to: '', 'm', 'dim' or 'aug'. */
function triadOf(quality: Quality): Quality {
  if (quality.startsWith('dim') || quality === 'm7b5') return 'dim';
  if (quality.startsWith('aug') || quality.startsWith('+')) return 'aug';
  if (quality.startsWith('m') && !quality.startsWith('maj')) return 'm';
  return '';
}

export function simplifyChord(chord: Chord, difficulty: Difficulty): Chord {
  if (difficulty === 'full' || chord.kind === 'none') return chord;
  return { kind: 'chord', root: chord.root, quality: triadOf(chord.quality) };
}

/** Pitch classes in the chord, root first. Unknown qualities fall back to their triad. */
export function chordPitchClasses(chord: Chord): PitchClass[] {
  if (chord.kind === 'none') return [];
  let type = ChordType.get(chord.quality);
  if (type.empty) type = ChordType.get(triadOf(chord.quality));
  return type.intervals.map((i) => toPitchClass(chord.root + (Interval.semitones(i) ?? 0)));
}

function parseKey(key: string): { tonic: PitchClass; minor: boolean } {
  const minor = key.endsWith('m');
  return { tonic: parseNote(minor ? key.slice(0, -1) : key), minor };
}

export function transposeKey(key: string, semitones: number): string {
  const { tonic, minor } = parseKey(key);
  return (minor ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES)[toPitchClass(tonic + semitones)];
}

export function accidentalsForKey(key: string): Accidentals {
  if (key === 'C' || key === 'Am') return 'mixed';
  return FLAT_KEYS.has(key) ? 'flats' : 'sharps';
}

/** simplify -> transpose -> spell. Spelling runs last because it depends on the key you end up in. */
export function displayChord(chord: Chord, view: DisplaySettings, originalKey: string): string {
  const moved = transposeChord(simplifyChord(chord, view.difficulty), view.semitones);
  const accidentals = view.spelling === 'auto' ? accidentalsForKey(transposeKey(originalKey, view.semitones)) : view.spelling;
  return formatChord(moved, accidentals);
}

// Diatonic triads as [semitones above tonic, triad quality].
const MAJOR_DIATONIC: [number, Quality][] = [[0, ''], [2, 'm'], [4, 'm'], [5, ''], [7, ''], [9, 'm'], [11, 'dim']];
const MINOR_DIATONIC: [number, Quality][] = [[0, 'm'], [2, 'dim'], [3, ''], [5, 'm'], [7, 'm'], [7, ''], [8, ''], [10, '']];

/**
 * Picks the key whose diatonic chords cover the most playing time, counting the tonic chord twice
 * so relative major/minor pairs (Ab vs Fm) are decided by which tonic the song sits on.
 * Tried and measured on the 28-song UG benchmark: a bonus for the first/last chord made it worse
 * (pop songs often fade out on the loop's last chord), so it is not used.
 * ponytail: duration heuristic, swap for a key-profile model if it guesses wrong often.
 */
export function estimateKey(events: { chord: Chord; start: number; end: number }[]): string {
  let best = { key: 'C', score: 0 };
  for (const minor of [false, true]) {
    for (let tonic = 0; tonic < 12; tonic++) {
      const scale = minor ? MINOR_DIATONIC : MAJOR_DIATONIC;
      let score = 0;
      for (const { chord, start, end } of events) {
        if (chord.kind === 'none') continue;
        const interval = toPitchClass(chord.root - tonic);
        const triad = triadOf(chord.quality);
        if (scale.some(([i, q]) => i === interval && q === triad)) score += end - start;
        if (interval === 0 && triad === scale[0][1]) score += end - start;
      }
      if (score > best.score) best = { key: (minor ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES)[tonic], score };
    }
  }
  return best.key;
}
