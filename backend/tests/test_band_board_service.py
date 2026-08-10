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
    assert post["media"] == []

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


class _FakeFile:
    """Duck-type mínimo de werkzeug.FileStorage — mesmo padrão de
    test_branding_service.py."""
    def __init__(self, filename, content=b"fake-bytes", mimetype="image/png"):
        self.filename = filename
        self.mimetype = mimetype
        self._content = content

    def read(self):
        return self._content


def test_add_media_photo_and_video(board, user_id, fake_blob_store):
    post = board.create(user_id, POST_DATA)
    photo = board.add_media_file(user_id, post["id"], "photo", _FakeFile("foto.jpg", b"jpg-bytes", "image/jpeg"))
    video = board.add_media_file(user_id, post["id"], "video", _FakeFile("clipe.mp4", b"mp4-bytes", "video/mp4"), label="Ensaio")

    assert photo["kind"] == "photo"
    assert photo["url"] is None
    assert video["kind"] == "video"
    assert video["label"] == "Ensaio"
    assert video["size_bytes"] == len(b"mp4-bytes")

    fetched = board.get(post["id"])
    assert {m["id"] for m in fetched["media"]} == {photo["id"], video["id"]}

    data, content_type = board.media_bytes(post["id"], photo["id"])
    assert data == b"jpg-bytes"
    assert content_type == "image/jpeg"


def test_add_media_link_and_youtube(board, user_id):
    post = board.create(user_id, POST_DATA)
    link = board.add_media_link(user_id, post["id"], "link", "https://instagram.com/bandadoze", label="Instagram")
    yt = board.add_media_link(user_id, post["id"], "youtube", "https://youtu.be/dQw4w9WgXcQ")

    assert link["url"] == "https://instagram.com/bandadoze"
    assert link["label"] == "Instagram"
    assert yt["kind"] == "youtube"
    assert yt["url"] == "https://youtu.be/dQw4w9WgXcQ"

    fetched = board.get(post["id"])
    assert len(fetched["media"]) == 2


def test_add_media_link_rejects_non_url(board, user_id):
    post = board.create(user_id, POST_DATA)
    with pytest.raises(ValueError):
        board.add_media_link(user_id, post["id"], "link", "não é um link")


def test_add_media_file_rejects_invalid_kind(board, user_id, fake_blob_store):
    post = board.create(user_id, POST_DATA)
    with pytest.raises(ValueError):
        board.add_media_file(user_id, post["id"], "link", _FakeFile("x.jpg"))


def test_add_media_file_rejects_mimetype_mismatch(board, user_id, fake_blob_store):
    post = board.create(user_id, POST_DATA)
    with pytest.raises(ValueError):
        board.add_media_file(user_id, post["id"], "photo", _FakeFile("x.mp4", mimetype="video/mp4"))


def test_add_media_file_rejects_oversized(board, user_id, fake_blob_store, monkeypatch):
    from services import band_board_service
    monkeypatch.setattr(band_board_service, "MAX_MEDIA_FILE_BYTES", 10)
    post = board.create(user_id, POST_DATA)
    with pytest.raises(ValueError):
        board.add_media_file(user_id, post["id"], "photo", _FakeFile("x.jpg", b"x" * 100))


def test_add_media_enforces_limit_per_post(board, user_id, fake_blob_store, monkeypatch):
    from services import band_board_service
    monkeypatch.setattr(band_board_service, "MAX_MEDIA_PER_POST", 2)
    post = board.create(user_id, POST_DATA)
    board.add_media_link(user_id, post["id"], "link", "https://a.test")
    board.add_media_link(user_id, post["id"], "link", "https://b.test")
    with pytest.raises(ValueError):
        board.add_media_link(user_id, post["id"], "link", "https://c.test")


def test_only_owner_can_add_media(board, user_id, other_user_id):
    post = board.create(user_id, POST_DATA)
    with pytest.raises(PermissionError):
        board.add_media_link(other_user_id, post["id"], "link", "https://a.test")


def test_delete_media_removes_it_and_blob(board, user_id, fake_blob_store):
    post = board.create(user_id, POST_DATA)
    photo = board.add_media_file(user_id, post["id"], "photo", _FakeFile("foto.jpg", b"jpg-bytes"))
    assert len(fake_blob_store) == 1

    board.delete_media(user_id, post["id"], photo["id"])
    assert board.get(post["id"])["media"] == []
    assert len(fake_blob_store) == 0


def test_delete_media_only_owner(board, user_id, other_user_id, fake_blob_store):
    post = board.create(user_id, POST_DATA)
    photo = board.add_media_file(user_id, post["id"], "photo", _FakeFile("foto.jpg"))
    with pytest.raises(PermissionError):
        board.delete_media(other_user_id, post["id"], photo["id"])


def test_media_bytes_none_for_link_kind(board, user_id):
    post = board.create(user_id, POST_DATA)
    link = board.add_media_link(user_id, post["id"], "link", "https://a.test")
    assert board.media_bytes(post["id"], link["id"]) is None


def test_list_active_includes_media(board, user_id, fake_blob_store):
    post = board.create(user_id, POST_DATA)
    board.add_media_link(user_id, post["id"], "youtube", "https://youtu.be/dQw4w9WgXcQ")
    active = board.list_active()
    assert len(active[0]["media"]) == 1


def test_deleting_user_cascades_media(board, user_id, fake_blob_store):
    post = board.create(user_id, POST_DATA)
    board.add_media_file(user_id, post["id"], "photo", _FakeFile("foto.jpg"))
    with db.get_pool().connection() as conn:
        conn.execute("delete from users where id=%s", (user_id,))
        remaining = conn.execute("select count(*) as n from band_post_media").fetchone()["n"]
    assert remaining == 0
