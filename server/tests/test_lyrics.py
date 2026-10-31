from app.lyrics import clean_title, parse_lrc

LRC = """[00:01.00] walking down the empty road
[00:05.50] counting every light
[00:09.00] all the way back home
"""


def test_parse_lrc_times_each_line_until_the_next():
    lines = parse_lrc(LRC, duration=12.0)
    assert [(l.id, l.start, l.end) for l in lines] == [("l0", 1.0, 5.5), ("l1", 5.5, 9.0), ("l2", 9.0, 12.0)]
    assert lines[0].text == "walking down the empty road"


def test_parse_lrc_caps_last_line_at_six_seconds():
    assert parse_lrc(LRC, duration=100.0)[-1].end == 15.0


def test_parse_lrc_skips_tag_lines():
    assert parse_lrc("[ar:Someone]\n[00:02.00] hi\n", duration=5.0)[0].text == "hi"


def test_clean_title_strips_video_noise():
    assert clean_title("AFUSIC - Pal Pal (Official Video) ft. Talwiinder") == "AFUSIC - Pal Pal"
    assert clean_title("Song Name [Lyrics] | Some Channel") == "Song Name"
    assert clean_title("Track feat. Someone (Official Audio)") == "Track"
