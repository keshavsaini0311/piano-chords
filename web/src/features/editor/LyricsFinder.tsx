// Lyrics live with the chart, not in a side panel. With no lyrics: one button that searches with the
// song's own title. Only if that misses do the title/artist fields appear. The server only searches;
// found lyrics are applied as an undoable edit and saved by autosave.
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
  const [state, setState] = useState<'idle' | 'searching' | 'missed' | 'failed'>('idle');
  const [open, setOpen] = useState(false);
  const hasLyrics = song.lyrics.length > 0;

  async function search(event?: FormEvent) {
    event?.preventDefault();
    setState('searching');
    try {
      const lyrics = await api.searchLyrics(song.id, title, artist);
      if (!lyrics.length) return setState('missed');
      apply((s) => replaceLyrics(s, { title, artist, lyrics }));
      setState('idle');
      setOpen(false);
    } catch {
      setState('failed');
    }
  }

  if (hasLyrics && !open)
    return (
      <p className="lyrics-again">
        <button className="link-button" onClick={() => setOpen(true)}>Wrong lyrics? Search again</button>
      </p>
    );

  const showFields = open || state === 'missed' || state === 'failed';
  return (
    <form className="lyrics-bar" onSubmit={search} aria-live="polite">
      <span>
        {state === 'missed' ? 'No lyrics found for that title. Check the song name and artist:' : state === 'failed' ? 'The lyrics service is not answering. Try again in a bit.' : hasLyrics ? 'Search with a different title:' : 'No lyrics yet.'}
      </span>
      {showFields && (
        <>
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Song title" placeholder="Song title" />
          <input className="field" value={artist} onChange={(e) => setArtist(e.target.value)} aria-label="Artist" placeholder="Artist" />
        </>
      )}
      <button className="btn" disabled={state === 'searching' || !title.trim()}>{state === 'searching' ? 'Searching…' : 'Find lyrics'}</button>
    </form>
  );
}
