// Waveform, chord blocks and lyric lane for a window of the song. The window pages with playback
// (re-rendering once per page); only the playhead follows time every frame.
// In edit mode each chord has a handle on its left edge: drag it to move the change, snapping to beats.
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { moveChordStart } from '../../domain/edits';
import { isUnsure, snapToBeat } from '../../domain/timing';
import { api } from '../../services/api';
import { player } from '../../services/player';
import { loadPeaks } from '../../services/waveform';
import { usePlaybackStore } from '../../state/playbackStore';
import { useSongStore } from '../../state/songStore';
import { useViewStore } from '../../state/viewStore';
import { ChordName } from '../../ui/ChordName';
import { ChordPopover } from '../editor/ChordPopover';
import { formatTime, useActiveIndex, useDisplay, useSong } from '../studio/display';

export const WINDOW_SEC = 20;
const PEAKS_PER_SEC = 25;

const percent = (t: number, start: number) => `${((t - start) / WINDOW_SEC) * 100}%`;
const span = (start: number, end: number, windowStart: number) => ({
  left: percent(Math.max(start, windowStart), windowStart),
  width: `${((Math.min(end, windowStart + WINDOW_SEC) - Math.max(start, windowStart)) / WINDOW_SEC) * 100}%`,
});

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
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.fillStyle = getComputedStyle(el).getPropertyValue('--muted').trim() || '#888';
    const first = Math.floor(windowStart * PEAKS_PER_SEC);
    const count = WINDOW_SEC * PEAKS_PER_SEC;
    const barWidth = el.width / count;
    for (let i = 0; i < count; i++) {
      const h = Math.max(1, (peaks[first + i] ?? 0) * el.height * 0.9);
      ctx.fillRect(i * barWidth, (el.height - h) / 2, Math.max(1, barWidth - ratio), h);
    }
  }, [peaks, windowStart]);
  return <canvas ref={canvas} className="waveform" aria-hidden="true" />;
}

export function Timeline() {
  const song = useSong();
  const windowStart = usePlaybackStore((s) => Math.floor(s.time / WINDOW_SEC) * WINDOW_SEC);
  const windowEnd = windowStart + WINDOW_SEC;
  const active = useActiveIndex();
  const { selectedChordId, selectChord, mode } = useViewStore();
  const apply = useSongStore((s) => s.apply);
  const { label } = useDisplay();
  const [peaks, setPeaks] = useState<number[]>([]);
  const [drag, setDrag] = useState<{ id: string; time: number } | null>(null);
  const scrubWindow = useRef<number | null>(null); // window start while scrubbing, so the view doesn't page under the pointer
  const lanes = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPeaks(api.audioUrl(song.id), Math.ceil(song.duration * PEAKS_PER_SEC)).then(setPeaks, () => setPeaks([]));
  }, [song.id, song.duration]);

  const timeAt = (clientX: number, start = windowStart) => {
    const box = lanes.current!.getBoundingClientRect();
    return start + Math.min(Math.max((clientX - box.left) / box.width, 0), 0.999) * WINDOW_SEC;
  };
  const scrubStart = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubWindow.current = windowStart;
    player.seek(timeAt(e.clientX));
  };
  const scrubMove = (e: PointerEvent) => scrubWindow.current !== null && player.seek(timeAt(e.clientX, scrubWindow.current));
  const scrubEnd = () => (scrubWindow.current = null);
  const dragTo = (e: PointerEvent, id: string) => setDrag({ id, time: snapToBeat(timeAt(e.clientX), song.beats) });
  const endDrag = () => {
    if (drag) apply((s) => moveChordStart(s, drag.id, drag.time));
    setDrag(null);
  };

  const visible = song.chords.map((c, i) => ({ c, i })).filter(({ c }) => c.end > windowStart && c.start < windowEnd);
  const ticks = Array.from({ length: WINDOW_SEC / 2 }, (_, i) => windowStart + i * 2);
  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-lanes" ref={lanes}>
        <div className="scrub-zone" onPointerDown={scrubStart} onPointerMove={scrubMove} onPointerUp={scrubEnd} onPointerCancel={scrubEnd} title="Drag to scrub">
          <div className="ruler" aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} style={{ left: percent(t, windowStart) }}>{formatTime(t)}</span>
            ))}
          </div>
          <div className="tl-audio">
            <Waveform peaks={peaks} windowStart={windowStart} />
          </div>
        </div>
        <div className="chord-lane">
          {visible.map(({ c, i }) => (
            <button
              key={c.id}
              className={['chord-block', i === active && 'active', c.id === selectedChordId && 'selected', isUnsure(c) && 'unsure', c.chord.kind === 'none' && 'silent'].filter(Boolean).join(' ')}
              style={span(c.start, c.end, windowStart)}
              onClick={() => {
                selectChord(c.id);
                player.seek(c.start);
              }}
              aria-label={`${label(c.chord)} at ${formatTime(c.start)}`}
            >
              <ChordName label={label(c.chord)} />
            </button>
          ))}
          {mode === 'edit' &&
            visible
              .filter(({ c, i }) => i > 0 && c.start >= windowStart)
              .map(({ c }) => (
                <button
                  key={`edge-${c.id}`}
                  className={drag?.id === c.id ? 'chord-edge dragging' : 'chord-edge'}
                  style={{ left: percent(c.start, windowStart) }}
                  aria-label={`Move the change into ${label(c.chord)}`}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    dragTo(e, c.id);
                  }}
                  onPointerMove={(e) => drag?.id === c.id && dragTo(e, c.id)}
                  onPointerUp={endDrag}
                  onPointerCancel={() => setDrag(null)}
                />
              ))}
          {drag && (
            <div className="drag-ghost" style={{ left: percent(drag.time, windowStart) }}>
              <span>{drag.time.toFixed(2)}s</span>
            </div>
          )}
        </div>
        <div className="lyric-lane">
          {song.lyrics
            .filter((l) => l.end > windowStart && l.start < windowEnd && l.text.trim())
            .map((l) => (
              <span key={l.id} style={span(l.start, l.end, windowStart)}>{l.text}</span>
            ))}
          {!song.lyrics.length && <span className="no-lyrics">No lyrics for this song yet</span>}
        </div>
        <Playhead windowStart={windowStart} />
        {mode === 'edit' &&
          visible
            .filter(({ c }) => c.id === selectedChordId)
            .map(({ c, i }) => (
              <ChordPopover
                key={c.id}
                event={c}
                index={i}
                style={{ left: `clamp(0px, calc(${((Math.max(c.start, windowStart) - windowStart) / WINDOW_SEC) * 100}% - 8px), calc(100% - min(380px, 100%)))` }}
              />
            ))}
      </div>
    </section>
  );
}
