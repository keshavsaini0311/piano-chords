"""Proven 7 Nov 2026 on an M-series Mac: Demucs htdemucs splits a 3:55 song in 22 s on MPS (74 s CPU);
stems sum back to the mix within 2.8% RMS; ~3.8 MB per stem as AAC 128k. Reference for plan 4.
Run: python stems_spike.py <audio> <out_dir> [mps|cpu]  (needs demucs==4.1.0, soundfile, imageio-ffmpeg)"""
import sys, time, subprocess, io
from pathlib import Path
import numpy as np, soundfile as sf, torch, imageio_ffmpeg
from demucs.api import Separator
src, out = Path(sys.argv[1]), Path(sys.argv[2]); out.mkdir(exist_ok=True)
ff = imageio_ffmpeg.get_ffmpeg_exe()
wav = out / "mix44.wav"
subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(src), "-ac", "2", "-ar", "44100", str(wav)], check=True)
data, sr = sf.read(wav, dtype="float32", always_2d=True)
device = sys.argv[3] if len(sys.argv) > 3 else "cpu"
t = time.time(); sep = Separator(model="htdemucs", device=device); print("load", round(time.time()-t,1), "s", "sr", sep.samplerate)
t = time.time(); _, stems = sep.separate_tensor(torch.from_numpy(data.T.copy()), sr); el = time.time()-t
print(f"separate on {device}: {el:.1f}s for {len(data)/sr:.0f}s of audio; stems {list(stems)}")
for name, tensor in stems.items():
    p = out / f"{name}.m4a"
    proc = subprocess.run([ff, "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(sr), "-ac", "2", "-i", "-", "-c:a", "aac", "-b:a", "128k", str(p)], input=tensor.T.contiguous().numpy().astype("float32").tobytes(), check=True)
    print(name, p.stat().st_size // 1024, "KB")
recon = sum(stems.values()).T.numpy(); n = min(len(recon), len(data))
print("reconstruction error (rms ratio):", round(float(np.sqrt(((recon[:n]-data[:n])**2).mean()) / np.sqrt((data[:n]**2).mean())), 4))
