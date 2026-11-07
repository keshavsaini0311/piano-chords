import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdClock, startClock } from './clock';
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
  return { onTick, onGate, seek: (player as unknown as { seek: ReturnType<typeof vi.fn> }).seek };
}

describe('startClock gate', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stops at the gate', () => {
    const { onTick, onGate } = run([9.98, 10.02], null, 10);
    expect(onGate).toHaveBeenCalledWith(10);
    expect(onTick).toHaveBeenLastCalledWith(10);
  });

  it('a loop restart jump does not trip the gate, but the gate inside the loop still stops the next pass', () => {
    const { onGate, seek } = run([11.99, 12.01, 4.02], { start: 4, end: 12 }, 4.01);
    expect(seek).toHaveBeenCalledWith(4);
    // the jump frame (12.01) never called onGate; the 4.02 frame steps 4 -> 4.02 across the gate, so it stops there, once
    expect(onGate).toHaveBeenCalledTimes(1);
    expect(onGate).toHaveBeenCalledWith(4.01);
  });

  it('a gate exactly at the loop start is waited on after the jump', () => {
    const { onGate, seek } = run([11.99, 12.01, 4.02], { start: 4, end: 12 }, 4);
    expect(seek).toHaveBeenCalledWith(4);
    expect(onGate).toHaveBeenCalledTimes(1);
    expect(onGate).toHaveBeenCalledWith(4);
  });

  it('a later frame at the gate time does not stop again', () => {
    const { onGate } = run([9.98, 10.02, 10, 10], null, 10);
    expect(onGate).toHaveBeenCalledTimes(1);
  });

  it('publishes nothing while held, then carries on', () => {
    holdClock(true);
    const held = run([0, 0.01], null, null);
    holdClock(false);
    expect(held.onTick).not.toHaveBeenCalled();
    expect(run([42], null, null).onTick).toHaveBeenCalledWith(42);
  });
});
