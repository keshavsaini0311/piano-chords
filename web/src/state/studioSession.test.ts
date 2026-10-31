import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/player', () => ({
  player: { load: vi.fn().mockResolvedValue(undefined), setRate: vi.fn(), setVolume: vi.fn(), onEnded: vi.fn(), pause: vi.fn() },
}));
vi.mock('../services/clock', () => ({ startClock: vi.fn(() => vi.fn()) }));

import { api } from '../services/api';
import { startClock } from '../services/clock';
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
