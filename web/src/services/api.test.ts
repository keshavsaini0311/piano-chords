import { describe, expect, it } from 'vitest';
import { fromWire, toWire, type WireSong } from './api';

const wire: WireSong = {
  id: 'abcdefghijk', title: 'Demo', artist: 'Nobody', duration: 8, beats: [0, 1],
  chords: [
    { id: 'c0', start: 0, end: 6, label: 'Fm', confidence: 1 },
    { id: 'c1', start: 6, end: 8, label: 'C#', confidence: 0.4, alternatives: ['Bbm'] },
  ],
  lyrics: [], anchors: {},
};

describe('wire conversion', () => {
  it('parses labels and estimates the key on the way in', () => {
    const song = fromWire(wire);
    expect(song.originalKey).toBe('Fm');
    expect(song.chords[1].chord).toEqual({ kind: 'chord', root: 1, quality: '' });
    expect(song.chords[1].alternatives).toEqual([{ kind: 'chord', root: 10, quality: 'm' }]);
  });

  it('writes labels spelled for the song key on the way out', () => {
    const out = toWire(fromWire(wire));
    expect(out.chords.map((c) => c.label)).toEqual(['Fm', 'Db']);
    expect(out.chords[1]).toMatchObject({ confidence: 0.4, alternatives: ['Bbm'] });
    expect('originalKey' in out).toBe(false);
  });
});
