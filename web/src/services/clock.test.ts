import { afterEach, describe, expect, it, vi } from 'vitest';
import { startClock } from './clock';
import type { Player } from './player';

function run(times: number[], loop: { start: number; end: number } | null, gate: number | null) {
  const frames: (() => void)[] = [];
  vi.stubGlobal('requestAnimationFrame', (f: () => void) => frames.push(f));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  let i = 0;
  const player = { currentTime: () => times[i++], seek: vi.fn() } as unknown as Player;
  const onTick = vi.fn();
  const onGate = vi.fn();
  startClock(player, onTick, () => loop, () => gate, onGate);
  for (let n = 0; n < times.length; n++) frames.shift()!();
  return { onTick, onGate };
}

describe('startClock gate', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stops at the gate', () => {
    const { onTick, onGate } = run([9.98, 10.02], null, 10);
    expect(onGate).toHaveBeenCalledWith(10);
    expect(onTick).toHaveBeenLastCalledWith(10);
  });

  it('a loop restart never trips the gate', () => {
    const { onGate } = run([11.99, 12.01], { start: 4, end: 12 }, 10);
    expect(onGate).not.toHaveBeenCalled();
  });
});
