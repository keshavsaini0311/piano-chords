// Bottom bar: play/pause, time, scrubber, loop the current change, speed.
import type { ChordEvent } from '../../domain/song';
import type { Section } from '../../domain/sections';
import { activeChordIndex } from '../../domain/timing';
import { player } from '../../services/player';
import { usePlaybackStore } from '../../state/playbackStore';
import { useViewStore } from '../../state/viewStore';
import { formatTime, useSong } from '../studio/display';

const SPEEDS = [1, 0.75, 0.5];

/** Leave the wait-for-me stop: set the next gate, then play on. */
export function resumeFromWait(nextGate: number | null) {
  const { setGate, setWaiting } = usePlaybackStore.getState();
  setGate(nextGate);
  setWaiting(false);
  player.play();
}

export function togglePlay() {
  const { playing, waiting, setPlaying, setWaiting } = usePlaybackStore.getState();
  if (playing && waiting) setWaiting(false);
  if (playing) player.pause();
  else player.play();
  setPlaying(!playing);
}

/** Loops the current chord and the next one: the change you are practising. */
export function toggleLoop(chords: ChordEvent[]) {
  const { loop, time, setLoop } = usePlaybackStore.getState();
  if (loop) return setLoop(null);
  const i = Math.max(0, activeChordIndex(chords, time));
  const last = chords[Math.min(i + 1, chords.length - 1)];
  if (chords[i]) setLoop({ start: chords[i].start, end: last.end });
}

/** Loops a section from its start; clicking the section that is already looping turns the loop off. */
export function loopSection(section: Section) {
  const { loop, setLoop } = usePlaybackStore.getState();
  if (loop?.start === section.start && loop.end === section.end) return setLoop(null);
  setLoop({ start: section.start, end: section.end });
  player.seek(section.start);
}

export function PlayerBar() {
  const song = useSong();
  const playing = usePlaybackStore((s) => s.playing);
  const second = usePlaybackStore((s) => Math.floor(s.time));
  const time = usePlaybackStore((s) => s.time);
  const rate = usePlaybackStore((s) => s.rate);
  const loop = usePlaybackStore((s) => s.loop);
  const volume = useViewStore((s) => s.volume);
  const setVolume = (v: number) => {
    player.setVolume(v);
    useViewStore.getState().setVolume(v);
  };
  const setRate = (r: number) => {
    player.setRate(r);
    usePlaybackStore.getState().setRate(r);
  };
  return (
    <footer className="bar player-bar">
      <button className="play-button" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} title="Space">
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 4 2.5z" fill="currentColor" /></svg>
        )}
      </button>
      <span className="time">
        {formatTime(second)} <span className="muted">/ {formatTime(song.duration)}</span>
      </span>
      <input
        className="scrubber"
        type="range"
        min={0}
        max={song.duration}
        step={0.1}
        value={time}
        onChange={(e) => player.seek(Number(e.target.value))}
        aria-label="Position"
      />
      <button className="btn" aria-pressed={loop !== null} onClick={() => toggleLoop(song.chords)} title="L">
        {loop ? `Looping ${formatTime(loop.start)} to ${formatTime(loop.end)}` : 'Loop this change'}
      </button>
      <label className="volume" title="Volume">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 7h3l4-3v10l-4-3H3z" fill="currentColor" />{volume > 0 && <path d="M12.5 6.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}{volume > 0.5 && <path d="M14.5 4.5a6.5 6.5 0 0 1 0 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}</svg>
        <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
      </label>
      <button className="btn" onClick={() => setRate(SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length])} title="Tap to change speed (pitch stays the same)">
        Speed {rate * 100}%
      </button>
    </footer>
  );
}
