// The song being edited, with snapshot undo/redo. Every change goes through apply(edit), where an
// edit is a pure (song) => song from domain/edits.ts.
import { create } from 'zustand';
import type { Song } from '../domain/song';
import { api } from '../services/api';

export const HISTORY_LIMIT = 100;
export type SaveState = 'saved' | 'saving' | 'error';

type SongState = {
  song: Song | null;
  past: Song[];
  future: Song[];
  revision: number; // bumps on every user change (not on load), which is what autosave watches
  saveState: SaveState;
  load: (song: Song) => void;
  apply: (edit: (song: Song) => Song) => void;
  undo: () => void;
  redo: () => void;
};

export const useSongStore = create<SongState>((set, get) => ({
  song: null,
  past: [],
  future: [],
  revision: 0,
  saveState: 'saved',
  load: (song) => set({ song, past: [], future: [], saveState: 'saved' }),
  apply: (edit) => {
    const { song, past, revision } = get();
    if (!song) return;
    const next = edit(song);
    if (next === song) return;
    set({ song: next, past: [...past, song].slice(-HISTORY_LIMIT), future: [], revision: revision + 1 });
  },
  undo: () => {
    const { song, past, future, revision } = get();
    if (!song || !past.length) return;
    set({ song: past[past.length - 1], past: past.slice(0, -1), future: [song, ...future], revision: revision + 1 });
  },
  redo: () => {
    const { song, past, future, revision } = get();
    if (!song || !future.length) return;
    set({ song: future[0], past: [...past, song], future: future.slice(1), revision: revision + 1 });
  },
}));

const AUTOSAVE_DELAY_MS = 800;

/** Saves the song shortly after the last change. Returns an unsubscribe function. */
export function subscribeAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = useSongStore.subscribe((state, previous) => {
    if (state.revision === previous.revision || !state.song) return;
    useSongStore.setState({ saveState: 'saving' });
    clearTimeout(timer);
    timer = setTimeout(() => {
      const song = useSongStore.getState().song;
      if (!song) return;
      api.saveSong(song).then(
        () => useSongStore.setState({ saveState: 'saved' }),
        () => useSongStore.setState({ saveState: 'error' }),
      );
    }, AUTOSAVE_DELAY_MS);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
