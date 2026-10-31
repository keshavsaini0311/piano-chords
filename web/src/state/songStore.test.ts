import { beforeEach, describe, expect, it } from 'vitest';
import { setChord } from '../domain/edits';
import { parseChord } from '../domain/music';
import type { Song } from '../domain/song';
import { HISTORY_LIMIT, useSongStore } from './songStore';

const song: Song = {
  id: 'abcdefghijk', title: 'Demo', artist: 'Nobody', duration: 4, originalKey: 'C', beats: [],
  chords: [{ id: 'c0', start: 0, end: 4, chord: parseChord('C') }], lyrics: [], anchors: {},
};
const store = () => useSongStore.getState();

describe('song store history', () => {
  beforeEach(() => store().load(song));

  it('undo restores the exact previous song and redo re-applies', () => {
    store().apply((s) => setChord(s, 'c0', parseChord('G')));
    const edited = store().song;
    store().undo();
    expect(store().song).toBe(song);
    store().redo();
    expect(store().song).toBe(edited);
  });

  it('a new edit after undo clears the redo stack', () => {
    store().apply((s) => setChord(s, 'c0', parseChord('G')));
    store().undo();
    store().apply((s) => setChord(s, 'c0', parseChord('Am')));
    expect(store().future).toEqual([]);
  });

  it('caps the history', () => {
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) store().apply((s) => ({ ...s, title: `t${i}` }));
    expect(store().past.length).toBe(HISTORY_LIMIT);
  });

  it('ignores edits that change nothing', () => {
    store().apply((s) => s);
    expect(store().past).toEqual([]);
  });
});
