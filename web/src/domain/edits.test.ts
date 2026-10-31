import { describe, expect, it } from 'vitest';
import { parseChord } from './music';
import { MIN_CHORD_SEC, validate, type Song } from './song';
import {
  confirmChord,
  deleteChord,
  mergeWithNext,
  moveAnchor,
  moveChordStart,
  setChord,
  setChordFromDisplay,
  splitChord,
} from './edits';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Contiguous chords: c1 [0,2] Fm · c2 [2,4] Db · c3 [4,6] Ab · c4 [6,8] Eb
const song: Song = deepFreeze({
  id: 'demo',
  title: 'Demo',
  artist: 'Nobody',
  duration: 8,
  originalKey: 'Fm',
  beats: [0, 1, 2, 3, 4, 5, 6, 7],
  chords: ['Fm', 'Db', 'Ab', 'Eb'].map((label, i) => ({
    id: `c${i + 1}`, start: i * 2, end: i * 2 + 2, chord: parseChord(label), confidence: 0.5,
  })),
  lyrics: [{ id: 'l0', start: 0, end: 8, text: 'walking down the road' }],
  anchors: {},
});

const byId = (s: Song, id: string) => s.chords.find((c) => c.id === id)!;

describe('validate', () => {
  it('accepts the fixture', () => {
    expect(validate(song)).toEqual([]);
  });

  it('reports overlap and empty chords', () => {
    const broken = { ...song, chords: [{ ...song.chords[0], end: 3 }, song.chords[1], { ...song.chords[2], end: 4 }] };
    expect(validate(broken).length).toBeGreaterThan(0);
  });
});

describe('edits', () => {
  it('setChord replaces one chord', () => {
    const next = setChord(song, 'c2', parseChord('Bbm'));
    expect(byId(next, 'c2').chord).toEqual(parseChord('Bbm'));
    expect(validate(next)).toEqual([]);
  });

  it('setChordFromDisplay stores the chord in the original key', () => {
    // Viewing +4 (Fm shown as Am), typing G must save Eb (pitch class 3).
    const next = setChordFromDisplay(song, 'c2', 'G', 4);
    expect(byId(next, 'c2').chord).toEqual({ kind: 'chord', root: 3, quality: '' });
  });

  it('moveChordStart moves the shared boundary', () => {
    const next = moveChordStart(song, 'c2', 1.5);
    expect(byId(next, 'c2').start).toBe(1.5);
    expect(byId(next, 'c1').end).toBe(1.5);
    expect(validate(next)).toEqual([]);
  });

  it('moveChordStart clamps so no chord gets shorter than the minimum', () => {
    const early = moveChordStart(song, 'c2', 0.05);
    expect(byId(early, 'c2').start).toBe(MIN_CHORD_SEC);
    expect(byId(early, 'c1').end).toBe(MIN_CHORD_SEC);
    const late = moveChordStart(song, 'c2', 99);
    expect(byId(late, 'c2').start).toBeCloseTo(3.9);
    expect(validate(late)).toEqual([]);
    const first = moveChordStart(song, 'c1', -5);
    expect(byId(first, 'c1').start).toBe(0);
  });

  it('splitChord makes two halves of the same chord', () => {
    const next = splitChord(song, 'c1', 1);
    expect(next.chords).toHaveLength(5);
    expect(next.chords[0]).toMatchObject({ id: 'c1', start: 0, end: 1 });
    expect(next.chords[1]).toMatchObject({ start: 1, end: 2, chord: parseChord('Fm') });
    expect(next.chords[1].id).not.toBe('c1');
    expect(validate(next)).toEqual([]);
  });

  it('splitChord ignores a split point that would leave a sliver', () => {
    expect(splitChord(song, 'c1', 0.05)).toBe(song);
  });

  it('mergeWithNext absorbs the next chord', () => {
    const next = mergeWithNext(song, 'c1');
    expect(next.chords).toHaveLength(3);
    expect(byId(next, 'c1')).toMatchObject({ start: 0, end: 4 });
  });

  it('deleteChord gives the time to the previous chord, or the next for the first', () => {
    const middle = deleteChord(song, 'c2');
    expect(middle.chords).toHaveLength(3);
    expect(byId(middle, 'c1')).toMatchObject({ start: 0, end: 4 });
    const first = deleteChord(song, 'c1');
    expect(byId(first, 'c2').start).toBe(0);
    expect(validate(first)).toEqual([]);
  });

  it('moveAnchor pins a chord to a word', () => {
    const next = moveAnchor(song, 'c3', 'l0', 8);
    expect(next.anchors.c3).toEqual({ lineId: 'l0', charIndex: 8 });
  });

  it('confirmChord marks a chord as checked so it leaves the review queue', () => {
    const next = confirmChord(song, 'c2');
    expect(byId(next, 'c2').confidence).toBe(1);
    expect(byId(next, 'c1').confidence).toBe(0.5);
  });
});
