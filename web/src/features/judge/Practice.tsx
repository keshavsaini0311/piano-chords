// "Check my playing": a header toggle, and a strip under the timeline that shows the chord to play,
// which of its notes the mic heard (plus any strays), and a steady verdict.
import { useEffect, useRef, useState } from 'react';
import { createSettler, judge } from '../../domain/judge';
import { accidentalsForKey, chordPitchClasses, formatChord, noteName, type Chord, type PitchClass } from '../../domain/music';
import { openMic } from '../../services/mic';
import { useJudgeStore } from '../../state/judgeStore';
import { ChordName } from '../../ui/ChordName';
import { useActiveIndex, useDisplay, useSong } from '../studio/display';

const TICK_MS = 100;

const MicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" fill="currentColor" />
    <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export function PracticeToggle() {
  const { listening, toggle } = useJudgeStore();
  return (
    <button className="btn practice-toggle" aria-pressed={listening} onClick={toggle} title="Listens through your mic and tells you if you hit the chord (M)">
      <MicIcon />
      {listening ? 'Checking…' : 'Check my playing'}
    </button>
  );
}

export function PracticeStrip() {
  const song = useSong();
  const index = useActiveIndex();
  const { played, currentKey } = useDisplay();
  const { current, level, report, toggle } = useJudgeStore();
  const [error, setError] = useState<string | null>(null);
  const event = song.chords[index] ?? null;
  const target = event ? played(event.chord) : null;
  const live = useRef({ id: null as string | null, target });
  useEffect(() => void (live.current = { id: event?.id ?? null, target }));

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    openMic().then(
      (mic) => {
        if (cancelled) return mic.close();
        const settle = createSettler();
        const id = setInterval(() => {
          const { chroma, level } = mic.read();
          const { id, target } = live.current;
          const raw = chroma && target ? judge(target, chroma) : null;
          report(id, id ? settle(id, raw) : null, level);
        }, TICK_MS);
        stop = () => {
          clearInterval(id);
          mic.close();
        };
      },
      () => setError('I can’t hear you: the mic is blocked. Allow it from the icon in the address bar, then try again.'),
    );
    return () => {
      cancelled = true;
      stop();
    };
  }, [report]);

  const accidentals = accidentalsForKey(currentKey);
  const note = (pc: PitchClass) => noteName(pc, accidentals);
  const name = (c: Chord) => <ChordName label={formatChord(c, accidentals)} />;
  const tones = target ? chordPitchClasses(target) : [];
  const heard = current?.notes ?? [];
  const strays = heard.filter((pc) => !tones.includes(pc));

  return (
    <section className="practice" aria-label="Checking your playing">
      <div className="practice-level" role="meter" aria-label="Mic level" aria-valuemin={0} aria-valuemax={1} aria-valuenow={level}>
        <MicIcon />
        <span className="practice-level-bar"><span style={{ transform: `scaleX(${level})` }} /></span>
      </div>
      {error ? (
        <p className="practice-message error" role="alert">{error}</p>
      ) : !target || target.kind === 'none' ? (
        <p className="practice-message muted">No chord here. Get ready for the next one.</p>
      ) : (
        <>
          <div className="practice-target">
            <span className="caption">Play</span>
            {name(target)}
          </div>
          <ul className="practice-notes" aria-label="Notes">
            {tones.map((pc) => (
              <li key={pc} className={heard.includes(pc) ? 'hit' : ''} title={heard.includes(pc) ? 'Heard' : 'Not heard yet'}>{note(pc)}</li>
            ))}
            {strays.map((pc) => (
              <li key={`x${pc}`} className="stray" title="Not in this chord">+{note(pc)}</li>
            ))}
          </ul>
          <p className={`practice-verdict ${current?.grade ?? ''}`} aria-live="polite">
            {!current && <span className="muted">Play it on your piano…</span>}
            {current?.grade === 'right' && <>✓ Got it</>}
            {current?.grade === 'rightish' && <>≈ Close: you played {name(current.heard)}. Right root, the chart wants {name(target)}</>}
            {current?.grade === 'off' && <>✗ Not quite: sounds like {name(current.heard)}</>}
          </p>
        </>
      )}
      <span className="practice-tip muted small">Headphones help: then I only hear you.</span>
      <button className="btn" onClick={toggle}>Stop</button>
    </section>
  );
}
