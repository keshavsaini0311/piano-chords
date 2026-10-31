// How things are shown: the player's profile, per-song view settings, and UI mode.
// Persisted to localStorage; storage failures (private mode) fall back to defaults.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { defaultProfile, type Profile } from '../domain/profile';

export type SongView = { semitones: number };
export const DEFAULT_SONG_VIEW: SongView = { semitones: 0 };

type ViewState = {
  profile: Profile;
  perSong: Record<string, SongView>;
  mode: 'play' | 'edit';
  selectedChordId: string | null;
  setSemitones: (songId: string, semitones: number) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  setMode: (mode: 'play' | 'edit') => void;
  selectChord: (id: string | null) => void;
};

const safeStorage = createJSONStorage(() => ({
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: settings just won't persist */
    }
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
}));

const wrapSemitones = (n: number) => ((((n + 5) % 12) + 12) % 12) - 5; // keep within -5..+6

export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
      profile: defaultProfile,
      perSong: {},
      mode: 'play',
      selectedChordId: null,
      setSemitones: (songId, semitones) =>
        set((s) => ({ perSong: { ...s.perSong, [songId]: { ...s.perSong[songId], semitones: wrapSemitones(semitones) } } })),
      updateProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      setMode: (mode) => set({ mode }),
      selectChord: (selectedChordId) => set({ selectedChordId }),
    }),
    { name: 'piano-chords:view', storage: safeStorage, partialize: (s) => ({ profile: s.profile, perSong: s.perSong }) },
  ),
);

export const useSongView = (songId: string): SongView => useViewStore((s) => s.perSong[songId] ?? DEFAULT_SONG_VIEW);
