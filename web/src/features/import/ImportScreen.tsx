// Paste a YouTube link -> watch the import job -> open the studio. Also lists songs already imported.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { openSong } from '../../App';
import { api, type Job, type SongSummary } from '../../services/api';
import { JobProgress } from './JobProgress';

const POLL_MS = 1000;
const formatDuration = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

export function ImportScreen() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const poll = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    api.listSongs().then(setSongs, () => setError('Cannot reach the local server. Is it running on port 8000?'));
    return () => clearInterval(poll.current);
  }, []);

  async function start(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    try {
      const { jobId, songId } = await api.createSong(url);
      clearInterval(poll.current);
      const check = async () => {
        const latest = await api.getJob(jobId);
        setJob(latest);
        if (latest.state === 'done') openSong(songId);
        if (latest.state === 'done_without_lyrics') setTimeout(() => openSong(songId), 1500); // let the note be read
        if (!['queued', 'running'].includes(latest.state)) clearInterval(poll.current);
      };
      await check();
      poll.current = setInterval(check, POLL_MS);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="import">
      <header>
        <h1>piano-chords</h1>
        <p className="muted">Paste a YouTube link. Chords are detected on this computer, then you can fix and play along.</p>
      </header>
      <form className="import-form" onSubmit={start}>
        <label className="lbl" htmlFor="url">YouTube link</label>
        <div className="row">
          <input id="url" className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/…" autoFocus />
          <button className="btn btn-p" disabled={!url.trim() || job?.state === 'running'}>Get chords</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
      {job && <JobProgress job={job} onRetry={() => start()} />}
      <section className="library">
        <h2 className="lbl">Your songs</h2>
        {songs.length === 0 ? (
          <p className="muted">Nothing imported yet.</p>
        ) : (
          <ul>
            {songs.map((s) => (
              <li key={s.id}>
                <button className="library-item" onClick={() => openSong(s.id)}>
                  <span>
                    <strong>{s.title}</strong>
                    <span className="muted"> · {s.artist}</span>
                  </span>
                  <span className="mono muted">{formatDuration(s.duration)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
