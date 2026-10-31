import { describe, expect, it } from 'vitest';
import { parseChord } from './music';
import type { ChordEvent } from './song';
import { isUnsure, snapToBeat, activeChordIndex, beatIndex, beatsUntilNextChord, computePeaks, loopSeekTarget, reviewQueue } from './timing';

const ev = (id: string, start: number, end: number, confidence?: number): ChordEvent => ({
  id, start, end, chord: parseChord('C'), confidence,
});
const chords = [ev('a', 1, 2, 0.9), ev('b', 2, 4, 0.3), ev('c', 4, 6), ev('d', 6, 8, 0.5)];

describe('activeChordIndex', () => {
  it('finds the chord under the playhead', () => {
    expect(activeChordIndex(chords, 0.5)).toBe(-1);
    expect(activeChordIndex(chords, 1)).toBe(0);
    expect(activeChordIndex(chords, 2)).toBe(1);
    expect(activeChordIndex(chords, 7.99)).toBe(3);
    expect(activeChordIndex(chords, 8)).toBe(-1);
    expect(activeChordIndex([], 3)).toBe(-1);
  });
});

describe('beats', () => {
  const beats = [0, 0.5, 1, 1.5, 2];
  it('beatIndex is the last beat at or before the time', () => {
    expect(beatIndex(beats, -1)).toBe(-1);
    expect(beatIndex(beats, 0.5)).toBe(1);
    expect(beatIndex(beats, 0.7)).toBe(1);
  });

  it('counts beats until the next chord change', () => {
    expect(beatsUntilNextChord([ev('a', 0, 2), ev('b', 2, 3)], beats, 0.6)).toBe(3);
    expect(beatsUntilNextChord([ev('a', 0, 2)], beats, 0.6)).toBeNull();
  });
});

describe('reviewQueue', () => {
  it('lists unsure chords in time order and skips chords without confidence', () => {
    expect(reviewQueue(chords)).toEqual(['b', 'd']);
    expect(reviewQueue(chords, 0.4)).toEqual(['b']);
  });
});

describe('loopSeekTarget', () => {
  const loop = { start: 2, end: 4 };
  it('jumps back to the loop start at the end', () => {
    expect(loopSeekTarget(3, loop)).toBeNull();
    expect(loopSeekTarget(4, loop)).toBe(2);
    expect(loopSeekTarget(5, loop)).toBe(2);
    expect(loopSeekTarget(5, null)).toBeNull();
  });
});

describe('computePeaks', () => {
  it('takes the loudest sample per bucket, normalised', () => {
    expect(computePeaks(new Float32Array([0, -1, 0.5, 0]), 2)).toEqual([1, 0.5]);
    expect(computePeaks(new Float32Array([0, 0, 0, 0]), 2)).toEqual([0, 0]);
  });
});

describe('snapToBeat', () => {
  it('snaps to a beat within the tolerance and leaves other times alone', () => {
    const beats = [0, 0.5, 1, 1.5];
    expect(snapToBeat(0.92, beats)).toBe(1);
    expect(snapToBeat(0.75, beats)).toBe(0.75);
    expect(snapToBeat(0.4, [])).toBe(0.4);
  });
});

describe('isUnsure', () => {
  it('flags low confidence and trusts chords without a score', () => {
    expect(isUnsure(ev('x', 0, 1, 0.3))).toBe(true);
    expect(isUnsure(ev('x', 0, 1, 0.9))).toBe(false);
    expect(isUnsure(ev('x', 0, 1))).toBe(false);
  });
});
