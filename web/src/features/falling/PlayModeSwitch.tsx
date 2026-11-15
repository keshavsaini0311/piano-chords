// Chords · Melody · Both: what you play. A mode, so it lives in the studio header (DESIGN-SYSTEM §4).
import { useJudgeStore } from '../../state/judgeStore';
import { useViewStore, type PlayMode } from '../../state/viewStore';

const MODES: { id: PlayMode; label: string; title: string }[] = [
  { id: 'chords', label: 'Chords', title: 'The chord chart (N)' },
  { id: 'melody', label: 'Melody', title: 'The tune as falling notes, right hand (N)' },
  { id: 'both', label: 'Both', title: 'Tune in the right hand, chords in the left (N)' },
];

/** Mic checking grades chords, so Melody-only switches it off. */
export function setPlayMode(mode: PlayMode) {
  useViewStore.getState().setPlayMode(mode);
  if (mode === 'melody' && useJudgeStore.getState().listening) useJudgeStore.getState().toggle();
}

export const cyclePlayMode = () => {
  const i = MODES.findIndex((m) => m.id === useViewStore.getState().playMode);
  setPlayMode(MODES[(i + 1) % MODES.length].id);
};

export function PlayModeSwitch() {
  const mode = useViewStore((s) => s.playMode);
  return (
    <div className="seg" role="group" aria-label="What to play">
      {MODES.map((m) => (
        <button key={m.id} aria-pressed={mode === m.id} title={m.title} onClick={() => setPlayMode(m.id)}>
          {m.label}
        </button>
      ))}
    </div>
  );
}
