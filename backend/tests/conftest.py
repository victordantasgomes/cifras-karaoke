"""Fixtures compartilhadas dos testes de service — rodam contra um Postgres
real (ver TEST_DATABASE_URL em backend/.env), não um banco falso/em memória:
SQL malformado ou uma constraint violada aparece aqui, não só em produção.

Cada teste começa com as tabelas vazias (TRUNCATE ... CASCADE) em vez de um
schema novo por teste — mais rápido, e o schema é sempre o mesmo dentro da
suíte.

IMPORTANTE: isso já truncou o banco de dados real uma vez (rodar a suíte
apontando sem querer pro mesmo DATABASE_URL usado pelos dados migrados —
ver backend/scripts/migrate_to_postgres.py — apagou tudo). Por isso a suíte
exige TEST_DATABASE_URL separada de DATABASE_URL e recusa a rodar sem ela,
em vez de só usar Config.DATABASE_URL como fallback."""
from __future__ import annotations

import os

import pytest

import db
from config import Config
from services import blob_client

_TABLES = (
    "setlist_items", "setlists", "samples", "audio_tracks",
    "song_plays", "song_versions", "songs", "settings", "users",
)

_TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
if not _TEST_DATABASE_URL:
    pytest.exit(
        "TEST_DATABASE_URL não definida em backend/.env. A suíte faz "
        "TRUNCATE CASCADE nas tabelas a cada teste — sem uma instância "
        "Postgres separada só pra testes (ex.: uma branch do Neon), isso "
        "apaga dados reais. Veja README.md > Testes.",
        returncode=1,
    )
if _TEST_DATABASE_URL == Config.DATABASE_URL:
    pytest.exit(
        "TEST_DATABASE_URL está igual a DATABASE_URL — configure uma "
        "instância Postgres SEPARADA pra testes, não a mesma do app.",
        returncode=1,
    )
Config.DATABASE_URL = _TEST_DATABASE_URL


@pytest.fixture(scope="session", autouse=True)
def _schema():
    db.init_schema()
    yield
    db.close_pool()


@pytest.fixture(autouse=True)
def _clean_db():
    with db.get_pool().connection() as conn:
        conn.execute("truncate table " + ", ".join(_TABLES) + " cascade")
    yield


@pytest.fixture
def user_id():
    """Cria o usuário 'u1' (FK de songs/settings) e devolve o id."""
    with db.get_pool().connection() as conn:
        conn.execute(
            "insert into users (id, username, name, password_hash) values ('u1', 'demo', 'Demo', 'x')",
        )
    return "u1"


@pytest.fixture
def fake_blob_store(monkeypatch):
    """Troca blob_client.put/get/delete por fakes em memória — os testes de
    AudioService não precisam de BLOB_READ_WRITE_TOKEN nem batem na API do
    Vercel Blob de verdade (que, pra este projeto, é um store privado —
    ver blob_client.py)."""
    store: dict[str, bytes] = {}  # pathname -> bytes

    def fake_put(pathname, data, content_type=None):
        store[pathname] = data
        return {"url": f"https://fake-blob.test/{pathname}", "pathname": pathname}

    def fake_get(url):
        pathname = url.replace("https://fake-blob.test/", "")
        if pathname not in store:
            raise blob_client.BlobError("not found")
        return store[pathname], "application/octet-stream"

    def fake_delete(urls):
        for url in urls:
            store.pop(url.replace("https://fake-blob.test/", ""), None)

    monkeypatch.setattr(blob_client, "put", fake_put)
    monkeypatch.setattr(blob_client, "get", fake_get)
    monkeypatch.setattr(blob_client, "delete", fake_delete)
    return store
