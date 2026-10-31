import { useState } from 'react';
import { openLibrary } from '../../App';
import { reviewQueue } from '../../domain/timing';
import { useSongStore } from '../../state/songStore';
import { useSongView, useViewStore } from '../../state/viewStore';
import { ChordName } from '../../ui/ChordName';
import { KeyMenu } from '../transpose/KeyMenu';
import { useDisplay, useSong } from './display';

const SAVE_LABEL = { saved: 'Saved', saving: 'Saving…', error: 'Not saved. Is the server running?' };

export function StudioHeader() {
  const song = useSong();
  const { saveState, undo, redo, past, future } = useSongStore();
  const { semitones } = useSongView(song.id);
  const { mode, setMode, setSemitones, profile, updateProfile } = useViewStore();
  const { currentKey, originalKey } = useDisplay();
  const [menuOpen, setMenuOpen] = useState(false);
  const toReview = reviewQueue(song.chords).length;
  const shift = semitones ? `${semitones > 0 ? '+' : ''}${semitones} from ${originalKey}` : 'original key';
  return (
    <header className="studio-header">
      <button className="ibtn" onClick={openLibrary} aria-label="Back to your songs">‹</button>
      <div className="title">
        <div className="title-name">{song.title}</div>
        <div className="muted small">
          {song.artist}, {song.chords.length} chords{toReview ? `, ${toReview} to review` : ''}. {SAVE_LABEL[saveState]}
        </div>
      </div>
      {mode === 'edit' && (
        <div className="button-row">
          <button className="btn" onClick={undo} disabled={!past.length}>Undo</button>
          <button className="btn" onClick={redo} disabled={!future.length}>Redo</button>
        </div>
      )}
      <nav className="seg" aria-label="Mode">
        <button aria-pressed={mode === 'play'} onClick={() => setMode('play')}>Play</button>
        <button aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>Edit chords</button>
      </nav>
      <div className="key-control">
        <button className="ibtn" onClick={() => setSemitones(song.id, semitones - 1)} aria-label="Key down a semitone">−</button>
        <button className="key-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label={`Key ${currentKey}, ${shift}. Choose a key`}>
          <ChordName label={currentKey} />
          <span className="small">
            {shift}{' '}
            <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          </span>
        </button>
        <button className="ibtn" onClick={() => setSemitones(song.id, semitones + 1)} aria-label="Key up a semitone">+</button>
        {menuOpen && <KeyMenu onClose={() => setMenuOpen(false)} />}
      </div>
      <div className="seg" role="group" aria-label="Chord detail">
        <button aria-pressed={profile.difficulty === 'easy'} onClick={() => updateProfile({ difficulty: 'easy' })} title="Plain three-note chords">Simple</button>
        <button aria-pressed={profile.difficulty === 'full'} onClick={() => updateProfile({ difficulty: 'full' })} title="Chords as detected, with 7ths and sus">Full</button>
      </div>
    </header>
  );
}
