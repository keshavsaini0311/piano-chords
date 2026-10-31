// The heartbeat: one requestAnimationFrame loop reads the player and publishes the time.
// Looping lives here, not in a button component.
import { loopSeekTarget, type Loop } from '../domain/timing';
import type { Player } from './player';

export function startClock(player: Player, onTick: (time: number) => void, getLoop: () => Loop | null): () => void {
  let frame = 0;
  const tick = () => {
    const time = player.currentTime();
    const jump = loopSeekTarget(time, getLoop());
    if (jump !== null) player.seek(jump);
    onTick(jump ?? time);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
