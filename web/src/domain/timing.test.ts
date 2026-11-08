import { describe, expect, it } from 'vitest';
import { parseChord } from './music';
import type { ChordEvent } from './song';
import { isUnsure, snapToBeat, activeChordIndex, beatIndex, beatsUntilNextChord, computePeaks, loopSeekTarget, reviewQueue, gateStop, nextGateAt, waitAction } from './timing';

// The 4th argument is a chord label (string) or a confidence (number).
const ev = (id: string, start: number, end: number, arg?: number | string): ChordEvent => ({
  id, start, end, chord: parseChord(typeof arg === 'string' ? arg : 'C'), confidence: typeof arg === 'number' ? arg : undefined,
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

describe('wait-for-me rules', () => {
  it('gateStop stops when playback crosses the gate', () => expect(gateStop(9.99, 10.01, 10)).toBe(10));
  it('gateStop ignores jumps', () => { expect(gateStop(5, 12, 10)).toBeNull(); expect(gateStop(12, 4, 10)).toBeNull(); expect(gateStop(10, 10.02, 10)).toBeNull(); });
  it('nextGateAt skips N.C. and chords under half a beat', () => expect(nextGateAt([ev('a', 0, 2, 'C'), ev('n', 2, 3, 'N.C.'), ev('s', 3, 3.2, 'G'), ev('b', 3.2, 5, 'F')], 0, 0.5)).toBe(3.2));
  it('nextGateAt before the first chord, and at the end', () => { expect(nextGateAt([ev('a', 1, 2, 'C')], -1, 0.5)).toBe(1); expect(nextGateAt([ev('a', 0, 2, 'C')], 0, 0.5)).toBeNull(); });
  it('nextGateAt in a loop waits at the loop start when the next chord is past the loop end', () => {
    const cs = [ev('a', 4, 8, 'C'), ev('b', 8, 12, 'G'), ev('c', 12, 14, 'F')];
    expect(nextGateAt(cs, 1, 0.5, { start: 4, end: 12 })).toBe(4);
    expect(nextGateAt(cs, 0, 0.5, { start: 4, end: 12 })).toBe(8);
    expect(nextGateAt(cs, 2, 0.5, { start: 4, end: 14 })).toBe(4);
  });
  const base = { waitMode: true, playing: true, waiting: false, time: 1, gate: 2, gateAt: 2, hit: false, targetStart: 2 };
  it('waitAction keeps the gate on the next change', () => expect(waitAction({ ...base, gate: null })).toBe('setGate'));
  it('waitAction resumes on a hit', () => expect(waitAction({ ...base, waiting: true, time: 2, hit: true })).toBe('resume'));
  it('waitAction ignores a hit for the previous chord while waiting', () => {
    const w = { ...base, waiting: true, time: 2, gate: 2, hit: true };
    expect(waitAction({ ...w, targetStart: 0 })).toBe('none');
    expect(waitAction({ ...w, targetStart: 2 })).toBe('resume');
  });
  it('release when you move away', () => expect(waitAction({ ...base, waiting: true, time: 7 })).toBe('release'));
  it('turning wait mode off while waiting resumes', () => expect(waitAction({ ...base, waitMode: false, waiting: true, time: 2 })).toBe('resume'));
  it('wait mode off clears a leftover gate', () => expect(waitAction({ ...base, waitMode: false })).toBe('clear'));
});
