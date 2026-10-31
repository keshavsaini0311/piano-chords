// One line: how many chords are flagged, and a button to jump to the next one (J / K also work).
import { reviewQueue } from '../../domain/timing';
import { player } from '../../services/player';
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

export function ReviewQueue() {
  const song = useSong();
  const count = reviewQueue(song.chords).length;
  if (!count) return null;
  return (
    <div className="review-line">
      <span className="muted small">{count === 1 ? '1 chord flagged as unsure' : `${count} chords flagged as unsure`}</span>
      <button className="btn" onClick={() => stepReview(song, 1)} title="J">Next flagged ›</button>
    </div>
  );
}
