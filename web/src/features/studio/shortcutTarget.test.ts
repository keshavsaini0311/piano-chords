import { describe, expect, it } from 'vitest';
import { isTypingTarget } from './shortcutTarget';

describe('isTypingTarget', () => {
  it('ignores shortcuts while typing, but not on sliders or buttons', () => {
    expect(isTypingTarget('INPUT', 'text', false)).toBe(true);
    expect(isTypingTarget('TEXTAREA', null, false)).toBe(true);
    expect(isTypingTarget('DIV', null, true)).toBe(true);
    expect(isTypingTarget('INPUT', 'range', false)).toBe(false);
    expect(isTypingTarget('INPUT', 'checkbox', false)).toBe(false);
    expect(isTypingTarget('BUTTON', null, false)).toBe(false);
  });
});
