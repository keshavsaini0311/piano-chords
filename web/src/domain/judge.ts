// Grades what the mic hears against the chord you should be playing.
// right    = the chord's notes, nothing much else (any inversion/octave; the 5th may be left out)
// rightish = a different chord on the same root (C when the chart says Cmaj7, C7, Csus4…)
// off      = a different chord; `heard` says which one it sounded like
import { chordPitchClasses, toPitchClass, type Chord, type PitchClass } from './music';

export type Chroma = number[]; // 12 energies, index = pitch class
export type Grade = 'right' | 'rightish' | 'off';
export type Verdict = { grade: Grade; heard: Chord; notes: PitchClass[] };

const QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'aug', '5'];
const LOW_HZ = 75; // below ~D2 semitones sit closer than an FFT bin
const HIGH_HZ = 2100; // above this it's mostly overtones
const PEAK_RANGE_DB = 30; // peaks this far under the loudest one are noise
const OVERTONE_WEIGHT = 0.25; // a peak at a whole multiple of a lower note is mostly that note's overtone
const ON_RATIO = 0.3; // a note counts as played at 30% of the loudest note's energy
const EXTRA_RATIO = 0.2; // share of energy outside the chord still allowed for "right"
const MAX_NOTES = 5; // more "notes" than this at once is room noise, not a chord

/** Folds an FFT (dB per bin, as AnalyserNode gives it) into 12 pitch-class energies. */
export function chromaFromSpectrum(db: Float32Array, binHz: number): Chroma {
  const lo = Math.max(1, Math.ceil(LOW_HZ / binHz));
  const hi = Math.min(db.length - 2, Math.floor(HIGH_HZ / binHz));
  let loudest = -Infinity;
  for (let i = lo; i <= hi; i++) loudest = Math.max(loudest, db[i]);
  const chroma = new Array(12).fill(0);
  const fundamentals: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const [a, b, c] = [db[i - 1], db[i], db[i + 1]];
    if (b < a || b < c || b < loudest - PEAK_RANGE_DB) continue;
    const curve = a - 2 * b + c;
    const hz = (i + (curve ? (0.5 * (a - c)) / curve : 0)) * binHz; // parabolic peak: sub-bin pitch
    const overtone = fundamentals.some((f) => {
      const k = Math.round(hz / f);
      return k >= 2 && Math.abs(hz / (k * f) - 1) < 0.025;
    });
    if (!overtone) fundamentals.push(hz);
    chroma[toPitchClass(Math.round(69 + 12 * Math.log2(hz / 440)))] += 10 ** (b / 20) * (overtone ? OVERTONE_WEIGHT : 1);
  }
  return chroma;
}

const cosine = (chroma: Chroma, pcs: PitchClass[]) => {
  const norm = Math.hypot(...chroma) * Math.sqrt(pcs.length);
  return norm ? pcs.reduce((sum: number, pc) => sum + chroma[pc], 0) / norm : 0;
};

/** The chord shape that best explains the chroma. */
function closestChord(chroma: Chroma): Chord {
  let best = { chord: { kind: 'none' } as Chord, score: -1 };
  for (let root = 0; root < 12; root++)
    for (const quality of QUALITIES) {
      const chord: Chord = { kind: 'chord', root: root as PitchClass, quality };
      const score = cosine(chroma, chordPitchClasses(chord));
      if (score > best.score) best = { chord, score };
    }
  return best.chord;
}

export function judge(target: Chord, chroma: Chroma): Verdict | null {
  if (target.kind === 'none') return null;
  const loudest = Math.max(...chroma);
  const total = chroma.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const notes = chroma.flatMap((e, pc) => (e >= loudest * ON_RATIO ? [pc as PitchClass] : []));
  if (notes.length > MAX_NOTES) return null;
  const tones = chordPitchClasses(target);
  const fifth = toPitchClass(target.root + 7);
  const missing = tones.filter((pc) => !notes.includes(pc) && !(pc === fifth && tones.length >= 3));
  const extra = chroma.reduce((sum: number, e, pc) => (tones.includes(pc as PitchClass) ? sum : sum + e), 0) / total;
  if (!missing.length && extra <= EXTRA_RATIO) return { grade: 'right', heard: target, notes };
  const heard = closestChord(chroma);
  return { grade: heard.kind === 'chord' && heard.root === target.root ? 'rightish' : 'off', heard, notes };
}

/**
 * Steadies the raw ~10/s verdicts for one chord at a time: a grade shows once it wins a few
 * readings in a row, silence keeps the last grade up, and once you get it right it stays right
 * until the chord changes.
 */
export function createSettler(window = 5, needed = 3) {
  let chordId: string | null = null;
  let recent: Verdict[] = [];
  let shown: Verdict | null = null;
  return (id: string, verdict: Verdict | null): Verdict | null => {
    if (id !== chordId) [chordId, recent, shown] = [id, [], null];
    if (!verdict || shown?.grade === 'right') return shown;
    recent = [...recent.slice(1 - window), verdict];
    for (const grade of ['right', 'rightish', 'off'] as const) {
      const hits = recent.filter((v) => v.grade === grade);
      if (hits.length >= needed) return (shown = hits[hits.length - 1]);
    }
    return shown;
  };
}
