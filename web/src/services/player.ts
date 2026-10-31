// Adapter over the audio API. The rest of the app speaks Player, so a YouTube player later is a
// second implementation, not a rewrite.
export interface Player {
  load(src: string): Promise<void>;
  play(): void;
  pause(): void;
  seek(time: number): void;
  currentTime(): number;
  duration(): number;
  setRate(rate: number): void;
  onEnded(callback: () => void): void;
}

export function createAudioPlayer(): Player {
  const audio = new Audio();
  audio.preservesPitch = true; // slowing down must not change the key
  return {
    load: (src) =>
      new Promise((resolve, reject) => {
        audio.onloadedmetadata = () => resolve();
        audio.onerror = () => reject(new Error('Could not load the audio'));
        audio.src = src;
      }),
    play: () => void audio.play(),
    pause: () => audio.pause(),
    seek: (time) => (audio.currentTime = Math.max(0, time)),
    currentTime: () => audio.currentTime,
    duration: () => audio.duration || 0,
    setRate: (rate) => (audio.playbackRate = rate),
    onEnded: (callback) => (audio.onended = callback),
  };
}

// ponytail: one song plays at a time, so one shared player.
export const player: Player = typeof Audio === 'undefined' ? (null as unknown as Player) : createAudioPlayer();
