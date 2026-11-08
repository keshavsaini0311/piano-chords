// The card after a run: grade, score, how it went chord by chord, your recent runs, and what to
// work on next with a button that sets up the loop for it.
import { useEffect, useRef } from 'react';
import { DEFAULT_BEAT, judgementFor, letterFor, tipsFor, type Tip } from '../../domain/score';
import { player } from '../../services/player';
import { usePlaybackStore } from '../../state/playbackStore';
import { bestScore, usePracticeStore } from '../../state/practiceStore';

function practise({ start, end, rate }: NonNullable<Tip['practice']>) {
  const playback = usePlaybackStore.getState();
  player.setRate(rate);
  playback.setRate(rate);
  playback.setLoop({ start, end });
  player.seek(start);
  player.play();
  playback.setPlaying(true);
}

export function RunSummary() {
  const summary = usePracticeStore((s) => s.summary);
  const allRuns = usePracticeStore((s) => s.runs);
  const runs = (summary && allRuns[summary.songId]) || [];
  const close = () => usePracticeStore.getState().openSummary(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (summary && !dialog.current?.open) dialog.current?.showModal();
  }, [summary]);
  if (!summary) return null;

  const { run, newBest } = summary;
  const at = runs.findIndex((r) => r.at === run.at);
  const previous = at > 0 ? runs[at - 1] : null;
  const best = bestScore(runs);
  const tips = tipsFor(runs.slice(0, at + 1));
  const letter = letterFor(run.score);
  return (
    <dialog ref={dialog} className="run-card" onClose={close} aria-labelledby="run-card-title">
      <header className="run-card-head">
        <h2 id="run-card-title">Run complete</h2>
        <span className="muted small" title="Timing windows follow the tempo you played at">
          {run.rate < 1 ? `at ${run.rate * 100}% speed` : 'full speed'} · {Math.round(60 / (run.beat ?? DEFAULT_BEAT))} BPM
        </span>
        <button className="btn run-card-close" onClick={close} aria-label="Close">✕</button>
      </header>

      <div className="run-grade">
        <span className={`run-letter grade-${letter.toLowerCase()}`}>{letter}</span>
        <div>
          <div className="run-score">{run.score}<span className="muted"> / 100</span></div>
          {newBest ? (
            <span className="run-badge">New best!</span>
          ) : (
            best !== null && <span className="muted small">Best {best}</span>
          )}
          {previous && (
            <span className={`small run-trend ${run.score >= previous.score ? 'up' : 'down'}`}>
              {run.score >= previous.score ? '▲' : '▼'} {Math.abs(run.score - previous.score)} vs last run
            </span>
          )}
        </div>
      </div>

      <dl className="run-stats">
        <div><dt>Chords hit</dt><dd>{run.hits} / {run.total}</dd></div>
        <div><dt>Best streak</dt><dd>{run.bestStreak}</dd></div>
        <div><dt>Avg time to land</dt><dd>{run.avgHit === null ? '–' : `${run.avgHit.toFixed(1)} s`}</dd></div>
      </dl>

      <ol className="run-chords" aria-label="Each chord in this run">
        {run.attempts.map((a, i) => {
          const { judgement, points } = judgementFor(a, run.beat ?? DEFAULT_BEAT);
          return <li key={i} className={judgement.toLowerCase()} title={`${a.chord}: ${judgement}${a.hitAfter !== null ? ` (${a.hitAfter.toFixed(1)} s, +${points})` : ''}`} />;
        })}
      </ol>
      <p className="run-legend muted small">
        <span className="perfect" /> Perfect <span className="great" /> Great <span className="good" /> Good <span className="late" /> Late <span className="missed" /> Missed
      </p>

      <h3 className="section-title">Work on next</h3>
      <ul className="run-tips">
        {tips.map((tip) => (
          <li key={tip.title}>
            <div>
              <strong>{tip.title}</strong>
              <p className="muted small">{tip.how}</p>
            </div>
            {tip.practice && (
              <button
                className="btn"
                onClick={() => {
                  close();
                  practise(tip.practice!);
                }}
              >
                Practise this
              </button>
            )}
          </li>
        ))}
      </ul>

      {runs.length > 1 && (
        <>
          <h3 className="section-title">Your last {runs.length} runs</h3>
          <ol className="run-history" aria-label="Scores of your recent runs">
            {runs.map((r) => (
              <li key={r.at} className={r.at === run.at ? 'this' : ''} title={`${r.score} · ${new Date(r.at).toLocaleString()}${r.rate < 1 ? ` · ${r.rate * 100}%` : ''}`}>
                <span style={{ height: `${Math.max(4, r.score)}%` }} />
              </li>
            ))}
          </ol>
        </>
      )}
    </dialog>
  );
}
