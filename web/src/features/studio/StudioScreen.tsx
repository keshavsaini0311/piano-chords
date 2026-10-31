// The studio: loads the song and audio, runs the clock and autosave, and lays out the panels.
import { useEffect, useState } from 'react';
import { openLibrary } from '../../App';
import { api } from '../../services/api';
import { startClock } from '../../services/clock';
import { player } from '../../services/player';
import { usePlaybackStore } from '../../state/playbackStore';
import { subscribeAutosave, useSongStore } from '../../state/songStore';
import { useViewStore } from '../../state/viewStore';
import { NowNextCard } from '../coach/NowNextCard';
import { PianoStrip } from '../coach/PianoStrip';
import { PlayerBar } from '../player/PlayerBar';
import { Timeline } from '../timeline/Timeline';
import { StudioHeader } from './StudioHeader';
import { useShortcuts } from './useShortcuts';

export function StudioScreen({ songId }: { songId: string }) {
  const song = useSongStore((s) => (s.song?.id === songId ? s.song : null));
  const mode = useViewStore((s) => s.mode);
  const [error, setError] = useState<string | null>(null);
  useShortcuts();

  useEffect(() => {
    let stopClock = () => {};
    const playback = usePlaybackStore.getState();
    api
      .getSong(songId)
      .then(async (loaded) => {
        useSongStore.getState().load(loaded);
        await player.load(api.audioUrl(songId));
        player.setRate(playback.rate);
        player.onEnded(() => usePlaybackStore.getState().setPlaying(false));
        stopClock = startClock(player, playback.setTime, () => usePlaybackStore.getState().loop);
      })
      .catch((e: Error) => setError(e.message));
    const stopAutosave = subscribeAutosave();
    return () => {
      stopClock();
      stopAutosave();
      player.pause();
      playback.setPlaying(false);
      playback.setLoop(null);
      playback.setTime(0);
    };
  }, [songId]);

  if (error)
    return (
      <main className="studio-error">
        <p role="alert">Could not open this song: {error}</p>
        <button className="btn" onClick={openLibrary}>Back to songs</button>
      </main>
    );
  if (!song) return <main className="studio-loading muted">Loading…</main>;
  return (
    <div className="studio" data-mode={mode}>
      <StudioHeader />
      <Timeline />
      <div className="studio-body">
        <main className="studio-main">
          <span className="lbl">Chart</span>
        </main>
        <aside className="studio-aside">
          <NowNextCard />
          <PianoStrip />
          <p className="muted small">Dashed blocks are chords the detector was unsure about. Press E to review them.</p>
        </aside>
      </div>
      <PlayerBar />
    </div>
  );
}
