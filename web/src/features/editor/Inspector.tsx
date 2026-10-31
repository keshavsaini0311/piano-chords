// Edit the selected chord: what it is, when it starts, and split/merge/delete.
// You edit in the key you are viewing; setChordFromDisplay stores it back in the original key.
import { useMemo } from 'react';
import { confirmChord, deleteChord, mergeWithNext, moveChordStart, moveChordToWord, setChordFromDisplay, splitChord } from '../../domain/edits';
import { accidentalsForKey, formatChord, noteName, toPitchClass, transposeChord, type Chord } from '../../domain/music';
import { MIN_CHORD_SEC } from '../../domain/song';
import { usePlaybackStore } from '../../state/playbackStore';
import { useSongStore } from '../../state/songStore';
import { useSongView, useViewStore } from '../../state/viewStore';
import { ChordName } from '../../ui/ChordName';
import { diagrams } from '../instrument/diagrams';
import { formatTime, useActiveIndex, useDisplay, useSong, useVoicings } from '../studio/display';
import { isUnsure } from '../../domain/timing';

const QUALITIES: [string, string][] = [
  ['', 'Major'], ['m', 'Minor'], ['7', '7'], ['maj7', 'maj7'], ['m7', 'm7'], ['sus2', 'sus2'], ['sus4', 'sus4'], ['dim', 'dim'],
];
const NUDGE_SEC = 0.1;

export function Inspector() {
  const song = useSong();
  const active = useActiveIndex();
  const selectedId = useViewStore((s) => s.selectedChordId) ?? song.chords[active]?.id;
  const profile = useViewStore((s) => s.profile);
  const { semitones } = useSongView(song.id);
  const apply = useSongStore((s) => s.apply);
  const { label, currentKey } = useDisplay();
  const voicings = useVoicings();
  const index = song.chords.findIndex((c) => c.id === selectedId);
  const event = song.chords[index];
  const shown: Chord | null = useMemo(() => (event ? transposeChord(event.chord, semitones) : null), [event, semitones]);
  const canSplit = usePlaybackStore((s) => !!event && s.time > event.start + MIN_CHORD_SEC && s.time < event.end - MIN_CHORD_SEC);

  if (!event || !shown)
    return (
      <section className="panel">
        <h2 className="section-title">Selected chord</h2>
        <p className="muted">Click a chord in the timeline or the chart to change it.</p>
      </section>
    );

  const accidentals = accidentalsForKey(currentKey);
  const setShown = (chord: Chord) => apply((s) => setChordFromDisplay(s, event.id, formatChord(chord, 'sharps'), semitones));
  const root = shown.kind === 'chord' ? shown.root : null;
  const quality = shown.kind === 'chord' ? shown.quality : null;
  const Diagram = diagrams[profile.instrumentId];
  const unsure = isUnsure(event);

  return (
    <section className="panel" aria-label="Selected chord">
      <div className="panel-head">
        <h2 className="section-title">Selected chord, at {formatTime(event.start)}</h2>
        <span className="muted small">{(event.end - event.start).toFixed(1)}s long</span>
      </div>
      <ChordName className="inspector-chord" label={formatChord(shown, accidentals)} />
      {unsure && <p className="inspector-note">Very short for this tempo, so it may be a detection blip. Listen, then fix it or mark it checked.</p>}
      {voicings[index]?.length > 0 && <Diagram range={profile.keyRange} now={voicings[index]} showNoteNames={profile.showNoteNames} />}

      {event.alternatives && event.alternatives.length > 0 && (
        <div className="picker" role="group" aria-label="Detector's other guesses">
          {event.alternatives.map((alt, i) => (
            <button key={i} onClick={() => setShown(transposeChord(alt, semitones))}>
              <ChordName label={label(alt)} />
            </button>
          ))}
        </div>
      )}

      <div className="picker" role="group" aria-label="Root note">
        {Array.from({ length: 12 }, (_, pc) => (
          <button key={pc} aria-pressed={root === pc} onClick={() => setShown({ kind: 'chord', root: toPitchClass(pc), quality: quality ?? '' })}>
            <ChordName label={noteName(toPitchClass(pc), accidentals)} />
          </button>
        ))}
      </div>
      <div className="picker" role="group" aria-label="Chord type">
        {QUALITIES.map(([q, name]) => (
          <button key={q} aria-pressed={quality === q} disabled={root === null} onClick={() => root !== null && setShown({ kind: 'chord', root, quality: q })}>
            {name}
          </button>
        ))}
        <button aria-pressed={shown.kind === 'none'} onClick={() => setShown({ kind: 'none' })}>No chord</button>
      </div>

      <div className="button-row" role="group" aria-label="Timing">
        <button className="btn" onClick={() => apply((s) => moveChordStart(s, event.id, event.start - NUDGE_SEC))} disabled={index === 0}>Start earlier</button>
        <button className="btn" onClick={() => apply((s) => moveChordStart(s, event.id, event.start + NUDGE_SEC))}>Start later</button>
        <button className="btn" onClick={() => apply((s) => splitChord(s, event.id, usePlaybackStore.getState().time))} disabled={!canSplit} title="Move the playhead inside this chord first">
          Split at playhead
        </button>
        <button className="btn" onClick={() => apply((s) => mergeWithNext(s, event.id))} disabled={index === song.chords.length - 1}>Merge with next</button>
        <button className="btn" onClick={() => apply((s) => deleteChord(s, event.id))} disabled={song.chords.length < 2}>Remove</button>
        {unsure && <button className="btn" onClick={() => apply((s) => confirmChord(s, event.id))}>Mark as checked</button>}
      </div>
      {song.lyrics.length > 0 && (
        <div className="button-row" role="group" aria-label="Position over the lyrics">
          <button className="btn" onClick={() => apply((s) => moveChordToWord(s, event.id, -1))}>Over the previous word</button>
          <button className="btn" onClick={() => apply((s) => moveChordToWord(s, event.id, 1))}>Over the next word</button>
        </div>
      )}
    </section>
  );
}
