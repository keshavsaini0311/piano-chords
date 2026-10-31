// Display-only: chord symbols with real music accidentals (D♭, F♯m7), the way a lead sheet prints them.
export function withAccidentalGlyphs(label: string): string {
  return label.replace(/#/g, '♯').replace(/(?<=[A-G])b|b(?=\d)/g, '♭');
}
