// Polls an import job until it finishes. Each request waits for the previous one, and any error
// (server restarted, job gone) stops polling and is reported instead of freezing the screen.
import { api, type Job } from './api';

export function pollJob(jobId: string, onUpdate: (job: Job) => void, onFail: (message: string) => void, intervalMs = 1000): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    try {
      const job = await api.getJob(jobId);
      if (stopped) return;
      onUpdate(job);
      if (job.state === 'queued' || job.state === 'running') timer = setTimeout(tick, intervalMs);
    } catch (e) {
      if (!stopped) onFail((e as Error).message);
    }
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
