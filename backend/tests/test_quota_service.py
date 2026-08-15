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


def _kind_limits(kind: str) -> dict:
    """Limites da linha singleton 'guest'/'admin' (ver schema.sql — seedada
    no início da sessão de teste, reseedada a cada teste em conftest.py)."""
    with db.get_pool().connection() as conn:
        row = conn.execute(
            "select max_setlists, storage_limit_mb from plans where kind=%s", (kind,),
        ).fetchone()
    return dict(row)


def _make_non_grandfathered_user(user_id: str, username: str) -> None:
    """Conta 'nova' (cadastro público — ver AuthService.register(
    grandfathered=False)): sem plano pago, cai no teto do plano gratuito
    em vez de ficar sem limite nenhum."""
    with db.get_pool().connection() as conn:
        conn.execute(
            "insert into users (id, username, name, password_hash, plan_grandfathered) "
            "values (%s, %s, %s, 'x', false)",
            (user_id, username, username),
        )


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


def test_grandfathered_user_without_plan_has_no_limit(ctx):
    # "u1" (fixture user_id) é inserido sem passar por AuthService.register()
    # — cai no default da coluna (plan_grandfathered=true), mesmo
    # comportamento de sempre pra conta que nunca assinou nada.
    _, _, _, quota = ctx
    assert quota.usage("u1") is None


def test_non_grandfathered_user_without_plan_gets_guest_kind_limit(ctx):
    _, setlists, _, quota = ctx
    _make_non_grandfathered_user("u3", "novo")
    guest = _kind_limits("guest")
    usage = quota.usage("u3")
    assert usage == {
        "setlists_used": 0, "setlists_max": guest["max_setlists"],
        "storage_used_mb": 0, "storage_limit_mb": guest["storage_limit_mb"],
    }
    for i in range(guest["max_setlists"]):
        setlists.save("u3", f"Show {i}", [])
    with pytest.raises(QuotaExceeded):
        setlists.save("u3", "Show a mais", [])


def test_non_grandfathered_user_storage_limit_enforced(ctx):
    songs, setlists, audio, _ = ctx
    _make_non_grandfathered_user("u3", "novo")
    guest = _kind_limits("guest")
    song = _create_song_with_track(songs, audio, "u3", "Bohemian Rhapsody", guest["storage_limit_mb"] * 1024 * 1024 + 1)
    with pytest.raises(QuotaExceeded):
        setlists.save("u3", "Show", [f"Queen/{song['titulo']}"])


def test_assigning_paid_plan_overrides_guest_kind_limit(ctx):
    _, setlists, _, quota = ctx
    _make_non_grandfathered_user("u3", "novo")
    _assign_plan("u3", max_setlists=50, storage_limit_mb=5000)
    usage = quota.usage("u3")
    assert usage["setlists_max"] == 50 and usage["storage_limit_mb"] == 5000


def test_admin_uses_admin_kind_limit_regardless_of_plan_or_grandfathered(ctx):
    """is_admin tem prioridade sobre tudo — mesmo com um plano pago
    atribuído (cenário improvável mas possível), ou grandfathered, um admin
    sempre usa a linha 'admin' (ver quota_service.py::_plan_limits)."""
    _, setlists, _, quota = ctx
    with db.get_pool().connection() as conn:
        conn.execute(
            "insert into users (id, username, name, password_hash, is_admin) "
            "values ('u3', 'admin-novo', 'Admin Novo', 'x', true)",
        )
    admin = _kind_limits("admin")
    usage = quota.usage("u3")
    assert usage["setlists_max"] == admin["max_setlists"]
    assert usage["storage_limit_mb"] == admin["storage_limit_mb"]

    # mesmo com plano pago atribuído, continua usando o limite de admin
    _assign_plan("u3", max_setlists=1, storage_limit_mb=1)
    usage_with_plan = quota.usage("u3")
    assert usage_with_plan["setlists_max"] == admin["max_setlists"]


def test_editing_setlist_excludes_its_own_previous_items_from_check(ctx):
    songs, setlists, audio, _ = ctx
    _assign_plan("u1", max_setlists=5, storage_limit_mb=1)  # 1 MB
    song_a = _create_song_with_track(songs, audio, "u1", "Musica A", 500_000)
    song_b = _create_song_with_track(songs, audio, "u1", "Musica B", 500_000)
    created = setlists.save("u1", "Show", [f"Queen/{song_a['titulo']}"])
    # trocar A por B (não somar A+B, senão estouraria 1 MB) — reedição deve
    # excluir os itens ANTIGOS deste mesmo setlist do cálculo.
    setlists.save("u1", "Show", [f"Queen/{song_b['titulo']}"], created["id"])
