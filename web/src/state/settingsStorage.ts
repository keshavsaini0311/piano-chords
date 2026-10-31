// View settings are saved in the server's data folder (settings.json) next to the songs, so copying
// that one folder moves everything to a new laptop. Shape matches zustand's StateStorage.
import { api } from '../services/api';

export function serverSettingsStorage() {
  const lastWritten = new Map<string, string>();
  return {
    async getItem(name: string): Promise<string | null> {
      try {
        const saved = await api.getSetting(name);
        if (saved !== null) return saved;
      } catch {
        return null; // server down: start from defaults
      }
      let old: string | null = null;
      try {
        old = localStorage.getItem(name); // one-time pickup of settings saved before this moved to the server
      } catch {
        return null;
      }
      if (old !== null) {
        lastWritten.set(name, old);
        void api.saveSetting(name, old).catch(() => lastWritten.delete(name));
      }
      return old;
    },
    async setItem(name: string, value: string): Promise<void> {
      if (lastWritten.get(name) === value) return; // UI-only changes (selection, mode) don't touch the file
      lastWritten.set(name, value);
      await api.saveSetting(name, value).catch(() => lastWritten.delete(name));
    },
    async removeItem(): Promise<void> {},
  };
}
