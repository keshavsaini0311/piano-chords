// The current chord big, the next one with beat dots counting down to the change.
import { useActiveIndex, useBeatsToNext, useDisplay, useSong } from '../studio/display';

const MAX_DOTS = 4;

export function NowNextCard() {
  const { chords } = useSong();
  const index = useActiveIndex();
  const beatsLeft = useBeatsToNext();
  const { label } = useDisplay();
  const now = chords[index];
  const next = chords[index + 1] ?? (index === -1 ? chords.find((c) => c.start > 0) : undefined);
  const dots = beatsLeft === null ? 0 : Math.min(beatsLeft, MAX_DOTS);
  return (
    <div className="now-next">
      <div>
        <div className="lbl">Now</div>
        <div className="mono now-chord">{now ? label(now.chord) : '—'}</div>
      </div>
      <div>
        <div className="lbl">Next</div>
        <div className="mono next-chord">{next ? label(next.chord) : '—'}</div>
        <div className="beat-dots" aria-label={beatsLeft === null ? 'No next chord' : `${beatsLeft} beats to the change`}>
          {Array.from({ length: MAX_DOTS }, (_, i) => (
            <span key={i} className={i < dots ? 'beat-dot on' : 'beat-dot'} />
          ))}
        </div>
      </div>
    </div>
  );
}
