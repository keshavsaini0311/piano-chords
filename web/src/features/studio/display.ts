// Hooks that turn the stored song into what's on screen: labels, keys, voicings, current chord.
// Components use these instead of reading raw playback time.
import { useMemo } from 'react';
import { displayChord, simplifyChord, transposeChord, transposeKey, type Chord, type DisplaySettings } from '../../domain/music';
import { displayRange, handRanges, melodyNotes, rankMelodyKeys } from '../../domain/melody';
import type { NoteEvent, Song } from '../../domain/song';
import { activeChordIndex } from '../../domain/timing';
import { voicers, type KeyRange, type Voicing } from '../../domain/voicing';
import { usePlaybackStore } from '../../state/playbackStore';
import { useSongStore } from '../../state/songStore';
import { useSongView, useViewStore } from '../../state/viewStore';

export const useSong = (): Song => useSongStore((s) => s.song!);

export function useDisplay() {
  const song = useSong();
  const { semitones } = useSongView(song.id);
  const difficulty = useViewStore((s) => s.profile.difficulty);
  return useMemo(() => {
    const settings: DisplaySettings = { semitones, difficulty, spelling: 'auto' };
    return {
      settings,
      originalKey: song.originalKey,
      currentKey: transposeKey(song.originalKey, semitones),
      label: (chord: Chord) => displayChord(chord, settings, song.originalKey),
      played: (chord: Chord) => transposeChord(simplifyChord(chord, difficulty), semitones),
    };
  }, [song.originalKey, semitones, difficulty]);
}

/** Keys to press for every chord, each voiced from the previous one so the hand stays put. */
export function useVoicings(): Voicing[] {
  const chords = useSong().chords;
  const { played } = useDisplay();
  const { voicing, keyRange } = useViewStore((s) => s.profile);
  return useMemo(() => {
    const voicer = voicers[voicing];
    const out: Voicing[] = [];
    let previous: Voicing | null = null;
    for (const event of chords) {
      const v = voicer(played(event.chord), previous, keyRange);
      out.push(v);
      if (v.length) previous = v;
    }
    return out;
  }, [chords, played, voicing, keyRange]);
}

export type FallingNote = NoteEvent & { hand: 'left' | 'right' };

/** What falls in Melody / Both mode, at the melody level and key you're viewing, and the keyboard to draw it on.
Null while the server is still finding the melody. Both: chords in the bottom octave, the tune above.
`easiest`: the transpose that puts the fewest tune notes on black keys, and how many land there now and then. */
export function useFallingNotes(): {
  notes: FallingNote[];
  range: KeyRange;
  blackKeyNotes: number;
  easiest: { semitones: number; blackKeyNotes: number };
} | null {
  const song = useSong();
  const { semitones } = useSongView(song.id);
  const { played } = useDisplay();
  const { voicing, keyRange } = useViewStore((s) => s.profile);
  const level = useViewStore((s) => s.melodyLevel);
  const both = useViewStore((s) => s.playMode === 'both');
  return useMemo(() => {
    if (!song.melody) return null;
    const hands = both ? handRanges(keyRange) : null;
    const fitTo = hands ? hands.right : level === 'full' ? null : keyRange;
    const view = { level, fitTo, beats: song.beats };
    const tune = melodyNotes(song.melody, { ...view, semitones });
    // ponytail: ranks the tune only; in Both the left-hand chords can still need black keys (the key menu ranks those)
    const ranked = rankMelodyKeys(melodyNotes(song.melody, { ...view, semitones: 0, fitTo: null }));
    const notes: FallingNote[] = tune.map((n) => ({ ...n, hand: 'right' }));
    if (hands) {
      let previous: Voicing | null = null;
      for (const event of song.chords) {
        const v = voicers[voicing](played(event.chord), previous, hands.left);
        if (v.length) previous = v;
        for (const midi of v) notes.push({ start: event.start, end: event.end, midi, hand: 'left' });
      }
    }
    return {
      notes,
      range: displayRange(notes.map((n) => n.midi), keyRange),
      blackKeyNotes: ranked.find((r) => r.semitones === semitones)?.blackKeyNotes ?? 0,
      easiest: ranked[0],
    };
  }, [song.melody, song.chords, song.beats, semitones, played, level, voicing, keyRange, both]);
}

export function useActiveIndex(): number {
  const chords = useSong().chords;
  return usePlaybackStore((s) => activeChordIndex(chords, s.time));
}

export const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
