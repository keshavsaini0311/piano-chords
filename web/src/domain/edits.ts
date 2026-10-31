// Every edit is a pure (song) => song. Undo/redo, autosave and tests all rely on that.
import { parseChord, transposeChord, type Chord } from './music';
import { MIN_CHORD_SEC, type ChordEvent, type Song } from './song';

const indexOf = (song: Song, id: string) => song.chords.findIndex((c) => c.id === id);

function withChords(song: Song, chords: ChordEvent[]): Song {
  return { ...song, chords };
}

export function setChord(song: Song, id: string, chord: Chord): Song {
  return withChords(song, song.chords.map((c) => (c.id === id ? { ...c, chord } : c)));
}

/** The editor shows transposed names; undo the view's transpose before saving. */
export function setChordFromDisplay(song: Song, id: string, label: string, semitones: number): Song {
  return setChord(song, id, transposeChord(parseChord(label), -semitones));
}

/** Moves the boundary this chord shares with the previous one, clamped so both keep MIN_CHORD_SEC. */
export function moveChordStart(song: Song, id: string, newStart: number): Song {
  const i = indexOf(song, id);
  if (i < 0) return song;
  const current = song.chords[i];
  const prev = song.chords[i - 1];
  const touchesPrev = prev !== undefined && Math.abs(prev.end - current.start) < 1e-9;
  const lowest = prev ? (touchesPrev ? prev.start + MIN_CHORD_SEC : prev.end) : 0;
  const start = Math.min(Math.max(newStart, lowest), current.end - MIN_CHORD_SEC);
  return withChords(
    song,
    song.chords.map((c, j) => {
      if (j === i) return { ...c, start };
      if (j === i - 1 && touchesPrev) return { ...c, end: start };
      return c;
    }),
  );
}

export function splitChord(song: Song, id: string, at: number): Song {
  const i = indexOf(song, id);
  const target = song.chords[i];
  if (!target || at < target.start + MIN_CHORD_SEC || at > target.end - MIN_CHORD_SEC) return song;
  const first = { ...target, end: at };
  const second: ChordEvent = { id: crypto.randomUUID(), start: at, end: target.end, chord: target.chord };
  return withChords(song, [...song.chords.slice(0, i), first, second, ...song.chords.slice(i + 1)]);
}

export function mergeWithNext(song: Song, id: string): Song {
  const i = indexOf(song, id);
  const next = song.chords[i + 1];
  if (i < 0 || !next) return song;
  return withChords(
    song,
    song.chords.filter((c) => c.id !== next.id).map((c) => (c.id === id ? { ...c, end: next.end } : c)),
  );
}

/** Removes a chord; its time goes to the previous chord (or the next one, for the first chord). */
export function deleteChord(song: Song, id: string): Song {
  const i = indexOf(song, id);
  if (i < 0 || song.chords.length === 1) return song;
  const target = song.chords[i];
  const absorberIndex = i > 0 ? i - 1 : i + 1;
  return withChords(
    song,
    song.chords
      .map((c, j) => {
        if (j !== absorberIndex) return c;
        return i > 0 ? { ...c, end: target.end } : { ...c, start: target.start };
      })
      .filter((c) => c.id !== id),
  );
}

export function moveAnchor(song: Song, chordId: string, lineId: string, charIndex: number): Song {
  return { ...song, anchors: { ...song.anchors, [chordId]: { lineId, charIndex } } };
}
