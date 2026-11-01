// The studio: loads the song and audio, runs the clock and autosave, and lays out the panels.
// Play mode puts the music stand (now/next + keys) up top; edit mode swaps in the editor panel.
import { useEffect, useRef, useState } from 'react';
import { openLibrary, openSong } from '../../App';
import { nextSong, type Playlist } from '../../domain/playlists';
import { api } from '../../services/api';
import { useSongStore } from '../../state/songStore';
import { openStudio, requestAutoplay } from '../../state/studioSession';
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

export function StudioScreen({ songId, playlistId }: { songId: string; playlistId: string | null }) {
  const song = useSongStore((s) => (s.song?.id === songId ? s.song : null));
  const mode = useViewStore((s) => s.mode);
  const [error, setError] = useState<string | null>(null);
  useShortcuts();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const next = playlist ? nextSong(playlist, songId) : null;
  const goNext = useRef<() => void>(() => {});
  goNext.current = () => {
    if (!next) return;
    requestAutoplay();
    openSong(next, playlistId);
  };
  useEffect(() => {
    if (playlistId) api.listPlaylists().then((all) => setPlaylist(all.find((p) => p.id === playlistId) ?? null), () => {});
  }, [playlistId]);
  useEffect(() => openStudio(songId, setError, () => goNext.current()), [songId]);

  if (error)
    return (
      <main className="studio-error">
        <p role="alert">This song could not be opened: {error}</p>
        <button className="btn" onClick={() => openLibrary(playlistId)}>Back to your songs</button>
      </main>
    );
  if (!song) return <main className="studio-loading muted">Opening the song…</main>;
  return (
    <div className="studio" data-mode={mode}>
      <div className="studio-top">
        <StudioHeader playlist={playlist} songId={songId} onNext={next ? () => goNext.current() : null} />
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
