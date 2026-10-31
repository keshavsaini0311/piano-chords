from app.lyrics import clean_title, parse_lrc, song_title

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


def test_clean_title_drops_collab_and_producer_credits():
    assert clean_title("Afusic - Pal Pal with @Talwiinder Prod. @AliSoomroMusic") == "Afusic - Pal Pal"


def test_song_title_removes_the_artist_prefix():
    assert song_title("Afusic - Pal Pal with @Talwiinder Prod. @AliSoomroMusic", "AFUSIC") == "Pal Pal"
    assert song_title("Pal Pal (Official Video)", "AFUSIC") == "Pal Pal"


from app.lyrics import pick_by_duration, title_queries


def test_title_queries_strip_noise_and_try_each_part():
    assert title_queries('"Tum Hi Ho" Aashiqui 2 Full Song') == ["Tum Hi Ho Aashiqui 2", "Tum Hi Ho"]
    assert title_queries("Agar Tum Saath Ho FULL AUDIO Song") == ["Agar Tum Saath Ho", "Agar Tum Saath"]
    assert title_queries("Arijit Singh - Phir Le Aya Dil Lyrics") == ["Arijit Singh Phir Le Aya Dil", "Phir Le Aya Dil", "Arijit Singh", "Phir Le Aya"]
    assert title_queries("Let It Be (Remastered 2009)") == ["Let It Be"]
    assert title_queries("Vance Joy - 'Riptide'") == ["Vance Joy Riptide", "Riptide", "Vance Joy"]
    assert title_queries("Pehla Nasha Lyrical") == ["Pehla Nasha"]


def test_pick_by_duration_takes_the_closest_synced_match_within_tolerance():
    results = [
        {"duration": 300, "syncedLyrics": "[00:01.00] far"},
        {"duration": 268, "syncedLyrics": "[00:01.00] close"},
        {"duration": 266, "syncedLyrics": None},
    ]
    assert pick_by_duration(results, 267.0)["syncedLyrics"].endswith("close")
    assert pick_by_duration(results, 200.0) is None
