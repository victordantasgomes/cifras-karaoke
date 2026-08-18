"""Testes HTTP-level das rotas públicas (/api/public/*) — primeiro arquivo
de teste do projeto que sobe um Flask test_client() de verdade em vez de
chamar services diretamente. Necessário aqui porque o que está sob teste é
justamente o comportamento da CAMADA DE ROTA (visitante sem token, sem
g.user_id) — os services por trás já são cobertos pelos testes de service
existentes."""
from __future__ import annotations

import pytest

import db
from app import create_app
from services.audio_service import AudioService
from services.setlist_service import SetlistService
from services.songs_service import SongsService


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()


@pytest.fixture
def songs(fake_blob_store):
    setlists = SetlistService()
    audio = AudioService()
    s = SongsService(setlists=setlists, audio=audio)
    audio.songs = s
    return s


def _create(songs_service, user_id, title="Yellow", artist="Coldplay", genre="Pop", tom="B"):
    return songs_service.create(
        user_id, genre, artist, title,
        f"@titulo: {title}\n@tom: {tom}\n@velocidade: 55\n\n{tom}\nLook at the stars",
    )


def _orphan_owner(owner_id, requester_id="u1"):
    """Apaga o dono, deixando a música órfã (user_id NULL via ON DELETE SET
    NULL — ver AuthService.delete_user)."""
    from services.auth_service import AuthService
    AuthService().delete_user(owner_id, requester_id)


def test_get_private_song_returns_404_without_leaking_data(client, songs, other_user_id):
    entry = _create(songs, other_user_id, title="Segredo")
    songs.set_shared(other_user_id, entry["slug"], False)

    r = client.get(f"/api/public/songs/{entry['slug']}")
    assert r.status_code == 404
    assert "Segredo" not in r.get_data(as_text=True)


def test_get_shared_song_returns_200(client, songs, other_user_id):
    entry = _create(songs, other_user_id, title="Yellow")
    r = client.get(f"/api/public/songs/{entry['slug']}")
    assert r.status_code == 200
    assert r.get_json()["titulo"] == "Yellow"


def test_get_orphan_song_returns_200(client, songs, user_id, other_user_id):
    entry = _create(songs, other_user_id, title="Sem Dono")
    _orphan_owner(other_user_id, requester_id=user_id)
    r = client.get(f"/api/public/songs/{entry['slug']}")
    assert r.status_code == 200
    assert r.get_json()["titulo"] == "Sem Dono"


def test_public_search_and_facets_only_see_shared_songs(client, songs, user_id, other_user_id):
    _create(songs, other_user_id, title="Publica", genre="GeneroPublico")
    private = _create(songs, other_user_id, title="Privada", genre="GeneroPrivado")
    songs.set_shared(other_user_id, private["slug"], False)

    hits = client.get("/api/public/songs", query_string={"q": "publica"}).get_json()
    assert hits["total"] == 1

    hits_private = client.get("/api/public/songs", query_string={"q": "privada"}).get_json()
    assert hits_private["total"] == 0

    facets = client.get("/api/public/songs/facets").get_json()
    assert "GeneroPublico" in facets["generos"]
    assert "GeneroPrivado" not in facets["generos"]


def test_public_transpose_never_persists_even_if_client_asks(client, songs, other_user_id):
    entry = _create(songs, other_user_id, tom="B")

    r = client.post(f"/api/public/songs/{entry['slug']}/transpose",
                     json={"semitones": 2, "save": True})
    assert r.status_code == 200
    assert r.get_json()["tom"] != "B"  # a resposta em si mostra o resultado transposto...

    # ...mas nada foi gravado: um GET seguinte mostra o tom original.
    again = client.get(f"/api/public/songs/{entry['slug']}").get_json()
    assert again["header"]["tom"] == "B"


def test_public_karaoke_of_private_song_returns_404(client, songs, other_user_id):
    entry = _create(songs, other_user_id)
    songs.set_shared(other_user_id, entry["slug"], False)
    r = client.get(f"/api/public/karaoke/{entry['slug']}")
    assert r.status_code == 404


def test_public_karaoke_of_shared_song_returns_200(client, songs, other_user_id):
    entry = _create(songs, other_user_id)
    r = client.get(f"/api/public/karaoke/{entry['slug']}")
    assert r.status_code == 200
    assert r.get_json()["lines"]


def test_public_audio_of_private_song_returns_404_even_with_track_uploaded(client, songs, other_user_id, fake_blob_store):
    entry = _create(songs, other_user_id)

    class _FakeFile:
        filename = "track.mp3"
        mimetype = "audio/mpeg"
        def read(self):
            return b"fake-audio-bytes"

    songs.audio.save_track(other_user_id, entry["slug"], _FakeFile())
    songs.set_shared(other_user_id, entry["slug"], False)

    r = client.get(f"/api/public/songs/{entry['slug']}/audio")
    assert r.status_code == 404


def test_rate_limit_blocks_after_threshold(client, songs, other_user_id):
    _create(songs, other_user_id)
    last = None
    for _ in range(65):
        last = client.get("/api/public/songs/facets")
    assert last.status_code == 429
    assert last.get_json()["error_code"] == "RATE_LIMIT_EXCEEDED"


def test_protected_routes_still_require_auth(client):
    assert client.get("/api/songs").status_code == 401
    assert client.post("/api/songs/qualquer-slug/favorite", json={"value": True}).status_code == 401
