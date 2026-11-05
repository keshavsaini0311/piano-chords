// A continuous timeline: the playhead stays in the centre and the song scrolls past it.
// Grab and drag anywhere to move through the song (left = forward); a plain click jumps there.
// The track follows time through a CSS transform set outside React, so playback never re-renders
// the chord blocks; only the active-chord highlight re-renders, once per chord change.
// Each chord has a handle on its left edge: drag it to move the change (snaps to beats).
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { moveChordStart } from '../../domain/edits';
import { isUnsure, snapToBeat } from '../../domain/timing';
import { api } from '../../services/api';
import { player } from '../../services/player';
import { loadPeaks } from '../../services/waveform';
import { usePlaybackStore } from '../../state/playbackStore';
import { useSongStore } from '../../state/songStore';
import { useJudgeStore } from '../../state/judgeStore';
import { useViewStore } from '../../state/viewStore';
import { ChordName } from '../../ui/ChordName';
import { ChordPopover } from '../editor/ChordPopover';
import { formatTime, useActiveIndex, useDisplay, useSong } from '../studio/display';

export const WINDOW_SEC = 20; // seconds visible across the timeline
const PEAKS_PER_SEC = 25;
const DRAG_THRESHOLD_PX = 4;
const TICK_SEC = 2;

function drawWaveform(canvas: HTMLCanvasElement | null, peaks: number[], time: number) {
  if (!canvas || !peaks.length) return;
  const ratio = window.devicePixelRatio || 1;
  const w = canvas.clientWidth * ratio;
  const h = canvas.clientHeight * ratio;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  const styles = getComputedStyle(canvas);
  const played = styles.getPropertyValue('--now').trim() || '#f80';
  const upcoming = styles.getPropertyValue('--muted').trim() || '#888';
  const count = WINDOW_SEC * PEAKS_PER_SEC;
  const first = (time - WINDOW_SEC / 2) * PEAKS_PER_SEC;
  const barWidth = w / count;
  const offset = (first - Math.floor(first)) * barWidth; // keeps bars gliding smoothly between peaks
  for (let i = 0; i <= count; i++) {
    const peak = peaks[Math.floor(first) + i] ?? 0;
    const bar = Math.max(1, peak * h * 0.9);
    const x = i * barWidth - offset;
    ctx.fillStyle = x < w / 2 ? played : upcoming; // left of the centre playhead has been played
    ctx.fillRect(x, (h - bar) / 2, Math.max(1, barWidth - ratio), bar);
  }
}

export function Timeline() {
  const song = useSong();
  const active = useActiveIndex();
  const { selectedChordId, selectChord } = useViewStore();
  const apply = useSongStore((s) => s.apply);
  const grades = useJudgeStore((s) => s.results);
  const { label } = useDisplay();
  const [peaks, setPeaks] = useState<number[]>([]);
  const [width, setWidth] = useState(0);
  const [edge, setEdge] = useState<{ id: string; time: number } | null>(null);
  const lanes = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pan = useRef<{ x: number; time: number; moved: boolean } | null>(null);
  const justPanned = useRef(false);
  const pxPerSec = width / WINDOW_SEC;

  useEffect(() => {
    const el = lanes.current!;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    loadPeaks(api.audioUrl(song.id), Math.ceil(song.duration * PEAKS_PER_SEC)).then(setPeaks, () => setPeaks([]));
  }, [song.id, song.duration]);

  // Follow playback without re-rendering: move the track and repaint the waveform.
  useEffect(() => {
    if (!width) return;
    const paint = (time: number) => {
      if (track.current) track.current.style.transform = `translateX(${width / 2 - time * pxPerSec}px)`;
      drawWaveform(canvas.current, peaks, time);
    };
    paint(usePlaybackStore.getState().time);
    return usePlaybackStore.subscribe((s, prev) => {
      if (s.time !== prev.time) paint(s.time);
    });
  }, [width, pxPerSec, peaks]);

  const clampTime = (t: number) => Math.min(Math.max(t, 0), song.duration);
  const timeAtX = (clientX: number) => {
    const box = lanes.current!.getBoundingClientRect();
    return clampTime(usePlaybackStore.getState().time + (clientX - box.left - width / 2) / pxPerSec);
  };

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.chord-edge, .chord-popover-edit')) return;
    pan.current = { x: e.clientX, time: usePlaybackStore.getState().time, moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const p = pan.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    if (!p.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    if (!p.moved) {
      p.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    player.seek(clampTime(p.time - dx / pxPerSec));
  };
  const onPointerUp = (e: PointerEvent) => {
    const p = pan.current;
    pan.current = null;
    if (!p) return;
    if (p.moved) {
      justPanned.current = true;
      setTimeout(() => (justPanned.current = false), 0);
    } else if (!(e.target as HTMLElement).closest('button')) player.seek(timeAtX(e.clientX));
  };

  const px = (t: number) => `${t * pxPerSec}px`;
  const ticks = Array.from({ length: Math.floor(song.duration / TICK_SEC) + 1 }, (_, i) => i * TICK_SEC);
  return (
    <section className="timeline" aria-label="Timeline: drag to move through the song">
      <div
        className="timeline-lanes"
        ref={lanes}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (pan.current = null)}
      >
        <canvas ref={canvas} className="waveform" aria-hidden="true" />
        <div className="track" ref={track} style={{ width: px(song.duration) }}>
          <div className="ruler" aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} style={{ left: px(t) }}>{formatTime(t)}</span>
            ))}
          </div>
          <div className="audio-row" />
          <div className="chord-lane">
            {song.chords.map((c, i) => (
              <button
                key={c.id}
                className={['chord-block', i === active && 'active', c.id === selectedChordId && 'selected', isUnsure(c) && 'unsure', c.chord.kind === 'none' && 'silent', grades[c.id] && `graded-${grades[c.id]}`].filter(Boolean).join(' ')}
                style={{ left: px(c.start), width: px(c.end - c.start) }}
                onClick={() => {
                  if (justPanned.current) return;
                  selectChord(c.id);
                  player.seek(c.start);
                }}
                aria-label={`${label(c.chord)} at ${formatTime(c.start)}`}
              >
                <ChordName label={label(c.chord)} />
              </button>
            ))}
            {song.chords.slice(1).map((c) => (
                <button
                  key={`edge-${c.id}`}
                  className={edge?.id === c.id ? 'chord-edge dragging' : 'chord-edge'}
                  style={{ left: px(c.start) }}
                  aria-label={`Move the change into ${label(c.chord)}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setEdge({ id: c.id, time: c.start });
                  }}
                  onPointerMove={(e) => {
                    if (edge?.id === c.id) setEdge({ id: c.id, time: snapToBeat(timeAtX(e.clientX), song.beats) });
                  }}
                  onPointerUp={() => {
                    if (edge && edge.time !== c.start) apply((s) => moveChordStart(s, edge.id, edge.time));
                    setEdge(null);
                  }}
                  onPointerCancel={() => setEdge(null)}
                />
              ))}
            {edge && (
              <div className="drag-ghost" style={{ left: px(edge.time) }}>
                <span>{formatTime(edge.time)}</span>
              </div>
            )}
          </div>
          <div className="lyric-lane">
            {song.lyrics
              .filter((l) => l.text.trim())
              .map((l) => (
                <span key={l.id} style={{ left: px(l.start), width: px(l.end - l.start) }}>{l.text}</span>
              ))}
          </div>
          {song.chords
              .map((c, i) => ({ c, i }))
              .filter(({ c }) => c.id === selectedChordId)
              .map(({ c, i }) => <ChordPopover key={c.id} event={c} index={i} style={{ left: px(c.start) }} />)}
        </div>
        <div className="playhead" aria-hidden="true" />
        {!song.lyrics.length && <span className="no-lyrics muted small">No lyrics for this song yet</span>}
      </div>
    </section>
  );
}
