// Two screens, picked by the URL hash: #/ (import + library) and #/song/<id> (studio).
import { useEffect, useState } from 'react';
import { ImportScreen } from './features/import/ImportScreen';
import { StudioScreen } from './features/studio/StudioScreen';

const songIdFromHash = () => /^#\/song\/([\w-]{11})$/.exec(window.location.hash)?.[1] ?? null;
export const openSong = (id: string) => (window.location.hash = `#/song/${id}`);
export const openLibrary = () => (window.location.hash = '#/');

export default function App() {
  const [songId, setSongId] = useState(songIdFromHash);
  useEffect(() => {
    const onChange = () => setSongId(songIdFromHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return (
    <div className="pc app" data-theme="auto">
      {songId ? <StudioScreen key={songId} songId={songId} /> : <ImportScreen />}
    </div>
  );
}
