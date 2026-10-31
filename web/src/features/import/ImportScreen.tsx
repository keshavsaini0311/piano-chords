// Paste a YouTube link -> watch the import job -> open the studio. Also lists songs already imported.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { openSong } from '../../App';
import { api, type Job, type SongSummary } from '../../services/api';
import { pollJob } from '../../services/jobPolling';
import { JobProgress } from './JobProgress';

const formatDuration = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

export function ImportScreen() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const stopPolling = useRef<() => void>(() => {});

  useEffect(() => {
    api.listSongs().then(setSongs, () => setError('The local server is not running. Start it with: cd server && uv run uvicorn app.main:app'));
    return () => stopPolling.current();
  }, []);

  async function start(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    try {
      const { jobId, songId } = await api.createSong(url);
      stopPolling.current();
      stopPolling.current = pollJob(
        jobId,
        (latest) => {
          setJob(latest);
          if (latest.state === 'done') openSong(songId);
          if (latest.state === 'done_without_lyrics') setTimeout(() => openSong(songId), 1500); // let the note be read
        },
        (message) => {
          setJob(null);
          setError(`Lost track of the import (${message}). If the server restarted, paste the link again.`);
        },
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="import">
      <header className="import-head">
        <h1>piano-chords</h1>
        <p>Paste a song from YouTube. This computer works out the chords, then you play along and fix anything it got wrong.</p>
      </header>
      <form className="import-form" onSubmit={start}>
        <label htmlFor="url">YouTube link</label>
        <div className="row">
          <input id="url" className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/…" autoFocus />
          <button className="btn btn-primary" disabled={!url.trim() || job?.state === 'running'}>Get chords</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
      {job && <JobProgress job={job} onRetry={() => start()} />}
      <section className="library">
        <h2>Your songs</h2>
        {songs.length === 0 ? (
          <p className="muted">Songs you import show up here.</p>
        ) : (
          <ul>
            {songs.map((s) => (
              <li key={s.id}>
                <button className="library-item" onClick={() => openSong(s.id)}>
                  <span>
                    <span className="library-title">{s.title}</span> <span className="muted">{s.artist}</span>
                  </span>
                  <span className="muted">{formatDuration(s.duration)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
