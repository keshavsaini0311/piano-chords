import { describe, expect, it } from 'vitest';
import { displayRange, EASY_MIN_SEC, handRanges, melodyNotes, soundingAt } from './melody';
import type { NoteEvent } from './song';

const n = (midi: number, start = 0, end = 1): NoteEvent => ({ start, end, midi });
const SA51 = { low: 53, high: 84 }; // F3–C6

describe('melodyNotes', () => {
  it('full: transposes and keeps every note where it is', () => {
    expect(melodyNotes([n(40), n(90)], { semitones: 2, easy: false, fitTo: null }).map((x) => x.midi)).toEqual([42, 92]);
  });

  it('easy: drops notes too quick to play', () => {
    const notes = [n(60, 0, EASY_MIN_SEC / 2), n(62, 1, 2)];
    expect(melodyNotes(notes, { semitones: 0, easy: true, fitTo: SA51 }).map((x) => x.midi)).toEqual([62]);
  });

  it('moves the whole tune by octaves first, so a phrase never jumps mid-line', () => {
    const low = [n(36), n(38), n(40), n(43)]; // C2–G2, all below the keyboard
    expect(melodyNotes(low, { semitones: 0, easy: true, fitTo: SA51 }).map((x) => x.midi)).toEqual([60, 62, 64, 67]);
  });

  it('then folds any note still off the keyboard', () => {
    const wide = [n(60), n(62), n(64), n(88)]; // E6 is above C6
    expect(melodyNotes(wide, { semitones: 0, easy: true, fitTo: SA51 }).map((x) => x.midi)).toEqual([60, 62, 64, 76]);
  });
});

describe('handRanges', () => {
  it('left hand gets the bottom octave, the melody the rest', () => {
    expect(handRanges(SA51)).toEqual({ left: { low: 53, high: 64 }, right: { low: 65, high: 84 } });
  });

  it('a keyboard under two octaves is shared by both hands', () => {
    const small = { low: 60, high: 79 };
    expect(handRanges(small)).toEqual({ left: small, right: small });
  });
});

describe('displayRange', () => {
  it('grows to fit every note and starts and ends on white keys', () => {
    expect(displayRange([49, 90], SA51)).toEqual({ low: 48, high: 91 }); // C#3 -> C3, F#6 -> G6
    expect(displayRange([60], SA51)).toEqual(SA51);
  });
});

describe('soundingAt', () => {
  it('lists the notes held at a moment', () => {
    const notes = [n(60, 0, 1), n(62, 1, 2), n(64, 1.5, 3)];
    expect(soundingAt(notes, 1.6).map((x) => x.midi)).toEqual([62, 64]);
    expect(soundingAt(notes, 5)).toEqual([]);
  });
});
