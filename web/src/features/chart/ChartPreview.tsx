// Chords over lyrics (or chord rows when there are no lyrics). The current row is shaded and
// scrolled into view during playback.
import { useEffect, useMemo, useRef } from 'react';
import { alignChart, type ChartRow } from '../../domain/align';
import type { ChordEvent } from '../../domain/song';
import { useViewStore } from '../../state/viewStore';
import { useActiveIndex, useDisplay, useSong, useVoicings } from '../studio/display';
import { ChordChip } from './ChordChip';

const CHORDS_PER_ROW = 4; // chord-only stretches become lead-sheet lines: | Em | G | C | Am |

type Row = { key: string; chordIds: string[] } & ({ kind: 'lyric'; segments: { event?: ChordEvent; text: string }[] } | { kind: 'instrumental'; chords: ChordEvent[] });

function toRows(chart: ChartRow[]): Row[] {
  const rows: Row[] = [];
  chart.forEach((row, r) => {
    if (row.kind === 'instrumental') {
      for (let i = 0; i < row.chords.length; i += CHORDS_PER_ROW) {
        const chords = row.chords.slice(i, i + CHORDS_PER_ROW);
        rows.push({ key: `i${r}-${i}`, kind: 'instrumental', chords, chordIds: chords.map((c) => c.id) });
      }
      return;
    }
    const { line, chords } = row;
    const segments: { event?: ChordEvent; text: string }[] = [];
    const firstIndex = chords[0]?.charIndex ?? line.text.length;
    if (firstIndex > 0) segments.push({ text: line.text.slice(0, firstIndex) });
    chords.forEach((placed, i) => {
      const end = chords[i + 1]?.charIndex ?? line.text.length;
      segments.push({ event: placed.event, text: line.text.slice(placed.charIndex, Math.max(end, placed.charIndex)) });
    });
    rows.push({ key: line.id, kind: 'lyric', segments, chordIds: chords.map((c) => c.event.id) });
  });
  return rows;
}

export function ChartPreview() {
  const song = useSong();
  const active = useActiveIndex();
  const selected = useViewStore((s) => s.selectedChordId);
  const mode = useViewStore((s) => s.mode);
  const { label } = useDisplay();
  const voicings = useVoicings();
  const rows = useMemo(() => toRows(alignChart(song)), [song]);
  const indexById = useMemo(() => new Map(song.chords.map((c, i) => [c.id, i])), [song.chords]);
  const activeId = song.chords[active]?.id;
  const currentRow = rows.findIndex((r) => activeId && r.chordIds.includes(activeId));
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (mode !== 'play') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rowRefs.current[currentRow]?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }, [currentRow, mode]);

  const chip = (event: ChordEvent) => (
    <ChordChip
      key={event.id}
      event={event}
      label={label(event.chord)}
      voicing={voicings[indexById.get(event.id)!] ?? []}
      active={event.id === activeId}
      selected={event.id === selected}
    />
  );

  return (
    <div className="chart">
      {rows.map((row, i) => (
        <div key={row.key} ref={(el) => void (rowRefs.current[i] = el)} className={`chart-row${i === currentRow ? ' current' : i < currentRow ? ' past' : ''}`}>
          {row.kind === 'instrumental' ? (
            <div className="lead-sheet">{row.chords.map((c) => chip(c))}</div>
          ) : (
            row.segments.map((segment, s) => (
              <span key={s} className="chart-segment">
                {segment.event ? chip(segment.event) : <span className="chord-chip spacer">–</span>}
                <span className="chart-text">{segment.text || ' '}</span>
              </span>
            ))
          )}
        </div>
      ))}
    </div>
  );
}
