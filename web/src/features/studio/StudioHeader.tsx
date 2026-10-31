import { useState } from 'react';
import { openLibrary } from '../../App';
import { useSongView, useViewStore } from '../../state/viewStore';
import { ChordName } from '../../ui/ChordName';
import { KeyMenu } from '../transpose/KeyMenu';
import { useDisplay, useSong } from './display';

export function StudioHeader() {
  const song = useSong();
  const { semitones } = useSongView(song.id);
  const { mode, setMode } = useViewStore();
  const { currentKey, originalKey } = useDisplay();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="studio-header">
      <button className="ibtn" onClick={openLibrary} aria-label="Back to your songs">‹</button>
      <div className="title">
        <div className="title-name">{song.title}</div>
        <div className="muted small">{song.artist}</div>
      </div>
      <nav className="seg" aria-label="Mode">
        <button aria-pressed={mode === 'play'} onClick={() => setMode('play')}>Play</button>
        <button aria-pressed={mode === 'edit'} onClick={() => setMode('edit')} title="E">Edit chords</button>
      </nav>
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
