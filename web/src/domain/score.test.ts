import { describe, expect, it } from 'vitest';
import type { Verdict } from './judge';
import { noteName, parseChord, type PitchClass } from './music';
import { beatSeconds, createRunTracker, judgementFor, letterFor, summarize, tipsFor, type Attempt, type Run, type Tick } from './score';

const C = parseChord('C');
const G = parseChord('G');
const verdict = (grade: Verdict['grade'], heard: string, notes: number[]): Verdict => ({ grade, heard: parseChord(heard), notes: notes as PitchClass[] });
const tick = (over: Partial<Tick>): Tick => ({
  id: 'c1', target: C, label: 'C', start: 10, end: 12, from: { label: 'G', start: 8, target: G },
  time: 10, rate: 1, playing: true, settled: null, raw: null, name: (pc) => noteName(pc, 'sharps'), ...over,
});
const attempt = (over: Partial<Attempt>): Attempt => ({ chord: 'C', from: 'G', loop: { start: 8, end: 12 }, hitAfter: 0.3, exact: true, missing: [], strays: [], ...over });
const run = (attempts: Attempt[], rate = 1, beat = 0.5): Run => summarize(attempts, rate, beat, '2026-11-04');

describe('scoring', () => {
  it('rewards fast, exact hits (120 BPM)', () => {
    expect(judgementFor(attempt({ hitAfter: 0.3 }), 0.5)).toEqual({ judgement: 'Perfect', points: 100 });
    expect(judgementFor(attempt({ hitAfter: 1.2 }), 0.5)).toEqual({ judgement: 'Good', points: 60 });
    expect(judgementFor(attempt({ hitAfter: 0.3, exact: false }), 0.5)).toEqual({ judgement: 'Perfect', points: 80 });
    expect(judgementFor(attempt({ hitAfter: null }), 0.5)).toEqual({ judgement: 'Missed', points: 0 });
  });
  it('windows follow the tempo: the same 0.6 s is Great in a fast song, Perfect in a slow one', () => {
    expect(judgementFor(attempt({ hitAfter: 0.6 }), 0.3).judgement).toBe('Great'); // 200 BPM
    expect(judgementFor(attempt({ hitAfter: 0.6 }), 1).judgement).toBe('Perfect'); // 60 BPM
  });
  it('reads the beat from the song, ignoring odd gaps', () => {
    expect(beatSeconds([0, 0.5, 1, 1.5, 3, 3.5])).toBe(0.5); // one missed beat
    expect(beatSeconds([])).toBe(0.5);
    expect(beatSeconds([0, 0.1, 0.2, 0.3])).toBe(0.3); // double-time tracker clamps to 200 BPM
  });
  it('summarizes a run with streaks', () => {
    const r = run([attempt({}), attempt({}), attempt({ hitAfter: null }), attempt({ hitAfter: 0.7 })]);
    expect(r).toMatchObject({ score: 70, hits: 3, total: 4, bestStreak: 2 });
    expect(letterFor(r.score)).toBe('B');
  });
});

describe('createRunTracker', () => {
  it('times the hit from the chord change, in real seconds at slow speed', () => {
    const t = createRunTracker();
    t.tick(tick({ time: 10 }));
    t.tick(tick({ time: 10.3, rate: 0.5, raw: verdict('off', 'G', [7, 11, 2]) }));
    t.tick(tick({ time: 10.4, rate: 0.5, settled: verdict('right', 'C', [0, 4, 7]) }));
    for (let i = 0; i < 3; i++) t.tick(tick({ id: `x${i}`, start: 12 + i, end: 13 + i, time: 12 + i }));
    const r = t.finish(0.5, 1)!;
    expect(r.attempts[0]).toMatchObject({ chord: 'C', from: 'G', hitAfter: 0.8, exact: true, missing: [] });
  });
  it('on a miss, remembers which notes were missing and which were left over', () => {
    const t = createRunTracker();
    t.tick(tick({ time: 10 }));
    for (let i = 0; i < 5; i++) t.tick(tick({ time: 10.1 + i / 10, raw: verdict('off', 'G', [0, 7, 11]) })); // C G B: no E, B left from G
    for (let i = 0; i < 3; i++) t.tick(tick({ id: `x${i}`, start: 12 + i, end: 13 + i, time: 12 + i }));
    const a = t.finish(1, 0.5)!.attempts[0];
    expect(a.hitAfter).toBeNull();
    expect(a.missing).toEqual([{ name: 'E', role: '3rd' }]);
    expect(a.strays).toEqual([{ name: 'B', leftover: true }]);
  });
  it('skips chords you joined late and runs that are too short', () => {
    const t = createRunTracker();
    t.tick(tick({ time: 11.5 })); // joined 1.5 s into the chord
    expect(t.finish(1, 0.5)).toBeNull();
  });
});

describe('tipsFor', () => {
  it('points at the weakest change with a loop to practise it', () => {
    const runs = [run([attempt({ hitAfter: null }), attempt({ hitAfter: null }), attempt({}), attempt({ chord: 'G', from: 'C' })])];
    const [first] = tipsFor(runs);
    expect(first.title).toBe('G → C: missed 2 of 3');
    expect(first.practice).toEqual({ start: 8, end: 12, rate: 0.75 });
  });
  it('explains a note you keep missing by its role', () => {
    const miss = attempt({ hitAfter: null, from: null, missing: [{ name: 'E', role: '3rd' }] });
    const tips = tipsFor([run([miss, miss, miss, attempt({ chord: 'G', from: null })])]);
    expect(tips[0].title).toBe('Your C keeps missing E');
    expect(tips[0].how).toContain('sound major');
  });
  it('a clean slow run says speed up', () => {
    const tips = tipsFor([run([attempt({}), attempt({}), attempt({}), attempt({})], 0.75)]);
    expect(tips[0].title).toContain('ready for more speed');
  });
});
