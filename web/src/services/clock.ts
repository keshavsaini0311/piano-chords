// The heartbeat: one requestAnimationFrame loop reads the player and publishes the time.
// Looping lives here, not in a button component.
import { gateStop, loopSeekTarget, type Loop } from '../domain/timing';
import type { Player } from './player';

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
    const time = player.currentTime();
    const stopAt = gateStop(prev, time, getGate());
    prev = time;
    if (stopAt !== null) {
      onGate(stopAt);
      onTick(stopAt);
      frame = requestAnimationFrame(tick);
      return;
    }
    const jump = loopSeekTarget(time, getLoop());
    if (jump !== null) player.seek(jump);
    onTick(jump ?? time);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
