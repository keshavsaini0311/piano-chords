"""Ground-truth check for the aligner: macOS `say` speaks each word separately at known times (optionally mixed
over instrumental stems), LRC line starts jittered by +-0.4 s. Measured 7 Nov 2026: median 69 ms, 96% within 150 ms.
Run: PYTHONPATH=. uv run python eval/align_synthetic.py [dir with other.m4a drums.m4a bass.m4a]"""
import random
import shutil
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path

import imageio_ffmpeg
import numpy as np

from app.align import CtcAligner

SR = 16000
LINES = ["every morning I walk down to the river", "the light is soft and the water is cold",
         "she said we could dance until the night was gone", "hold on to the moment before it fades away",
         "I keep a little song inside my pocket", "count the stars and sing them back to me"]


def load(path) -> np.ndarray:
    raw = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def main() -> None:
    if not shutil.which("say"):
        sys.exit("needs macOS `say` to speak the test words; not found")
    random.seed(1)
    tmp = Path(tempfile.mkdtemp()) / "w.aiff"
    track, truth, t = [np.zeros(SR)], [], 1.0
    for line in LINES:
        words = []
        for w in line.split():
            subprocess.run(["say", "-r", "170", "-o", str(tmp), w], check=True)
            a = load(tmp)
            nz = np.nonzero(np.abs(a) > 0.01)[0]
            a = a[nz[0]:nz[-1]]
            words.append(t)
            track.append(a)
            t += len(a) / SR
            gap = random.uniform(0.05, 0.35)
            track.append(np.zeros(int(gap * SR)))
            t += gap
        truth.append((line, words, words[0], t))
        track.append(np.zeros(int(1.5 * SR)))
        t += 1.5
    voice = np.concatenate(track)
    mixes = [("voice only", voice)]
    if len(sys.argv) > 1:
        inst = sum(load(f"{sys.argv[1]}/{n}.m4a") for n in ["other", "drums", "bass"])[: len(voice)]
        inst = np.pad(inst, (0, len(voice) - len(inst)))
        mixes.append(("voice + music at -6 dB", voice + 0.5 * inst / (np.abs(inst).max() + 1e-9) * np.abs(voice).max()))
    aligner, ok = CtcAligner(), True
    for label, mix in mixes:
        emissions, stride, tokenizer = aligner.emit(mix.astype(np.float32))
        errs = []
        for text, starts, start, end in truth:
            lrc = start + random.uniform(-0.4, 0.4)  # LRC line times are only roughly right
            got = aligner.align_line(emissions, stride, tokenizer, {"text": text, "start": lrc, "end": end})
            if got:
                errs += [abs(g["start"] - s) for g, s in zip(got[0], starts)]
        med, within = statistics.median(errs), sum(e <= 0.15 for e in errs) / len(errs)
        ok &= med <= 0.12 and within >= 0.9 and len(errs) == sum(len(l.split()) for l in LINES)
        print(f"{label:24} word start error: median {med*1000:.0f} ms, 90th pct {statistics.quantiles(errs, n=10)[8]*1000:.0f} ms, within 150 ms {within:.0%} ({len(errs)} words)")
    print("PASS" if ok else "FAIL: need median <= 120 ms and >= 90% within 150 ms")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
