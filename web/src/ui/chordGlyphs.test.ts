import { describe, expect, it } from 'vitest';
import { withAccidentalGlyphs } from './chordGlyphs';

describe('withAccidentalGlyphs', () => {
  it('turns ASCII accidentals on the root and bass into music glyphs', () => {
    expect(withAccidentalGlyphs('Db')).toBe('D♭');
    expect(withAccidentalGlyphs('F#m7')).toBe('F♯m7');
    expect(withAccidentalGlyphs('Bbm7b5')).toBe('B♭m7♭5');
    expect(withAccidentalGlyphs('C/Eb')).toBe('C/E♭');
    expect(withAccidentalGlyphs('Ab/C')).toBe('A♭/C');
  });

  it('leaves plain chords and N.C. alone', () => {
    expect(withAccidentalGlyphs('Em')).toBe('Em');
    expect(withAccidentalGlyphs('N.C.')).toBe('N.C.');
  });
});
