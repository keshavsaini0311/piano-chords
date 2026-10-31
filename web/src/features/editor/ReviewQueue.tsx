// Steps through the chords the detector was unsure about (J / K).
import { reviewQueue } from '../../domain/timing';
import { player } from '../../services/player';
import { useViewStore } from '../../state/viewStore';
import { ChordName } from '../../ui/ChordName';
import { formatTime, useDisplay, useSong } from '../studio/display';

/** Selects and plays the next (step 1) or previous (step -1) chord in the review queue. */
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
  const selected = useViewStore((s) => s.selectedChordId);
  const { label } = useDisplay();
  const ids = reviewQueue(song.chords);
  const byId = new Map(song.chords.map((c) => [c.id, c]));
  return (
    <section className="panel" aria-label="Chords to review">
      <div className="panel-head">
        <h2 className="section-title">To review ({ids.length})</h2>
        {ids.length > 0 && <span className="muted small">J and K step through them</span>}
      </div>
      {ids.length === 0 ? (
        <p className="muted small">Nothing flagged. Play it through and click any chord that sounds wrong.</p>
      ) : (
        <ol className="queue">
          {ids.map((id) => {
            const c = byId.get(id)!;
            return (
              <li key={id}>
                <button
                  aria-current={id === selected}
                  onClick={() => {
                    useViewStore.getState().selectChord(id);
                    player.seek(c.start);
                  }}
                  title={formatTime(c.start)}
                >
                  <ChordName label={label(c.chord)} /> <span className="muted small">{formatTime(c.start)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
