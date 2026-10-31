import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type Job } from './api';
import { pollJob } from './jobPolling';

const job = (state: Job['state']): Job => ({ id: 'j', song_id: 'abcdefghijk', state, stage: null, error: null });

describe('pollJob', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reports updates and stops once the job finishes', async () => {
    vi.useFakeTimers();
    const get = vi.spyOn(api, 'getJob').mockResolvedValueOnce(job('running')).mockResolvedValueOnce(job('done'));
    const updates: string[] = [];
    pollJob('j', (j) => updates.push(j.state), () => {}, 1000);
    await vi.advanceTimersByTimeAsync(3500);
    expect(updates).toEqual(['running', 'done']);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('stops and reports the error when the server stops answering', async () => {
    vi.useFakeTimers();
    const get = vi.spyOn(api, 'getJob').mockRejectedValue(new Error('Job not found'));
    const errors: string[] = [];
    pollJob('j', () => {}, (message) => errors.push(message), 1000);
    await vi.advanceTimersByTimeAsync(3500);
    expect(errors).toEqual(['Job not found']);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
