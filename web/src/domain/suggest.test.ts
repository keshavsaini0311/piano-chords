import { describe, expect, it } from 'vitest';
import { formatChord, parseChord } from './music';
import type { Song } from './song';
import { chordsByUse } from './suggest';

const song = (labels: [string, number][]): Song => {
  let t = 0;
  const chords = labels.map(([label, length], i) => {
    const c = { id: `c${i}`, start: t, end: t + length, chord: parseChord(label) };
    t += length;
    return c;
  });
  return { id: 's', title: '', artist: '', duration: t, originalKey: 'Fm', beats: [], chords, lyrics: [], anchors: {} };
};
const names = (s: Song, difficulty: 'easy' | 'full', limit?: number) => chordsByUse(s, difficulty, limit).map((c) => formatChord(c, 'flats'));

describe('chordsByUse', () => {
  it('ranks the chords a song uses by how long they play', () => {
    expect(names(song([['Fm', 8], ['Db', 4], ['Ab', 2], ['Db', 4], ['N.C.', 9]]), 'full')).toEqual(['Fm', 'Db', 'Ab']);
  });

  it('merges chords that look the same in simple mode', () => {
    expect(names(song([['Dbmaj7', 4], ['Db', 3], ['Fm7', 5]]), 'easy')).toEqual(['Db', 'Fm']);
    expect(names(song([['Dbmaj7', 4], ['Db', 3], ['Fm7', 5]]), 'full')).toEqual(['Fm7', 'Dbmaj7', 'Db']);
  });

  it('stops at the limit', () => {
    expect(names(song([['C', 5], ['G', 4], ['Am', 3], ['F', 2]]), 'easy', 2)).toEqual(['C', 'G']);
  });
});
