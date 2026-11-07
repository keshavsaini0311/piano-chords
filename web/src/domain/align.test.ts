import { describe, expect, it } from 'vitest';
import { alignChart } from './align';
import { parseChord } from './music';
import type { ChordEvent, LyricLine, Song, WordTime } from './song';

const chord = (id: string, start: number, end: number): ChordEvent => ({ id, start, end, chord: parseChord('C') });
const line = (id: string, start: number, end: number, text: string, words?: WordTime[]): LyricLine => ({ id, start, end, text, words });
const wt = (...starts: number[]): WordTime[] => starts.map((start, index) => ({ index, start, end: start + 0.3 }));
const charIndexes = (rows: ReturnType<typeof alignChart>) => rows.flatMap((r) => (r.kind === 'lyric' ? r.chords.map((c) => c.charIndex) : []));

function makeSong(chords: ChordEvent[], lyrics: LyricLine[], anchors: Song['anchors'] = {}): Song {
  return { id: 's', title: '', artist: '', duration: 40, originalKey: 'C', beats: [], chords, lyrics, anchors };
}

describe('alignChart', () => {
  it('gives one instrumental row when there are no lyrics', () => {
    const rows = alignChart(makeSong([chord('a', 0, 2), chord('b', 2, 4)], []));
    expect(rows).toEqual([{ kind: 'instrumental', chords: [chord('a', 0, 2), chord('b', 2, 4)] }]);
  });

  it('snaps a chord to the nearest word start', () => {
    // "walking down the road" is 21 chars; 50% of the line lands at index 10 ("down" starts at 8).
    const rows = alignChart(makeSong([chord('a', 10, 12), chord('b', 15, 18)], [line('l0', 10, 20, 'walking down the road')]));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.kind).toBe('lyric');
    if (row.kind !== 'lyric') return;
    expect(row.chords.map((c) => c.charIndex)).toEqual([0, 8]);
  });

  it('lets an anchor override the line and position', () => {
    const lyrics = [line('l0', 0, 10, 'first line here'), line('l1', 10, 20, 'second line here')];
    const rows = alignChart(makeSong([chord('a', 1, 2)], lyrics, { a: { lineId: 'l1', charIndex: 7 } }));
    const second = rows.find((r) => r.kind === 'lyric' && r.line.id === 'l1');
    expect(second && second.kind === 'lyric' && second.chords[0].charIndex).toBe(7);
    const first = rows.find((r) => r.kind === 'lyric' && r.line.id === 'l0');
    expect(first && first.kind === 'lyric' && first.chords).toEqual([]);
  });

  it('puts chords before the first line into a leading instrumental row', () => {
    const rows = alignChart(makeSong([chord('intro', 0, 4), chord('a', 5, 6)], [line('l0', 5, 10, 'hello there')]));
    expect(rows[0]).toEqual({ kind: 'instrumental', chords: [chord('intro', 0, 4)] });
    expect(rows[1].kind).toBe('lyric');
  });

  it('turns an empty lyric line into an instrumental row', () => {
    const rows = alignChart(makeSong([chord('a', 0, 2), chord('b', 6, 8)], [line('l0', 0, 5, 'sing this'), line('l1', 5, 10, '  ')]));
    expect(rows[1]).toEqual({ kind: 'instrumental', chords: [chord('b', 6, 8)] });
  });

  describe('with word times', () => {
    const text = 'one two three four';
    it('puts the chord on the word being sung', () => {
      const rows = alignChart(makeSong([chord('a', 2.9, 3.5)], [line('l', 0, 4, text, wt(0, 0.4, 2.8, 3.2))]));
      expect(charIndexes(rows)).toEqual([8]);
    });
    it('before the first word / after the last', () => {
      const early = line('l', 0, 4, text, [{ index: 2, start: 1, end: 1.3 }, { index: 3, start: 2, end: 2.3 }]);
      expect(charIndexes(alignChart(makeSong([chord('a', 0.1, 0.5)], [early])))).toEqual([8]);
      const late = line('l', 0, 4, text, wt(0, 0.4));
      expect(charIndexes(alignChart(makeSong([chord('a', 3.9, 4)], [late])))).toEqual([4]);
    });
    it('index counts punctuation words', () => {
      const rows = alignChart(makeSong([chord('a', 2, 3)], [line('l', 0, 4, 'go \u2014 now', wt(0, 1, 1.9))]));
      expect(charIndexes(rows)).toEqual([5]);
    });
    it('falls back to the estimate for a missing index; anchor beats word times', () => {
      const bad = line('l', 0, 4, text, [{ index: 9, start: 0, end: 1 }]);
      expect(charIndexes(alignChart(makeSong([chord('a', 2, 3)], [bad])))).toEqual([8]);
      const l = line('l', 0, 4, text, wt(0, 0.4, 2.8, 3.2));
      expect(charIndexes(alignChart(makeSong([chord('a', 2.9, 3.5)], [l], { a: { lineId: 'l', charIndex: 4 } })))).toEqual([4]);
    });
  });
});
