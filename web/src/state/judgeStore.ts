// Practice checking: whether the mic is on, how loud it hears you, and the grade for each chord
// you've played this session (shown on the timeline and chart).
import { create } from 'zustand';
import type { Grade, Verdict } from '../domain/judge';

const RANK: Record<Grade, number> = { off: 0, right: 1 };

type JudgeState = {
  listening: boolean;
  level: number;
  current: Verdict | null;
  results: Record<string, Grade>; // best grade per chord id
  toggle: () => void;
  report: (chordId: string | null, verdict: Verdict | null, level: number) => void;
};

export const useJudgeStore = create<JudgeState>((set) => ({
  listening: false,
  level: 0,
  current: null,
  results: {},
  toggle: () => set((s) => ({ listening: !s.listening, current: null, level: 0, results: s.listening ? s.results : {} })),
  report: (chordId, verdict, level) =>
    set((s) => {
      const prev = chordId ? s.results[chordId] : undefined;
      const better = chordId && verdict && (!prev || RANK[verdict.grade] > RANK[prev]);
      return { level, current: verdict, results: better ? { ...s.results, [chordId]: verdict.grade } : s.results };
    }),
}));
