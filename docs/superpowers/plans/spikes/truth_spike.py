"""Ground-truth check for the aligner: macOS `say` speaks each word separately at known times, mixed over
instrumental stems, LRC line starts jittered by +-0.4 s. Result 7 Nov 2026: median word-start error 69 ms,
96% within 150 ms. Becomes server/eval/align_synthetic.py in plan 5.
Run: python truth_spike.py <dir with other.m4a drums.m4a bass.m4a>"""
import subprocess, os, statistics, random, sys
import numpy as np, imageio_ffmpeg, onnxruntime, soundfile as sf
import ctc_forced_aligner as cfa
ff = imageio_ffmpeg.get_ffmpeg_exe(); SR = 16000
def load(path):
    raw = subprocess.run([ff, "-loglevel", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()
lines = ["every morning I walk down to the river", "the light is soft and the water is cold",
         "she said we could dance until the night was gone", "hold on to the moment before it fades away",
         "I keep a little song inside my pocket", "count the stars and sing them back to me"]
random.seed(1)
track, truth, t = [np.zeros(SR)], [], 1.0
for line in lines:
    words = []
    for w in line.split():
        subprocess.run(["say", "-r", "170", "-o", "w.aiff", w], check=True)
        a = load("w.aiff"); nz = np.nonzero(np.abs(a) > 0.01)[0]; a = a[nz[0]:nz[-1]]
        words.append((w, t)); track.append(a); t += len(a) / SR
        gap = random.uniform(0.05, 0.35); track.append(np.zeros(int(gap * SR))); t += gap
    truth.append((line, words, words[0][1], t)); track.append(np.zeros(int(1.5 * SR))); t += 1.5
voice = np.concatenate(track)
inst = sum(load(f"{sys.argv[1]}/{n}.m4a") for n in ["other", "drums", "bass"])[: len(voice)]
inst = np.pad(inst, (0, len(voice) - len(inst)))
model = os.path.expanduser("~/.cache/piano-chords/ctc-aligner.onnx")
session, tok = onnxruntime.InferenceSession(model), cfa.Tokenizer()
for label, mix in [("voice only", voice), ("voice + music at -6 dB", voice + 0.5 * inst / (np.abs(inst).max() + 1e-9) * np.abs(voice).max())]:
    em, stride = cfa.generate_emissions(session, mix.astype(np.float32), batch_size=4); fps = 1000 / stride
    errs = []
    for line, words, start, end in truth:
        lrc = start + random.uniform(-0.4, 0.4)           # LRC line times are only roughly right
        a, b = max(0, lrc - 1.0), end + 1.0
        toks, starred = cfa.preprocess_text(line, romanize=True, language="eng")
        segs, sc, blank = cfa.get_alignments(em[int(a*fps):int(b*fps)], toks, tok)
        got = cfa.postprocess_results(starred, cfa.get_spans(toks, segs, blank), stride, sc)
        errs += [abs(a + g["start"] - w[1]) for g, w in zip(got, words)]
    print(f"{label:24} word start error: median {statistics.median(errs)*1000:.0f} ms, 90th pct {statistics.quantiles(errs, n=10)[8]*1000:.0f} ms, within 150 ms {sum(e<=.15 for e in errs)/len(errs):.0%} ({len(errs)} words)")
