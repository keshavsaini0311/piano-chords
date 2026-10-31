// One chord in the chart. Hover or focus shows its keys; click jumps there and selects it.
import { memo, useState } from 'react';
import { noteName, toPitchClass } from '../../domain/music';
import type { ChordEvent } from '../../domain/song';
import type { Voicing } from '../../domain/voicing';
import { player } from '../../services/player';
import { useViewStore } from '../../state/viewStore';
import { ChordName } from '../../ui/ChordName';
import { diagrams } from '../instrument/diagrams';
import { isUnsure } from '../../domain/timing';

type Props = { event: ChordEvent; label: string; voicing: Voicing; active: boolean; selected: boolean };

export const ChordChip = memo(function ChordChip({ event, label, voicing, active, selected }: Props) {
  const [open, setOpen] = useState(false);
  const profile = useViewStore((s) => s.profile);
  const selectChord = useViewStore((s) => s.selectChord);
  const Diagram = diagrams[profile.instrumentId];
  const className = ['chord-chip', active && 'active', selected && 'selected', isUnsure(event) && 'unsure'].filter(Boolean).join(' ');
  return (
    <span className="chord-chip-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        className={className}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => {
          selectChord(event.id);
          player.seek(event.start);
        }}
        title="Jump here"
      >
        <ChordName label={label} />
      </button>
      {open && voicing.length > 0 && (
        <span className="chord-popover" role="tooltip">
          <span className="chord-popover-head">
            <ChordName label={label} />
            <span className="muted small">{voicing.map((m) => noteName(toPitchClass(m), 'flats')).join(', ')}</span>
          </span>
          <Diagram range={profile.keyRange} now={voicing} showNoteNames={profile.showNoteNames} size="mini" />
        </span>
      )}
    </span>
  );
});
