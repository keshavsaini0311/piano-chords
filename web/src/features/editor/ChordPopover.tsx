// Fix a chord in place: a small popover under the selected chord on the timeline.
// Shows the chord as the chart does, offers the song's own chords, and keeps rarer tools behind "More".
import { useMemo, useState } from 'react';
import { confirmChord, deleteChord, mergeWithNext, moveChordStart, moveChordToWord, setChord, setChordFromDisplay, splitChord } from '../../domain/edits';
import { accidentalsForKey, formatChord, noteName, toPitchClass, type Chord, type PitchClass } from '../../domain/music';
import { MIN_CHORD_SEC, type ChordEvent } from '../../domain/song';
import { chordsByUse } from '../../domain/suggest';
import { isUnsure } from '../../domain/timing';
import { player } from '../../services/player';
import { usePlaybackStore } from '../../state/playbackStore';
import { useSongStore } from '../../state/songStore';
import { useSongView, useViewStore } from '../../state/viewStore';
import { ChordName } from '../../ui/ChordName';
import { RootPicker } from '../../ui/RootPicker';
import { useDisplay, useSong, useVoicings } from '../studio/display';

const EXTRA_TYPES: [string, string][] = [['7', '7'], ['maj7', 'maj7'], ['m7', 'm7'], ['sus2', 'sus2'], ['sus4', 'sus4'], ['dim', 'dim']];
const NUDGE_SEC = 0.1;

export function ChordPopover({ event, index, style }: { event: ChordEvent; index: number; style: React.CSSProperties }) {
  const song = useSong();
  const profile = useViewStore((s) => s.profile);
  const selectChord = useViewStore((s) => s.selectChord);
  const { semitones } = useSongView(song.id);
  const apply = useSongStore((s) => s.apply);
  const { label, played, currentKey } = useDisplay();
  const voicings = useVoicings();
  const loop = usePlaybackStore((s) => s.loop);
  const canSplit = usePlaybackStore((s) => s.time > event.start + MIN_CHORD_SEC && s.time < event.end - MIN_CHORD_SEC);
  const suggestions = useMemo(() => chordsByUse(song, profile.difficulty), [song, profile.difficulty]);
  const [panel, setPanel] = useState<'none' | 'other' | 'more'>('none');

  const shown = played(event.chord);
  const shownLabel = label(event.chord);
  const accidentals = accidentalsForKey(currentKey);
  const listening = loop?.start === event.start && loop.end === event.end;
  const root = shown.kind === 'chord' ? shown.root : null;
  const quality = shown.kind === 'chord' ? shown.quality : '';
  // Any choice here also marks the chord as checked.
  const pickShown = (chord: Chord) => apply((s) => confirmChord(setChordFromDisplay(s, event.id, formatChord(chord, 'sharps'), semitones), event.id));
  const pickRoot = (pc: PitchClass) => pickShown({ kind: 'chord', root: pc, quality: quality === '' || quality === 'm' || profile.difficulty === 'full' ? quality : '' });

  const listen = () => {
    const { setLoop, setPlaying } = usePlaybackStore.getState();
    if (listening) return setLoop(null);
    setLoop({ start: event.start, end: event.end });
    player.seek(event.start);
    player.play();
    setPlaying(true);
  };

  return (
    <div className="chord-popover-edit" style={style} role="dialog" aria-label={`Fix ${shownLabel}`}>
      <div className="pop-head">
        <ChordName className="pop-chord" label={shownLabel} />
        <span className="muted small">{(voicings[index] ?? []).map((m) => noteName(toPitchClass(m), accidentals)).join(' · ')}</span>
        <button className="ibtn" aria-pressed={listening} onClick={listen} title={listening ? 'Stop' : 'Listen to this chord'}>{listening ? '❚❚' : '▶'}</button>
        <button className="ibtn" onClick={() => selectChord(null)} aria-label="Close" title="Esc">✕</button>
      </div>

      {isUnsure(event) && <p className="small unsure-text">Might be wrong. Listen, then tap the right chord.</p>}
      <div className="chip-row" role="group" aria-label="Chords used in this song">
        {suggestions.map((chord) => (
          <button key={formatChord(chord, 'sharps')} aria-pressed={label(chord) === shownLabel} onClick={() => apply((s) => confirmChord(setChord(s, event.id, chord), event.id))}>
            <ChordName label={label(chord)} />
          </button>
        ))}
        <button className="chip-quiet" aria-expanded={panel === 'other'} onClick={() => setPanel(panel === 'other' ? 'none' : 'other')}>Other…</button>
      </div>

      {panel === 'other' && (
        <div className="pop-section">
          <RootPicker selected={root} accidentals={accidentals} onPick={pickRoot} />
          <div className="chip-row">
            <div className="seg" role="group" aria-label="Major or minor">
              <button aria-pressed={root !== null && quality === ''} disabled={root === null} onClick={() => root !== null && pickShown({ kind: 'chord', root, quality: '' })}>Major</button>
              <button aria-pressed={quality === 'm'} disabled={root === null} onClick={() => root !== null && pickShown({ kind: 'chord', root, quality: 'm' })}>Minor</button>
            </div>
            {profile.difficulty === 'full' &&
              EXTRA_TYPES.map(([q, name]) => (
                <button key={q} aria-pressed={quality === q} disabled={root === null} onClick={() => root !== null && pickShown({ kind: 'chord', root, quality: q })}>{name}</button>
              ))}
            <button className="chip-quiet" aria-pressed={shown.kind === 'none'} onClick={() => pickShown({ kind: 'none' })}>No chord</button>
          </div>
        </div>
      )}

      <div className="pop-foot">
        <div className="seg" role="group" aria-label="When the change happens">
          <button onClick={() => apply((s) => moveChordStart(s, event.id, event.start - NUDGE_SEC))} disabled={index === 0} title="Change comes a bit earlier">◀ Earlier</button>
          <button onClick={() => apply((s) => moveChordStart(s, event.id, event.start + NUDGE_SEC))} title="Change comes a bit later">Later ▶</button>
        </div>
        <button className="chip-quiet" aria-expanded={panel === 'more'} onClick={() => setPanel(panel === 'more' ? 'none' : 'more')}>More ⋯</button>
      </div>

      {panel === 'more' && (
        <div className="pop-section chip-row">
          <button onClick={() => apply((s) => splitChord(s, event.id, usePlaybackStore.getState().time))} disabled={!canSplit} title="Split where the playhead is">Split</button>
          <button onClick={() => apply((s) => mergeWithNext(s, event.id))} disabled={index === song.chords.length - 1}>Join next</button>
          <button onClick={() => apply((s) => deleteChord(s, event.id))} disabled={song.chords.length < 2}>Remove</button>
          {song.lyrics.length > 0 && (
            <>
              <button onClick={() => apply((s) => moveChordToWord(s, event.id, -1))}>◀ Word</button>
              <button onClick={() => apply((s) => moveChordToWord(s, event.id, 1))}>Word ▶</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
