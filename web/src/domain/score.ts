// Practice scoring: turns the mic's steady verdicts into per-chord attempts while the song plays,
// scores a run, and reads the last few runs for what to practise next. Pure: no React, no stores.
import { chordPitchClasses, toPitchClass, type Chord, type PitchClass } from './music';
import type { Verdict } from './judge';

export type Role = 'root' | '3rd' | '5th' | '7th' | 'other';
export type Note = { name: string; role: Role };
export type Stray = { name: string; leftover: boolean }; // leftover = still ringing from the chord before
export type Attempt = {
  chord: string; // as shown when you played it
  from: string | null; // the chord before it: together they're the change you made
  loop: { start: number; end: number }; // song time from the previous chord to the end of this one
  hitAfter: number | null; // real seconds from the change to getting it; null = missed
  exact: boolean; // the chart's own notes, not just another chord on the same root
  missing: Note[];
  strays: Stray[];
};
export type Run = { at: string; rate: number; beat: number; score: number; hits: number; total: number; bestStreak: number; avgHit: number | null; attempts: Attempt[] };
export type Judgement = 'Perfect' | 'Great' | 'Good' | 'Late' | 'Missed';
export type Tip = { title: string; how: string; practice?: { start: number; end: number; rate: number } };

// Timing windows: the mic's own delay plus a number of beats, so fast songs are judged as tightly
// as slow ones feel. At 120 BPM they come to 0.5 / 0.9 / 1.5 s.
const DETECT_SEC = 0.25; // settling on a chord takes the mic about this long
const WINDOWS: [number, Judgement, number][] = [[0.5, 'Perfect', 100], [1.3, 'Great', 80], [2.5, 'Good', 60], [Infinity, 'Late', 40]];
const LATE_BEATS = WINDOWS[1][0]; // slower than Great is worth a tip
export const DEFAULT_BEAT = 0.5; // 120 BPM, when a song has no beats
const FLAVOUR_FACTOR = 0.8; // right root, different chord: still right, a bit fewer points
const JOINED_LATE_SEC = 0.5; // started listening mid-chord: that chord isn't scored
const NOTE_SHARE = 0.4; // a note counts as "missing" if it was missing in this share of readings
const MIN_ATTEMPTS = 4; // fewer scored chords than this isn't a run
export const RUNS_KEPT = 10;

/** Seconds per beat in song time: the median gap, so a few missed or doubled beats don't skew it. */
export function beatSeconds(beats: number[]): number {
  const gaps = beats.slice(1).map((b, i) => b - beats[i]).filter((g) => g > 0).sort((a, b) => a - b);
  if (!gaps.length) return DEFAULT_BEAT;
  return Math.min(1, Math.max(0.3, gaps[gaps.length >> 1])); // 60..200 BPM; outside that the tracker doubled or halved
}

/** How many beats after the change you landed it, not counting the mic's own delay. */
const beatsLate = (hitAfter: number, beat: number) => Math.max(0, hitAfter - DETECT_SEC) / beat;

/** `beat` is real seconds per beat at the speed you played (song beat / playback rate). */
export function judgementFor(a: Attempt, beat: number): { judgement: Judgement; points: number } {
  if (a.hitAfter === null) return { judgement: 'Missed', points: 0 };
  const [, judgement, points] = WINDOWS.find(([limit]) => beatsLate(a.hitAfter!, beat) <= limit)!;
  return { judgement, points: Math.round(points * (a.exact ? 1 : FLAVOUR_FACTOR)) };
}

export function letterFor(score: number): string {
  return score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D';
}

function roleOf(pc: PitchClass, root: PitchClass): Role {
  const interval = toPitchClass(pc - root);
  if (interval === 0) return 'root';
  if (interval === 3 || interval === 4) return '3rd';
  if (interval >= 6 && interval <= 8) return '5th';
  if (interval === 10 || interval === 11) return '7th';
  return 'other';
}

export type Tick = {
  id: string | null; // chord event at the playhead
  target: Chord | null; // as you should play it (transposed, simplified)
  label: string;
  start: number;
  end: number;
  from: { label: string; start: number; target: Chord } | null;
  time: number;
  rate: number;
  playing: boolean;
  settled: Verdict | null;
  raw: Verdict | null;
  name: (pc: PitchClass) => string;
};

/** Follows the song tick by tick and collects one attempt per chord you were there for. */
export function createRunTracker() {
  let attempts: Attempt[] = [];
  let open: { id: string; attempt: Attempt; readings: number; missing: Map<string, [Note, number]>; strays: Map<string, [Stray, number]> } | null = null;
  let seen: string | null = null;

  const close = () => {
    if (!open) return;
    const { attempt, readings, missing, strays } = open;
    if (attempt.hitAfter === null && readings) {
      const often = <T,>(m: Map<string, [T, number]>) => [...m.values()].filter(([, n]) => n >= readings * NOTE_SHARE).map(([v]) => v);
      attempt.missing = often(missing);
      attempt.strays = often(strays);
    }
    attempts.push(attempt);
    open = null;
  };

  const diff = (t: Tick, v: Verdict) => {
    const tones = chordPitchClasses(t.target!);
    const root = (t.target as { root: PitchClass }).root;
    const fifth = toPitchClass(root + 7);
    const before = t.from ? chordPitchClasses(t.from.target) : [];
    return {
      missing: tones.filter((pc) => !v.notes.includes(pc) && pc !== fifth).map((pc) => ({ name: t.name(pc), role: roleOf(pc, root) })),
      strays: v.notes.filter((pc) => !tones.includes(pc)).map((pc) => ({ name: t.name(pc), leftover: before.includes(pc) })),
    };
  };

  return {
    tick(t: Tick) {
      if (t.id !== seen) {
        close();
        seen = t.id;
        const fresh = t.time - t.start <= JOINED_LATE_SEC * t.rate;
        if (t.playing && fresh && t.id && t.target?.kind === 'chord')
          open = {
            id: t.id,
            readings: 0,
            missing: new Map(),
            strays: new Map(),
            attempt: { chord: t.label, from: t.from?.label ?? null, loop: { start: t.from?.start ?? t.start, end: t.end }, hitAfter: null, exact: false, missing: [], strays: [] },
          };
      }
      if (!open || !t.playing || open.attempt.hitAfter !== null) return;
      if (t.settled?.grade === 'right') {
        open.attempt.hitAfter = Math.round(Math.max(0, (t.time - t.start) / t.rate) * 100) / 100;
        const { heard } = t.settled;
        const target = t.target as Extract<Chord, { kind: 'chord' }>;
        open.attempt.exact = heard.kind === 'chord' && heard.root === target.root && heard.quality === target.quality;
        if (!open.attempt.exact) Object.assign(open.attempt, diff(t, t.settled));
      } else if (t.raw) {
        open.readings++;
        const { missing, strays } = diff(t, t.raw);
        for (const n of missing) open.missing.set(n.name, [n, (open.missing.get(n.name)?.[1] ?? 0) + 1]);
        for (const s of strays) open.strays.set(s.name, [s, (open.strays.get(s.name)?.[1] ?? 0) + 1]);
      }
    },
    /** Finished attempts this run, and the one in progress: for the live score. */
    attempts: () => attempts,
    current: () => open?.attempt ?? null,
    /** Ends the run. Returns it, or null if too short to count. */
    finish(rate: number, beat: number, at = new Date().toISOString()): Run | null {
      close();
      seen = null;
      const done = attempts;
      attempts = [];
      return done.length >= MIN_ATTEMPTS ? summarize(done, rate, beat, at) : null;
    },
  };
}

export function summarize(attempts: Attempt[], rate: number, beat: number, at: string): Run {
  let streak = 0;
  let bestStreak = 0;
  for (const a of attempts) {
    streak = a.hitAfter === null ? 0 : streak + 1;
    bestStreak = Math.max(bestStreak, streak);
  }
  const hits = attempts.filter((a) => a.hitAfter !== null);
  const total = attempts.reduce((sum, a) => sum + judgementFor(a, beat).points, 0);
  return {
    at,
    rate,
    beat,
    score: attempts.length ? Math.round(total / attempts.length) : 0,
    hits: hits.length,
    total: attempts.length,
    bestStreak,
    avgHit: hits.length ? hits.reduce((s, a) => s + a.hitAfter!, 0) / hits.length : null,
    attempts,
  };
}

const ROLE_HOW: Record<Role, (note: string, chord: string) => string> = {
  root: (n, c) => `${n} is the root, the note ${c} is named after. Put it at the bottom, or in your left hand.`,
  '3rd': (n, c) => `${n} is the 3rd: it's what makes ${c} sound ${/m(?!aj)/.test(c) ? 'minor' : 'major'}. Keep it in the middle of your hand.`,
  '5th': (n) => `Add ${n} on top.`,
  '7th': (n, c) => `${n} is the 7th that gives ${c} its colour. Add it on top of the triad.`,
  other: (n, c) => `${c} needs ${n} as well.`,
};

/** Up to three things to work on, worst first, from the most recent runs. */
export function tipsFor(runs: Run[], recent = 5): Tip[] {
  const last = runs.at(-1);
  if (!last) return [];
  // each attempt carries how many beats late it was, so runs at different speeds compare fairly
  const attempts = runs.slice(-recent).flatMap((r) => r.attempts.map((a) => ({ ...a, late: a.hitAfter === null ? null : beatsLate(a.hitAfter, r.beat ?? DEFAULT_BEAT) })));
  type Scored = (typeof attempts)[number];
  const tips: { weight: number; tip: Tip }[] = [];
  const practiceRate = Math.min(last.rate, 0.75);

  // 1. The changes you miss or land late on.
  const changes = new Map<string, Scored[]>();
  for (const a of attempts) if (a.from) changes.set(`${a.from} → ${a.chord}`, [...(changes.get(`${a.from} → ${a.chord}`) ?? []), a]);
  for (const [change, list] of changes) {
    if (list.length < 2) continue;
    const missed = list.filter((a) => a.hitAfter === null).length;
    const hits = list.filter((a) => a.late !== null);
    const avg = hits.length ? hits.reduce((s, a) => s + a.late!, 0) / hits.length : null;
    const missRate = missed / list.length;
    if (missRate < 0.34 && (avg === null || avg <= LATE_BEATS)) continue;
    const late = avg !== null && avg > LATE_BEATS ? `${missed ? ', and ' : ''}you land ${avg.toFixed(1)} beats late` : '';
    tips.push({
      weight: missRate + (avg ?? 4) / 4,
      tip: {
        title: `${change}: ${missed ? `missed ${missed} of ${list.length}` : ''}${late}`,
        how: `Loop just this change at ${practiceRate * 100}% until you get it 5 times in a row. Look at the next chord on the timeline while the current one rings, and start moving on the last beat.`,
        practice: { ...list.at(-1)!.loop, rate: practiceRate },
      },
    });
  }

  // 2. Notes you keep leaving out, and notes that keep sneaking in.
  const byChord = new Map<string, Scored[]>();
  for (const a of attempts) byChord.set(a.chord, [...(byChord.get(a.chord) ?? []), a]);
  for (const [chord, list] of byChord) {
    const count = <T extends { name: string }>(pick: (a: Attempt) => T[]) => {
      const m = new Map<string, [T, number]>();
      for (const a of list) for (const n of pick(a)) m.set(n.name, [n, (m.get(n.name)?.[1] ?? 0) + 1]);
      return [...m.values()].filter(([, n]) => list.length >= 2 && n / list.length >= NOTE_SHARE).sort((x, y) => y[1] - x[1])[0];
    };
    const missing = count((a) => a.missing);
    if (missing)
      tips.push({
        weight: missing[1] / list.length,
        tip: { title: `Your ${chord} keeps missing ${missing[0].name}`, how: ROLE_HOW[missing[0].role](missing[0].name, chord), practice: { ...list.at(-1)!.loop, rate: practiceRate } },
      });
    const stray = count((a) => a.strays);
    if (stray)
      tips.push({
        weight: (stray[1] / list.length) * 0.9,
        tip: {
          title: `${stray[0].name} keeps sounding in your ${chord}`,
          how: stray[0].leftover
            ? `${stray[0].name} is left over from the chord before. Lift your whole hand off the keys before you land on ${chord}, and use less sustain pedal.`
            : `${stray[0].name} isn't in ${chord}: check you're not catching the key next to the one you want.`,
          practice: { ...list.at(-1)!.loop, rate: practiceRate },
        },
      });
  }

  // 3. Overall pace.
  if (last.rate < 1 && last.score >= 85)
    tips.push({ weight: 0.3, tip: { title: `${last.score} at ${last.rate * 100}%: you're ready for more speed`, how: 'Bump the speed up one step and play the whole song again.' } });
  if (last.rate === 1 && last.score < 50)
    tips.push({ weight: 0.35, tip: { title: 'This tempo is a stretch right now', how: 'Drop the speed to 75% and play the whole song. Speed comes after the changes feel easy.' } });
  const lastLate = last.avgHit === null ? null : beatsLate(last.avgHit, last.beat ?? DEFAULT_BEAT);
  if (!tips.length && lastLate !== null && lastLate > LATE_BEATS)
    tips.push({ weight: 0.2, tip: { title: `You get the chords, about ${lastLate.toFixed(1)} beats after the change`, how: 'Look one chord ahead: the next chord is just right of the playhead. Start moving on the last beat of the current chord.' } });
  if (!tips.length)
    tips.push({ weight: 0, tip: { title: 'Clean run!', how: last.rate < 1 ? 'Try it one speed step faster.' : 'Switch to Full chords in the Key menu for the real voicings, or try another song.' } });

  return tips.sort((a, b) => b.weight - a.weight).slice(0, 3).map((t) => t.tip);
}
