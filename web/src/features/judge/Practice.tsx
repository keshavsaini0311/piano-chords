// "Check my playing": a header toggle, and a strip under the timeline that shows the chord to play,
// which of its notes the mic heard (plus any strays), a steady verdict, and the live run score.
// A run is one stretch of playback: pausing ends it, saves it, and opens the summary card.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createSettler, judge } from '../../domain/judge';
import { accidentalsForKey, chordPitchClasses, formatChord, noteName, type Chord, type PitchClass } from '../../domain/music';
import { nextGateAt, waitAction } from '../../domain/timing';
import { beatSeconds, createRunTracker, judgementFor, summarize, type Attempt } from '../../domain/score';
import { openMic } from '../../services/mic';
import { useJudgeStore } from '../../state/judgeStore';
import { usePlaybackStore } from '../../state/playbackStore';
import { resumeFromWait } from '../player/PlayerBar';
import { bestScore, usePracticeStore, type Live } from '../../state/practiceStore';
import { ChordName } from '../../ui/ChordName';
import { useActiveIndex, useDisplay, useSong } from '../studio/display';

const TICK_MS = 50;

const MicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" fill="currentColor" />
    <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export function PracticeToggle() {
  const { listening, toggle } = useJudgeStore();
  const songId = useSong().id;
  const best = bestScore(usePracticeStore((s) => s.runs[songId]));
  return (
    <button className="btn practice-toggle" aria-pressed={listening} onClick={toggle} title="Listens through your mic, tells you if you hit each chord and scores your run (M)">
      <MicIcon />
      {listening ? 'Checking…' : 'Check my playing'}
      {best !== null && <span className="practice-best">Best {best}</span>}
    </button>
  );
}

const trailingHits = (attempts: Attempt[]) => {
  let n = 0;
  for (let i = attempts.length - 1; i >= 0 && attempts[i].hitAfter !== null; i--) n++;
  return n;
};

export function PracticeStrip() {
  const song = useSong();
  const index = useActiveIndex();
  const { played, label, currentKey } = useDisplay();
  const { current, level, report, toggle, waitMode, toggleWait } = useJudgeStore();
  const { live: score, saveRun, setLive, openSummary } = usePracticeStore();
  const hasRuns = usePracticeStore((s) => !!s.runs[song.id]?.length);
  const playing = usePlaybackStore((s) => s.playing);
  const waiting = usePlaybackStore((s) => s.waiting);
  const loop = usePlaybackStore((s) => s.loop);
  const [error, setError] = useState<string | null>(null);
  const event = song.chords[index] ?? null;
  const target = event ? played(event.chord) : null;
  const accidentals = accidentalsForKey(currentKey);
  const before = song.chords[index - 1];
  const songBeat = useMemo(() => beatSeconds(song.beats), [song.beats]);
  const now = {
    songId: song.id,
    songBeat,
    gateAt: nextGateAt(song.chords, index, songBeat, loop),
    id: event?.id ?? null,
    target,
    label: event ? label(event.chord) : '',
    start: event?.start ?? 0,
    end: event?.end ?? 0,
    from: before && before.chord.kind === 'chord' && before.end === event?.start ? { label: label(before.chord), start: before.start, target: played(before.chord) } : null,
    name: (pc: PitchClass) => noteName(pc, accidentals),
  };
  const live = useRef(now);
  useEffect(() => void (live.current = now));

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    openMic().then(
      (mic) => {
        if (cancelled) return mic.close();
        const settle = createSettler();
        const beat = () => live.current.songBeat / usePlaybackStore.getState().rate; // real seconds per beat right now
        const tracker = createRunTracker();
        let wasPlaying = false;
        let shown: Live = usePracticeStore.getState().live;
        let popKey = 0;
        let popped: Attempt | null = null;
        const endRun = () => {
          const run = tracker.finish(usePlaybackStore.getState().rate, beat());
          if (run) saveRun(live.current.songId, run);
          else setLive((shown = { score: null, streak: 0, pop: null }));
        };
        const updateLive = () => {
          const done = tracker.attempts();
          const cur = tracker.current();
          const counted = cur?.hitAfter != null ? [...done, cur] : done;
          let pop = shown.pop;
          const newest = cur?.hitAfter != null ? cur : done.at(-1);
          if (newest && newest !== popped && (newest === cur || newest.hitAfter === null)) {
            popped = newest;
            pop = { judgement: judgementFor(newest, beat()).judgement, chord: newest.chord, key: ++popKey };
          }
          const next: Live = { score: counted.length ? summarize(counted, 1, beat(), '').score : null, streak: trailingHits(counted), pop };
          if (next.score !== shown.score || next.streak !== shown.streak || next.pop !== shown.pop) setLive((shown = next));
        };
        const id = setInterval(() => {
          const { chroma, level } = mic.read();
          const t = live.current;
          const pb = usePlaybackStore.getState();
          const { time, rate } = pb;
          const { waitMode } = useJudgeStore.getState();
          const playing = pb.playing && !waitMode; // wait mode scores nothing: it ends the run
          const raw = chroma && t.target ? judge(t.target, chroma) : null;
          const settled = t.id ? settle(t.id, raw) : null;
          report(t.id, settled, level);
          tracker.tick({ ...t, time, rate, playing, settled, raw });
          if (wasPlaying && !playing) endRun();
          wasPlaying = playing;
          if (playing) updateLive();
          const act = waitAction({ waitMode, playing: pb.playing, waiting: pb.waiting, time, gate: pb.gate, gateAt: t.gateAt, hit: settled?.grade === 'right', targetStart: t.id ? t.start : null });
          if (act === 'setGate') pb.setGate(t.gateAt);
          else if (act === 'resume') resumeFromWait(waitMode ? t.gateAt : null);
          else if (act === 'release') {
            pb.setWaiting(false);
            pb.setPlaying(false);
          }
          else if (act === 'clear') pb.setGate(null);
        }, TICK_MS);
        stop = () => {
          clearInterval(id);
          usePlaybackStore.getState().setGate(null);
          if (usePlaybackStore.getState().waiting) usePlaybackStore.getState().setPlaying(false); // audio is paused at the gate
          usePlaybackStore.getState().setWaiting(false);
          mic.close();
          endRun();
        };
      },
      () => setError('I can’t hear you: the mic is blocked. Allow it from the icon in the address bar, then try again.'),
    );
    return () => {
      cancelled = true;
      stop();
    };
  }, [report, saveRun, setLive]);

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
            {waiting && <>Waiting for {name(target)}. Play it to carry on.</>}
            {!waiting && !current && <span className="muted">Play it on your piano…</span>}
            {!waiting && current?.grade === 'right' && (
              <>
                ✓ Got it{formatChord(current.heard, accidentals) !== formatChord(target, accidentals) && <span className="muted"> ({name(current.heard)})</span>}
              </>
            )}
            {!waiting && current?.grade === 'off' && <>✗ Not quite: sounds like {name(current.heard)}</>}
          </p>
        </>
      )}
      <div className="practice-score" aria-live="off">
        {waitMode ? (
          <span className="muted small">Scores are off in Wait for me</span>
        ) : score.score === null ? (
          <span className="muted small">{playing ? 'Scoring this run…' : 'Press play to score a run'}</span>
        ) : (
          <>
            <span className="caption">Score</span>
            <b>{score.score}</b>
            {score.streak >= 3 && <span className="practice-streak" title="Chords in a row">🔥 {score.streak}</span>}
          </>
        )}
        {score.pop && (
          <span key={score.pop.key} className={`practice-pop ${score.pop.judgement.toLowerCase()}`}>
            {score.pop.judgement}
          </span>
        )}
      </div>
      <button className="btn" aria-pressed={waitMode} onClick={toggleWait} title="Wait for me (W): the song waits at each change until you play it">Wait for me</button>
      {waiting && <button className="btn" onClick={() => resumeFromWait(now.gateAt)}>Skip</button>}
      <button className="btn" onClick={() => openSummary(song.id)} disabled={!hasRuns} title="Your scores and what to work on">Progress</button>
      <button className="btn" onClick={toggle}>Stop</button>
    </section>
  );
}
