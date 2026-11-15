// Melody / Both mode: notes fall onto your keyboard, Synthesia style. Drawn on a canvas each frame from
// playbackStore.getState(), so React re-renders only when the notes or settings change, never per frame.
import { useEffect, useMemo, useRef, useState } from 'react';
import { keyLayout, type KeyBox } from '../../domain/keyboard';
import { accidentalsForKey, noteName, toPitchClass, type Accidentals } from '../../domain/music';
import { api } from '../../services/api';
import { usePlaybackStore } from '../../state/playbackStore';
import { useSongStore } from '../../state/songStore';
import { useViewStore } from '../../state/viewStore';
import { useDisplay, useFallingNotes, useSong, type FallingNote } from '../studio/display';

const LOOKAHEAD_SEC = 3; // how far ahead you can see; the notes fall slower at slower speeds by themselves
const POLL_MS = 4000;
const POLL_TRIES = 75; // ~5 minutes: the first melody can queue behind an import and its stems

type Palette = Record<'surface' | 'surface2' | 'line' | 'line2' | 'muted' | 'now' | 'onNow' | 'next' | 'left' | 'ivory' | 'ebony' | 'keyLine' | 'font', string>;
type Scene = { notes: FallingNote[]; keys: Map<number, KeyBox>; beats: number[]; accidentals: Accidentals; names: boolean };

function readPalette(el: HTMLElement): Palette {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    surface: v('--surface'), surface2: v('--surface2'), line: v('--line'), line2: v('--line2'), muted: v('--muted'),
    now: v('--now'), onNow: v('--on-now'), next: v('--next'), left: v('--hand-left'),
    ivory: v('--ivory'), ebony: v('--ebony'), keyLine: v('--key-line'), font: v('--font-ui'),
  };
}

/** The soonest notes each hand plays next: they get a blue dot on their key, like the chord strip. */
function upcoming(notes: FallingNote[], time: number): Set<number> {
  const out = new Set<number>();
  for (const hand of ['left', 'right'] as const) {
    let soonest = Infinity;
    for (const n of notes) if (n.hand === hand && n.start > time && n.start < soonest) soonest = n.start;
    if (soonest - time > LOOKAHEAD_SEC) continue;
    for (const n of notes) if (n.hand === hand && Math.abs(n.start - soonest) < 0.03) out.add(n.midi);
  }
  return out;
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, scene: Scene, c: Palette) {
  const keysH = Math.min(120, Math.max(64, h * 0.2));
  const hitY = h - keysH;
  const pps = hitY / LOOKAHEAD_SEC;
  const blackH = keysH * 0.62;
  const keys = [...scene.keys];

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = c.surface;
  ctx.fillRect(0, 0, w, hitY);
  ctx.globalAlpha = 0.55; // black-key lanes, so a falling note's lane is easy to follow down
  ctx.fillStyle = c.surface2;
  for (const [, k] of keys) if (k.black) ctx.fillRect(k.x * w, 0, k.w * w, hitY);
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.line;
  for (const [m, k] of keys) if (m % 12 === 0) ctx.fillRect(Math.round(k.x * w), 0, 1, hitY); // octave guides at each C
  scene.beats.forEach((beat, i) => {
    if (beat < time || beat > time + LOOKAHEAD_SEC) return;
    ctx.fillStyle = i % 4 === 0 ? c.line2 : c.line; // bars a little stronger than beats
    ctx.fillRect(0, Math.round(hitY - (beat - time) * pps), w, 1);
  });

  const lit = new Set<number>();
  for (const n of scene.notes) {
    if (n.end <= time || n.start >= time + LOOKAHEAD_SEC) continue;
    const k = scene.keys.get(n.midi);
    if (!k) continue;
    const on = n.start <= time;
    if (on) lit.add(n.midi);
    const top = Math.max(-8, hitY - (n.end - time) * pps);
    const bottom = Math.min(hitY, hitY - (n.start - time) * pps);
    const inset = k.black ? 1 : 2;
    ctx.fillStyle = on ? c.now : n.hand === 'left' ? c.left : c.next;
    ctx.beginPath();
    ctx.roundRect(k.x * w + inset, top, k.w * w - inset * 2, Math.max(2, bottom - top), 5);
    ctx.fill();
  }

  const next = upcoming(scene.notes, time);
  const label = (m: number) => noteName(toPitchClass(m), scene.accidentals);
  const dot = (cx: number, cy: number) => {
    ctx.fillStyle = c.next;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const [m, k] of keys) {
    if (k.black) continue;
    const x = k.x * w;
    const kw = k.w * w;
    ctx.fillStyle = lit.has(m) ? c.now : c.ivory;
    ctx.fillRect(x, hitY, kw, keysH);
    ctx.fillStyle = c.keyLine;
    ctx.fillRect(Math.round(x), hitY, 1, keysH);
    if (lit.has(m) && scene.names) {
      ctx.fillStyle = c.onNow;
      ctx.font = `600 ${Math.min(13, kw * 0.5)}px ${c.font}`;
      ctx.fillText(label(m), x + kw / 2, h - 10);
    } else if (m % 12 === 0) {
      ctx.fillStyle = c.muted;
      ctx.font = `500 ${Math.min(10, kw * 0.42)}px ${c.font}`;
      ctx.fillText(`C${Math.floor(m / 12) - 1}`, x + kw / 2, h - 8);
    }
    if (next.has(m) && !lit.has(m)) dot(x + kw / 2, h - 26);
  }
  for (const [m, k] of keys) {
    if (!k.black) continue;
    const x = k.x * w;
    const kw = k.w * w;
    ctx.fillStyle = lit.has(m) ? c.now : c.ebony;
    ctx.beginPath();
    ctx.roundRect(x, hitY, kw, blackH, [0, 0, 3, 3]);
    ctx.fill();
    if (lit.has(m) && scene.names) {
      ctx.fillStyle = c.onNow;
      ctx.font = `600 ${Math.min(11, kw * 0.55)}px ${c.font}`;
      ctx.fillText(label(m), x + kw / 2, hitY + blackH - 8);
    }
    if (next.has(m) && !lit.has(m)) dot(x + kw / 2, hitY + blackH - 12);
  }
  ctx.fillStyle = c.line2; // the line notes land on
  ctx.fillRect(0, hitY - 1, w, 2);
}

/** The server finds the melody the first time a song is opened; poll until it lands, then merge it in. */
function useMelodyArrival(songId: string, missing: boolean): boolean {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!missing) return;
    let tries = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () =>
      api.getSong(songId).then((fresh) => fresh.melody, () => undefined).then((melody) => {
        if (stopped) return;
        if (melody) {
          if (useSongStore.getState().song?.id === songId) useSongStore.getState().mergeServer({ melody });
          return;
        }
        if (++tries >= POLL_TRIES) return setTimedOut(true);
        timer = setTimeout(tick, POLL_MS);
      });
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [songId, missing]);
  return timedOut;
}

export function FallingNotes() {
  const song = useSong();
  const data = useFallingNotes();
  const both = useViewStore((s) => s.playMode === 'both');
  const { difficulty, showNoteNames, keyRange } = useViewStore((s) => s.profile);
  const { currentKey } = useDisplay();
  const timedOut = useMelodyArrival(song.id, song.melody === undefined);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const range = data?.range ?? keyRange;
  const keys = useMemo(() => keyLayout(range), [range]); // range is memoised upstream, so this runs on real changes only
  const scene = useRef<Scene | null>(null);
  useEffect(() => {
    scene.current = { notes: data?.notes ?? [], keys, beats: song.beats, accidentals: accidentalsForKey(currentKey), names: showNoteNames };
  }, [data, keys, song.beats, currentKey, showNoteNames]);

  useEffect(() => {
    const el = box.current;
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!el || !cv || !ctx) return;
    let palette = readPalette(el);
    let size = { w: 0, h: 0 };
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      size = { w: el.clientWidth, h: el.clientHeight };
      cv.width = Math.round(size.w * dpr);
      cv.height = Math.round(size.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      palette = readPalette(el);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const onTheme = () => (palette = readPalette(el));
    dark.addEventListener('change', onTheme);
    resize();
    let frame = requestAnimationFrame(function loop() {
      if (scene.current && size.w) draw(ctx, size.w, size.h, usePlaybackStore.getState().time, scene.current, palette);
      frame = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      dark.removeEventListener('change', onTheme);
    };
  }, []);

  const noTune = song.melody?.length === 0;
  const message = timedOut
    ? { title: 'The melody is taking longer than usual.', body: 'Open the song again in a few minutes to check.' }
    : song.melody === undefined
      ? { title: 'Finding the melody…', body: 'Only the first time, usually under a minute. Chords work meanwhile.', busy: true }
      : noTune && !both
        ? { title: 'No clear melody in this song.', body: 'Try Both for the chords in your left hand.' }
        : null;

  return (
    <section className="falling-wrap" aria-label="Falling notes">
      <div className="falling-caption small">
        <span className="falling-legend">
          {both && (
            <span><i className="falling-swatch hand-left" aria-hidden="true" />Left hand: chords</span>
          )}
          <span><i className="falling-swatch hand-right" aria-hidden="true" />Right hand: {noTune ? 'no tune found' : 'tune'}</span>
        </span>
        <span>{difficulty === 'easy' ? 'Easy: quick notes left out, fitted to your keys' : 'Full: every note as sung'}</span>
      </div>
      <div className="falling" ref={box}>
        <canvas ref={canvas} role="img" aria-label={`Notes falling onto your keyboard${both ? ', both hands' : ''}`} />
        {message && (
          <div className="falling-empty" aria-live="polite">
            {message.busy && <span className="finding-dot" aria-hidden="true" />}
            <strong>{message.title}</strong>
            <span className="muted small">{message.body}</span>
          </div>
        )}
      </div>
    </section>
  );
}
