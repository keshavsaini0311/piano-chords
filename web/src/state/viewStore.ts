// How things are shown: the player's profile, per-song view settings, and selection.
// Persisted to settings.json in the server's data folder (see settingsStorage.ts).
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { MelodyLevel } from '../domain/melody';
import type { MixId } from '../domain/mix';
import { defaultProfile, type Profile } from '../domain/profile';
import { serverSettingsStorage } from './settingsStorage';

export type PlayMode = 'chords' | 'melody' | 'both'; // what you play: the chart, falling notes for the tune, or both hands
export type SongView = { semitones: number; mix?: MixId };
export const DEFAULT_SONG_VIEW: SongView = { semitones: 0 };

type ViewState = {
  profile: Profile;
  perSong: Record<string, SongView>;
  selectedChordId: string | null;
  volume: number; // 0..1
  playMode: PlayMode;
  melodyLevel: MelodyLevel; // how simple the falling tune is, separate from chord detail
  setPlayMode: (playMode: PlayMode) => void;
  setMelodyLevel: (melodyLevel: MelodyLevel) => void;
  setVolume: (volume: number) => void;
  setSemitones: (songId: string, semitones: number) => void;
  setMix: (songId: string, mix: MixId) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  selectChord: (id: string | null) => void;
};

const settingsStorage = createJSONStorage(serverSettingsStorage);

const wrapSemitones = (n: number) => ((((n + 5) % 12) + 12) % 12) - 5; // keep within -5..+6

export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
      profile: defaultProfile,
      perSong: {},
      selectedChordId: null,
      volume: 1,
      playMode: 'chords',
      melodyLevel: 'beat',
      setPlayMode: (playMode) => set({ playMode }),
      setMelodyLevel: (melodyLevel) => set({ melodyLevel }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setSemitones: (songId, semitones) =>
        set((s) => ({ perSong: { ...s.perSong, [songId]: { ...s.perSong[songId], semitones: wrapSemitones(semitones) } } })),
      setMix: (songId, mix) =>
        set((s) => ({ perSong: { ...s.perSong, [songId]: { ...(s.perSong[songId] ?? DEFAULT_SONG_VIEW), mix } } })),
      updateProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      selectChord: (selectedChordId) => set({ selectedChordId }),
    }),
    { name: 'piano-chords:view', storage: settingsStorage, partialize: (s) => ({ profile: s.profile, perSong: s.perSong, volume: s.volume, playMode: s.playMode, melodyLevel: s.melodyLevel }) },
  ),
);

export const useSongView = (songId: string): SongView => useViewStore((s) => s.perSong[songId] ?? DEFAULT_SONG_VIEW);
