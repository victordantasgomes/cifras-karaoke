import pytest

import db
from services.band_board_service import BandBoardService
from services.setlist_service import SetlistService

POST_DATA = {
    "band_name": "Banda do Zé",
    "genero": "Rock",
    "style_freeform": "Rock nacional",
    "skill_level": "intermediario",
    "goal": "shows_pagos",
    "rehearsal_days": ["terca", "quinta"],
    "instruments_needed": ["baixo", "bateria"],
    "bio": "Banda formada há 3 anos, buscando completar a formação.",
    "contact_info": "zap: 11999998888",
}


@pytest.fixture
def board():
    return BandBoardService()


def test_create_and_get(board, user_id):
    post = board.create(user_id, POST_DATA)
    assert post["band_name"] == "Banda do Zé"
    assert post["genero"] == "Rock"
    assert post["rehearsal_days"] == ["terca", "quinta"]
    assert post["instruments_needed"] == ["baixo", "bateria"]
    assert post["active"] is True
    assert post["user_id"] == user_id

    fetched = board.get(post["id"])
    assert fetched == post


def test_list_active_only_shows_active_posts(board, user_id):
    p1 = board.create(user_id, POST_DATA)
    p2 = board.create(user_id, {**POST_DATA, "band_name": "Outra Banda"})
    board.set_active(user_id, p2["id"], False)

    active = board.list_active()
    assert [p["id"] for p in active] == [p1["id"]]


def test_list_mine_shows_all_including_inactive(board, user_id):
    p1 = board.create(user_id, POST_DATA)
    p2 = board.create(user_id, {**POST_DATA, "band_name": "Outra Banda"})
    board.set_active(user_id, p2["id"], False)

    mine = board.list_mine(user_id)
    assert {p["id"] for p in mine} == {p1["id"], p2["id"]}


def test_get_inactive_post_raises_for_anonymous(board, user_id):
    post = board.create(user_id, POST_DATA)
    board.set_active(user_id, post["id"], False)
    with pytest.raises(FileNotFoundError):
        board.get(post["id"])


def test_get_inactive_post_visible_to_owner(board, user_id):
    post = board.create(user_id, POST_DATA)
    board.set_active(user_id, post["id"], False)
    fetched = board.get(post["id"], user_id)
    assert fetched["active"] is False


def test_only_owner_can_update(board, user_id, other_user_id):
    post = board.create(user_id, POST_DATA)
    with pytest.raises(PermissionError):
        board.update(other_user_id, post["id"], {**POST_DATA, "band_name": "Hackeada"})


def test_only_owner_can_deactivate(board, user_id, other_user_id):
    post = board.create(user_id, POST_DATA)
    with pytest.raises(PermissionError):
        board.set_active(other_user_id, post["id"], False)


def test_update_unknown_post_raises_not_found(board, user_id):
    with pytest.raises(FileNotFoundError):
        board.update(user_id, "00000000-0000-0000-0000-000000000000", POST_DATA)


def test_update_changes_fields(board, user_id):
    post = board.create(user_id, POST_DATA)
    updated = board.update(user_id, post["id"], {**POST_DATA, "band_name": "Novo Nome"})
    assert updated["band_name"] == "Novo Nome"


def test_setlist_refs_only_include_owned_setlists(board, user_id, other_user_id):
    setlists = SetlistService()
    mine = setlists.save(user_id, "Ensaio", ["Queen/Bohemian Rhapsody"])
    theirs = setlists.save(other_user_id, "Alheio", ["Coldplay/Yellow"])

    with db.get_pool().connection() as conn:
        mine_id = conn.execute("select id from setlists where slug=%s", (mine["id"],)).fetchone()["id"]
        theirs_id = conn.execute("select id from setlists where slug=%s", (theirs["id"],)).fetchone()["id"]

    post = board.create(user_id, {**POST_DATA, "setlist_refs": [str(mine_id), str(theirs_id)]})
    assert post["setlist_refs"] == [str(mine_id)]


def test_deleting_user_cascades_posts(board, user_id):
    post = board.create(user_id, POST_DATA)
    with db.get_pool().connection() as conn:
        conn.execute("delete from users where id=%s", (user_id,))
    with pytest.raises(FileNotFoundError):
        board.get(post["id"], user_id)
