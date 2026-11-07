import { describe, expect, it } from 'vitest';
import { chordKey, mastery, nextToLearn, playableSongs, songChordsAsPlayed, type ChordSkill } from './mastery';
import type { Attempt, Run } from './score';

const at = (hitAfter: number | null, chord = 'C'): Attempt => ({ chord, from: null, loop: { start: 0, end: 1 }, hitAfter, exact: true, missing: [], strays: [] });
// beat 0.5: hitAfter 0.3 → 100, 0.7 → 80, 1.2 → 60, 2.0 → 40, null → 0
const runOf = (hits: (number | null)[], chord = 'C', when = '2026-11-01'): Run => ({ at: when, rate: 1, beat: 0.5, score: 0, hits: 0, total: hits.length, bestStreak: 0, avgHit: null, attempts: hits.map((h) => at(h, chord)) });
const skillOf = (hits: (number | null)[]) => mastery({ s: [runOf(hits)] }).get('C')!;
const solid = (chord: string): ChordSkill => ({ chord, attempts: 9, score: 70, level: 'solid' });
const solidCG = new Map([['C', solid('C')], ['G', solid('G')]]);

describe('chord mastery', () => {
  it('spellings collapse', () => { expect(chordKey('Db')).toBe('C#'); expect(chordKey('N.C.')).toBeNull(); });
  it('levels follow the thresholds', () => {
    expect(skillOf([0.3, 0.3, 0.3, 0.3, 0.3]).level).toBe('mastered');
    expect(skillOf([0.7, 0.7, 1.2, 1.2, 1.2])).toMatchObject({ score: 68, level: 'solid' });
    expect(skillOf([2, 2, 2, 2, 2]).level).toBe('learning');
    expect(skillOf([0.3, 0.3]).level).toBe('new');
  });
  it('only the last 20 attempts count', () => {
    const skills = mastery({ a: [runOf(Array(20).fill(null), 'C', '2026-11-01')], b: [runOf(Array(20).fill(0.3), 'Db', '2026-11-02')] });
    expect(skills.get('C#')).toMatchObject({ attempts: 20, level: 'mastered' });
    const same = mastery({ a: [runOf(Array(20).fill(0.3), 'C', '2026-11-02')], b: [runOf(Array(20).fill(null), 'C', '2026-11-01')] });
    expect(same.get('C')).toMatchObject({ attempts: 20, score: 100 });
  });
  it('no runs, no skills', () => expect(mastery({}).size).toBe(0));
  it('song chords as played follow key and difficulty', () => expect(songChordsAsPlayed({ Am7: 10, 'N.C.': 5, G: 4 }, 3, 'easy')).toEqual({ Cm: 10, 'A#': 4 }));
  it('playable when main chords are solid; passing chords and empty songs', () => {
    expect(playableSongs([{ id: 'a', chords: { C: 50, G: 48, F: 2 } }], solidCG)).toEqual(['a']);
    expect(playableSongs([{ id: 'b', chords: {} }], solidCG)).toEqual([]);
    expect(playableSongs([{ id: 'c', chords: { C: 50, F: 50 } }], solidCG)).toEqual([]);
  });
  it('learn next favours the chord that unlocks most songs', () => {
    const songs: { id: string; chords: Record<string, number> }[] = [{ id: 'a', chords: { C: 50, F: 50 } }, { id: 'b', chords: { C: 40, D: 30, F: 30 } }, { id: 'c', chords: { G: 60, F: 40 } }];
    expect(nextToLearn(songs, solidCG)[0]).toEqual({ chord: 'F', unlocks: ['a', 'c'] });
  });
});
