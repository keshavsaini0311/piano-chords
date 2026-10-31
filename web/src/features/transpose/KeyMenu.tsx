// Every key the song could be played in, easiest first (fewest chords needing a black key),
// plus the player's difficulty and voicing preferences.
import { useEffect, useMemo, useRef } from 'react';
import { transposeKey } from '../../domain/music';
import { rankKeys } from '../../domain/voicing';
import { useSongView, useViewStore } from '../../state/viewStore';
import { ChordName } from '../../ui/ChordName';
import { useSong } from '../studio/display';

export function KeyMenu({ onClose }: { onClose: () => void }) {
  const song = useSong();
  const { semitones } = useSongView(song.id);
  const { profile, updateProfile, setSemitones } = useViewStore();
  const ranked = useMemo(() => rankKeys(song.chords.map((c) => c.chord), profile.difficulty), [song.chords, profile.difficulty]);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => !menu.current?.parentElement?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="key-menu" ref={menu} role="dialog" aria-label="Choose a key">
      <p>Keys with fewer black-key chords are easier to play. If the recording sounds off, use your keyboard's transpose.</p>
      <ul className="key-list">
        {ranked.map(({ semitones: s, blackKeyChords }) => (
          <li key={s}>
            <button
              className={blackKeyChords === 0 ? 'key-option all-white' : 'key-option'}
              aria-pressed={s === semitones}
              onClick={() => setSemitones(song.id, s)}
            >
              <ChordName label={transposeKey(song.originalKey, s)} />
              <span className="small">
                {blackKeyChords === 0 ? 'white keys only' : `${blackKeyChords} with black keys`}
                {s === 0 ? ', original' : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="seg" role="group" aria-label="Hand position">
        <button aria-pressed={profile.voicing === 'nearest'} onClick={() => updateProfile({ voicing: 'nearest' })}>Least hand movement</button>
        <button aria-pressed={profile.voicing === 'root'} onClick={() => updateProfile({ voicing: 'root' })}>Root position</button>
      </div>
      <label className="check">
        <input type="checkbox" checked={profile.showNoteNames} onChange={(e) => updateProfile({ showNoteNames: e.target.checked })} /> Show note names on the keys
      </label>
    </div>
  );
}
