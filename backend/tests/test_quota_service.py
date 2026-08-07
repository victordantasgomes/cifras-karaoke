import pytest

import db
from services.audio_service import AudioService
from services.quota_service import QuotaExceeded, QuotaService
from services.setlist_service import SetlistService
from services.songs_service import SongsService


class _FakeFile:
    """Duck-type mínimo de werkzeug.FileStorage."""
    def __init__(self, filename, content):
        self.filename = filename
        self.mimetype = "audio/mpeg"
        self._content = content

    def read(self):
        return self._content


@pytest.fixture
def ctx(fake_blob_store, user_id):
    setlists = SetlistService()
    audio = AudioService()
    songs = SongsService(setlists=setlists, audio=audio)
    audio.songs = songs
    quota = QuotaService(setlists=setlists)
    setlists.quota = quota
    return songs, setlists, audio, quota


def _create_song_with_track(songs, audio, user_id, title, size_bytes):
    entry = songs.create(user_id, "Rock", "Queen", title, f"@titulo: {title}\n\ncorpo")
    audio.save_track(user_id, entry["slug"], _FakeFile("faixa.mp3", b"0" * size_bytes))
    return entry


def _assign_plan(user_id, max_setlists, storage_limit_mb):
    with db.get_pool().connection() as conn:
        plan_id = conn.execute(
            """insert into plans (name, max_setlists, storage_limit_mb, price_cents)
               values (%s, %s, %s, %s) returning id""",
            (f"plano-{user_id}-{max_setlists}-{storage_limit_mb}", max_setlists, storage_limit_mb, 990),
        ).fetchone()["id"]
        conn.execute("update users set plan_id=%s where id=%s", (plan_id, user_id))
    return plan_id


def test_usage_is_none_without_assigned_plan(ctx):
    _, _, _, quota = ctx
    assert quota.usage("u1") is None


def test_check_setlist_creation_allows_when_no_plan_assigned(ctx):
    _, setlists, _, _ = ctx
    setlists.save("u1", "Show 1", [])
    setlists.save("u1", "Show 2", [])  # sem plano = sem limite, mesmo comportamento de sempre


def test_check_setlist_creation_blocks_at_limit(ctx):
    _, setlists, _, _ = ctx
    _assign_plan("u1", max_setlists=1, storage_limit_mb=100)
    setlists.save("u1", "Show 1", [])
    with pytest.raises(QuotaExceeded):
        setlists.save("u1", "Show 2", [])


def test_check_setlist_creation_does_not_block_editing_existing(ctx):
    _, setlists, _, _ = ctx
    _assign_plan("u1", max_setlists=1, storage_limit_mb=100)
    created = setlists.save("u1", "Show 1", [])
    setlists.save("u1", "Show 1 renomeado", [], created["id"])  # edição, não conta pro limite


def test_quota_exceeded_does_not_partially_create_setlist(ctx):
    _, setlists, _, _ = ctx
    _assign_plan("u1", max_setlists=1, storage_limit_mb=100)
    setlists.save("u1", "Show 1", [])
    with pytest.raises(QuotaExceeded):
        setlists.save("u1", "Show 2", [])
    assert [s["nome"] for s in setlists.list("u1")] == ["Show 1"]


def test_storage_limit_blocks_setlist_with_heavy_song(ctx):
    songs, setlists, audio, _ = ctx
    _assign_plan("u1", max_setlists=10, storage_limit_mb=0)  # 0 MB = qualquer áudio já estoura
    song = _create_song_with_track(songs, audio, "u1", "Bohemian Rhapsody", 1024)
    with pytest.raises(QuotaExceeded):
        setlists.save("u1", "Show", [f"Queen/{song['titulo']}"])
    assert setlists.list("u1") == []  # nada gravado — bloqueio é tudo ou nada


def test_storage_limit_allows_setlist_without_audio(ctx):
    songs, setlists, audio, _ = ctx
    _assign_plan("u1", max_setlists=10, storage_limit_mb=0)
    entry = songs.create("u1", "Rock", "Queen", "Bohemian Rhapsody", "@titulo: Bohemian Rhapsody\n\ncorpo")
    setlists.save("u1", "Show", [f"Queen/{entry['titulo']}"])  # sem áudio, 0 bytes — não estoura


def test_storage_limit_not_enforced_without_plan(ctx):
    songs, setlists, audio, _ = ctx
    song = _create_song_with_track(songs, audio, "u1", "Bohemian Rhapsody", 999_999_999)
    setlists.save("u1", "Show", [f"Queen/{song['titulo']}"])  # sem plano = sem limite


def test_usage_reports_setlist_count_and_storage(ctx):
    songs, setlists, audio, quota = ctx
    _assign_plan("u1", max_setlists=5, storage_limit_mb=10)
    song = _create_song_with_track(songs, audio, "u1", "Bohemian Rhapsody", 2048)
    setlists.save("u1", "Show", [f"Queen/{song['titulo']}"])

    usage = quota.usage("u1")
    assert usage == {
        "setlists_used": 1, "setlists_max": 5,
        "storage_used_mb": round(2048 / (1024 * 1024), 1),
        "storage_limit_mb": 10,
    }


def test_storage_counts_only_songs_from_owned_setlists(ctx, other_user_id):
    songs, setlists, audio, quota = ctx
    _assign_plan("u1", max_setlists=5, storage_limit_mb=100)
    song = _create_song_with_track(songs, audio, other_user_id, "Bohemian Rhapsody", 5_000_000)
    setlists.save(other_user_id, "Show de outro", [f"Queen/{song['titulo']}"])  # shared=true por padrão

    # u1 enxerga o setlist de outro usuário (é compartilhado), mas ele não é
    # DONO — não deve contar pro armazenamento de u1 (Decisão §13).
    assert quota.storage_used_bytes("u1") == 0


def test_editing_setlist_excludes_its_own_previous_items_from_check(ctx):
    songs, setlists, audio, _ = ctx
    _assign_plan("u1", max_setlists=5, storage_limit_mb=1)  # 1 MB
    song_a = _create_song_with_track(songs, audio, "u1", "Musica A", 500_000)
    song_b = _create_song_with_track(songs, audio, "u1", "Musica B", 500_000)
    created = setlists.save("u1", "Show", [f"Queen/{song_a['titulo']}"])
    # trocar A por B (não somar A+B, senão estouraria 1 MB) — reedição deve
    # excluir os itens ANTIGOS deste mesmo setlist do cálculo.
    setlists.save("u1", "Show", [f"Queen/{song_b['titulo']}"], created["id"])
