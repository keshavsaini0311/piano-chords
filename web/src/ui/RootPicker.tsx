// Choose a root note by tapping it on a one-octave keyboard: the natural picker for a piano player.
import { noteName, toPitchClass, type Accidentals, type PitchClass } from '../domain/music';
import { withAccidentalGlyphs } from './chordGlyphs';

const WHITE: PitchClass[] = [0, 2, 4, 5, 7, 9, 11];
const BLACK: { pc: PitchClass; afterWhite: number }[] = [
  { pc: 1, afterWhite: 1 }, { pc: 3, afterWhite: 2 }, { pc: 6, afterWhite: 4 }, { pc: 8, afterWhite: 5 }, { pc: 10, afterWhite: 6 },
];

type Props = { selected: PitchClass | null; accidentals: Accidentals; onPick: (pc: PitchClass) => void };

export function RootPicker({ selected, accidentals, onPick }: Props) {
  const key = (pc: PitchClass, className: string, style?: React.CSSProperties) => (
    <button key={pc} className={className} style={style} aria-pressed={selected === pc} onClick={() => onPick(toPitchClass(pc))} aria-label={`Root ${noteName(pc, accidentals)}`}>
      <span>{withAccidentalGlyphs(noteName(pc, accidentals))}</span>
    </button>
  );
  return (
    <div className="root-picker" role="group" aria-label="Root note">
      <div className="root-whites">{WHITE.map((pc) => key(pc, 'root-white'))}</div>
      {BLACK.map(({ pc, afterWhite }) => key(pc, 'root-black', { left: `calc(${(afterWhite / 7) * 100}% - 7%)` }))}
    </div>
  );
}
