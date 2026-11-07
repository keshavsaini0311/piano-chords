// Time-based lookups for playback. Components subscribe to these derived values, not raw time,
// so they re-render once per chord or beat change instead of 60 times a second.
import type { ChordEvent } from './song';

export type Loop = { start: number; end: number };

/** Index of the last item whose key is <= time, or -1. Binary search over a sorted list. */
function lastAtOrBefore<T>(items: T[], time: number, key: (item: T) => number): number {
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(items[mid]) <= time) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export function activeChordIndex(chords: ChordEvent[], time: number): number {
  const i = lastAtOrBefore(chords, time, (c) => c.start);
  return i >= 0 && time < chords[i].end ? i : -1;
}

export function beatIndex(beats: number[], time: number): number {
  return lastAtOrBefore(beats, time, (b) => b);
}

/** Beats left before the next chord starts (the count-in), or null if no chord follows. */
export function beatsUntilNextChord(chords: ChordEvent[], beats: number[], time: number): number | null {
  const next = chords.find((c) => c.start > time);
  if (!next) return null;
  return beats.filter((b) => b > time && b <= next.start).length;
}

/** Below this confidence a chord is shown dashed and queued for review. */
export const UNSURE_BELOW = 0.6;

export const isUnsure = (event: ChordEvent, threshold = UNSURE_BELOW) => event.confidence !== undefined && event.confidence < threshold;

export function reviewQueue(chords: ChordEvent[], threshold = UNSURE_BELOW): string[] {
  return chords.filter((c) => isUnsure(c, threshold)).map((c) => c.id);
}

export function loopSeekTarget(time: number, loop: Loop | null): number | null {
  return loop && time >= loop.end ? loop.start : null;
}

/** Loudest absolute sample per bucket, scaled so the loudest bucket is 1. */
export function computePeaks(samples: Float32Array, buckets: number): number[] {
  const size = Math.max(1, Math.floor(samples.length / buckets));
  const peaks: number[] = [];
  for (let b = 0; b < buckets; b++) {
    let max = 0;
    for (let i = b * size; i < Math.min((b + 1) * size, samples.length); i++) max = Math.max(max, Math.abs(samples[i]));
    peaks.push(max);
  }
  const top = Math.max(...peaks);
  return top > 0 ? peaks.map((p) => p / top) : peaks;
}

export const SNAP_SEC = 0.15;

/** Pulls a dragged time onto the nearest beat when it is close enough. */
export function snapToBeat(time: number, beats: number[], tolerance = SNAP_SEC): number {
  const i = lastAtOrBefore(beats, time, (b) => b);
  const candidates = [beats[i], beats[i + 1]].filter((b) => b !== undefined);
  const nearest = candidates.sort((a, b) => Math.abs(a - time) - Math.abs(b - time))[0];
  return nearest !== undefined && Math.abs(nearest - time) <= tolerance ? nearest : time;
}

/** Wait-for-me: the gate time if playback crossed it in one small step (not a seek), else null. */
export function gateStop(prev: number, time: number, gateAt: number | null): number | null {
  return gateAt !== null && prev < gateAt && gateAt <= time && time - prev < 0.25 ? gateAt : null;
}

/** Start of the first real chord after `index` that lasts at least half a beat; N.C. and blips are never waited on. */
export function nextGateAt(chords: ChordEvent[], index: number, songBeat: number): number | null {
  const next = chords.slice(index + 1).find((c) => c.chord.kind === 'chord' && c.end - c.start >= songBeat / 2);
  return next ? next.start : null;
}

export type WaitAction = 'none' | 'setGate' | 'resume' | 'release' | 'clear';

export function waitAction(s: { waitMode: boolean; playing: boolean; waiting: boolean; time: number; gate: number | null; gateAt: number | null; hit: boolean; targetStart: number | null }): WaitAction {
  if (!s.waitMode) return s.waiting ? 'resume' : s.gate !== null ? 'clear' : 'none';
  if (s.waiting) return s.gate !== null && Math.abs(s.time - s.gate) > 0.05 ? 'release' : s.hit && s.targetStart === s.gate ? 'resume' : 'none'; // a hit counts only for the chord that starts at the gate
  return s.playing && s.gate !== s.gateAt ? 'setGate' : 'none';
}
