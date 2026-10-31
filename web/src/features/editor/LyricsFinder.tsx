// Search LRCLIB again with a corrected title/artist. The server only searches; found lyrics are
// applied here as an undoable edit and saved by autosave like any other change.
import { useState, type FormEvent } from 'react';
import { replaceLyrics } from '../../domain/edits';
import { api } from '../../services/api';
import { useSongStore } from '../../state/songStore';
import { useSong } from '../studio/display';

export function LyricsFinder() {
  const song = useSong();
  const apply = useSongStore((s) => s.apply);
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const lyrics = await api.searchLyrics(song.id, title, artist);
      if (lyrics.length) {
        apply((s) => replaceLyrics(s, { title, artist, lyrics }));
        setStatus(`Found ${lyrics.length} lines.`);
      } else setStatus('No synced lyrics for that title and artist. Try the exact song name, or check back later.');
    } catch (e) {
      setStatus(`Search failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="panel more" open={!song.lyrics.length}>
      <summary className="section-title">{song.lyrics.length ? `Lyrics (${song.lyrics.length} lines)` : 'Lyrics: none yet'}</summary>
      <form className="lyrics-form" onSubmit={search}>
        <div className="row">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Song title" placeholder="Song title" />
          <input className="field" value={artist} onChange={(e) => setArtist(e.target.value)} aria-label="Artist" placeholder="Artist" />
        </div>
        <button className="btn" disabled={busy || !title.trim()}>{busy ? 'Searching…' : song.lyrics.length ? 'Search again' : 'Search lyrics'}</button>
        {status && <p className="small muted" role="status">{status}</p>}
      </form>
    </details>
  );
}
