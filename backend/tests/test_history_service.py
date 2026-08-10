import pytest

from services.history_service import HistoryService
from services.songs_service import SongsService

DEMO_SONGS = [
    ("Rock", "Queen", "Bohemian Rhapsody"),
    ("Rock", "Queen", "We Will Rock You"),
    ("Pop", "Coldplay", "Yellow"),
]


@pytest.fixture
def ctx(user_id):
    songs = SongsService()
    for genero, artista, titulo in DEMO_SONGS:
        content = f"@titulo: {titulo}\n\ncorpo"
        songs.create(user_id, genero, artista, titulo, content)
    return songs, HistoryService(songs)


def test_most_played_artists_starts_empty(ctx):
    _, history = ctx
    assert history.most_played_artists("u1") == []


def test_most_played_artists_aggregates_across_songs_by_same_artist(ctx, user_id):
    _, history = ctx
    history.register_play(user_id, "rock--queen--bohemian-rhapsody")
    history.register_play(user_id, "rock--queen--bohemian-rhapsody")
    history.register_play(user_id, "rock--queen--we-will-rock-you")
    history.register_play(user_id, "pop--coldplay--yellow")

    result = history.most_played_artists(user_id)
    assert result[0] == {"interprete": "Queen", "plays": 3}
    assert result[1] == {"interprete": "Coldplay", "plays": 1}


def test_most_played_artists_respects_limit(ctx, user_id):
    _, history = ctx
    history.register_play(user_id, "rock--queen--bohemian-rhapsody")
    history.register_play(user_id, "rock--queen--we-will-rock-you")
    history.register_play(user_id, "pop--coldplay--yellow")

    result = history.most_played_artists(user_id, limit=1)
    assert len(result) == 1
    assert result[0]["interprete"] == "Queen"
