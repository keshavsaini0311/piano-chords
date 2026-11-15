import { describe, expect, it } from 'vitest';
import { displayRange, EASY_MIN_SEC, handRanges, melodyNotes, rankMelodyKeys, soundingAt, type MelodyView } from './melody';
import type { NoteEvent } from './song';

const n = (midi: number, start = 0, end = 1): NoteEvent => ({ start, end, midi });
const SA51 = { low: 53, high: 84 }; // F3–C6
const view = (v: Partial<MelodyView>): MelodyView => ({ semitones: 0, level: 'easy', fitTo: SA51, beats: [], ...v });
const midis = (notes: NoteEvent[]) => notes.map((x) => x.midi);

describe('melodyNotes', () => {
  it('full: transposes and keeps every note where it is', () => {
    expect(melodyNotes([n(40), n(90)], view({ semitones: 2, level: 'full', fitTo: null })).map((x) => x.midi)).toEqual([42, 92]);
  });

  it('easy: drops notes too quick to play', () => {
    const notes = [n(60, 0, EASY_MIN_SEC / 2), n(62, 1, 2)];
    expect(melodyNotes(notes, view({})).map((x) => x.midi)).toEqual([62]);
  });

  it('moves the whole tune by octaves first, so a phrase never jumps mid-line', () => {
    const low = [n(36), n(38), n(40), n(43)]; // C2–G2, all below the keyboard
    expect(melodyNotes(low, view({})).map((x) => x.midi)).toEqual([60, 62, 64, 67]);
  });

  it('then folds any note still off the keyboard', () => {
    const wide = [n(60), n(62), n(64), n(88)]; // E6 is above C6
    expect(melodyNotes(wide, view({})).map((x) => x.midi)).toEqual([60, 62, 64, 76]);
  });
});

describe('on the beat', () => {
  const beats = [0, 1, 2, 3, 4];

  it('plays one note per beat, starting on the beat: the note sung longest in it', () => {
    const notes = [n(60, 0.1, 0.3), n(62, 0.3, 0.9), n(64, 1.0, 1.2), n(65, 1.2, 1.9)];
    const out = melodyNotes(notes, view({ level: 'beat', beats }));
    expect(out).toEqual([n(62, 0, 1), n(65, 1, 2)]);
  });

  it('a note sung across beats stays one held note; the same note sung again is struck again', () => {
    const held = melodyNotes([n(60, 0, 2.5)], view({ level: 'beat', beats }));
    expect(held).toEqual([n(60, 0, 3)]);
    const twice = melodyNotes([n(60, 0, 0.9), n(60, 1, 1.9)], view({ level: 'beat', beats }));
    expect(twice).toEqual([n(60, 0, 1), n(60, 1, 2)]);
  });

  it('a beat that is mostly silent is a rest', () => {
    const out = melodyNotes([n(60, 0, 0.9), n(62, 1.9, 2.9)], view({ level: 'beat', beats }));
    expect(out).toEqual([n(60, 0, 1), n(62, 2, 3)]);
  });

  it('one position: on the beat, and every note within 12 keys so the hand never moves', () => {
    const notes = [n(60, 0, 1), n(64, 1, 2), n(67, 2, 3), n(74, 3, 4)]; // C E G, then D an octave up
    const out = melodyNotes(notes, view({ level: 'hand', beats }));
    expect(midis(out)).toEqual([60, 64, 67, 62]);
    expect(Math.max(...midis(out)) - Math.min(...midis(out))).toBeLessThanOrEqual(11);
  });
});

describe('rankMelodyKeys', () => {
  it('ranks every transposition by how many tune notes land on black keys, fewest first', () => {
    const tune = [n(61), n(63), n(66), n(60)]; // C# D# F# C: three black
    const ranked = rankMelodyKeys(tune);
    expect(ranked).toHaveLength(12);
    expect(ranked[0]).toEqual({ semitones: -1, blackKeyNotes: 0 }); // C D F B
    expect(ranked.find((r) => r.semitones === 0)?.blackKeyNotes).toBe(3);
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
