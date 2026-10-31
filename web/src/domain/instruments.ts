// Instrument registry: the map lookup is the factory. A new instrument is one new entry here
// plus its diagram in features/instrument/diagrams.ts (the UI half, kept out of the domain).
import type { KeyRange, VoicingId } from './voicing';

export type InstrumentId = 'piano';
export type InstrumentSpec = { id: InstrumentId; label: string; defaultRange: KeyRange; voicingIds: VoicingId[] };

export const instruments: Record<InstrumentId, InstrumentSpec> = {
  // ponytail: F3–C6 is a guess at the Casio SA-51's 32 keys; calibrate in the profile.
  piano: { id: 'piano', label: 'Piano / keyboard', defaultRange: { low: 53, high: 84 }, voicingIds: ['nearest', 'root'] },
};

export const getInstrument = (id: InstrumentId): InstrumentSpec => instruments[id];
