import { formatChord, parseChord, simplifyChord, transposeChord, type Difficulty } from './music';
import { DEFAULT_BEAT, judgementFor, type Run } from './score';

export type Level = 'new' | 'learning' | 'solid' | 'mastered';
export type ChordSkill = { chord: string; attempts: number; score: number; level: Level };
type SongChords = { id: string; chords: Record<string, number> };

const RECENT = 20; // attempts that count per chord
const MAIN_SHARE = 0.03; // a chord under this share of a song is a passing chord

/** One key per sound, whatever the spelling; no key for N.C. */
export function chordKey(label: string): string | null {
  const chord = parseChord(label);
  return chord.kind === 'none' ? null : formatChord(chord, 'sharps');
}

const levelOf = (attempts: number, score: number): Level =>
  attempts < 3 ? 'new' : score >= 85 && attempts >= 5 ? 'mastered' : score >= 65 ? 'solid' : 'learning';

/** Skill per chord from its last 20 attempts across every song. */
export function mastery(runsBySong: Record<string, Run[]>): Map<string, ChordSkill> {
  const byChord = new Map<string, { at: string; points: number }[]>();
  for (const run of Object.values(runsBySong).flat())
    for (const a of run.attempts) {
      const key = chordKey(a.chord);
      if (key) byChord.set(key, [...(byChord.get(key) ?? []), { at: run.at, points: judgementFor(a, run.beat ?? DEFAULT_BEAT).points }]);
    }
  const skills = new Map<string, ChordSkill>();
  for (const [chord, list] of byChord) {
    const last = list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).slice(-RECENT); // stable: ties keep run order
    const score = last.reduce((s, x) => s + x.points, 0) / last.length;
    skills.set(chord, { chord, attempts: last.length, score, level: levelOf(last.length, score) });
  }
  return skills;
}

/** A song's chord seconds as you'd play them: simplified, transposed, spelling-free. */
export function songChordsAsPlayed(chordTime: Record<string, number>, semitones: number, difficulty: Difficulty): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [label, sec] of Object.entries(chordTime)) {
    const chord = simplifyChord(parseChord(label), difficulty);
    const key = chordKey(formatChord(transposeChord(chord, semitones), 'sharps'));
    if (key) out[key] = (out[key] ?? 0) + sec;
  }
  return out;
}

const known = (skills: Map<string, ChordSkill>, chord: string) => ['solid', 'mastered'].includes(skills.get(chord)?.level ?? '');
const mainChords = (chords: Record<string, number>) => {
  const total = Object.values(chords).reduce((s, x) => s + x, 0);
  return Object.keys(chords).filter((c) => chords[c] / total >= MAIN_SHARE);
};
const gaps = (song: SongChords, skills: Map<string, ChordSkill>) => mainChords(song.chords).filter((c) => !known(skills, c));

export function playableSongs(songs: SongChords[], skills: Map<string, ChordSkill>): string[] {
  return songs.filter((s) => Object.keys(s.chords).length && !gaps(s, skills).length).map((s) => s.id);
}

/** The chords to learn next: most songs unlocked first, then most time spent in them. */
export function nextToLearn(songs: SongChords[], skills: Map<string, ChordSkill>, limit = 3): { chord: string; unlocks: string[] }[] {
  const found = new Map<string, { unlocks: string[]; seconds: number }>();
  for (const song of songs) {
    const missing = gaps(song, skills);
    for (const chord of missing) {
      const f = found.get(chord) ?? { unlocks: [], seconds: 0 };
      if (missing.length === 1) f.unlocks.push(song.id);
      f.seconds += song.chords[chord];
      found.set(chord, f);
    }
  }
  return [...found].sort(([, a], [, b]) => b.unlocks.length - a.unlocks.length || b.seconds - a.seconds).slice(0, limit).map(([chord, f]) => ({ chord, unlocks: f.unlocks }));
}
