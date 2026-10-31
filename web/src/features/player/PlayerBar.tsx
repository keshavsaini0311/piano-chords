// Bottom bar: play/pause, time, scrubber, loop the current change, speed.
import type { ChordEvent } from '../../domain/song';
import { activeChordIndex } from '../../domain/timing';
import { player } from '../../services/player';
import { usePlaybackStore } from '../../state/playbackStore';
import { useViewStore } from '../../state/viewStore';
import { formatTime, useSong } from '../studio/display';

const SPEEDS = [1, 0.75, 0.5];

export function togglePlay() {
  const { playing, setPlaying } = usePlaybackStore.getState();
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
        {playing ? '❚❚' : '▶'}
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
        <span aria-hidden="true">{volume === 0 ? '🔇' : '🔊'}</span>
        <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
      </label>
      <button className="btn" onClick={() => setRate(SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length])} title="Tap to change speed (pitch stays the same)">
        Speed {rate * 100}%
      </button>
    </footer>
  );
}
