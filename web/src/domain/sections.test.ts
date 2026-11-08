import { describe, expect, it } from 'vitest';
import { parseChord } from './music';
import { findSections, sectionAt } from './sections';
import type { ChordEvent, LyricLine, Song } from './song';

const loop = ['C', 'G', 'Am', 'F'];

// One repeating 4-chord loop, 2 s each, from 0 to `end`; lines are 3 s long, 4 s apart, from 5 s.
function makeSong(texts: string[], end = 44): Song {
  const chords: ChordEvent[] = [];
  for (let t = 0, n = 0; t < end; t += 2, n++) {
    chords.push({ id: `c${n}`, start: t, end: t + 2, chord: parseChord(loop[n % 4]) });
  }
  const lyrics: LyricLine[] = texts.map((text, n) => ({ id: `l${n}`, start: 5 + 4 * n, end: 8 + 4 * n, text }));
  return { id: 's', title: '', artist: '', duration: end, originalKey: 'C', beats: [], chords, lyrics, anchors: {} };
}

const verse1 = ['red kites over quiet hills', 'we carry lanterns home'];
const chorus = ['oh sing it loud tonight', 'every window glowing bright tonight'];
const verse2 = ['paper boats on silver streams', 'counting stars by seven'];
const texts = [...verse1, ...chorus, ...verse2, ...chorus];

describe('findSections', () => {
  it('names verses and choruses even when the chords never change', () => {
    expect(findSections(makeSong(texts)).map((s) => s.label)).toEqual(['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Outro']);
  });

  it('choruses match despite a changed word', () => {
    const changed = [...verse1, ...chorus, ...verse2, 'oh sing it loud tonight', 'every window glowing light tonight'];
    expect(findSections(makeSong(changed)).map((s) => s.label)).toContain('Chorus');
  });

  it('too few lines or no repeats, no sections', () => {
    expect(findSections(makeSong(texts.slice(0, 7)))).toEqual([]);
    const different = ['one a', 'two b', 'three c', 'four d', 'five e', 'six f', 'seven g', 'eight h'];
    expect(findSections(makeSong(different))).toEqual([]);
  });

  it('sections are contiguous and start on chord changes', () => {
    const song = makeSong(texts);
    const s = findSections(song);
    s.slice(1).forEach((x, i) => expect(x.start).toBe(s[i].end));
    expect(song.chords.some((c) => c.start === s[1].start)).toBe(true);
    expect(s.map((x) => x.id)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5']);
  });

  it('never makes a zero-length section when lines share one long chord', () => {
    const song = makeSong(texts);
    song.chords = [{ id: 'long', start: 0, end: 44, chord: parseChord('C') }];
    const s = findSections(song);
    expect(s.length).toBeGreaterThan(0);
    s.forEach((x) => expect(x.end).toBeGreaterThan(x.start));
    s.slice(1).forEach((x, i) => expect(x.start).toBe(s[i].end));
    expect(s.map((x) => x.id)).toEqual(s.map((_, i) => `s${i}`));
  });

  it('sectionAt', () => {
    const s = findSections(makeSong(texts));
    expect(sectionAt(s, s[2].start + 0.1)?.label).toBe('Chorus');
    expect(sectionAt(s, -1)).toBeNull();
  });
});
