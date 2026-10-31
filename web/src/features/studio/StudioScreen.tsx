// The studio: loads the song and audio, runs the clock and autosave, and lays out the panels.
// Play mode puts the music stand (now/next + keys) up top; edit mode swaps in the editor panel.
import { useEffect, useState } from 'react';
import { openLibrary } from '../../App';
import { api } from '../../services/api';
import { startClock } from '../../services/clock';
import { player } from '../../services/player';
import { usePlaybackStore } from '../../state/playbackStore';
import { subscribeAutosave, useSongStore } from '../../state/songStore';
import { useViewStore } from '../../state/viewStore';
import { ChartPreview } from '../chart/ChartPreview';
import { NowNextCard } from '../coach/NowNextCard';
import { PianoStrip } from '../coach/PianoStrip';
import { Inspector } from '../editor/Inspector';
import { LyricsFinder } from '../editor/LyricsFinder';
import { ReviewQueue } from '../editor/ReviewQueue';
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
      useViewStore.getState().selectChord(null);
    };
  }, [songId]);

  if (error)
    return (
      <main className="studio-error">
        <p role="alert">This song could not be opened: {error}</p>
        <button className="btn" onClick={openLibrary}>Back to your songs</button>
      </main>
    );
  if (!song) return <main className="studio-loading muted">Opening the song…</main>;
  return (
    <div className="studio" data-mode={mode}>
      <StudioHeader />
      <Timeline />
      {mode === 'play' && (
        <section className="stand" aria-label="What to play">
          <NowNextCard />
          <div className="stand-keys">
            <PianoStrip />
          </div>
        </section>
      )}
      <div className="studio-body">
        <main className="studio-main">
          <ChartPreview />
        </main>
        {mode === 'edit' && (
          <aside className="studio-aside">
            <Inspector />
            <ReviewQueue />
            <LyricsFinder />
          </aside>
        )}
      </div>
      <PlayerBar />
    </div>
  );
}
