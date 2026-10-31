// Screens are picked by the URL hash:
//   #/                       library        #/playlist/<id>             a playlist
//   #/song/<id>              studio         #/playlist/<pid>/song/<id>  studio, playing through a playlist
import { useEffect, useState } from 'react';
import { LibraryScreen } from './features/library/LibraryScreen';
import { StudioScreen } from './features/studio/StudioScreen';

type Route = { view: 'library'; playlistId: string | null } | { view: 'studio'; songId: string; playlistId: string | null };

function parseRoute(hash: string): Route {
  const song = /^#\/(?:playlist\/([\w-]+)\/)?song\/([\w-]{11})$/.exec(hash);
  if (song) return { view: 'studio', songId: song[2], playlistId: song[1] ?? null };
  return { view: 'library', playlistId: /^#\/playlist\/([\w-]+)$/.exec(hash)?.[1] ?? null };
}

export const openSong = (id: string, playlistId?: string | null) =>
  (window.location.hash = playlistId ? `#/playlist/${playlistId}/song/${id}` : `#/song/${id}`);
export const openLibrary = (playlistId?: string | null) => (window.location.hash = playlistId ? `#/playlist/${playlistId}` : '#/');

export default function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return (
    <div className="pc app" data-theme="auto">
      {route.view === 'studio' ? (
        <StudioScreen key={`${route.playlistId}:${route.songId}`} songId={route.songId} playlistId={route.playlistId} />
      ) : (
        <LibraryScreen playlistId={route.playlistId} />
      )}
    </div>
  );
}
