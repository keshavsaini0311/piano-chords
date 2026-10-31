// The chart: chords over lyrics, and lead-sheet bars (with repeat counts) where there are no lyrics.
// The current line is shaded and kept in view during playback; past lines fade back.
import { useEffect, useMemo, useRef } from 'react';
import { alignChart } from '../../domain/align';
import { toLeadSheet, type SheetLine } from '../../domain/leadSheet';
import type { ChordEvent } from '../../domain/song';
import { useViewStore } from '../../state/viewStore';
import { useActiveIndex, useDisplay, useSong, useVoicings } from '../studio/display';
import { ChordChip } from './ChordChip';

function lyricSegments(line: Extract<SheetLine, { kind: 'lyric' }>) {
  const { row } = line;
  const text = row.line.text;
  const segments: { event?: ChordEvent; text: string }[] = [];
  const first = row.chords[0]?.charIndex ?? text.length;
  if (first > 0) segments.push({ text: text.slice(0, first) });
  row.chords.forEach((placed, i) => {
    const end = row.chords[i + 1]?.charIndex ?? text.length;
    segments.push({ event: placed.event, text: text.slice(placed.charIndex, Math.max(end, placed.charIndex)) });
  });
  return segments;
}

export function ChartPreview() {
  const song = useSong();
  const active = useActiveIndex();
  const selected = useViewStore((s) => s.selectedChordId);
  const mode = useViewStore((s) => s.mode);
  const { label } = useDisplay();
  const voicings = useVoicings();
  const lines = useMemo(() => toLeadSheet(alignChart(song), 4, (e) => label(e.chord)), [song, label]);
  const indexById = useMemo(() => new Map(song.chords.map((c, i) => [c.id, i])), [song.chords]);
  const activeId = song.chords[active]?.id;
  const currentLine = lines.findIndex((l) => activeId !== undefined && l.ids.includes(activeId));
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (mode !== 'play') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    lineRefs.current[currentLine]?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }, [currentLine, mode]);

  const chip = (event: ChordEvent, isActive: boolean, isSelected: boolean) => (
    <ChordChip
      key={event.id}
      event={event}
      label={label(event.chord)}
      voicing={voicings[indexById.get(event.id)!] ?? []}
      active={isActive}
      selected={isSelected}
    />
  );

  return (
    <div className="chart">
      {lines.map((line, i) => (
        <div key={line.ids[0] ?? i} ref={(el) => void (lineRefs.current[i] = el)} className={`chart-row${i === currentLine ? ' current' : i < currentLine ? ' past' : ''}`}>
          {line.kind === 'bars' ? (
            <div className="lead-sheet">
              {line.chords.map((c, col) =>
                chip(c, activeId !== undefined && line.columnOf.get(activeId) === col, selected !== null && line.columnOf.get(selected) === col),
              )}
              {line.repeats > 1 && <span className="repeat" title={`Played ${line.repeats} times`}>×{line.repeats}</span>}
            </div>
          ) : (
            lyricSegments(line).map((segment, s) => (
              <span key={s} className="chart-segment">
                {segment.event ? chip(segment.event, segment.event.id === activeId, segment.event.id === selected) : <span className="chord-chip spacer">–</span>}
                <span className="chart-text">{segment.text || ' '}</span>
              </span>
            ))
          )}
        </div>
      ))}
    </div>
  );
}
