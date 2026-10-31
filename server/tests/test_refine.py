import numpy as np

from app.detect import Segment
from app.refine import chord_profile, refine_boundaries

FPS = 20  # frames per second in these fake note profiles


def profile_frames(label: str, seconds: float) -> np.ndarray:
    return np.repeat(chord_profile(label)[:, None], int(seconds * FPS), axis=1)


def test_chord_profile_marks_the_chord_notes():
    assert list(np.nonzero(chord_profile("Am"))[0]) == [0, 4, 9]
    assert list(np.nonzero(chord_profile("G7"))[0]) == [2, 5, 7, 11]
    assert not chord_profile("N.C.").any()


def test_a_late_change_moves_back_to_the_beat_where_the_sound_changes():
    # Em for 4s then G for 4s, but the detector reported the change one beat (0.6s) late.
    notes = np.hstack([profile_frames("Em", 4), profile_frames("G", 4)])
    times = np.arange(notes.shape[1]) / FPS
    beats = [round(b, 3) for b in np.arange(0.4, 8, 0.6)]  # ..., 3.4, 4.0, 4.6, ...
    segments = [Segment(0, 4.6, "Em"), Segment(4.6, 8, "G")]
    refined = refine_boundaries(segments, notes, times, beats)
    assert abs(refined[1].start - 4.0) < 0.01
    assert refined[0].end == refined[1].start


def test_an_accurate_change_stays_put():
    notes = np.hstack([profile_frames("C", 3), profile_frames("Dm", 3)])
    times = np.arange(notes.shape[1]) / FPS
    beats = [0, 1, 2, 3, 4, 5]
    refined = refine_boundaries([Segment(0, 3, "C"), Segment(3, 6, "Dm")], notes, times, beats)
    assert refined[1].start == 3


def test_labels_and_silence_are_left_alone():
    notes = np.hstack([profile_frames("C", 2), np.zeros((12, 2 * FPS)), profile_frames("F", 2)])
    times = np.arange(notes.shape[1]) / FPS
    segments = [Segment(0, 2, "C"), Segment(2, 4, "N.C."), Segment(4, 6, "F")]
    refined = refine_boundaries(segments, notes, times, [0, 1, 2, 3, 4, 5])
    assert [s.label for s in refined] == ["C", "N.C.", "F"]
    assert [s.start for s in refined] == [0, 2, 4]
