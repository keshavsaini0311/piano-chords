// How things are shown: the player's profile, per-song view settings, and UI mode.
// Persisted to settings.json in the server's data folder (see settingsStorage.ts).
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { defaultProfile, type Profile } from '../domain/profile';
import { serverSettingsStorage } from './settingsStorage';

export type SongView = { semitones: number };
export const DEFAULT_SONG_VIEW: SongView = { semitones: 0 };

type ViewState = {
  profile: Profile;
  perSong: Record<string, SongView>;
  mode: 'play' | 'edit';
  selectedChordId: string | null;
  volume: number; // 0..1
  setVolume: (volume: number) => void;
  setSemitones: (songId: string, semitones: number) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  setMode: (mode: 'play' | 'edit') => void;
  selectChord: (id: string | null) => void;
};

const settingsStorage = createJSONStorage(serverSettingsStorage);

const wrapSemitones = (n: number) => ((((n + 5) % 12) + 12) % 12) - 5; // keep within -5..+6

export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
      profile: defaultProfile,
      perSong: {},
      mode: 'play',
      selectedChordId: null,
      volume: 1,
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setSemitones: (songId, semitones) =>
        set((s) => ({ perSong: { ...s.perSong, [songId]: { ...s.perSong[songId], semitones: wrapSemitones(semitones) } } })),
      updateProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      setMode: (mode) => set({ mode }),
      selectChord: (selectedChordId) => set({ selectedChordId }),
    }),
    { name: 'piano-chords:view', storage: settingsStorage, partialize: (s) => ({ profile: s.profile, perSong: s.perSong, volume: s.volume }) },
  ),
);

export const useSongView = (songId: string): SongView => useViewStore((s) => s.perSong[songId] ?? DEFAULT_SONG_VIEW);
