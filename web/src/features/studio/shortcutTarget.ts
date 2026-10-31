const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'button', 'submit']);

/** True when a key press should go to a text field instead of a studio shortcut. Sliders don't count,
 *  so Space still plays after you drag the scrubber. */
export function isTypingTarget(tagName: string, type: string | null, isContentEditable: boolean): boolean {
  if (isContentEditable || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  return tagName === 'INPUT' && !NON_TEXT_INPUTS.has(type ?? 'text');
}
