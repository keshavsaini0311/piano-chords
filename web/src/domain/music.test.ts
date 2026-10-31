import { describe, expect, it } from 'vitest';
import {
  accidentalsForKey,
  displayChord,
  estimateKey,
  formatChord,
  parseChord,
  simplifyChord,
  transposeChord,
  transposeKey,
  type Chord,
  type PitchClass,
} from './music';

const easyAuto = (semitones: number) => ({ semitones, difficulty: 'easy' as const, spelling: 'auto' as const });

describe('parse and format', () => {
  it('round-trips common chord labels', () => {
    for (const label of ['C', 'Fm', 'F#m7', 'Bdim', 'Gsus4', 'Cmaj7', 'C/E']) {
      expect(formatChord(parseChord(label), 'sharps')).toBe(label);
    }
    expect(formatChord(parseChord('Bb'), 'flats')).toBe('Bb');
  });

  it('reads aliases', () => {
    expect(formatChord(parseChord('Amin'), 'sharps')).toBe('Am');
    expect(formatChord(parseChord('CM7'), 'sharps')).toBe('Cmaj7');
  });

  it('treats N.C. as no chord, and transposing it keeps it none', () => {
    expect(parseChord('N.C.').kind).toBe('none');
    expect(parseChord('N').kind).toBe('none');
    expect(transposeChord(parseChord('N.C.'), 3).kind).toBe('none');
    expect(formatChord({ kind: 'none' }, 'sharps')).toBe('N.C.');
  });
});

describe('transpose', () => {
  it('is reversible for every root, quality and shift', () => {
    for (let root = 0; root < 12; root++) {
      for (const quality of ['', 'm', '7', 'dim']) {
        const chord: Chord = { kind: 'chord', root: root as PitchClass, quality };
        for (let n = -11; n <= 11; n++) {
          expect(transposeChord(transposeChord(chord, n), -n)).toEqual(chord);
        }
      }
    }
  });

  it('moves the slash bass too', () => {
    expect(formatChord(transposeChord(parseChord('C/E'), 2), 'sharps')).toBe('D/F#');
  });

  it('transposes keys', () => {
    expect(transposeKey('Fm', 4)).toBe('Am');
    expect(transposeKey('C', -1)).toBe('B');
  });
});

describe('simplify', () => {
  it('reduces to plain triads on easy', () => {
    expect(formatChord(simplifyChord(parseChord('Fm7'), 'easy'), 'flats')).toBe('Fm');
    expect(formatChord(simplifyChord(parseChord('Dbsus2'), 'easy'), 'flats')).toBe('Db');
    expect(formatChord(simplifyChord(parseChord('Bm7b5'), 'easy'), 'sharps')).toBe('Bdim');
    expect(formatChord(simplifyChord(parseChord('C/E'), 'easy'), 'sharps')).toBe('C');
  });

  it('leaves the chord alone on full', () => {
    const chord = parseChord('Fm7');
    expect(simplifyChord(chord, 'full')).toBe(chord);
  });
});

describe('display pipeline', () => {
  it('simplifies, transposes, then spells for the target key', () => {
    expect(displayChord(parseChord('Fm'), easyAuto(4), 'Fm')).toBe('Am');
    expect(displayChord(parseChord('Db'), easyAuto(4), 'Fm')).toBe('F');
    expect(displayChord(parseChord('C#'), easyAuto(0), 'Fm')).toBe('Db');
  });

  it('spells borrowed chords the conventional way in keys without sharps or flats', () => {
    const view = { semitones: 0, difficulty: 'full' as const, spelling: 'auto' as const };
    expect(displayChord(parseChord('A#'), view, 'C')).toBe('Bb');
    expect(displayChord(parseChord('D#'), view, 'C')).toBe('Eb');
    expect(displayChord(parseChord('G#'), view, 'Am')).toBe('Ab');
    expect(displayChord(parseChord('D/F#'), view, 'C')).toBe('D/F#');
    expect(displayChord(parseChord('F#m'), view, 'G')).toBe('F#m');
  });

  it('picks accidentals from the key', () => {
    expect(accidentalsForKey('Fm')).toBe('flats');
    expect(accidentalsForKey('A')).toBe('sharps');
  });
});

describe('estimateKey', () => {
  it('finds the minor key when its tonic chord dominates', () => {
    const ev = (label: string, start: number, end: number) => ({ chord: parseChord(label), start, end });
    expect(estimateKey([ev('Fm', 0, 8), ev('Db', 8, 12), ev('Ab', 12, 16), ev('Eb', 16, 20)])).toBe('Fm');
  });

  it('defaults to C with no chords', () => {
    expect(estimateKey([])).toBe('C');
  });
});
