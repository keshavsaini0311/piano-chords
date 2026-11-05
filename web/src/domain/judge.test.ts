import { describe, expect, it } from 'vitest';
import { chromaFromSpectrum, createSettler, judge, type Verdict } from './judge';
import { formatChord, parseChord } from './music';

// Fake AnalyserNode output: quiet floor, each note a fundamental plus fading overtones like a piano.
const BIN_HZ = 48000 / 8192;
function spectrum(midis: number[], overtones = 5) {
  const db = new Float32Array(4096).fill(-110);
  for (const m of midis)
    for (let k = 1; k <= overtones; k++) {
      const bin = Math.round((k * 440 * 2 ** ((m - 69) / 12)) / BIN_HZ);
      if (bin < db.length) db[bin] = Math.max(db[bin], -20 - 6 * (k - 1));
    }
  return chromaFromSpectrum(db, BIN_HZ);
}
const grade = (chart: string, midis: number[]) => {
  const v = judge(parseChord(chart), spectrum(midis))!;
  return `${v.grade} ${formatChord(v.heard, 'sharps')}`;
};
const C_E_G = [60, 64, 67];

describe('judge', () => {
  it('right for the exact chord in any inversion or octave, overtones and all', () => {
    expect(grade('C', C_E_G)).toBe('right C');
    expect(grade('C', [52, 55, 60])).toBe('right C'); // E G C
    expect(grade('C', [48, 60, 64, 67])).toBe('right C'); // bass C under the triad
    expect(grade('C/E', C_E_G)).toBe('right C/E');
    expect(grade('Am7', [57, 60, 64, 67])).toBe('right Am7');
    expect(grade('F', [53, 57, 60])).toBe('right F');
    expect(grade('Am', [57, 60, 64])).toBe('right Am');
  });
  it('right without the fifth', () => {
    expect(grade('C', [60, 64])).toBe('right C');
  });
  it('right for any chord on the same root, and says which one', () => {
    expect(grade('Cmaj7', C_E_G)).toBe('right C');
    expect(grade('C', [60, 64, 67, 70])).toBe('right C7');
    expect(grade('C', [60, 65, 67])).toBe('right Csus4');
  });
  it('off for a different chord, and says what it heard', () => {
    expect(grade('C', [57, 60, 64])).toBe('off Am');
    expect(grade('C#m', [64, 68, 71])).toBe('off E');
  });
  it('no verdict on N.C. or silence', () => {
    expect(judge(parseChord('N.C.'), spectrum(C_E_G))).toBeNull();
    expect(judge(parseChord('C'), new Array(12).fill(0))).toBeNull();
    expect(judge(parseChord('C'), [5, 4, 6, 5, 4, 6, 5, 4, 6, 5, 4, 6])).toBeNull(); // hiss: energy everywhere
  });
});

describe('createSettler', () => {
  const v = (grade: Verdict['grade']) => ({ grade, heard: parseChord('C'), notes: [] }) as Verdict;
  it('is quick to praise, slower to fault, holds through silence, and latches right per chord', () => {
    const settle = createSettler();
    expect(settle('a', v('off'))).toBeNull();
    expect(settle('a', v('off'))).toBeNull();
    expect(settle('a', v('off'))?.grade).toBe('off'); // off needs 3
    expect(settle('a', null)?.grade).toBe('off'); // silence keeps it
    expect(settle('a', v('right'))?.grade).toBe('off');
    expect(settle('a', v('right'))?.grade).toBe('right'); // right needs only 2
    expect(settle('a', v('off'))?.grade).toBe('right'); // got it: stays got
    expect(settle('b', v('right'))).toBeNull(); // new chord starts fresh
  });
});
