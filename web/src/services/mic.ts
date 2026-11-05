// Microphone → pitch-class energies. Echo cancellation is on: the browser subtracts what this page
// is playing, so the song through speakers isn't graded. Noise suppression and auto gain are off:
// they are tuned for speech and eat sustained piano tones.
import { chromaFromSpectrum, type Chroma } from '../domain/judge';

// You count as playing when the loudest note-range bin is GATE_DB over the room's floor (which
// drops to the quietest reading at once and creeps up slowly) and over MIN_DB. Measured on a
// MacBook mic: a quiet room sits at -72..-85 dB in this band.
// ponytail: calibration knobs. Raise MIN_DB if room noise gets graded, lower it if soft playing reads as silence.
const MIN_DB = -65;
const GATE_DB = 12;
const FLOOR_RISE_DB = 0.15; // per read (~3 dB/s at 20 reads/s)
const BAND_HZ = [75, 2100]; // where piano fundamentals live; rumble and hiss are outside
const METER_DB = [-90, -30]; // meter range

export type MicReading = { chroma: Chroma | null; level: number }; // level 0..1 for the meter
export type Mic = { read(): MicReading; close(): void };

export async function openMic(): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 8192; // 170 ms window: fast to react, semitones still apart down to about G2
  analyser.smoothingTimeConstant = 0.4;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const db = new Float32Array(analyser.frequencyBinCount);
  let floor = METER_DB[1];
  return {
    read() {
      analyser.getFloatFrequencyData(db);
      const binHz = ctx.sampleRate / analyser.fftSize;
      let loudest = -Infinity;
      for (let i = Math.ceil(BAND_HZ[0] / binHz); i <= BAND_HZ[1] / binHz; i++) loudest = Math.max(loudest, db[i]);
      if (loudest > -95) floor = Math.min(loudest, floor + FLOOR_RISE_DB); // ignore the analyser warming up from silence
      const level = Math.min(1, Math.max(0, (loudest - METER_DB[0]) / (METER_DB[1] - METER_DB[0])));
      const playing = loudest > Math.max(floor + GATE_DB, MIN_DB);
      return { chroma: playing ? chromaFromSpectrum(db, binHz) : null, level };
    },
    close() {
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
