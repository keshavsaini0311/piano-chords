// What to play now (big) and next, with beat dots counting down to the change.
import { ChordName } from '../../ui/ChordName';
import { useActiveIndex, useBeatsToNext, useDisplay, useSong } from '../studio/display';

const MAX_DOTS = 4;

export function NowNextCard() {
  const { chords } = useSong();
  const index = useActiveIndex();
  const beatsLeft = useBeatsToNext();
  const { label } = useDisplay();
  const now = chords[index];
  const next = index === -1 ? chords.find((c) => c.chord.kind === 'chord') : chords[index + 1];
  const dots = beatsLeft === null ? 0 : Math.min(beatsLeft, MAX_DOTS);
  return (
    <div className="now-next">
      <div>
        <div className="stand-caption">Now</div>
        <ChordName key={now?.id ?? 'none'} className="now-chord" label={now ? label(now.chord) : '–'} />
      </div>
      <div>
        <div className="stand-caption">Next</div>
        <ChordName key={next?.id ?? 'none'} className="next-chord" label={next ? label(next.chord) : '–'} />
        <div className="beat-dots" role="img" aria-label={beatsLeft === null ? 'Last chord' : `${beatsLeft} beats until the change`}>
          {Array.from({ length: MAX_DOTS }, (_, i) => (
            <span key={i} className={i < dots ? 'beat-dot on' : 'beat-dot'} />
          ))}
        </div>
      </div>
    </div>
  );
}
