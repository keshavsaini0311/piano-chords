import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services/api';
import { serverSettingsStorage } from './settingsStorage';

describe('serverSettingsStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reads settings from the data folder on the server', async () => {
    vi.spyOn(api, 'getSetting').mockResolvedValue('{"a":1}');
    expect(await serverSettingsStorage().getItem('view')).toBe('{"a":1}');
  });

  it('falls back once to what this browser saved before, and copies it to the server', async () => {
    vi.spyOn(api, 'getSetting').mockResolvedValue(null);
    const save = vi.spyOn(api, 'saveSetting').mockResolvedValue(undefined);
    vi.stubGlobal('localStorage', { getItem: () => '{"old":true}' });
    expect(await serverSettingsStorage().getItem('view')).toBe('{"old":true}');
    expect(save).toHaveBeenCalledWith('view', '{"old":true}');
  });

  it('writes only when the value changed', async () => {
    vi.spyOn(api, 'getSetting').mockResolvedValue('w');
    const save = vi.spyOn(api, 'saveSetting').mockResolvedValue(undefined);
    const storage = serverSettingsStorage();
    await storage.getItem('view');
    await storage.setItem('view', 'x');
    await storage.setItem('view', 'x');
    await storage.setItem('view', 'y');
    expect(save.mock.calls).toEqual([['view', 'x'], ['view', 'y']]);
  });

  it('never saves before the saved value has loaded, so defaults cannot overwrite it', async () => {
    let resolve: (v: string) => void = () => {};
    vi.spyOn(api, 'getSetting').mockReturnValue(new Promise((r) => (resolve = r)));
    const save = vi.spyOn(api, 'saveSetting').mockResolvedValue(undefined);
    const storage = serverSettingsStorage();
    const loading = storage.getItem('view');
    await storage.setItem('view', '{"defaults":true}'); // a store change while the load is in flight
    resolve('{"mine":true}');
    expect(await loading).toBe('{"mine":true}');
    expect(save).not.toHaveBeenCalled();
    await storage.setItem('view', '{"mine":false}');
    expect(save).toHaveBeenCalledWith('view', '{"mine":false}');
  });

  it('keeps working with defaults when the server is down', async () => {
    vi.spyOn(api, 'getSetting').mockRejectedValue(new Error('down'));
    expect(await serverSettingsStorage().getItem('view')).toBeNull();
  });
});
