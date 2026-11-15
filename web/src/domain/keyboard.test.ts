import { describe, expect, it } from 'vitest';
import { keyLayout } from './keyboard';

describe('keyLayout', () => {
  it('splits the width between white keys and centres black keys on the gap', () => {
    const keys = keyLayout({ low: 60, high: 64 }); // C D E, with C# and D# between
    expect(keys.get(60)).toEqual({ x: 0, w: 1 / 3, black: false });
    expect(keys.get(64)).toEqual({ x: 2 / 3, w: 1 / 3, black: false });
    const cSharp = keys.get(61)!;
    expect(cSharp.black).toBe(true);
    expect(cSharp.x + cSharp.w / 2).toBeCloseTo(1 / 3); // sits on the C|D line
  });
});
