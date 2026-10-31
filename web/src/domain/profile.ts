// Settings that belong to the player, not the song. More profiles later = a list of these.
import { getInstrument, type InstrumentId } from './instruments';
import type { Difficulty } from './music';
import type { KeyRange, VoicingId } from './voicing';

export type Profile = {
  id: string;
  name: string;
  instrumentId: InstrumentId;
  keyRange: KeyRange;
  difficulty: Difficulty;
  voicing: VoicingId;
  showNoteNames: boolean;
};

export const defaultProfile: Profile = {
  id: 'default',
  name: 'Me',
  instrumentId: 'piano',
  keyRange: getInstrument('piano').defaultRange,
  difficulty: 'easy',
  voicing: 'nearest',
  showNoteNames: true,
};
