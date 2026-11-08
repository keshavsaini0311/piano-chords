"""Word-level lyric timing: Meta's MMS forced aligner (ONNX) runs once over the song, then each LRCLIB line is
aligned inside its own window. A line keeps its `words` only if the result passes a confidence gate."""
import statistics
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from app.pipeline import Deps

MODEL_PATH = Path.home() / ".cache/piano-chords/ctc-aligner.onnx"
WINDOW_SEC = 1.0
MIN_MEAN_LOGPROB = -2.5


class LyricAligner(Protocol):
    def align(self, audio: Path, lines: list[dict]) -> dict[str, list[dict]]:
        """{line_id: [{"index", "start", "end"}]} for the lines that were aligned with confidence."""
        ...


def language_of(text: str) -> str:
    return "hin" if any("ऀ" <= c <= "ॿ" for c in text) else "eng"


def kept_words(words: list[str], normalized: list[str]) -> list[int]:
    return [i for i, n in enumerate(normalized) if n.strip()]


def accept_line(line_start: float, line_end: float, words: list[dict], mean_logprob: float) -> bool:
    return bool(words) and -0.6 <= words[0]["start"] - line_start <= 0.8 and words[-1]["end"] <= line_end + WINDOW_SEC and mean_logprob >= MIN_MEAN_LOGPROB


class CtcAligner:
    def __init__(self, model_path: Path = MODEL_PATH):
        self.model_path = model_path

    def align(self, audio: Path, lines: list[dict]) -> dict[str, list[dict]]:
        import imageio_ffmpeg
        import numpy as np

        raw = subprocess.run(
            [imageio_ffmpeg.get_ffmpeg_exe(), "-loglevel", "error", "-i", str(audio), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
            capture_output=True, check=True,
        ).stdout
        emissions, stride, tokenizer = self.emit(np.frombuffer(raw, dtype=np.float32).copy())
        out: dict[str, list[dict]] = {}
        for line in lines:
            found = self.align_line(emissions, stride, tokenizer, line)
            if found and accept_line(line["start"], line["end"], found[0], found[1]):
                out[line["id"]] = found[0]
        return out

    def emit(self, wave):
        """16 kHz mono float32 samples -> (emissions, stride in ms, tokenizer)."""
        import ctc_forced_aligner as cfa  # heavy: only when a song is actually aligned
        import onnxruntime

        cfa.ensure_onnx_model(str(self.model_path), cfa.MODEL_URL)
        session, tokenizer = onnxruntime.InferenceSession(str(self.model_path)), cfa.Tokenizer()
        emissions, stride = cfa.generate_emissions(session, wave, batch_size=4)
        return emissions, stride, tokenizer

    def align_line(self, emissions, stride, tokenizer, line: dict):
        """(timed words, mean logprob) for one line inside its window, or None if it can't be aligned."""
        import ctc_forced_aligner as cfa

        fps = 1000 / stride
        words = line["text"].split()
        lang = language_of(line["text"])
        kept = kept_words(words, [cfa.text_normalize(w, lang) for w in words])
        if not kept:
            return None
        window = max(0.0, line["start"] - WINDOW_SEC)
        a, b = int(window * fps), min(len(emissions), int((line["end"] + WINDOW_SEC) * fps))
        try:
            tokens, starred = cfa.preprocess_text(" ".join(words[i] for i in kept), romanize=True, language=lang)
            segments, scores, blank = cfa.get_alignments(emissions[a:b], tokens, tokenizer)
            found = cfa.postprocess_results(starred, cfa.get_spans(tokens, segments, blank), stride, scores)
        except Exception:  # one unalignable line must not lose the rest of the song
            return None
        if len(found) != len(kept):
            return None
        timed = [{"index": kept[k], "start": round(window + w["start"], 3), "end": round(window + w["end"], 3)} for k, w in enumerate(found)]
        return timed, statistics.mean(w["score"] / max(1, (w["end"] - w["start"]) * fps) for w in found)


def align_song(song_id: str, deps: "Deps") -> None:
    store = deps.store
    song = store.read_song(song_id)  # raises FileNotFoundError for a deleted song
    lines = [l for l in song.get("lyrics", []) if l.get("text", "").strip()]
    if not lines:
        return
    vocals = store.song_dir(song_id) / "mix" / "vocals.m4a"
    audio = vocals if vocals.exists() else store.audio_path(song_id)
    if not audio:
        raise FileNotFoundError(f"no audio for {song_id}")
    found = deps.aligner.align(audio, lines)
    aligned = {l["id"]: l["text"] for l in lines}

    def change(current: dict) -> dict:
        def update(line: dict) -> dict:
            if aligned.get(line.get("id")) != line.get("text"):
                return line  # edited while aligning: its result is stale
            rest = {k: v for k, v in line.items() if k != "words"}
            return {**rest, "words": found[line["id"]]} if line["id"] in found else rest

        return {**current, "lyrics": [update(l) for l in current.get("lyrics", [])]}

    store.update_song(song_id, change)
