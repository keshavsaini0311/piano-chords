// "Your chords": skill level per chord, songs you can play now, the chord to learn next.
import { openSong } from '../../App';
import type { ChordSkill, Level } from '../../domain/mastery';
import type { SongSummary } from '../../services/api';
import { ChordName } from '../../ui/ChordName';

const order: Level[] = ['mastered', 'solid', 'learning', 'new'];

export function ChordMastery({ skills, playable, next, songs }: { skills: Map<string, ChordSkill>; playable: Set<string>; next: { chord: string; unlocks: string[] }[]; songs: SongSummary[] }) {
  const chords = [...skills.values()].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level) || a.chord.localeCompare(b.chord));
  const playableSongs = songs.filter((s) => playable.has(s.id));
  return (
    <section className="mastery panel">
      <div className="panel-head"><h2>Your chords</h2></div>
      {!chords.length ? (
        <p className="muted small">Practise with Check my playing to see your chords here.</p>
      ) : (
        <>
          <div className="chip-row">
            {chords.map((c) => (
              <span key={c.chord} className={`mastery-chord ${c.level}`} title={`${c.chord}: ${c.level}`}><ChordName label={c.chord} /></span>
            ))}
          </div>
          {playableSongs.length > 0 && (
            <>
              <h3>You can play these now</h3>
              <div className="mastery-songs">
                {playableSongs.map((s) => <button key={s.id} className="song-title" onClick={() => openSong(s.id)}>{s.title}</button>)}
              </div>
            </>
          )}
          {next.length > 0 && (
            <>
              <h3>Learn next</h3>
              {next.map((n) => (
                <div key={n.chord} className="small"><ChordName label={n.chord} /> unlocks {n.unlocks.length} {n.unlocks.length === 1 ? 'song' : 'songs'}</div>
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}
