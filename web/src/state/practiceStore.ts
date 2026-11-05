// Practice runs per song (saved to settings.json on the server, last RUNS_KEPT per song), the live
// score while you play, and which run's summary card is open.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { RUNS_KEPT, type Judgement, type Run } from '../domain/score';
import { serverSettingsStorage } from './settingsStorage';

export type Live = { score: number | null; streak: number; pop: { judgement: Judgement; chord: string; key: number } | null };
const IDLE: Live = { score: null, streak: 0, pop: null };

type PracticeState = {
  runs: Record<string, Run[]>;
  live: Live;
  summary: { songId: string; run: Run; newBest: boolean } | null;
  saveRun: (songId: string, run: Run) => void;
  setLive: (live: Live) => void;
  openSummary: (songId: string | null) => void;
};

export const usePracticeStore = create<PracticeState>()(
  persist(
    (set, get) => ({
      runs: {},
      live: IDLE,
      summary: null,
      saveRun: (songId, run) => {
        const before = get().runs[songId] ?? [];
        const newBest = before.length > 0 && run.score > Math.max(...before.map((r) => r.score));
        set((s) => ({ runs: { ...s.runs, [songId]: [...before, run].slice(-RUNS_KEPT) }, summary: { songId, run, newBest }, live: IDLE }));
      },
      setLive: (live) => set({ live }),
      openSummary: (songId) => {
        const run = songId ? get().runs[songId]?.at(-1) : undefined;
        set({ summary: songId && run ? { songId, run, newBest: false } : null });
      },
    }),
    { name: 'piano-chords:practice', storage: createJSONStorage(serverSettingsStorage), partialize: (s) => ({ runs: s.runs }) },
  ),
);

export const bestScore = (runs: Run[] | undefined) => (runs?.length ? Math.max(...runs.map((r) => r.score)) : null);
