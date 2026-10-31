import pytest

from app.labels import normalize_label


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("C:maj", "C"),
        ("C:min", "Cm"),
        ("A:maj7", "Amaj7"),
        ("G:7", "G7"),
        ("D:min7", "Dm7"),
        ("E:sus4", "Esus4"),
        ("B:dim", "Bdim"),
        ("Bb:hdim7", "Bbm7b5"),
        ("C:maj/3", "C/E"),
        ("A:min/b3", "Am/C"),
        ("F#:min", "F#m"),
        ("N", "N.C."),
        ("X", "N.C."),
        ("C", "C"),
    ],
)
def test_normalize_label(raw, expected):
    assert normalize_label(raw) == expected
