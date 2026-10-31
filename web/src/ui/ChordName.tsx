import { withAccidentalGlyphs } from './chordGlyphs';

/** A chord symbol in the display face with proper ♭/♯. Screen readers get the plain label. */
export function ChordName({ label, className = '' }: { label: string; className?: string }) {
  return (
    <span className={`chord-name ${className}`} aria-label={label}>
      {withAccidentalGlyphs(label)}
    </span>
  );
}
