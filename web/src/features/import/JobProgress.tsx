import type { Job } from '../../services/api';

const STAGES: [string, string][] = [
  ['downloading', 'Downloading the audio'],
  ['detecting', 'Working out the chords and the beat'],
  ['lyrics', 'Looking for synced lyrics'],
  ['saving', 'Saving'],
];

export function JobProgress({ job, onRetry }: { job: Job; onRetry: () => void }) {
  const current = STAGES.findIndex(([id]) => id === job.stage);
  const finished = job.state === 'done' || job.state === 'done_without_lyrics';
  const statusOf = (i: number) => {
    if (finished || i < current) return 'done';
    if (i === current && job.state === 'failed') return 'failed';
    return i === current ? 'active' : 'todo';
  };
  return (
    <div aria-live="polite">
      <ol className="progress">
        {STAGES.map(([id, label], i) => (
          <li key={id} data-status={statusOf(i)}>
            <span className="progress-mark" aria-hidden="true">{statusOf(i) === 'done' ? '✓' : statusOf(i) === 'failed' ? '!' : ''}</span>
            {label}
          </li>
        ))}
        {job.state === 'queued' && <li className="progress-note muted">Waiting for the song before this one to finish.</li>}
        {job.state === 'done_without_lyrics' && <li className="progress-note muted">No synced lyrics for this one. Opening the chords anyway; you can search for lyrics in Edit.</li>}
        {job.state === 'failed' && (
          <li className="progress-note">
            <span className="error">The import stopped: {job.error}</span>
            <button className="btn" onClick={onRetry}>Try again</button>
          </li>
        )}
      </ol>
    </div>
  );
}
