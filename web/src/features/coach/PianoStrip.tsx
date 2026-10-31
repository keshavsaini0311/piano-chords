// The keys for the current chord (orange) and the next chord (blue dots), drawn by the
// profile's instrument diagram.
import { diagrams } from '../instrument/diagrams';
import { useActiveIndex, useVoicings } from '../studio/display';
import { useViewStore } from '../../state/viewStore';

export function PianoStrip() {
  const index = useActiveIndex();
  const voicings = useVoicings();
  const profile = useViewStore((s) => s.profile);
  const Diagram = diagrams[profile.instrumentId];
  const now = voicings[index] ?? [];
  const next = voicings[index + 1] ?? (index === -1 ? voicings[0] : []) ?? [];
  return <Diagram range={profile.keyRange} now={now} next={next.filter((m) => !now.includes(m))} showNoteNames={profile.showNoteNames} />;
}
