// The only code that talks to the server. Wire format uses label strings; the app uses Chord objects.
// Converting here keeps every other module free of the server's shape.
import { accidentalsForKey, estimateKey, formatChord, parseChord } from '../domain/music';
import type { Playlist } from '../domain/playlists';
import type { LyricLine, Song } from '../domain/song';

export type WireChord = { id: string; start: number; end: number; label: string; confidence?: number; alternatives?: string[] };
export type WireSong = Omit<Song, 'chords' | 'originalKey'> & { chords: WireChord[]; importedAt?: number };
export type JobState = 'queued' | 'running' | 'done' | 'done_without_lyrics' | 'failed';
export type Job = { id: string; song_id: string; state: JobState; stage: string | null; error: string | null };
export type SongSummary = { id: string; title: string; artist: string; duration: number; chordTime: Record<string, number>; hasLyrics: boolean };

export function fromWire(wire: WireSong): Song {
  const chords = wire.chords.map(({ label, alternatives, ...rest }) => ({
    ...rest,
    chord: parseChord(label),
    ...(alternatives ? { alternatives: alternatives.map(parseChord) } : {}),
  }));
  return { ...wire, chords, originalKey: estimateKey(chords) };
}

export function toWire(song: Song): WireSong {
  const accidentals = accidentalsForKey(song.originalKey);
  const { originalKey: _key, ...rest } = song;
  return {
    ...rest,
    chords: song.chords.map(({ chord, alternatives, ...c }) => ({
      ...c,
      label: formatChord(chord, accidentals),
      ...(alternatives ? { alternatives: alternatives.map((a) => formatChord(a, accidentals)) } : {}),
    })),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { headers: { 'content-type': 'application/json' }, ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed (${response.status})`);
  }
  return response.json();
}

export const api = {
  createSong: (url: string) =>
    request<{ songId: string; jobId: string }>('/api/songs', { method: 'POST', body: JSON.stringify({ url }) }),
  getJob: (id: string) => request<Job>(`/api/jobs/${id}`),
  listSongs: () => request<SongSummary[]>('/api/songs'),
  getSong: async (id: string) => fromWire(await request<WireSong>(`/api/songs/${id}`)),
  /** keepalive lets the save finish while the page unloads. */
  saveSong: (song: Song, keepalive = false) =>
    request(`/api/songs/${song.id}`, { method: 'PUT', body: JSON.stringify(toWire(song)), keepalive }),
  searchLyrics: async (id: string, title: string, artist: string) =>
    (await request<{ lyrics: LyricLine[] }>(`/api/songs/${id}/lyrics`, { method: 'POST', body: JSON.stringify({ title, artist }) })).lyrics,
  audioUrl: (id: string) => `/api/songs/${id}/audio`,
  coverUrl: (id: string) => `/api/songs/${id}/cover`,
  deleteSong: (id: string) => request(`/api/songs/${id}`, { method: 'DELETE' }),
  listPlaylists: () => request<Playlist[]>('/api/playlists'),
  savePlaylists: (playlists: Playlist[]) => request('/api/playlists', { method: 'PUT', body: JSON.stringify(playlists) }),
  getSetting: async (name: string) => (await request<{ value: string | null }>(`/api/settings/${encodeURIComponent(name)}`)).value,
  saveSetting: async (name: string, value: string) => {
    await request(`/api/settings/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify({ value }) });
  },
};
