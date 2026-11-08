// The heartbeat: one requestAnimationFrame loop reads the player and publishes the time.
// Looping lives here, not in a button component.
import { gateStop, loopSeekTarget, type Loop } from '../domain/timing';
import type { Player } from './player';

let held = false;
/** While a mix swap loads, the new source reads ~0: hold the clock so nothing sees that as a seek. */
export function holdClock(on: boolean) {
  held = on;
}

export function startClock(
  player: Player,
  onTick: (time: number) => void,
  getLoop: () => Loop | null,
  getGate: () => number | null = () => null,
  onGate: (at: number) => void = () => {},
): () => void {
  let frame = 0;
  let prev = -Infinity; // the first frame never gates
  const tick = () => {
    if (held) {
      frame = requestAnimationFrame(tick);
      return;
    }
    const time = player.currentTime();
    const stopAt = gateStop(prev, time, getGate());
    if (stopAt !== null) {
      prev = time;
      onGate(stopAt);
      onTick(stopAt);
      frame = requestAnimationFrame(tick);
      return;
    }
    const jump = loopSeekTarget(time, getLoop());
    if (jump !== null) player.seek(jump);
    prev = jump !== null ? jump - 0.001 : time; // after a loop jump the next step starts just before the loop start, so a gate there still trips
    onTick(jump ?? time);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
