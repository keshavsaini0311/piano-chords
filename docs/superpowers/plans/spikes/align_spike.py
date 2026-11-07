"""Proven 7 Nov 2026: ctc-forced-aligner 1.0.2 (MMS ONNX). Emissions ONCE per song (~42 s for 4 min on CPU),
then each LRC line aligned inside its [start-1s, end+1s] slice of the emissions (0.1 s total). English and
Devanagari (romanised by unidecode) both align every line. Reference for plan 5.
Run: python align_spike.py <song.json> <audio> <eng|hin>"""
import sys, json, time, os, statistics, subprocess
import numpy as np, imageio_ffmpeg, onnxruntime
import ctc_forced_aligner as cfa
song = json.load(open(sys.argv[1])); audio = sys.argv[2]; lang = sys.argv[3]
ff = imageio_ffmpeg.get_ffmpeg_exe()
raw = subprocess.run([ff, "-loglevel", "error", "-i", audio, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
wave = np.frombuffer(raw, dtype=np.float32).copy()
model = os.path.expanduser("~/.cache/piano-chords/ctc-aligner.onnx")
session, tok = onnxruntime.InferenceSession(model), cfa.Tokenizer()
t0 = time.time(); em, stride = cfa.generate_emissions(session, wave, batch_size=4); t_em = time.time() - t0
fps = 1000 / stride
lines = [l for l in song["lyrics"] if l["text"].strip()]
signed, conf, t1 = [], [], time.time()
for l in lines:
    a, b = max(0, l["start"] - 1.0), l["end"] + 1.0
    fa, fb = int(a * fps), min(len(em), int(b * fps))
    toks, starred = cfa.preprocess_text(l["text"], romanize=True, language=lang)
    try:
        segs, sc, blank = cfa.get_alignments(em[fa:fb], toks, tok)
        words = cfa.postprocess_results(starred, cfa.get_spans(toks, segs, blank), stride, sc)
    except Exception as e:
        print("fail:", type(e).__name__, str(e)[:60]); continue
    if words:
        signed.append(a + words[0]["start"] - l["start"])
        conf.append(statistics.mean(w["score"] / max(1, (w["end"] - w["start"]) * fps) for w in words))
q = statistics.quantiles(signed, n=4)
print(f"emissions {t_em:.1f}s + align {time.time()-t1:.1f}s | {len(signed)}/{len(lines)} lines | first word - LRC start: "
      f"median {statistics.median(signed):+.2f}s, IQR {q[0]:+.2f}..{q[2]:+.2f} | mean per-frame logprob {statistics.mean(conf):.2f}")
