// One slim bar under the timeline in edit mode: undo/redo, how to edit, and flagged chords.
import { reviewQueue } from '../../domain/timing';
import { player } from '../../services/player';
import { useSongStore } from '../../state/songStore';
import { useViewStore } from '../../state/viewStore';
import { useSong } from '../studio/display';

/** Selects and plays the next (step 1) or previous (step -1) flagged chord. */
export function stepReview(song: ReturnType<typeof useSong>, step: 1 | -1) {
  const ids = reviewQueue(song.chords);
  if (!ids.length) return;
  const { selectedChordId, selectChord } = useViewStore.getState();
  const at = selectedChordId ? ids.indexOf(selectedChordId) : -1;
  const id = ids[(at + step + ids.length) % ids.length];
  selectChord(id);
  player.seek(song.chords.find((c) => c.id === id)!.start);
}

const SAVE_LABEL = { saved: 'Saved', saving: 'Saving…', error: 'Not saved. Is the server running?' };

export function EditBar() {
  const song = useSong();
  const { undo, redo, past, future, saveState } = useSongStore();
  const flagged = reviewQueue(song.chords).length;
  return (
    <div className="edit-bar">
      <div className="seg" role="group" aria-label="History">
        <button onClick={undo} disabled={!past.length} title="⌘Z">Undo</button>
        <button onClick={redo} disabled={!future.length} title="⇧⌘Z">Redo</button>
      </div>
      <span className="muted small edit-hint">Click a chord to fix it. Drag its left edge to move the change.</span>
      {flagged > 0 && (
        <button className="chip-quiet" onClick={() => stepReview(song, 1)} title="J">
          {flagged} flagged · Next ›
        </button>
      )}
      <span className="muted small">{SAVE_LABEL[saveState]}</span>
    </div>
  );
}
