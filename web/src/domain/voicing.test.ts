import { describe, expect, it } from 'vitest';
import { getInstrument } from './instruments';
import { parseChord, type Chord, type PitchClass } from './music';
import { defaultProfile } from './profile';
import { movement, nearestInversion, rankKeys, rootPosition, type KeyRange, type Voicer, type Voicing } from './voicing';

const range: KeyRange = { low: 48, high: 84 };
const progression = ['C', 'Am', 'F', 'G'].map(parseChord);

function voiceAll(voicer: Voicer, chords: Chord[]): Voicing[] {
  const out: Voicing[] = [];
  for (const chord of chords) out.push(voicer(chord, out.at(-1) ?? null, range));
  return out;
}
const totalMovement = (vs: Voicing[]) => vs.slice(1).reduce((sum, v, i) => sum + movement(vs[i], v), 0);

describe('voicers', () => {
  it('root position jumps the whole hand: 27 semitones for C Am F G', () => {
    const vs = voiceAll(rootPosition, progression);
    expect(vs).toEqual([[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]);
    expect(totalMovement(vs)).toBe(27);
  });

  it('nearest inversion keeps fingers in place: 9 semitones', () => {
    const vs = voiceAll(nearestInversion, progression);
    expect(vs[1]).toEqual([60, 64, 69]);
    expect(totalMovement(vs)).toBe(9);
  });

  it('never leaves the key range', () => {
    const narrow: KeyRange = { low: 53, high: 84 };
    for (const voicer of [rootPosition, nearestInversion]) {
      let prev: Voicing | null = null;
      for (let root = 0; root < 12; root++) {
        for (const quality of ['', 'm']) {
          const v = voicer({ kind: 'chord', root: root as PitchClass, quality }, prev, narrow);
          expect(v.every((n) => n >= narrow.low && n <= narrow.high)).toBe(true);
          prev = v;
        }
      }
    }
  });

  it('voices no chord as no keys', () => {
    expect(nearestInversion({ kind: 'none' }, null, range)).toEqual([]);
  });
});

describe('rankKeys', () => {
  it('puts the all-white-key transposition first', () => {
    const ranked = rankKeys(['Fm', 'Db', 'Ab', 'Eb'].map(parseChord), 'easy');
    expect(ranked[0]).toEqual({ semitones: 4, blackKeyChords: 0 });
    expect(ranked).toHaveLength(12);
  });
});

describe('instrument registry and profile', () => {
  it('knows the piano and its default range', () => {
    expect(getInstrument('piano').defaultRange).toEqual({ low: 53, high: 84 });
    expect(defaultProfile.keyRange).toEqual(getInstrument('piano').defaultRange);
  });
});
