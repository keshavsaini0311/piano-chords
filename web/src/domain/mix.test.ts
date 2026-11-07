import { expect, it } from 'vitest';
import { nextMix } from './mix';

it('nextMix cycles and skips what is missing', () => {
  expect(nextMix('full', ['full', 'backing', 'novocals', 'vocals'])).toBe('backing');
  expect(nextMix('backing', ['full', 'backing'])).toBe('full');
  expect(nextMix('full', ['full', 'vocals'])).toBe('vocals');
});
