// Keyboard shortcuts for the studio. Ignored while typing in a field.
import { useEffect } from 'react';
import { activeChordIndex } from '../../domain/timing';
import { player } from '../../services/player';
import { usePlaybackStore } from '../../state/playbackStore';
import { useSongStore } from '../../state/songStore';
import { useViewStore } from '../../state/viewStore';
import { stepReview } from '../editor/EditBar';
import { isTypingTarget } from './shortcutTarget';
import { toggleLoop, togglePlay } from '../player/PlayerBar';

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (isTypingTarget(target.tagName, target.getAttribute('type'), target.isContentEditable)) return;
      const song = useSongStore.getState().song;
      if (!song) return;
      const view = useViewStore.getState();
      const time = usePlaybackStore.getState().time;
      const index = activeChordIndex(song.chords, time);
      const undoKey = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z';
      if (undoKey) {
        e.preventDefault();
        if (e.shiftKey) useSongStore.getState().redo();
        else useSongStore.getState().undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const semitones = view.perSong[song.id]?.semitones ?? 0;
      const actions: Record<string, () => void> = {
        ' ': togglePlay,
        ArrowLeft: () => player.seek(song.chords[Math.max(0, index - 1)]?.start ?? 0),
        ArrowRight: () => player.seek(song.chords[index + 1]?.start ?? time),
        '[': () => view.setSemitones(song.id, semitones - 1),
        ']': () => view.setSemitones(song.id, semitones + 1),
        l: () => toggleLoop(song.chords),
        e: () => view.setMode(view.mode === 'play' ? 'edit' : 'play'),
        Escape: () => view.selectChord(null),
        j: () => view.mode === 'edit' && stepReview(song, 1),
        k: () => view.mode === 'edit' && stepReview(song, -1),
      };
      const action = actions[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
