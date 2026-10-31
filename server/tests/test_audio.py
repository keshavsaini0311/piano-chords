import pytest

from app.audio import video_id


@pytest.mark.parametrize(
    "url",
    [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
        "https://youtu.be/dQw4w9WgXcQ?si=abc",
        "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        "https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
        "  https://youtu.be/dQw4w9WgXcQ  ",
    ],
)
def test_video_id_reads_every_link_shape(url):
    assert video_id(url) == "dQw4w9WgXcQ"


@pytest.mark.parametrize("url", ["hello", "https://vimeo.com/1", "https://www.youtube.com/watch?v=short", ""])
def test_video_id_rejects_non_youtube(url):
    with pytest.raises(ValueError, match="Not a YouTube link"):
        video_id(url)
