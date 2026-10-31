import { describe, expect, it } from 'vitest';
import type { ChartRow } from './align';
import { formatChord, parseChord } from './music';
import type { ChordEvent } from './song';
import { toLeadSheet } from './leadSheet';

let n = 0;
const ev = (label: string): ChordEvent => ({ id: `c${n++}`, start: n, end: n + 1, chord: parseChord(label) });
const labels = (events: ChordEvent[]) => events.map((e) => formatChord(e.chord, 'flats'));

describe('toLeadSheet', () => {
  it('folds repeated chord lines into one line with a repeat count', () => {
    const outro = ['Fm', 'Ab', 'Db', 'Bbm', 'Fm', 'Ab', 'Db', 'Bbm', 'Fm', 'Ab', 'Db', 'Bbm'].map(ev);
    const lines = toLeadSheet([{ kind: 'instrumental', chords: outro }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: 'bars', repeats: 3 });
    if (lines[0].kind !== 'bars') return;
    expect(labels(lines[0].chords)).toEqual(['Fm', 'Ab', 'Db', 'Bbm']);
    expect(lines[0].columnOf.get(outro[9].id)).toBe(1); // the 3rd pass's Ab lights the 2nd bar
  });

  it('drops silence and keeps different lines apart', () => {
    const chords = ['N.C.', 'C', 'G', 'Am', 'F', 'C', 'G', 'F', 'C', 'N.C.'].map(ev);
    const lines = toLeadSheet([{ kind: 'instrumental', chords }]);
    expect(lines.map((l) => (l.kind === 'bars' ? [labels(l.chords), l.repeats] : null))).toEqual([
      [['C', 'G', 'Am', 'F'], 1],
      [['C', 'G', 'F', 'C'], 1],
    ]);
  });

  it('passes lyric lines through untouched', () => {
    const row: ChartRow = { kind: 'lyric', line: { id: 'l0', start: 0, end: 4, text: 'hello there' }, chords: [] };
    expect(toLeadSheet([row])).toEqual([{ kind: 'lyric', row, ids: [] }]);
  });
});

describe('toLeadSheet with a display key', () => {
  it('folds lines that look the same on screen even if the stored chords differ', () => {
    const chords = ['Fm7', 'Ab', 'Dbmaj7', 'Bbm', 'Fm', 'Ab', 'Db', 'Bbm7'].map(ev);
    const simple = (e: ChordEvent) => formatChord(e.chord, 'flats').replace(/maj7|7/g, '');
    const lines = toLeadSheet([{ kind: 'instrumental', chords }], 4, simple);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: 'bars', repeats: 2 });
  });
});
