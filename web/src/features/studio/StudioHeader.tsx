import { useState } from 'react';
import { openLibrary } from '../../App';
import { useSongView } from '../../state/viewStore';
import { ChordName } from '../../ui/ChordName';
import type { Playlist } from '../../domain/playlists';
import { PracticeToggle } from '../judge/Practice';
import { KeyMenu } from '../transpose/KeyMenu';
import { useDisplay, useSong } from './display';

type Props = { playlist: Playlist | null; songId: string; onNext: (() => void) | null };

export function StudioHeader({ playlist, songId, onNext }: Props) {
  const song = useSong();
  const { semitones } = useSongView(song.id);
  const { currentKey, originalKey } = useDisplay();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="studio-header">
      <button className="back-button" onClick={() => openLibrary(playlist?.id)} aria-label="Back to your songs">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Songs
      </button>
      <div className="title">
        <div className="title-name">{song.title}</div>
        <div className="muted small">{song.artist}</div>
      </div>
      {playlist && (
        <div className="playlist-now">
          <span className="muted small">
            {playlist.name} · {playlist.songIds.indexOf(songId) + 1} of {playlist.songIds.length}
          </span>
          <button className="btn" onClick={onNext ?? undefined} disabled={!onNext} title="Plays automatically when this song ends">Next ›</button>
        </div>
      )}
      <PracticeToggle />
      <div className="key-control">
        <button className="key-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-haspopup="dialog">
          <span className="muted small">Key</span>
          <ChordName label={currentKey} />
          {semitones !== 0 && <span className="muted small">from {originalKey}</span>}
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
        </button>
        {menuOpen && <KeyMenu onClose={() => setMenuOpen(false)} />}
      </div>
    </header>
  );
}
