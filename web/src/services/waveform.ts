// Waveform peaks decoded in the browser, so the server API stays unchanged.
import { computePeaks } from '../domain/timing';

export async function loadPeaks(url: string, buckets: number): Promise<number[]> {
  const data = await (await fetch(url)).arrayBuffer();
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(data);
    return computePeaks(decoded.getChannelData(0), buckets);
  } finally {
    void context.close();
  }
}
