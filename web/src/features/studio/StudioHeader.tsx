import { openLibrary } from '../../App';
import { useSongStore } from '../../state/songStore';
import { useSongView, useViewStore } from '../../state/viewStore';
import { UNSURE_BELOW } from '../timeline/Timeline';
import { useDisplay, useSong } from './display';

const SAVE_LABEL = { saved: 'saved', saving: 'saving…', error: 'not saved, retrying on next change' };

export function StudioHeader() {
  const song = useSong();
  const saveState = useSongStore((s) => s.saveState);
  const { semitones } = useSongView(song.id);
  const { mode, setMode, setSemitones, profile, updateProfile } = useViewStore();
  const { currentKey, originalKey } = useDisplay();
  const unsure = song.chords.filter((c) => (c.confidence ?? 1) < UNSURE_BELOW).length;
  return (
    <header className="studio-header">
      <button className="ibtn" onClick={openLibrary} aria-label="Back to songs">‹</button>
      <div className="title">
        <div className="title-name">{song.title}</div>
        <div className="muted small">
          {song.artist} · {song.chords.length} chords · {unsure} unsure · {SAVE_LABEL[saveState]}
        </div>
      </div>
      <nav className="seg" aria-label="Mode">
        <button aria-pressed={mode === 'play'} onClick={() => setMode('play')}>Play</button>
        <button aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>Edit</button>
      </nav>
      <div className="key-control">
        <span className="muted small">Key</span>
        <button className="ibtn" onClick={() => setSemitones(song.id, semitones - 1)} aria-label="Transpose down">−</button>
        <span className="mono key-name">{currentKey}</span>
        <button className="ibtn" onClick={() => setSemitones(song.id, semitones + 1)} aria-label="Transpose up">+</button>
        <span className="muted small key-from">{semitones ? `from ${originalKey} (${semitones > 0 ? '+' : ''}${semitones})` : 'original'}</span>
      </div>
      <div className="seg" role="group" aria-label="Difficulty">
        <button aria-pressed={profile.difficulty === 'easy'} onClick={() => updateProfile({ difficulty: 'easy' })}>Easy</button>
        <button aria-pressed={profile.difficulty === 'full'} onClick={() => updateProfile({ difficulty: 'full' })}>Full</button>
      </div>
    </header>
  );
}
