import { describe, expect, it } from 'vitest';
import { addSong, createPlaylist, deletePlaylist, moveSong, nextSong, removeSong, renamePlaylist, songKeySummary } from './playlists';

const base = createPlaylist([], 'Warm up', 'p1');

describe('playlists', () => {
  it('creates, renames and deletes', () => {
    expect(base).toEqual([{ id: 'p1', name: 'Warm up', songIds: [] }]);
    expect(renamePlaylist(base, 'p1', 'Evening')[0].name).toBe('Evening');
    expect(deletePlaylist(base, 'p1')).toEqual([]);
  });

  it('adds a song once, removes and reorders', () => {
    let lists = addSong(addSong(addSong(base, 'p1', 'a'), 'p1', 'b'), 'p1', 'a');
    expect(lists[0].songIds).toEqual(['a', 'b']);
    lists = addSong(lists, 'p1', 'c');
    expect(moveSong(lists, 'p1', 2, 0)[0].songIds).toEqual(['c', 'a', 'b']);
    expect(removeSong(lists, 'p1', 'b')[0].songIds).toEqual(['a', 'c']);
  });

  it('knows which song comes next, and stops at the end', () => {
    const lists = addSong(addSong(base, 'p1', 'a'), 'p1', 'b');
    expect(nextSong(lists[0], 'a')).toBe('b');
    expect(nextSong(lists[0], 'b')).toBeNull();
  });
});

describe('songKeySummary', () => {
  it('works out the key and the easiest key from chord times', () => {
    expect(songKeySummary({ Fm: 80, 'C#': 40, Ab: 30, Bbm: 30 })).toEqual({ key: 'Fm', easiestKey: 'Em', easiestShift: -1 });
  });

  it('says nothing for a song without chords', () => {
    expect(songKeySummary({})).toBeNull();
  });
});
