import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services/api';
import { setChord } from '../domain/edits';
import { parseChord } from '../domain/music';
import type { Song } from '../domain/song';
import { HISTORY_LIMIT, subscribeAutosave, useSongStore } from './songStore';

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

describe('autosave', () => {
  beforeEach(() => store().load(song));
  afterEach(() => vi.restoreAllMocks());

  it('sends a pending save immediately when autosave stops (leaving the studio)', () => {
    const save = vi.spyOn(api, 'saveSong').mockResolvedValue({});
    const stop = subscribeAutosave();
    store().apply((s) => ({ ...s, title: 'edited' }));
    stop();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].title).toBe('edited');
  });

  it('does not save when nothing changed', () => {
    const save = vi.spyOn(api, 'saveSong').mockResolvedValue({});
    subscribeAutosave()();
    expect(save).not.toHaveBeenCalled();
  });
});
