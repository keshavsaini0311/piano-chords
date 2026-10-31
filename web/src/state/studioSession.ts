// Opening a song in the studio: load it, load the audio, start the clock and autosave.
// The returned close() is safe to call at any point, including before loading finishes, so a fast
// Back or React StrictMode's double effect never leaves a stray clock or the wrong song behind.
import { api } from '../services/api';
import { startClock } from '../services/clock';
import { player } from '../services/player';
import { usePlaybackStore } from './playbackStore';
import { subscribeAutosave, useSongStore } from './songStore';
import { useViewStore } from './viewStore';

export function openStudio(songId: string, onError: (message: string) => void): () => void {
  let closed = false;
  let stopClock = () => {};
  const playback = usePlaybackStore.getState();
  const stopAutosave = subscribeAutosave();

  api
    .getSong(songId)
    .then(async (song) => {
      if (closed) return;
      useSongStore.getState().load(song);
      await player.load(api.audioUrl(songId));
      if (closed) return;
      player.setRate(playback.rate);
      player.onEnded(() => usePlaybackStore.getState().setPlaying(false));
      stopClock = startClock(player, playback.setTime, () => usePlaybackStore.getState().loop);
    })
    .catch((e: Error) => !closed && onError(e.message));

  return () => {
    closed = true;
    stopClock();
    stopAutosave();
    player.pause();
    playback.setPlaying(false);
    playback.setLoop(null);
    playback.setTime(0);
    useViewStore.getState().selectChord(null);
  };
}
