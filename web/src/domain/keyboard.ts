// Where each key sits on a drawn keyboard, as fractions of its width. The falling-notes lanes and the keys
// under them both come from this, so they always line up.
import { isBlackKey, type KeyRange } from './voicing';

export type KeyBox = { x: number; w: number; black: boolean };

const BLACK_WIDTH = 0.6; // of a white key, the same proportion as ui/Keyboard's CSS

export function keyLayout(range: KeyRange): Map<number, KeyBox> {
  const whites = [];
  for (let m = range.low; m <= range.high; m++) if (!isBlackKey(m)) whites.push(m);
  const white = 1 / whites.length;
  const keys = new Map<number, KeyBox>();
  let before = 0;
  for (let m = range.low; m <= range.high; m++) {
    if (isBlackKey(m)) keys.set(m, { x: before * white - (BLACK_WIDTH * white) / 2, w: BLACK_WIDTH * white, black: true });
    else keys.set(m, { x: before++ * white, w: white, black: false });
  }
  return keys;
}
