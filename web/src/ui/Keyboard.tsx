// A keyboard drawing. Pure props, no store access, so the strip, popovers and picker all reuse it.
// `now` keys are filled orange with note names; `next` keys get a blue dot.
import { noteName, toPitchClass } from '../domain/music';
import { isBlackKey, type KeyRange } from '../domain/voicing';

export type KeyboardProps = { range: KeyRange; now: number[]; next?: number[]; showNoteNames: boolean; size?: 'strip' | 'mini' };

export function Keyboard({ range, now, next = [], showNoteNames, size = 'strip' }: KeyboardProps) {
  const keys = [];
  for (let midi = range.low; midi <= range.high; midi++) keys.push(midi);
  const whites = keys.filter((m) => !isBlackKey(m));
  const label = (midi: number) => {
    if (now.includes(midi)) return showNoteNames ? noteName(toPitchClass(midi), 'flats') : '';
    return size === 'strip' && midi % 12 === 0 ? `C${Math.floor(midi / 12) - 1}` : '';
  };
  const keyClass = (midi: number) => ['key', now.includes(midi) && 'key-now', next.includes(midi) && 'key-next'].filter(Boolean).join(' ');
  const names = now.map((m) => noteName(toPitchClass(m), 'flats')).join(' ');
  return (
    <div className={`keyboard keyboard-${size}`} role="img" aria-label={`Keyboard${names ? `, play ${names}` : ''}`}>
      <div className="keyboard-whites">
        {whites.map((m) => (
          <div key={m} className={`${keyClass(m)} key-white`}>
            {next.includes(m) && <span className="key-dot" />}
            <span className="key-label">{label(m)}</span>
          </div>
        ))}
      </div>
      {keys.filter(isBlackKey).map((m) => {
        const whitesBefore = whites.filter((w) => w < m).length;
        return (
          <div key={m} className={`${keyClass(m)} key-black`} style={{ left: `calc(${(whitesBefore / whites.length) * 100}% - var(--black-w) / 2)` }}>
            {next.includes(m) && <span className="key-dot" />}
            <span className="key-label">{label(m)}</span>
          </div>
        );
      })}
    </div>
  );
}
