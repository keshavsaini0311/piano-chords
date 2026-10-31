// Fix the selected chord: listen, then pick the right one. The panel shows the chord exactly as the
// chart and keyboard do (current key and Simple/As detected), so there is only ever one name on screen.
// Suggestions are the song's own chords; the full picker and timing tools are one click away.
import { useMemo } from 'react';
import { confirmChord, deleteChord, mergeWithNext, moveChordStart, moveChordToWord, setChord, setChordFromDisplay, splitChord } from '../../domain/edits';
import { accidentalsForKey, formatChord, noteName, toPitchClass, type Chord } from '../../domain/music';
import { MIN_CHORD_SEC } from '../../domain/song';
import { chordsByUse } from '../../domain/suggest';
import { isUnsure } from '../../domain/timing';
import { player } from '../../services/player';
import { usePlaybackStore } from '../../state/playbackStore';
import { useSongStore } from '../../state/songStore';
import { useSongView, useViewStore } from '../../state/viewStore';
import { ChordName } from '../../ui/ChordName';
import { diagrams } from '../instrument/diagrams';
import { formatTime, useActiveIndex, useDisplay, useSong, useVoicings } from '../studio/display';

const SIMPLE_TYPES: [string, string][] = [['', 'Major'], ['m', 'Minor']];
const ALL_TYPES: [string, string][] = [...SIMPLE_TYPES, ['7', '7'], ['maj7', 'maj7'], ['m7', 'm7'], ['sus2', 'sus2'], ['sus4', 'sus4'], ['dim', 'dim']];
const NUDGE_SEC = 0.1;

export function Inspector() {
  const song = useSong();
  const active = useActiveIndex();
  const selectedId = useViewStore((s) => s.selectedChordId) ?? song.chords[active]?.id;
  const profile = useViewStore((s) => s.profile);
  const { semitones } = useSongView(song.id);
  const apply = useSongStore((s) => s.apply);
  const { label, played, currentKey } = useDisplay();
  const voicings = useVoicings();
  const loop = usePlaybackStore((s) => s.loop);
  const index = song.chords.findIndex((c) => c.id === selectedId);
  const event = song.chords[index];
  const suggestions = useMemo(() => chordsByUse(song, profile.difficulty), [song, profile.difficulty]);
  const canSplit = usePlaybackStore((s) => !!event && s.time > event.start + MIN_CHORD_SEC && s.time < event.end - MIN_CHORD_SEC);

  if (!event)
    return (
      <section className="panel">
        <p className="muted">Click a chord in the timeline or the chart to fix it.</p>
      </section>
    );

  const shown: Chord = played(event.chord); // same transform as the chart and keyboard
  const shownLabel = label(event.chord);
  const accidentals = accidentalsForKey(currentKey);
  const listening = loop?.start === event.start && loop.end === event.end;
  const Diagram = diagrams[profile.instrumentId];
  const voicing = voicings[index] ?? [];
  const pickShown = (chord: Chord) => apply((s) => setChordFromDisplay(s, event.id, formatChord(chord, 'sharps'), semitones));
  const root = shown.kind === 'chord' ? shown.root : null;
  const quality = shown.kind === 'chord' ? shown.quality : null;

  const listen = () => {
    const { setLoop, setPlaying } = usePlaybackStore.getState();
    if (listening) {
      setLoop(null);
      return;
    }
    setLoop({ start: event.start, end: event.end });
    player.seek(event.start);
    player.play();
    setPlaying(true);
  };

  return (
    <section className="panel inspector" aria-label="Fix this chord">
      <div className="panel-head">
        <span className="muted small">Chord at {formatTime(event.start)}</span>
        <button className="btn" aria-pressed={listening} onClick={listen}>{listening ? 'Stop listening' : '▶ Listen'}</button>
      </div>
      <div className="inspector-name">
        <ChordName className="inspector-chord" label={shownLabel} />
        {voicing.length > 0 && <span className="muted">{voicing.map((m) => noteName(toPitchClass(m), accidentals)).join(' · ')}</span>}
      </div>
      {voicing.length > 0 && <Diagram range={profile.keyRange} now={voicing} showNoteNames={profile.showNoteNames} size="mini" />}

      <div className="panel">
        <span className="small">{isUnsure(event) ? 'This one might be wrong. Listen, then pick the right chord:' : 'Sounds wrong? Pick the right chord:'}</span>
        <div className="picker suggestions" role="group" aria-label="Chords used in this song">
          {suggestions.map((chord) => {
            const current = label(chord) === shownLabel;
            return (
              <button key={formatChord(chord, 'sharps')} aria-pressed={current} onClick={() => apply((s) => setChord(s, event.id, chord))}>
                <ChordName label={label(chord)} />
              </button>
            );
          })}
        </div>
        {isUnsure(event) && (
          <button className="btn btn-primary" onClick={() => apply((s) => confirmChord(s, event.id))}>{shownLabel} sounds right</button>
        )}
      </div>

      <details className="more">
        <summary>A different chord</summary>
        <div className="panel">
          <div className="picker" role="group" aria-label="Root note">
            {Array.from({ length: 12 }, (_, pc) => (
              <button key={pc} aria-pressed={root === pc} onClick={() => pickShown({ kind: 'chord', root: toPitchClass(pc), quality: quality ?? '' })}>
                <ChordName label={noteName(toPitchClass(pc), accidentals)} />
              </button>
            ))}
          </div>
          <div className="picker" role="group" aria-label="Chord type">
            {(profile.difficulty === 'easy' ? SIMPLE_TYPES : ALL_TYPES).map(([q, name]) => (
              <button key={q} aria-pressed={quality === q} disabled={root === null} onClick={() => root !== null && pickShown({ kind: 'chord', root, quality: q })}>
                {name}
              </button>
            ))}
            <button aria-pressed={shown.kind === 'none'} onClick={() => pickShown({ kind: 'none' })}>No chord</button>
          </div>
        </div>
      </details>

      <details className="more">
        <summary>Timing and more</summary>
        <div className="panel">
          <span className="small muted">The change into this chord happens…</span>
          <div className="button-row">
            <button className="btn" onClick={() => apply((s) => moveChordStart(s, event.id, event.start - NUDGE_SEC))} disabled={index === 0}>A bit earlier</button>
            <button className="btn" onClick={() => apply((s) => moveChordStart(s, event.id, event.start + NUDGE_SEC))}>A bit later</button>
          </div>
          <div className="button-row">
            <button className="btn" onClick={() => apply((s) => splitChord(s, event.id, usePlaybackStore.getState().time))} disabled={!canSplit} title="Move the playhead inside this chord first">
              Split at playhead
            </button>
            <button className="btn" onClick={() => apply((s) => mergeWithNext(s, event.id))} disabled={index === song.chords.length - 1}>Join with next</button>
            <button className="btn" onClick={() => apply((s) => deleteChord(s, event.id))} disabled={song.chords.length < 2}>Remove</button>
          </div>
          {song.lyrics.length > 0 && (
            <div className="button-row">
              <button className="btn" onClick={() => apply((s) => moveChordToWord(s, event.id, -1))}>Over the previous word</button>
              <button className="btn" onClick={() => apply((s) => moveChordToWord(s, event.id, 1))}>Over the next word</button>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
