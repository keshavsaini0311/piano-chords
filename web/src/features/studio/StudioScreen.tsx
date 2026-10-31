// The studio: loads the song and audio, runs the clock and autosave, and lays out the panels.
// Play mode puts the music stand (now/next + keys) up top; edit mode swaps in the editor panel.
import { useEffect, useState } from 'react';
import { openLibrary } from '../../App';
import { useSongStore } from '../../state/songStore';
import { openStudio } from '../../state/studioSession';
import { useViewStore } from '../../state/viewStore';
import { ChartPreview } from '../chart/ChartPreview';
import { NowNextCard } from '../coach/NowNextCard';
import { PianoStrip } from '../coach/PianoStrip';
import { LyricsFinder } from '../editor/LyricsFinder';
import { EditBar } from '../editor/EditBar';
import { PlayerBar } from '../player/PlayerBar';
import { Timeline } from '../timeline/Timeline';
import { StudioHeader } from './StudioHeader';
import { useShortcuts } from './useShortcuts';

export function StudioScreen({ songId }: { songId: string }) {
  const song = useSongStore((s) => (s.song?.id === songId ? s.song : null));
  const mode = useViewStore((s) => s.mode);
  const [error, setError] = useState<string | null>(null);
  useShortcuts();

  useEffect(() => openStudio(songId, setError), [songId]);

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
      <div className="studio-top">
        <StudioHeader />
        {mode === 'edit' ? (
          <>
            <Timeline />
            <EditBar />
          </>
        ) : (
          <section className="stand" aria-label="What to play">
            <NowNextCard />
            <div className="stand-keys">
              <PianoStrip />
            </div>
          </section>
        )}
      </div>
      <div className="studio-body">
        <main className="studio-main">
          {song.lyrics.length === 0 && <LyricsFinder />}
          <ChartPreview />
          {song.lyrics.length > 0 && <LyricsFinder />}
        </main>
      </div>
      <PlayerBar />
    </div>
  );
}
