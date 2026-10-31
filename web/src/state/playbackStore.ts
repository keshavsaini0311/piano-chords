// Ephemeral playback state. `time` changes 60x/s: subscribe to derived values, not to `time`,
// unless you are the playhead or scrubber.
import { create } from 'zustand';
import type { Loop } from '../domain/timing';

type PlaybackState = {
  time: number;
  playing: boolean;
  rate: number;
  loop: Loop | null;
  setTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  setRate: (rate: number) => void;
  setLoop: (loop: Loop | null) => void;
};

export const usePlaybackStore = create<PlaybackState>((set) => ({
  time: 0,
  playing: false,
  rate: 1,
  loop: null,
  setTime: (time) => set({ time }),
  setPlaying: (playing) => set({ playing }),
  setRate: (rate) => set({ rate }),
  setLoop: (loop) => set({ loop }),
}));
