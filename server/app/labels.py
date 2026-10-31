"""Anti-corruption layer: chord models speak Harte/MIREX ("C:min", "A:maj7/3", "N").
The browser only ever sees the app's labels ("Cm", "Amaj7/C#", "N.C.")."""

SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
LETTER = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

QUALITY = {
    "maj": "", "min": "m", "7": "7", "maj7": "maj7", "min7": "m7", "dim": "dim", "dim7": "dim7",
    "aug": "aug", "sus2": "sus2", "sus4": "sus4", "hdim7": "m7b5", "maj6": "6", "min6": "m6",
    "9": "9", "maj9": "maj9", "min9": "m9", "minmaj7": "mM7", "5": "5", "1": "",
}
# Harte bass degrees -> semitones above the root.
DEGREE = {"2": 2, "b3": 3, "3": 4, "4": 5, "b5": 6, "5": 7, "b6": 8, "6": 9, "b7": 10, "7": 11, "9": 2}
NO_CHORD = {"N", "X", ""}


def _pitch(note: str) -> int:
    shift = {"#": 1, "b": -1}.get(note[1:2], 0)
    return (LETTER[note[0]] + shift) % 12


def normalize_label(raw: str) -> str:
    raw = raw.strip()
    if raw in NO_CHORD:
        return "N.C."
    body, _, bass = raw.partition("/")
    root, _, quality = body.partition(":")
    names = FLATS if "b" in root[1:] else SHARPS
    label = root + QUALITY.get(quality, quality)
    if bass in DEGREE:
        label += "/" + names[(_pitch(root) + DEGREE[bass]) % 12]
    return label
