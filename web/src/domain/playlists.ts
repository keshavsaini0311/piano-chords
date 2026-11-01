// Practice playlists: ordered lists of song ids. Pure edits, saved as a whole to <data>/playlists.json.
import { estimateKey, parseChord, transposeKey } from './music';
import { rankKeys } from './voicing';

export type Playlist = { id: string; name: string; songIds: string[] };

const update = (lists: Playlist[], id: string, change: (p: Playlist) => Playlist) => lists.map((p) => (p.id === id ? change(p) : p));

export const createPlaylist = (lists: Playlist[], name: string, id: string = crypto.randomUUID()): Playlist[] => [...lists, { id, name, songIds: [] }];
export const renamePlaylist = (lists: Playlist[], id: string, name: string) => update(lists, id, (p) => ({ ...p, name }));
export const deletePlaylist = (lists: Playlist[], id: string) => lists.filter((p) => p.id !== id);
export const addSong = (lists: Playlist[], id: string, songId: string) =>
  update(lists, id, (p) => (p.songIds.includes(songId) ? p : { ...p, songIds: [...p.songIds, songId] }));
export const removeSong = (lists: Playlist[], id: string, songId: string) => update(lists, id, (p) => ({ ...p, songIds: p.songIds.filter((s) => s !== songId) }));

export function moveSong(lists: Playlist[], id: string, from: number, to: number): Playlist[] {
  return update(lists, id, (p) => {
    const songIds = [...p.songIds];
    const [moved] = songIds.splice(from, 1);
    songIds.splice(to, 0, moved);
    return { ...p, songIds };
  });
}

export function nextSong(playlist: Playlist, songId: string): string | null {
  const at = playlist.songIds.indexOf(songId);
  return at >= 0 && at + 1 < playlist.songIds.length ? playlist.songIds[at + 1] : null;
}

/** For library cards: the song's key and the easiest key to play it in (fewest black-key chords). */
export function songKeySummary(chordTime: Record<string, number>): { key: string; easiestKey: string; easiestShift: number } | null {
  const entries = Object.entries(chordTime);
  if (!entries.length) return null;
  const events = entries.map(([label, seconds]) => ({ chord: parseChord(label), start: 0, end: seconds }));
  const key = estimateKey(events);
  const best = rankKeys(events.map((e) => e.chord), 'easy')[0];
  return { key, easiestKey: transposeKey(key, best.semitones), easiestShift: best.semitones };
}
