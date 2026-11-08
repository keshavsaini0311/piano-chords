import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/player', () => ({
  player: { load: vi.fn().mockResolvedValue(undefined), setRate: vi.fn(), setVolume: vi.fn(), onEnded: vi.fn(), pause: vi.fn(), play: vi.fn(), seek: vi.fn(), currentTime: vi.fn(() => 42) },
}));
vi.mock('../services/clock', () => ({ startClock: vi.fn(() => vi.fn()), holdClock: vi.fn() }));

import { player } from '../services/player';
import { api } from '../services/api';
import { holdClock, startClock } from '../services/clock';
import { loopSection, switchMix, togglePlay } from '../features/player/PlayerBar';
import { usePlaybackStore } from './playbackStore';
import { openStudio } from './studioSession';
import { useSongStore } from './songStore';
import { useViewStore } from './viewStore';

describe('openStudio', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does nothing when closed before the song finishes loading', async () => {
    let resolve!: (song: never) => void;
    vi.spyOn(api, 'getSong').mockReturnValue(new Promise((r) => (resolve = r)));
    useSongStore.setState({ song: null });
    const close = openStudio('abcdefghijk', () => {});
    close();
    resolve({ id: 'abcdefghijk', chords: [], lyrics: [], beats: [], anchors: {} } as never);
    await new Promise((r) => setTimeout(r, 0));
    expect(useSongStore.getState().song).toBeNull();
    expect(startClock).not.toHaveBeenCalled();
  });
});

describe('togglePlay', () => {
  it('while waiting stops', () => {
    usePlaybackStore.setState({ playing: true, waiting: true });
    togglePlay();
    expect(usePlaybackStore.getState()).toMatchObject({ playing: false, waiting: false });
  });
});

describe('loopSection', () => {
  it('toggles', () => {
    const section = { id: 's', label: 'Verse', start: 10, end: 20 };
    usePlaybackStore.setState({ loop: null });
    loopSection(section);
    expect(usePlaybackStore.getState().loop).toEqual({ start: 10, end: 20 });
    expect(player.seek).toHaveBeenCalledWith(10);
    loopSection(section);
    expect(usePlaybackStore.getState().loop).toBeNull();
  });
});

describe('mixes', () => {
  afterEach(() => vi.restoreAllMocks());
  const open = async (mixes?: string[]) => {
    vi.spyOn(api, 'getSong').mockResolvedValue({ id: 'abcdefghijk', chords: [], lyrics: [], beats: [], anchors: {}, mixes } as never);
    vi.mocked(player.load).mockClear();
    const close = openStudio('abcdefghijk', () => {});
    await new Promise((r) => setTimeout(r, 0));
    close();
  };

  it('opens with the saved mix when the song has it', async () => {
    useViewStore.setState({ perSong: { abcdefghijk: { semitones: 0, mix: 'backing' } } });
    await open(['backing', 'novocals', 'vocals']);
    expect(player.load).toHaveBeenCalledWith('/api/songs/abcdefghijk/mix/backing');
  });

  it('falls back to the full song when the saved mix is missing', async () => {
    useViewStore.setState({ perSong: { abcdefghijk: { semitones: 0, mix: 'backing' } } });
    await open();
    expect(player.load).toHaveBeenCalledWith(api.audioUrl('abcdefghijk'));
  });

  it('switchMix keeps position and rate', async () => {
    usePlaybackStore.setState({ playing: true, rate: 0.75 });
    await switchMix('abcdefghijk', 'vocals');
    expect(player.load).toHaveBeenLastCalledWith('/api/songs/abcdefghijk/mix/vocals');
    expect(player.setRate).toHaveBeenLastCalledWith(0.75);
    expect(player.seek).toHaveBeenLastCalledWith(42);
    expect(player.play).toHaveBeenCalled();
    expect(useViewStore.getState().perSong.abcdefghijk.mix).toBe('vocals');
  });

  describe('switchMix edge cases', () => {
    const id = 'abcdefghijk';
    afterEach(() => {
      usePlaybackStore.setState({ playing: false, waiting: false, rate: 1 });
      useViewStore.setState({ perSong: {} });
      vi.mocked(player.load).mockReset().mockResolvedValue(undefined);
      vi.mocked(player.play).mockClear();
    });

    it('ignores a second switch while the first is loading', async () => {
      let done!: () => void;
      vi.mocked(player.load).mockClear().mockReturnValueOnce(new Promise<void>((r) => (done = r)));
      const first = switchMix(id, 'backing');
      await switchMix(id, 'backing');
      expect(player.load).toHaveBeenCalledTimes(1);
      done();
      await first;
    });

    it('does not resume when paused during the load', async () => {
      usePlaybackStore.setState({ playing: true });
      vi.mocked(player.play).mockClear();
      let done!: () => void;
      vi.mocked(player.load).mockReturnValueOnce(new Promise<void>((r) => (done = r)));
      const p = switchMix(id, 'vocals');
      usePlaybackStore.setState({ playing: false });
      done();
      await p;
      expect(player.play).not.toHaveBeenCalled();
    });

    it('is ignored while waiting at a gate', async () => {
      usePlaybackStore.setState({ playing: true, waiting: true });
      vi.mocked(player.load).mockClear();
      await switchMix(id, 'vocals');
      expect(player.load).not.toHaveBeenCalled();
    });

    it('does not play when waiting began during the load', async () => {
      usePlaybackStore.setState({ playing: true });
      let done!: () => void;
      vi.mocked(player.load).mockReturnValueOnce(new Promise<void>((r) => (done = r)));
      const p = switchMix(id, 'vocals');
      usePlaybackStore.setState({ waiting: true });
      done();
      await p;
      expect(player.play).not.toHaveBeenCalled();
    });

    it('holds the clock while the source swaps, so it never publishes the new source at 0', async () => {
      vi.mocked(holdClock).mockClear();
      let done!: () => void;
      vi.mocked(player.load).mockReturnValueOnce(new Promise<void>((r) => (done = r)));
      const p = switchMix(id, 'vocals');
      expect(holdClock).toHaveBeenLastCalledWith(true);
      done();
      await p;
      expect(holdClock).toHaveBeenLastCalledWith(false);
    });

    it('goes back to the previous mix when the load fails', async () => {
      useViewStore.setState({ perSong: { [id]: { semitones: 0, mix: 'backing' } } });
      vi.mocked(player.load).mockClear().mockRejectedValueOnce(new Error('boom'));
      await switchMix(id, 'vocals');
      expect(player.load).toHaveBeenLastCalledWith('/api/songs/abcdefghijk/mix/backing');
      expect(useViewStore.getState().perSong[id].mix).toBe('backing');
    });
  });
});
