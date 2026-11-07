// Home: add a song, browse your songs as cards, and keep practice playlists.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { openLibrary, openSong } from '../../App';
import { addSong, createPlaylist, deletePlaylist, moveSong, removeSong, renamePlaylist, songKeySummary, type Playlist } from '../../domain/playlists';
import { api, type Job, type SongSummary } from '../../services/api';
import { pollJob } from '../../services/jobPolling';
import { nextToLearn, playableSongs, mastery, songChordsAsPlayed } from '../../domain/mastery';
import { usePracticeStore } from '../../state/practiceStore';
import { useViewStore } from '../../state/viewStore';
import { ChordName } from '../../ui/ChordName';
import { ChordMastery } from './ChordMastery';
import { JobProgress } from './JobProgress';

const formatDuration = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const topChords = (chordTime: Record<string, number>) => Object.entries(chordTime).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([label]) => label);

function AddSong({ onImported }: { onImported: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);

  async function start(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    try {
      const { jobId } = await api.createSong(url);
      stop.current();
      stop.current = pollJob(
        jobId,
        (latest) => {
          setJob(latest);
          if (latest.state === 'done' || latest.state === 'done_without_lyrics') {
            setUrl('');
            onImported();
            setTimeout(() => setJob(null), 2500);
          }
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
    <div className="add-song">
      <form className="add-song-form" onSubmit={start}>
        <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a YouTube link to add a song" aria-label="YouTube link" />
        <button className="btn btn-primary" disabled={!url.trim() || job?.state === 'running'}>Add song</button>
      </form>
      {error && <p className="error small" role="alert">{error}</p>}
      {job && <JobProgress job={job} onRetry={() => start()} />}
    </div>
  );
}

function SongCard({ song, playable, playlists, onChange, onRemove }: { song: SongSummary; playable: boolean; playlists: Playlist[]; onChange: (p: Playlist[]) => void; onRemove: () => void }) {
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const summary = useMemo(() => songKeySummary(song.chordTime), [song.chordTime]);
  return (
    <article className="song-card" onMouseLeave={() => (setMenu(false), setConfirming(false))}>
      <button className="song-cover" onClick={() => openSong(song.id)} aria-label={`Open ${song.title}`}>
        <img src={api.coverUrl(song.id)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <span className="song-duration">{formatDuration(song.duration)}</span>
      </button>
      <div className="song-meta">
        <button className="song-title" onClick={() => openSong(song.id)}>{song.title}</button>
        <div className="muted small">{song.artist}</div>
        {playable && <div className="song-badge">✓ You can play this</div>}
        {summary && (
          <div className="small song-keys">
            Key <ChordName label={summary.key} />
            {summary.easiestShift !== 0 && (
              <span className="muted">
                {' '}· easiest <ChordName label={summary.easiestKey} /> ({summary.easiestShift > 0 ? '+' : ''}{summary.easiestShift})
              </span>
            )}
          </div>
        )}
        <div className="song-chords muted">{topChords(song.chordTime).map((c) => <ChordName key={c} label={c} />)}</div>
      </div>
      <button className="ibtn song-menu-button" aria-label="More" aria-expanded={menu} onClick={() => setMenu(!menu)}>⋯</button>
      {menu && (
        <div className="song-menu" role="menu">
          {playlists.map((p) => (
            <button key={p.id} role="menuitem" disabled={p.songIds.includes(song.id)} onClick={() => (onChange(addSong(playlists, p.id, song.id)), setMenu(false))}>
              {p.songIds.includes(song.id) ? `In ${p.name}` : `Add to ${p.name}`}
            </button>
          ))}
          <button role="menuitem" className="danger" onClick={() => (confirming ? onRemove() : setConfirming(true))}>
            {confirming ? 'Click again to remove for good' : 'Remove from library'}
          </button>
        </div>
      )}
    </article>
  );
}

function PlaylistView({ playlist, songs, playlists, onChange }: { playlist: Playlist; songs: Map<string, SongSummary>; playlists: Playlist[]; onChange: (p: Playlist[]) => void }) {
  const items = playlist.songIds.map((id) => songs.get(id)).filter((s): s is SongSummary => !!s);
  return (
    <section className="playlist">
      <div className="playlist-head">
        <input className="playlist-name" value={playlist.name} onChange={(e) => onChange(renamePlaylist(playlists, playlist.id, e.target.value))} aria-label="Playlist name" />
        <button className="btn btn-primary" disabled={!items.length} onClick={() => openSong(items[0].id, playlist.id)}>Play all</button>
        <button className="btn" onClick={() => (onChange(deletePlaylist(playlists, playlist.id)), openLibrary())}>Delete playlist</button>
      </div>
      {!items.length && <p className="muted">Empty. Add songs from a song's ⋯ menu in All songs.</p>}
      <ol className="playlist-rows">
        {items.map((song, i) => (
          <li key={song.id}>
            <span className="muted">{i + 1}</span>
            <img src={api.coverUrl(song.id)} alt="" loading="lazy" />
            <button className="song-title" onClick={() => openSong(song.id, playlist.id)}>{song.title}</button>
            <span className="muted small">{song.artist}</span>
            <span className="seg">
              <button aria-label="Move up" disabled={i === 0} onClick={() => onChange(moveSong(playlists, playlist.id, i, i - 1))}>↑</button>
              <button aria-label="Move down" disabled={i === items.length - 1} onClick={() => onChange(moveSong(playlists, playlist.id, i, i + 1))}>↓</button>
              <button aria-label="Remove from playlist" onClick={() => onChange(removeSong(playlists, playlist.id, song.id))}>✕</button>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function LibraryScreen({ playlistId }: { playlistId: string | null }) {
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = () => api.listSongs().then(setSongs, () => setError('The local server is not running. Start it with: cd server && uv run uvicorn app.main:app'));

  useEffect(() => {
    void load();
    api.listPlaylists().then(setPlaylists, () => {});
  }, []);

  const savePlaylists = (next: Playlist[]) => {
    setPlaylists(next);
    void api.savePlaylists(next);
  };
  const byId = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);
  const runs = usePracticeStore((s) => s.runs);
  const perSong = useViewStore((s) => s.perSong);
  const difficulty = useViewStore((s) => s.profile.difficulty);
  const skills = useMemo(() => mastery(runs), [runs]);
  const asPlayed = useMemo(() => songs.map((s) => ({ id: s.id, chords: songChordsAsPlayed(s.chordTime, perSong[s.id]?.semitones ?? 0, difficulty) })), [songs, perSong, difficulty]);
  const playable = useMemo(() => new Set(playableSongs(asPlayed, skills)), [asPlayed, skills]);
  const next = useMemo(() => nextToLearn(asPlayed, skills), [asPlayed, skills]);
  const open = playlists.find((p) => p.id === playlistId) ?? null;
  const shown = songs.filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <main className="library">
      <header className="library-head">
        <h1>piano-chords</h1>
        <AddSong onImported={() => void load()} />
      </header>
      <nav className="library-tabs" aria-label="Library">
        <button aria-pressed={!open} onClick={() => openLibrary()}>All songs <span className="muted">{songs.length}</span></button>
        {playlists.map((p) => (
          <button key={p.id} aria-pressed={open?.id === p.id} onClick={() => openLibrary(p.id)}>
            {p.name} <span className="muted">{p.songIds.length}</span>
          </button>
        ))}
        <button
          className="new-playlist"
          onClick={() => {
            const next = createPlaylist(playlists, `Playlist ${playlists.length + 1}`);
            savePlaylists(next);
            openLibrary(next[next.length - 1].id);
          }}
        >
          + New playlist
        </button>
        {!open && <input className="field library-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs" aria-label="Search songs" />}
      </nav>
      {error && <p className="error" role="alert">{error}</p>}
      {open ? (
        <PlaylistView playlist={open} songs={byId} playlists={playlists} onChange={savePlaylists} />
      ) : songs.length === 0 && !error ? (
        <p className="muted">Paste a YouTube link above to add your first song.</p>
      ) : (
        <>
        <ChordMastery skills={skills} playable={playable} next={next} songs={songs} />
        <div className="song-grid">
          {shown.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              playable={playable.has(song.id)}
              playlists={playlists}
              onChange={savePlaylists}
              onRemove={() => api.deleteSong(song.id).then(() => (void load(), api.listPlaylists().then(setPlaylists)))}
            />
          ))}
        </div>
        </>
      )}
    </main>
  );
}
