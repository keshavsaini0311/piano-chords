// Opening a song in the studio: load it, load the audio, start the clock and autosave.
// The returned close() is safe to call at any point, including before loading finishes, so a fast
// Back or React StrictMode's double effect never leaves a stray clock or the wrong song behind.
import { api } from '../services/api';
import { startClock } from '../services/clock';
import { player } from '../services/player';
import { usePlaybackStore } from './playbackStore';
import { subscribeAutosave, useSongStore } from './songStore';
import { useViewStore } from './viewStore';

let autoplayNext = false;
/** The next studio that opens starts playing by itself (used to continue through a playlist). */
export const requestAutoplay = () => (autoplayNext = true);

export function openStudio(songId: string, onError: (message: string) => void, onEnded: () => void = () => {}): () => void {
  let closed = false;
  let stopClock = () => {};
  const playback = usePlaybackStore.getState();
  const stopAutosave = subscribeAutosave();

  api
    .getSong(songId)
    .then(async (song) => {
      if (closed) return;
      useSongStore.getState().load(song);
      const saved = useViewStore.getState().perSong[songId]?.mix ?? 'full';
      await player.load(api.mixUrl(songId, saved === 'full' || song.mixes?.includes(saved) ? saved : 'full'));
      if (closed) return;
      player.setRate(playback.rate);
      player.setVolume(useViewStore.getState().volume);
      player.onEnded(() => {
        usePlaybackStore.getState().setPlaying(false);
        onEnded();
      });
      stopClock = startClock(player, playback.setTime, () => usePlaybackStore.getState().loop,
        () => usePlaybackStore.getState().gate,
        (at) => {
          player.pause();
          player.seek(at);
          usePlaybackStore.getState().setWaiting(true);
        },
      );
      if (autoplayNext) {
        autoplayNext = false;
        player.play();
        playback.setPlaying(true);
      }
    })
    .catch((e: Error) => !closed && onError(e.message));

  return () => {
    closed = true;
    stopClock();
    stopAutosave();
    player.pause();
    playback.setPlaying(false);
    playback.setLoop(null);
    playback.setGate(null);
    playback.setWaiting(false);
    playback.setTime(0);
    useViewStore.getState().selectChord(null);
  };
}
