import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/player', () => ({
  player: { load: vi.fn().mockResolvedValue(undefined), setRate: vi.fn(), setVolume: vi.fn(), onEnded: vi.fn(), pause: vi.fn(), play: vi.fn(), seek: vi.fn() },
}));
vi.mock('../services/clock', () => ({ startClock: vi.fn(() => vi.fn()) }));

import { player } from '../services/player';
import { api } from '../services/api';
import { startClock } from '../services/clock';
import { loopSection, togglePlay } from '../features/player/PlayerBar';
import { usePlaybackStore } from './playbackStore';
import { openStudio } from './studioSession';
import { useSongStore } from './songStore';

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
