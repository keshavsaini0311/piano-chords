// Chord suggestions for fixing a wrong chord: the chords this song already uses, longest-playing
// first. A wrong detection is almost always one of the song's other chords.
import { formatChord, simplifyChord, type Chord, type Difficulty } from './music';
import type { Song } from './song';

export function chordsByUse(song: Song, difficulty: Difficulty, limit = 6): Chord[] {
  const time = new Map<string, { chord: Chord; seconds: number }>();
  for (const event of song.chords) {
    const chord = simplifyChord(event.chord, difficulty);
    if (chord.kind === 'none') continue;
    const key = formatChord(chord, 'sharps');
    const entry = time.get(key) ?? { chord, seconds: 0 };
    entry.seconds += event.end - event.start;
    time.set(key, entry);
  }
  return [...time.values()].sort((a, b) => b.seconds - a.seconds).slice(0, limit).map((e) => e.chord);
}
