import db
from services.favorites_service import FavoritesService


def test_list_favorites_starts_empty(user_id):
    favs = FavoritesService()
    assert favs.list_favorites(user_id) == {"artists": [], "genres": []}


def test_toggle_artist_on_and_off(user_id):
    favs = FavoritesService()
    favs.set_favorite_artist(user_id, "Legião Urbana", True)
    assert favs.list_favorites(user_id)["artists"] == ["Legião Urbana"]

    favs.set_favorite_artist(user_id, "Legião Urbana", False)
    assert favs.list_favorites(user_id)["artists"] == []


def test_toggle_genre_on_and_off(user_id):
    favs = FavoritesService()
    favs.set_favorite_genre(user_id, "MPB", True)
    assert favs.list_favorites(user_id)["genres"] == ["MPB"]

    favs.set_favorite_genre(user_id, "MPB", False)
    assert favs.list_favorites(user_id)["genres"] == []


def test_toggle_on_twice_does_not_duplicate(user_id):
    favs = FavoritesService()
    favs.set_favorite_artist(user_id, "Queen", True)
    favs.set_favorite_artist(user_id, "Queen", True)
    assert favs.list_favorites(user_id)["artists"] == ["Queen"]


def test_list_favorites_sorted_and_scoped_per_user(user_id, other_user_id):
    favs = FavoritesService()
    favs.set_favorite_artist(user_id, "Zeca Pagodinho", True)
    favs.set_favorite_artist(user_id, "Alceu Valença", True)
    favs.set_favorite_artist(other_user_id, "Legião Urbana", True)

    assert favs.list_favorites(user_id)["artists"] == ["Alceu Valença", "Zeca Pagodinho"]
    assert favs.list_favorites(other_user_id)["artists"] == ["Legião Urbana"]


def test_blank_name_is_ignored(user_id):
    favs = FavoritesService()
    favs.set_favorite_artist(user_id, "   ", True)
    favs.set_favorite_genre(user_id, "", True)
    assert favs.list_favorites(user_id) == {"artists": [], "genres": []}


def test_deleting_user_cascades_favorites(user_id):
    favs = FavoritesService()
    favs.set_favorite_artist(user_id, "Queen", True)
    favs.set_favorite_genre(user_id, "Rock", True)

    with db.get_pool().connection() as conn:
        conn.execute("delete from users where id=%s", (user_id,))

    assert favs.list_favorites(user_id) == {"artists": [], "genres": []}
