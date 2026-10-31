// Waveform, chord blocks and lyric lane for a window of the song. The window pages with playback
// (re-rendering once per page); only the playhead follows time every frame.
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { player } from '../../services/player';
import { api } from '../../services/api';
import { loadPeaks } from '../../services/waveform';
import { usePlaybackStore } from '../../state/playbackStore';
import { useViewStore } from '../../state/viewStore';
import { useActiveIndex, useDisplay, useSong, formatTime } from '../studio/display';

export const WINDOW_SEC = 20;
const PEAKS_PER_SEC = 25;
export const UNSURE_BELOW = 0.6;

const percent = (t: number, start: number) => `${((t - start) / WINDOW_SEC) * 100}%`;

function useWindowStart(): number {
  return usePlaybackStore((s) => Math.floor(s.time / WINDOW_SEC) * WINDOW_SEC);
}

function Playhead({ windowStart }: { windowStart: number }) {
  const time = usePlaybackStore((s) => s.time);
  if (time < windowStart || time > windowStart + WINDOW_SEC) return null;
  return <div className="playhead" style={{ left: percent(time, windowStart) }} aria-hidden="true" />;
}

function Waveform({ peaks, windowStart }: { peaks: number[]; windowStart: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !peaks.length) return;
    const ratio = window.devicePixelRatio || 1;
    el.width = el.clientWidth * ratio;
    el.height = el.clientHeight * ratio;
    const ctx = el.getContext('2d')!;
    ctx.fillStyle = getComputedStyle(el).getPropertyValue('--muted').trim() || '#888';
    const first = Math.floor(windowStart * PEAKS_PER_SEC);
    const count = WINDOW_SEC * PEAKS_PER_SEC;
    const barWidth = el.width / count;
    for (let i = 0; i < count; i++) {
      const peak = peaks[first + i] ?? 0;
      const h = Math.max(1, peak * el.height * 0.9);
      ctx.fillRect(i * barWidth, (el.height - h) / 2, Math.max(1, barWidth - ratio), h);
    }
  }, [peaks, windowStart]);
  return <canvas ref={canvas} className="waveform" aria-hidden="true" />;
}

export function Timeline() {
  const song = useSong();
  const windowStart = useWindowStart();
  const windowEnd = windowStart + WINDOW_SEC;
  const active = useActiveIndex();
  const selected = useViewStore((s) => s.selectedChordId);
  const selectChord = useViewStore((s) => s.selectChord);
  const { label } = useDisplay();
  const [peaks, setPeaks] = useState<number[]>([]);
  const lanes = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPeaks(api.audioUrl(song.id), Math.ceil(song.duration * PEAKS_PER_SEC)).then(setPeaks, () => setPeaks([]));
  }, [song.id, song.duration]);

  const timeAt = (clientX: number) => {
    const box = lanes.current!.getBoundingClientRect();
    return windowStart + ((clientX - box.left) / box.width) * WINDOW_SEC;
  };
  const seekToPointer = (e: PointerEvent) => player.seek(timeAt(e.clientX));

  const visible = song.chords.map((c, i) => ({ c, i })).filter(({ c }) => c.end > windowStart && c.start < windowEnd);
  const ticks = Array.from({ length: WINDOW_SEC / 2 }, (_, i) => windowStart + i * 2);
  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-labels muted">
        <span className="tl-ruler" />
        <span className="tl-audio">Audio</span>
        <span className="tl-chords">Chords</span>
        <span className="tl-lyrics">Lyrics</span>
      </div>
      <div className="timeline-lanes" ref={lanes}>
        <div className="tl-ruler ruler">
          {ticks.map((t) => (
            <span key={t} className="mono" style={{ left: percent(t, windowStart) }}>{formatTime(t)}</span>
          ))}
        </div>
        <div className="tl-audio" onPointerDown={seekToPointer}>
          <Waveform peaks={peaks} windowStart={windowStart} />
        </div>
        <div className="tl-chords chord-lane">
          {visible.map(({ c, i }) => (
            <button
              key={c.id}
              className={['chord-block', i === active && 'active', c.id === selected && 'selected', (c.confidence ?? 1) < UNSURE_BELOW && 'unsure', c.chord.kind === 'none' && 'silent'].filter(Boolean).join(' ')}
              style={{ left: percent(Math.max(c.start, windowStart), windowStart), width: `${((Math.min(c.end, windowEnd) - Math.max(c.start, windowStart)) / WINDOW_SEC) * 100}%` }}
              onClick={() => {
                selectChord(c.id);
                player.seek(c.start);
              }}
              aria-label={`Chord ${label(c.chord)} at ${formatTime(c.start)}`}
            >
              <span className="mono">{label(c.chord)}</span>
            </button>
          ))}
        </div>
        <div className="tl-lyrics lyric-lane">
          {song.lyrics
            .filter((l) => l.end > windowStart && l.start < windowEnd && l.text.trim())
            .map((l) => (
              <span key={l.id} style={{ left: percent(Math.max(l.start, windowStart), windowStart), width: `${((Math.min(l.end, windowEnd) - Math.max(l.start, windowStart)) / WINDOW_SEC) * 100}%` }}>
                {l.text}
              </span>
            ))}
          {!song.lyrics.length && <span className="muted no-lyrics">No lyrics</span>}
        </div>
        <Playhead windowStart={windowStart} />
      </div>
    </section>
  );
}
