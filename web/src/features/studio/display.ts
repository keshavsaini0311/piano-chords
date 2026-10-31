// Hooks that turn the stored song into what's on screen: labels, keys, voicings, current chord.
// Components use these instead of reading raw playback time.
import { useMemo } from 'react';
import { displayChord, simplifyChord, transposeChord, transposeKey, type Chord, type DisplaySettings } from '../../domain/music';
import type { Song } from '../../domain/song';
import { activeChordIndex, beatsUntilNextChord } from '../../domain/timing';
import { voicers, type Voicing } from '../../domain/voicing';
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

export function useActiveIndex(): number {
  const chords = useSong().chords;
  return usePlaybackStore((s) => activeChordIndex(chords, s.time));
}

export function useBeatsToNext(): number | null {
  const { chords, beats } = useSong();
  return usePlaybackStore((s) => beatsUntilNextChord(chords, beats, s.time));
}

export const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
