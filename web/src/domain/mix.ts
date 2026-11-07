// Which version of the audio is playing: the full song or one of the server's stem mixes.
export type MixId = 'full' | 'backing' | 'novocals' | 'vocals';

export const MIX_LABEL: Record<MixId, string> = {
  full: 'Full song',
  backing: 'Backing track',
  novocals: 'No vocals',
  vocals: 'Vocals only',
};

const ORDER: MixId[] = ['full', 'backing', 'novocals', 'vocals'];

/** The next mix in the cycle that the song has. `full` is always available. */
export function nextMix(current: MixId, available: MixId[]): MixId {
  for (let i = 1; i <= ORDER.length; i++) {
    const m = ORDER[(ORDER.indexOf(current) + i) % ORDER.length];
    if (m === 'full' || available.includes(m)) return m;
  }
  return 'full';
}
