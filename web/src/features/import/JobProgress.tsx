import type { Job } from '../../services/api';

const STAGES: [string, string][] = [
  ['downloading', 'Downloading audio'],
  ['detecting', 'Detecting chords and beats'],
  ['lyrics', 'Fetching lyrics'],
  ['saving', 'Saving'],
];

export function JobProgress({ job, onRetry }: { job: Job; onRetry: () => void }) {
  const current = STAGES.findIndex(([id]) => id === job.stage);
  const finished = job.state === 'done' || job.state === 'done_without_lyrics';
  return (
    <div className="card progress" aria-live="polite">
      <ol>
        {STAGES.map(([id, label], i) => {
          const status = finished || i < current ? 'done' : i === current && job.state === 'running' ? 'active' : job.state === 'failed' && i === current ? 'failed' : 'todo';
          return (
            <li key={id} data-status={status}>
              <span className="progress-mark" aria-hidden="true">{status === 'done' ? '✓' : status === 'failed' ? '!' : ''}</span>
              {label}
            </li>
          );
        })}
      </ol>
      {job.state === 'queued' && <p className="muted">Waiting for the previous import to finish…</p>}
      {job.state === 'done_without_lyrics' && <p className="muted">No synced lyrics found. You can add them later.</p>}
      {job.state === 'failed' && (
        <div className="progress-error">
          <p>Import failed: {job.error}</p>
          <button className="btn" onClick={onRetry}>Retry</button>
        </div>
      )}
    </div>
  );
}
