import pytest

import db
from services.audio_service import AudioService
from services.auth_service import AuthService
from services.clip_queue_service import ClipQueueService
from services.search_service import SearchService
from services.setlist_service import SetlistService
from services.songs_service import NotOwner, SongNotFound, SongsService
from services.karaoke_service import KaraokeService, velocity_to_ms


@pytest.fixture
def ctx(fake_blob_store, user_id):
    setlists = SetlistService()
    audio = AudioService()
    songs = SongsService(setlists=setlists, audio=audio)
    audio.songs = songs
    return songs, setlists, audio


def _create(songs, title="Yellow", artist="Coldplay", genre="Pop"):
    return songs.create("u1", genre, artist, title,
                        f"@titulo: {title}\n@tom: B\n@velocidade: 55\n\nB\nLook at the stars")


class _FakeFile:
    """Duck-type mínimo de werkzeug.FileStorage para os testes."""
    def __init__(self, filename, content=b"fake-audio-bytes"):
        self.filename = filename
        self.mimetype = "audio/mpeg"
        self._content = content

    def read(self):
        return self._content


def test_create_and_get(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    data = songs.get("u1", entry["slug"])
    assert data["titulo"] == "Yellow" and "stars" in data["body"]


def test_search_and_pagination(ctx):
    songs, _, _ = ctx
    for i in range(12):
        _create(songs, title=f"Música {i:02d}")
    search = SearchService()
    page = search.search("u1", page=1, page_size=5)
    assert page["total"] == 12 and len(page["items"]) == 5 and page["total_pages"] == 3
    hit = search.search("u1", q="musica 07")
    assert hit["total"] >= 1


def test_update_creates_history_version(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    data = songs.get("u1", entry["slug"])
    songs.update("u1", entry["slug"], data["header"], "novo corpo")
    song_id = songs.get_id("u1", "pop--coldplay--yellow")
    with db.get_pool().connection() as conn:
        count = conn.execute(
            "select count(*) as n from song_versions where song_id=%s", (song_id,),
        ).fetchone()["n"]
    assert count == 1


def test_delete_removes_from_setlists(ctx):
    songs, setlists, _ = ctx
    entry = _create(songs)
    created = setlists.save("u1", "Show", ["Coldplay/Yellow", "Queen/Love of My Life"])
    songs.delete("u1", entry["slug"])
    remaining = setlists.get("u1", created["id"])["items"]
    assert all("Yellow" not in i["ref"] for i in remaining)


def test_delete_song_removes_audio(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    audio.save_track("u1", entry["slug"], _FakeFile("track.mp3"))
    audio.save_sample("u1", entry["slug"], _FakeFile("solo.mp3"), "Solo de Guitarra")
    assert audio.has_track("u1", entry["slug"])
    songs.delete("u1", entry["slug"])
    assert not audio.has_track("u1", entry["slug"])
    assert audio.list_samples("u1", entry["slug"]) == {}


def test_transpose_updates_key(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    result = songs.transpose("u1", entry["slug"], semitones=2)
    assert result["tom"] == "C#"


def test_normalize_sets_flags_and_renames_title(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    result = songs.normalize("u1", entry["slug"])
    assert result["normalizada"] is True
    assert result["titulo"] == "Yellow - Coldplay"


def test_normalize_creates_history_version(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    songs.normalize("u1", entry["slug"])
    # o slug ignora o sufixo "- intérprete" do título normalizado (ver
    # strip_title_suffix em songs_service.py) — senão duplicava o intérprete
    # no slug.
    song_id = songs.get_id("u1", "pop--coldplay--yellow")
    with db.get_pool().connection() as conn:
        version = conn.execute(
            "select header from song_versions where song_id=%s", (song_id,),
        ).fetchone()
    # a versão arquivada é o estado PRÉ-normalização (título ainda sem sufixo)
    # — restaurar essa versão é o "desfazer" da normalização, sem mecanismo novo.
    assert version["header"]["titulo"] == "Yellow"


def test_deleting_user_preserves_their_songs_and_setlists(ctx, other_user_id):
    songs, setlists, _ = ctx
    entry = _create(songs)
    created = setlists.save("u1", "Show", [])
    AuthService().delete_user("u1", other_user_id)

    data = songs.get(other_user_id, entry["slug"])
    assert data["user_id"] is None and data["titulo"] == "Yellow"
    # setlist sobrevive (shared=true por padrão) e vira órfão — is_owner=true
    # pra QUALQUER usuário (mesma lógica de música órfã em SongsService),
    # senão ninguém nunca mais conseguiria editar/excluir/compartilhar
    remaining_setlist = setlists.get(other_user_id, created["id"])
    assert remaining_setlist["is_owner"] is True


def test_orphaned_setlist_is_manageable_by_anyone(ctx, other_user_id):
    songs, setlists, _ = ctx
    created = setlists.save("u1", "Show", [])
    AuthService().delete_user("u1", other_user_id)

    setlists.set_shared(other_user_id, created["id"], False)
    saved = setlists.save(other_user_id, "Show renomeado", [], created["id"])
    assert saved["nome"] == "Show renomeado"
    setlists.delete(other_user_id, created["id"])
    # excluir marca deleted=true (ver setlist_service.py::delete) — some de
    # get()/list() pra QUALQUER usuário, inclusive quem tinha acabado de
    # gerenciar o órfão. Não existe mais um "dono de arquivo" fixo pra
    # verificar (ver test_owner_deleting_setlist_removes_it_from_everyones_view).
    with pytest.raises(FileNotFoundError):
        setlists.get(other_user_id, created["id"])


def test_normalize_slug_excludes_suffix_and_interprete_is_not_duplicated(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    result = songs.normalize("u1", entry["slug"])
    assert result["slug"] == "pop--coldplay--yellow"
    assert "cifra" not in result["slug"]
    assert result["slug"].count("coldplay") == 1


def test_normalize_status_counts_pending(ctx):
    songs, _, _ = ctx
    _create(songs, title="Um")
    _create(songs, title="Dois")
    assert songs.normalize_status() == {"remaining": 2}


def test_normalize_batch_processes_up_to_limit(ctx):
    songs, _, _ = ctx
    for i in range(5):
        _create(songs, title=f"Música {i}")
    result = songs.normalize_batch(limit=3)
    assert result["processed"] == 3
    assert result["remaining"] == 2


def test_normalize_batch_ignores_already_normalized(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    songs.normalize("u1", entry["slug"])
    result = songs.normalize_batch(limit=50)
    assert result == {"processed": 0, "remaining": 0}


def test_reset_normalization_reopens_the_queue(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    songs.normalize("u1", entry["slug"])
    assert songs.normalize_status() == {"remaining": 0}
    result = songs.reset_normalization()
    assert result == {"remaining": 1}
    assert songs.normalize_status() == {"remaining": 1}


def test_normalize_batch_after_reset_reruns_the_new_rule(ctx):
    # simula a regra de limpeza de título/slug tendo mudado DEPOIS que a
    # música já tinha passado por normalize_batch uma vez.
    songs, _, _ = ctx
    _create(songs, title="minha-musica-em-slug")
    songs.normalize_batch(limit=50)
    songs.reset_normalization()
    result = songs.normalize_batch(limit=50)
    assert result["processed"] == 1
    assert result["remaining"] == 0


def test_normalize_batch_is_resumable(ctx):
    songs, _, _ = ctx
    for i in range(4):
        _create(songs, title=f"Música {i}")
    first = songs.normalize_batch(limit=2)
    second = songs.normalize_batch(limit=2)
    assert first["processed"] == 2 and second["processed"] == 2
    assert second["remaining"] == 0
    assert songs.normalize_status() == {"remaining": 0}


# ---------- biblioteca global (Fase 3) ----------

def test_song_visible_to_other_user(ctx, other_user_id):
    songs, _, _ = ctx
    entry = _create(songs)
    # u1 criou, mas u2 já consegue ler — biblioteca é compartilhada
    data = songs.get(other_user_id, entry["slug"])
    assert data["titulo"] == "Yellow"


def _make_private_user(user_id: str, username: str) -> None:
    """Cadastro público (Fase 5) grava share_by_default=false — aqui feito
    direto no banco pra não depender da rota pública ainda inexistente."""
    with db.get_pool().connection() as conn:
        conn.execute(
            "insert into users (id, username, name, password_hash, share_by_default) "
            "values (%s, %s, %s, 'x', false)",
            (user_id, username, username),
        )


def test_new_song_defaults_shared_for_existing_style_user(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    assert songs.get("u1", entry["slug"])["shared"] is True


def test_new_song_defaults_private_for_share_by_default_false_user(ctx):
    songs, _, _ = ctx
    _make_private_user("u3", "privado")
    entry = songs.create("u3", "Pop", "Coldplay", "Segredo",
                          "@titulo: Segredo\n\ncorpo")
    assert songs.get("u3", entry["slug"])["shared"] is False


def test_private_song_not_visible_to_other_user(ctx):
    songs, _, _ = ctx
    _make_private_user("u3", "privado")
    entry = songs.create("u3", "Pop", "Coldplay", "Segredo",
                          "@titulo: Segredo\n\ncorpo")
    with pytest.raises(SongNotFound):
        songs.get("u1", entry["slug"])


def test_owner_still_sees_own_private_song(ctx):
    songs, _, _ = ctx
    _make_private_user("u3", "privado")
    entry = songs.create("u3", "Pop", "Coldplay", "Segredo",
                          "@titulo: Segredo\n\ncorpo")
    assert songs.get("u3", entry["slug"])["titulo"] == "Segredo"


def test_search_excludes_private_songs_of_others(ctx):
    songs, _, _ = ctx
    _make_private_user("u3", "privado")
    songs.create("u3", "Pop", "Coldplay", "Segredo Privado", "@titulo: Segredo Privado\n\ncorpo")
    search = SearchService()
    hit = search.search("u1", q="segredo privado")
    assert hit["total"] == 0


def test_search_includes_own_private_songs(ctx):
    songs, _, _ = ctx
    _make_private_user("u3", "privado")
    songs.create("u3", "Pop", "Coldplay", "Segredo Privado", "@titulo: Segredo Privado\n\ncorpo")
    search = SearchService()
    hit = search.search("u3", q="segredo privado")
    assert hit["total"] == 1


def test_facets_exclude_values_only_from_private_songs(ctx):
    songs, _, _ = ctx
    _make_private_user("u3", "privado")
    songs.create("u3", "GeneroExclusivoPrivado", "Artista Privado", "Segredo", "@titulo: Segredo\n\ncorpo")
    search = SearchService()
    facets = search.facets("u1")
    assert "GeneroExclusivoPrivado" not in facets["generos"]
    assert "Artista Privado" not in facets["interpretes"]


# ---------- admin vê tudo, independente de shared/dono (Fase 10) ----------

def test_admin_sees_private_song_of_other_user(ctx):
    songs, _, _ = ctx
    _make_private_user("u3", "privado")
    entry = songs.create("u3", "Pop", "Coldplay", "Segredo", "@titulo: Segredo\n\ncorpo")
    data = songs.get("u1", entry["slug"], is_admin=True)
    assert data["titulo"] == "Segredo"


def test_non_admin_still_blocked_from_private_song(ctx):
    songs, _, _ = ctx
    _make_private_user("u3", "privado")
    entry = songs.create("u3", "Pop", "Coldplay", "Segredo", "@titulo: Segredo\n\ncorpo")
    with pytest.raises(SongNotFound):
        songs.get("u1", entry["slug"], is_admin=False)


def test_admin_search_includes_private_songs_of_others(ctx):
    songs, _, _ = ctx
    _make_private_user("u3", "privado")
    songs.create("u3", "Pop", "Coldplay", "Segredo Privado", "@titulo: Segredo Privado\n\ncorpo")
    search = SearchService()
    hit = search.search("u1", q="segredo privado", is_admin=True)
    assert hit["total"] == 1


def test_admin_facets_include_values_from_private_songs(ctx):
    songs, _, _ = ctx
    _make_private_user("u3", "privado")
    songs.create("u3", "GeneroExclusivoPrivado", "Artista Privado", "Segredo", "@titulo: Segredo\n\ncorpo")
    search = SearchService()
    facets = search.facets("u1", is_admin=True)
    assert "GeneroExclusivoPrivado" in facets["generos"]
    assert "Artista Privado" in facets["interpretes"]


def test_admin_get_by_slugs_includes_private_song(ctx):
    songs, _, _ = ctx
    _make_private_user("u3", "privado")
    entry = songs.create("u3", "Pop", "Coldplay", "Segredo", "@titulo: Segredo\n\ncorpo")
    search = SearchService()
    assert search.get_by_slugs("u1", [entry["slug"]], is_admin=False) == []
    found = search.get_by_slugs("u1", [entry["slug"]], is_admin=True)
    assert [s["slug"] for s in found] == [entry["slug"]]


def test_clone_of_private_song_follows_editor_share_default(ctx, other_user_id):
    """Clonar uma música alheia gera uma cópia que segue A SUA preferência
    de compartilhamento, não a da música original."""
    songs, _, _ = ctx
    entry = _create(songs)  # u1, shared=true (padrão de hoje)
    _make_private_user("u3", "privado")
    clone = songs.clone("u3", entry["slug"], editor_name="Privado")
    assert songs.get("u3", clone["slug"])["shared"] is False


def test_clone_creates_independent_copy_owned_by_cloner(ctx, other_user_id):
    songs, _, _ = ctx
    entry = _create(songs)
    clone = songs.clone(other_user_id, entry["slug"], editor_name="Outro")

    assert clone["slug"] != entry["slug"]
    assert "cifra editada por: Outro" in clone["titulo"]
    assert clone["user_id"] == other_user_id

    # o original continua exatamente como estava, dono nenhum mudou
    still_original = songs.get("u1", entry["slug"])
    assert still_original["titulo"] == "Yellow"
    assert still_original["body"] == entry["body"]


def test_admin_can_clone_private_song(ctx):
    songs, _, _ = ctx
    _make_private_user("u3", "privado")
    entry = songs.create("u3", "Pop", "Coldplay", "Segredo", "@titulo: Segredo\n\ncorpo")
    clone = songs.clone("u1", entry["slug"], editor_name="Admin", is_admin=True)
    assert clone["user_id"] == "u1"


def test_clone_of_invisible_song_raises_not_found(ctx, other_user_id):
    songs, _, _ = ctx
    _make_private_user("u3", "privado")
    entry = songs.create("u3", "Pop", "Coldplay", "Segredo", "@titulo: Segredo\n\ncorpo")
    with pytest.raises(SongNotFound):
        songs.clone(other_user_id, entry["slug"])


def test_owner_can_toggle_shared(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    songs.set_shared("u1", entry["slug"], False)
    assert songs.get("u1", entry["slug"])["shared"] is False


def test_non_owner_cannot_toggle_song_shared(ctx, other_user_id):
    songs, _, _ = ctx
    entry = _create(songs)
    with pytest.raises(NotOwner):
        songs.set_shared(other_user_id, entry["slug"], False)


def test_editing_someone_elses_song_is_blocked(ctx, other_user_id):
    songs, _, _ = ctx
    entry = _create(songs)
    original = songs.get("u1", entry["slug"])

    edited_header = dict(original["header"])
    edited_header["nota"] = "9"
    with pytest.raises(NotOwner):
        songs.update(other_user_id, entry["slug"], edited_header, "corpo editado", editor_name="Outro")

    # o original continua exatamente como estava, ninguém mexeu nele
    still_original = songs.get("u1", entry["slug"])
    assert still_original["titulo"] == "Yellow"
    assert still_original["body"] != "corpo editado"


def test_admin_can_edit_someone_elses_song_in_place(ctx, other_user_id):
    songs, _, _ = ctx
    entry = _create(songs)
    original = songs.get("u1", entry["slug"])
    result = songs.update(other_user_id, entry["slug"], dict(original["header"]), "corpo novo", is_admin=True)
    # admin edita a MESMA música, sem clonar (sem sufixo "cifra editada por")
    assert "cifra editada por" not in result["titulo"]
    assert songs.get("u1", result["slug"])["body"] == "corpo novo"


def test_owner_editing_own_song_mutates_in_place(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    result = songs.update("u1", entry["slug"], songs.get("u1", entry["slug"])["header"], "corpo novo")
    # dono edita: mesma música (slug pode mudar por causa do título/gênero,
    # mas não é uma linha nova — sem sufixo "cifra editada por")
    assert "cifra editada por" not in result["titulo"]


def test_favoriting_someone_elses_song_does_not_clone(ctx, other_user_id):
    songs, _, _ = ctx
    entry = _create(songs)
    result = songs.set_favorite(other_user_id, entry["slug"], True)
    assert result["slug"] == entry["slug"]
    assert result["favorita"] is True
    # dono (u1) não vê a música como favorita — preferência é por usuário
    assert songs.get("u1", entry["slug"])["favorita"] is False


def test_non_owner_cannot_delete_song(ctx, other_user_id):
    songs, _, _ = ctx
    entry = _create(songs)
    with pytest.raises(NotOwner):
        songs.delete(other_user_id, entry["slug"])


def test_admin_can_delete_others_song(ctx, other_user_id):
    songs, _, _ = ctx
    entry = _create(songs)
    songs.delete(other_user_id, entry["slug"], is_admin=True)
    with pytest.raises(SongNotFound):
        songs.get("u1", entry["slug"])


# ---------- setlists compartilháveis + áudio (Fase 4) ----------

def test_shared_setlist_visible_to_other_user(ctx, other_user_id):
    songs, setlists, _ = ctx
    _create(songs)
    created = setlists.save("u1", "Show", ["Coldplay/Yellow"])
    got = setlists.get(other_user_id, created["id"])
    assert got["is_owner"] is False
    assert got["shared"] is True


def test_non_shared_setlist_hidden_from_other_user(ctx, other_user_id):
    songs, setlists, _ = ctx
    _create(songs)
    created = setlists.save("u1", "Show", ["Coldplay/Yellow"])
    setlists.set_shared("u1", created["id"], False)
    with pytest.raises(FileNotFoundError):
        setlists.get(other_user_id, created["id"])


def test_list_splits_mine_from_following_via_is_owner(ctx, other_user_id):
    songs, setlists, _ = ctx
    _create(songs)
    mine = setlists.save("u1", "Meu Show", ["Coldplay/Yellow"])
    setlists.save(other_user_id, "Show do Outro", ["Coldplay/Yellow"])

    by_id = {s["id"]: s for s in setlists.list("u1")}
    assert by_id[mine["id"]]["is_owner"] is True
    assert by_id["show-do-outro"]["is_owner"] is False


def test_unfollow_hides_setlist_from_list_without_affecting_others(ctx, other_user_id):
    songs, setlists, _ = ctx
    _create(songs)
    created = setlists.save("u1", "Show", ["Coldplay/Yellow"])
    assert created["id"] in [s["id"] for s in setlists.list(other_user_id)]

    setlists.unfollow(other_user_id, created["id"])
    assert created["id"] not in [s["id"] for s in setlists.list(other_user_id)]
    # não afeta o dono nem é uma exclusão de verdade — só some pra quem pediu
    assert created["id"] in [s["id"] for s in setlists.list("u1")]
    assert setlists.get("u1", created["id"])["nome"] == "Show"


def test_unfollow_of_unknown_setlist_raises_not_found(ctx, other_user_id):
    songs, setlists, _ = ctx
    with pytest.raises(FileNotFoundError):
        setlists.unfollow(other_user_id, "nao-existe")


def test_non_owner_cannot_save_or_delete_setlist(ctx, other_user_id):
    songs, setlists, _ = ctx
    _create(songs)
    created = setlists.save("u1", "Show", ["Coldplay/Yellow"])
    with pytest.raises(PermissionError):
        setlists.save(other_user_id, "Show alterado", ["Coldplay/Yellow"], created["id"])
    with pytest.raises(PermissionError):
        setlists.delete(other_user_id, created["id"])


def test_non_owner_cannot_toggle_sharing(ctx, other_user_id):
    songs, setlists, _ = ctx
    _create(songs)
    created = setlists.save("u1", "Show", ["Coldplay/Yellow"])
    with pytest.raises(PermissionError):
        setlists.set_shared(other_user_id, created["id"], False)


def test_admin_can_save_and_delete_others_setlist(ctx, other_user_id):
    songs, setlists, _ = ctx
    _create(songs)
    created = setlists.save("u1", "Show", ["Coldplay/Yellow"])
    setlists.save(other_user_id, "Show renomeado", ["Coldplay/Yellow"], created["id"], is_admin=True)
    setlists.delete(other_user_id, created["id"], is_admin=True)
    # excluído (deleted=true) — u1 (dono original) não vê mais, ninguém vê
    with pytest.raises(FileNotFoundError):
        setlists.get("u1", created["id"])
    with pytest.raises(FileNotFoundError):
        setlists.get(other_user_id, created["id"])


def test_owner_deleting_setlist_removes_it_from_everyones_view(ctx, other_user_id):
    """Reproduz o bug relatado: excluir um setlist tinha efeito NENHUM
    quando reatribuía a propriedade pra uma conta de arquivo fixa por
    username — se o próprio usuário que excluía FOSSE essa conta, a
    reatribuição virava um no-op e o setlist continuava aparecendo como
    "meu", renomeável, editável (ver setlist_service.py::delete, agora
    soft-delete via coluna `deleted`, sem depender de nenhuma conta
    específica)."""
    songs, setlists, _ = ctx
    _create(songs)
    created = setlists.save("u1", "Show", ["Coldplay/Yellow"])
    setlists.delete("u1", created["id"])

    # some da lista de quem excluiu...
    assert created["id"] not in [s["id"] for s in setlists.list("u1")]
    # ...não pode mais ser aberto por quem excluiu...
    with pytest.raises(FileNotFoundError):
        setlists.get("u1", created["id"])
    # ...nem por quem seguia (era shared=true por padrão)...
    with pytest.raises(FileNotFoundError):
        setlists.get(other_user_id, created["id"])
    # ...e não dá mais pra alternar o compartilhamento dele.
    with pytest.raises(FileNotFoundError):
        setlists.set_shared("u1", created["id"], True)
    # mas o conteúdo continua no banco, não foi perdido pra sempre.
    with db.get_pool().connection() as conn:
        row = conn.execute(
            "select nome, deleted from setlists where slug=%s", (created["id"],),
        ).fetchone()
    assert row["deleted"] is True and row["nome"] == "Show"


def test_clone_setlist_creates_own_copy(ctx, other_user_id):
    songs, setlists, _ = ctx
    _create(songs)
    created = setlists.save("u1", "Show", ["Coldplay/Yellow"])
    clone = setlists.clone(other_user_id, created["id"])

    assert clone["id"] != created["id"]
    got = setlists.get(other_user_id, clone["id"])
    assert got["is_owner"] is True
    assert got["nome"] == "Show (cópia)"
    assert [i["ref"] for i in got["items"]] == ["Coldplay/Yellow"]

    # o original continua do dono original, sem alteração
    original = setlists.get("u1", created["id"])
    assert original["nome"] == "Show"


def test_clone_of_non_shared_setlist_raises_not_found(ctx, other_user_id):
    songs, setlists, _ = ctx
    _create(songs)
    created = setlists.save("u1", "Show", ["Coldplay/Yellow"])
    setlists.set_shared("u1", created["id"], False)
    with pytest.raises(FileNotFoundError):
        setlists.clone(other_user_id, created["id"])


def test_non_owner_cannot_upload_audio(ctx, other_user_id):
    songs, _, audio = ctx
    entry = _create(songs)
    with pytest.raises(NotOwner):
        audio.save_track(other_user_id, entry["slug"], _FakeFile("track.mp3"))


def test_delete_removes_song_from_every_users_setlists(ctx, other_user_id):
    songs, setlists, _ = ctx
    entry = _create(songs)
    setlists.save("u1", "Show de u1", ["Coldplay/Yellow"])
    setlists.save(other_user_id, "Show de u2", ["Coldplay/Yellow"])
    songs.delete("u1", entry["slug"])
    for uid, setlist_id in (("u1", "show-de-u1"), (other_user_id, "show-de-u2")):
        items = setlists.get(uid, setlist_id)["items"]
        assert all("Yellow" not in i["ref"] for i in items)


def test_setlist_ref_resolves_after_title_gets_normalized_suffix(ctx):
    songs, setlists, _ = ctx
    entry = _create(songs)
    created = setlists.save("u1", "Show", ["Coldplay/Yellow"])
    songs.normalize("u1", entry["slug"])
    item = setlists.get("u1", created["id"])["items"][0]
    assert item["song"] is not None
    assert item["song"]["titulo"] == "Yellow - Coldplay"


def test_setlist_ref_resolves_when_added_with_already_normalized_title(ctx):
    """Reproduz o bug relatado: adicionar ao setlist uma música que JÁ
    estava normalizada (ref montada com o título completo, sufixo incluso —
    é assim que o SongPicker monta a ref a partir do resultado de busca)
    aparecia como "música não encontrada" — _resolve_many comparava o
    título do alvo (sufixado, porque veio de uma música já normalizada) com
    o do candidato (sempre sem sufixo) sem tirar o sufixo dos dois lados."""
    songs, setlists, _ = ctx
    entry = _create(songs)
    songs.normalize("u1", entry["slug"])
    ref = "Coldplay/Yellow - Coldplay"  # mesmo formato que o SongPicker monta
    created = setlists.save("u1", "Show", [ref])
    item = setlists.get("u1", created["id"])["items"][0]
    assert item["song"] is not None
    assert item["song"]["titulo"] == "Yellow - Coldplay"


def test_editing_song_interprete_repairs_existing_setlist_refs(ctx):
    """Reproduz o bug relatado ("Brigas" virando "não encontrada" depois de
    editada): setlist_items.ref guarda texto solto (não o id estável da
    música) — corrigir um dado ruim de importação (intérprete errado, ex.:
    "CIFRAS") quebrava silenciosamente qualquer setlist que já referenciava
    a música pelo nome antigo. _update_owned agora repara essas refs pro
    texto novo (ver SongsService._repair_setlist_refs)."""
    songs, setlists, _ = ctx
    entry = songs.create("u1", "Sertanejo", "CIFRAS", "Brigas", "@titulo: Brigas\n\ncorpo")
    created = setlists.save("u1", "Show", ["CIFRAS/Brigas"])
    item = setlists.get("u1", created["id"])["items"][0]
    assert item["song"] is not None  # resolve antes da edição

    data = songs.get("u1", entry["slug"])
    header = dict(data["header"])
    header["intérprete"] = "Bruno e Marrone"
    songs.update("u1", entry["slug"], header, data["body"])

    item_after = setlists.get("u1", created["id"])["items"][0]
    assert item_after["song"] is not None
    assert item_after["song"]["interprete"] == "Bruno e Marrone"


def test_editing_song_repairs_orphaned_ref_with_blank_artist(ctx):
    """Reproduz o bug relatado de novo, numa variante que _repair_setlist_refs
    sozinho NÃO cobre: uma ref com intérprete vazio/corrompido de um import
    antigo (aqui, ref = "/Cadeh Voceh" sem parte de artista nenhuma) nunca
    bate na identidade EXATA anterior da música (que já tinha o intérprete
    certo) — ficaria "não encontrada" pra sempre só com aquele mecanismo.
    _repair_orphaned_refs_for_song conserta pelo título, quando inequívoco."""
    songs, setlists, _ = ctx
    entry = songs.create("u1", "Sertanejo", "Leandro e Leonardo", "Cadeh Voceh", "@titulo: Cadeh Voceh\n\ncorpo")
    created = setlists.save("u1", "Show", ["/Cadeh Voceh"])
    item = setlists.get("u1", created["id"])["items"][0]
    assert item["song"] is None  # ref órfã (artista vazio) — não resolve ainda

    data = songs.get("u1", entry["slug"])
    header = dict(data["header"])
    header["tom"] = "G"  # qualquer save já dispara a segunda passada de reparo
    songs.update("u1", entry["slug"], header, data["body"])

    item_after = setlists.get("u1", created["id"])["items"][0]
    assert item_after["song"] is not None
    assert item_after["song"]["interprete"] == "Leandro e Leonardo"


def test_editing_song_does_not_repair_ambiguous_orphaned_ref(ctx):
    """Duas músicas DIFERENTES com o mesmo título — uma ref órfã com esse
    título é ambígua demais pra reatribuir sozinho; melhor deixar quebrada
    (e visível como tal) do que arriscar apontar pra música errada."""
    songs, setlists, _ = ctx
    songs.create("u1", "Rock", "Artista X", "Mesmo Nome", "@titulo: Mesmo Nome\n\ncorpo x")
    entry_y = songs.create("u1", "Rock", "Artista Y", "Mesmo Nome", "@titulo: Mesmo Nome\n\ncorpo y")
    created = setlists.save("u1", "Show", ["/Mesmo Nome"])

    data = songs.get("u1", entry_y["slug"])
    header = dict(data["header"])
    header["tom"] = "G"
    songs.update("u1", entry_y["slug"], header, data["body"])

    item_after = setlists.get("u1", created["id"])["items"][0]
    assert item_after["song"] is None  # continua órfã — não escolheu X nem Y


def test_editing_song_title_only_reformatting_does_not_touch_unrelated_refs(ctx):
    """Reformatar o título sem mudar a identidade (mesmo slugify) não deve
    varrer a tabela de setlist_items à toa — old_target == new_target,
    _repair_setlist_refs sai cedo."""
    songs, setlists, _ = ctx
    entry = _create(songs)  # Coldplay/Yellow
    created = setlists.save("u1", "Show", ["Coldplay/Yellow"])

    data = songs.get("u1", entry["slug"])
    header = dict(data["header"])
    header["nota"] = "5"  # muda algo irrelevante pra identidade
    songs.update("u1", entry["slug"], header, data["body"])

    item = setlists.get("u1", created["id"])["items"][0]
    assert item["song"] is not None
    assert item["ref"] == "Coldplay/Yellow"  # ref original, não reescrita


# ---------- músicas duplicadas ("mesmo nome, letra muito parecida") ----------

def test_duplicate_versions_scan_labels_similar_songs_by_creation_order(ctx):
    songs, _, _ = ctx
    body_a = "@titulo: Brigas\n\nAm  C  G\nMesma letra quase igual em tudo\nSó um detalhezinho mudou aqui"
    body_b = body_a.replace("detalhezinho", "detalhe")  # quase idêntico
    a = songs.create("u1", "Sertanejo", "Bruno e Marrone", "Brigas", body_a)
    b = songs.create("u1", "Sertanejo", "Bruno e Marrone", "Brigas", body_b)

    result = songs.duplicate_versions_scan()
    assert result == {"groups_found": 1, "songs_labeled": 2}
    assert songs.get("u1", a["slug"])["header"]["versao"] == "1"
    assert songs.get("u1", b["slug"])["header"]["versao"] == "2"


def test_duplicate_versions_scan_does_not_label_dissimilar_songs_with_same_name(ctx):
    songs, _, _ = ctx
    songs.create("u1", "Sertanejo", "Bruno e Marrone", "Brigas",
                  "@titulo: Brigas\n\nLetra completamente diferente aqui, nada a ver com a outra faixa")
    songs.create("u1", "Sertanejo", "Bruno e Marrone", "Brigas",
                  "@titulo: Brigas\n\nOutro texto qualquer, sem nenhuma semelhança relevante com o primeiro")

    result = songs.duplicate_versions_scan()
    assert result["groups_found"] == 1  # mesmo nome, então é candidato
    assert result["songs_labeled"] == 0  # mas a letra não bate o suficiente


def test_duplicate_versions_detected_automatically_on_create(ctx):
    """"Daqui pra frente" (item confirmado com o usuário): não precisa
    esperar a varredura manual — criar uma música que colide com outra já
    existente já dispara o agrupamento na hora (ver
    SongsService._check_duplicate_versions)."""
    songs, _, _ = ctx
    body = "@titulo: Brigas\n\nLetra numero um bem parecida com a proxima"
    songs.create("u1", "Sertanejo", "Bruno e Marrone", "Brigas", body)
    b = songs.create("u1", "Sertanejo", "Bruno e Marrone", "Brigas", body + " ")  # quase idêntica

    assert songs.get("u1", b["slug"])["header"]["versao"] == "2"


def test_duplicate_versions_status_reflects_pending_legacy_duplicates(ctx):
    """Simula duplicatas PRÉ-EXISTENTES (inseridas direto no banco, sem
    passar por create()/update() — mesma situação de músicas já na
    biblioteca antes desta funcionalidade existir) — só a varredura manual
    (duplicate_versions_scan) resolve essas."""
    songs, _, _ = ctx
    with db.get_pool().connection() as conn:
        for i in range(2):
            conn.execute(
                "insert into songs (slug, genero, titulo, interprete, body) "
                "values (%s, 'Sertanejo', 'Brigas', 'Bruno e Marrone', %s)",
                (f"legacy-brigas-{i}", "letra bem parecida em tudo, quase igual palavra por palavra"),
            )
    assert songs.duplicate_versions_status() == {"pending_groups": 1}

    result = songs.duplicate_versions_scan()
    assert result == {"groups_found": 1, "songs_labeled": 2}
    assert songs.duplicate_versions_status() == {"pending_groups": 0}


# ---------- link do YouTube (busca real, priorizada por setlists) ----------

class _FakeYoutube:
    """Duck-type de YoutubeService — devolve candidatos fixos (ou nenhum) por
    (intérprete, título), sem bater na API de verdade. Registra a ORDEM das
    chamadas, pra testar a priorização por setlist. `urls` mapeia pra uma
    lista de candidatos OU uma única URL (vira lista de 1 automaticamente)."""
    def __init__(self, urls=None, durations=None):
        self.urls = urls or {}
        self.durations = durations or {}  # (interprete, titulo) -> "mm:ss" do primeiro candidato
        self.calls = []

    def _candidates_for(self, interprete, titulo):
        value = self.urls.get((interprete, titulo))
        if not value:
            return []
        urls = value if isinstance(value, list) else [value]
        duration = self.durations.get((interprete, titulo))
        return [
            {"video_id": u.rsplit("=", 1)[-1], "title": titulo, "url": u,
             "duration": duration if i == 0 else None}
            for i, u in enumerate(urls)
        ]

    def search_videos(self, interprete, titulo, max_results=5):
        self.calls.append((interprete, titulo))
        return self._candidates_for(interprete, titulo)[:max_results]

    def search_video_url(self, interprete, titulo):
        self.calls.append((interprete, titulo))
        candidates = self._candidates_for(interprete, titulo)
        return candidates[0]["url"] if candidates else None


def test_youtube_link_status_counts_remaining_and_in_setlists(ctx):
    songs, setlists, _ = ctx
    songs.create("u1", "Pop", "Artista A", "Musica A", "@titulo: Musica A\n\ncorpo a")
    songs.create("u1", "Pop", "Artista B", "Musica B", "@titulo: Musica B\n\ncorpo b")
    setlists.save("u1", "Show", ["Artista B/Musica B"])

    assert songs.youtube_link_status() == {"remaining": 2, "remaining_in_setlists": 1}


def test_youtube_link_batch_prioritizes_songs_in_setlists(ctx):
    """Pedido do usuário: preencher automaticamente deve priorizar as
    músicas que estão em algum setlist."""
    songs, setlists, _ = ctx
    songs.create("u1", "Pop", "Artista A", "Musica A", "@titulo: Musica A\n\ncorpo a")
    songs.create("u1", "Pop", "Artista B", "Musica B", "@titulo: Musica B\n\ncorpo b")
    setlists.save("u1", "Show", ["Artista B/Musica B"])  # só "Musica B" está em uso

    fake = _FakeYoutube(urls={
        ("Artista A", "Musica A"): "https://www.youtube.com/watch?v=aaaaaaaaaaa",
        ("Artista B", "Musica B"): "https://www.youtube.com/watch?v=bbbbbbbbbbb",
    })
    songs.youtube = fake
    songs.youtube_link_batch(limit=1)  # só dá pra processar uma música

    assert fake.calls == [("Artista B", "Musica B")]  # a que está no setlist foi primeiro


def test_youtube_link_batch_saves_found_url(ctx):
    songs, _, _ = ctx
    entry = songs.create("u1", "Pop", "Artista C", "Musica C", "@titulo: Musica C\n\ncorpo c")
    songs.youtube = _FakeYoutube(urls={("Artista C", "Musica C"): "https://www.youtube.com/watch?v=ccccccccccc"})

    result = songs.youtube_link_batch(limit=10)
    assert result["found"] == 1
    assert songs.get("u1", entry["slug"])["header"]["youtube_url"] == "https://www.youtube.com/watch?v=ccccccccccc"


def test_youtube_link_batch_also_fills_execution_time_from_duration(ctx):
    """Reproduz o bug relatado: preencher o link em lote não preenchia
    "Tempo de execução" — só os fluxos interativos do editor (aceitar
    sugestão / colar link manualmente) setavam esse campo."""
    songs, _, _ = ctx
    entry = songs.create("u1", "Pop", "Artista E", "Musica E", "@titulo: Musica E\n\ncorpo e")
    songs.youtube = _FakeYoutube(
        urls={("Artista E", "Musica E"): "https://www.youtube.com/watch?v=fffffffffff"},
        durations={("Artista E", "Musica E"): "3:45"},
    )

    songs.youtube_link_batch(limit=10)
    header = songs.get("u1", entry["slug"])["header"]
    assert header["youtube_url"] == "https://www.youtube.com/watch?v=fffffffffff"
    assert header["tempoexecucao"] == "3:45"


def test_youtube_link_batch_leaves_unfound_songs_without_url(ctx):
    songs, _, _ = ctx
    entry = songs.create("u1", "Pop", "Artista D", "Musica D", "@titulo: Musica D\n\ncorpo d")
    songs.youtube = _FakeYoutube()  # sem resultado nenhum

    result = songs.youtube_link_batch(limit=10)
    assert result["found"] == 0
    assert songs.get("u1", entry["slug"])["header"]["youtube_url"] == ""


def test_suggest_youtube_candidates_returns_search_results(ctx):
    songs, _, _ = ctx
    entry = _create(songs)  # Coldplay/Yellow
    songs.youtube = _FakeYoutube(urls={("Coldplay", "Yellow"): [
        "https://www.youtube.com/watch?v=ddddddddddd",
        "https://www.youtube.com/watch?v=eeeeeeeeeee",
    ]})
    candidates = songs.suggest_youtube_candidates(entry["slug"])
    assert [c["url"] for c in candidates] == [
        "https://www.youtube.com/watch?v=ddddddddddd",
        "https://www.youtube.com/watch?v=eeeeeeeeeee",
    ]


def test_suggest_youtube_candidates_empty_when_nothing_found(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    songs.youtube = _FakeYoutube()
    assert songs.suggest_youtube_candidates(entry["slug"]) == []


def test_suggest_youtube_candidates_raises_without_youtube_service(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    songs.youtube = None
    with pytest.raises(RuntimeError):
        songs.suggest_youtube_candidates(entry["slug"])


def test_velocity_mapping():
    assert velocity_to_ms(1) == 10000
    assert velocity_to_ms(100) == 500
    assert 500 < velocity_to_ms(50) < 10000


def test_karaoke_payload(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["ms_per_line"] > 0 and len(payload["lines"]) >= 2


def test_karaoke_payload_includes_youtube_url(ctx):
    songs, _, audio = ctx
    entry = songs.create("u1", "Pop", "Coldplay", "Yellow",
                          "@titulo: Yellow\n@youtube_url: https://youtu.be/wjgrCnbxNqE\n\nB\nletra")
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["youtube_url"] == "https://youtu.be/wjgrCnbxNqE"


def test_karaoke_payload_defaults_youtube_url_empty(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["youtube_url"] == ""


def test_karaoke_payload_includes_owner_id(ctx):
    """Fase 8 (whitelabel): o player usa owner_id pra buscar a marca própria
    (nome da banda + logo) do dono da música."""
    songs, _, audio = ctx
    entry = _create(songs)
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["owner_id"] == "u1"


def test_karaoke_payload_admin_can_play_private_song_of_other_user(ctx):
    songs, _, audio = ctx
    _make_private_user("u3", "privado")
    entry = songs.create("u3", "Pop", "Coldplay", "Segredo", "@titulo: Segredo\n\ncorpo")
    k = KaraokeService(songs, audio)
    with pytest.raises(SongNotFound):
        k.payload("u1", entry["slug"])
    payload = k.payload("u1", entry["slug"], is_admin=True)
    assert payload["ms_per_line"] > 0


def test_karaoke_payload_classifies_lines(ctx):
    songs, _, audio = ctx
    entry = songs.create(
        "u1", "Rock", "Queen", "Bohemian Rhapsody",
        "@titulo: Bohemian Rhapsody\n@tom: Bb\n@velocidade: 40\n\n"
        "Intro:\nGm7          C7\nIs this the real life?\n(repete)",
    )
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    tipos = [l["tipo"] for l in payload["lines"]]
    assert tipos == ["observacao", "acorde", "letra", "observacao"]


def test_karaoke_payload_transposes_chords_live_without_persisting(ctx):
    """semitones= é só pra esta resposta (ver medley, ScrollPlayer.jsx) —
    nunca grava nada na música."""
    songs, _, audio = ctx
    entry = songs.create(
        "u1", "Rock", "Queen", "Bohemian Rhapsody",
        "@titulo: Bohemian Rhapsody\n@tom: C\n@velocidade: 40\n\n"
        "C          G\nIs this the real life?",
    )
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"], semitones=2)
    assert payload["tom"] == "D"
    acorde_line = next(l for l in payload["lines"] if l["tipo"] == "acorde")
    assert "D" in acorde_line["text"] and "A" in acorde_line["text"]

    original = k.payload("u1", entry["slug"])
    assert original["tom"] == "C"
    saved = songs.get("u1", entry["slug"])
    assert saved["header"]["tom"] == "C"


def test_karaoke_payload_hides_oculta_lines(ctx):
    songs, _, audio = ctx
    entry = songs.create(
        "u1", "Rock", "Queen", "Bohemian Rhapsody",
        "@titulo: Bohemian Rhapsody\n@tom: Bb\n@velocidade: 40\n\n"
        "[@observacao:oculta] conferir acorde com o áudio original\n"
        "Is this the real life?",
    )
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert len(payload["lines"]) == 1
    assert payload["lines"][0]["text"] == "Is this the real life?"


def test_karaoke_payload_has_audio_false_by_default(ctx):
    """Regressão crítica: músicas sem áudio (todo o acervo hoje) não podem mudar de comportamento."""
    songs, _, audio = ctx
    entry = _create(songs)
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["has_audio"] is False
    assert payload["samples"] == []


def test_karaoke_payload_has_audio_true_after_upload(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    audio.save_track("u1", entry["slug"], _FakeFile("faixa.mp3"))
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["has_audio"] is True


def test_karaoke_payload_synth_ready_defaults_false(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["bpm"] is None
    assert payload["instrumentos"] == {"bateria": False, "guitarra": False, "baixo": False, "teclado": False}
    assert payload["synth_ready"] is False


def test_karaoke_payload_synth_ready_true_with_bpm_and_instrument(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    header = songs.get("u1", entry["slug"])["header"]
    header = {**header, "bpm": "90", "bateria": "sim"}
    songs.update("u1", entry["slug"], header, songs.get("u1", entry["slug"])["body"])
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["bpm"] == 90
    assert payload["instrumentos"]["bateria"] is True
    assert payload["synth_ready"] is True


def test_karaoke_payload_synth_ready_false_when_audio_uploaded(ctx):
    """Regressão: acompanhamento sintetizado nunca assume o palco por cima de áudio real."""
    songs, _, audio = ctx
    entry = _create(songs)
    header = songs.get("u1", entry["slug"])["header"]
    header = {**header, "bpm": "90", "bateria": "sim"}
    songs.update("u1", entry["slug"], header, songs.get("u1", entry["slug"])["body"])
    audio.save_track("u1", entry["slug"], _FakeFile("faixa.mp3"))
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["synth_ready"] is False


def test_karaoke_payload_synth_ready_false_without_instrument(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    header = songs.get("u1", entry["slug"])["header"]
    header = {**header, "bpm": "90"}
    songs.update("u1", entry["slug"], header, songs.get("u1", entry["slug"])["body"])
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["synth_ready"] is False


def test_karaoke_payload_defaults_to_rolagem_mode(ctx):
    """Acervo existente (sem @modoexecucao) deve tocar em modo rolagem por padrão."""
    songs, _, audio = ctx
    entry = _create(songs)
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["modo_execucao"] == "rolagem"
    assert payload["tempo_execucao_segundos"] is None


def test_karaoke_payload_respects_karaoke_mode(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    header = songs.get("u1", entry["slug"])["header"]
    header = {**header, "modoexecucao": "karaoke"}
    songs.update("u1", entry["slug"], header, songs.get("u1", entry["slug"])["body"])
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["modo_execucao"] == "karaoke"


def test_karaoke_payload_parses_tempo_execucao(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    header = songs.get("u1", entry["slug"])["header"]
    header = {**header, "tempoexecucao": "03:30"}
    songs.update("u1", entry["slug"], header, songs.get("u1", entry["slug"])["body"])
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["tempo_execucao"] == "03:30"
    assert payload["tempo_execucao_segundos"] == 210


def test_karaoke_payload_resolves_sample_with_time_and_upload(ctx):
    songs, _, audio = ctx
    entry = songs.create(
        "u1", "Rock", "Queen", "Bohemian Rhapsody",
        "@titulo: Bohemian Rhapsody\n@tom: Bb\n@velocidade: 40\n\n"
        "[t=42.5] [@sample] Solo de Guitarra\n"
        "[@sample] Sem Tempo Marcado\n"
        "[t=50] [@sample] Nunca Enviado\n"
        "Letra normal",
    )
    audio.save_sample("u1", entry["slug"], _FakeFile("solo.mp3"), "Solo de Guitarra")
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["samples"] == [{"id": "solo-de-guitarra", "nome": "Solo de Guitarra", "t": 42.5}]


def test_karaoke_payload_defaults_modo_pedal_empty(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    k = KaraokeService(songs, audio, ClipQueueService(songs))
    payload = k.payload("u1", entry["slug"])
    assert payload["modo_pedal"] == "" and payload["clips"] == []


def test_karaoke_payload_lists_clips_in_fila_clipes_mode(ctx, fake_blob_store):
    songs, _, audio = ctx
    clips = ClipQueueService(songs)
    entry = _create(songs)
    header = songs.get("u1", entry["slug"])["header"]
    header = {**header, "modopedal": "fila_clipes"}
    songs.update("u1", entry["slug"], header, songs.get("u1", entry["slug"])["body"])
    clips.save_clip("u1", entry["slug"], _FakeFile("a.mp3"), "Intro")
    clips.save_clip("u1", entry["slug"], _FakeFile("b.mp3"), "Solo")
    k = KaraokeService(songs, audio, clips)
    payload = k.payload("u1", entry["slug"])
    assert payload["modo_pedal"] == "fila_clipes"
    assert [c["nome"] for c in payload["clips"]] == ["Intro", "Solo"]


def test_karaoke_payload_omits_clips_in_faixa_completa_mode(ctx, fake_blob_store):
    songs, _, audio = ctx
    clips = ClipQueueService(songs)
    entry = _create(songs)
    header = songs.get("u1", entry["slug"])["header"]
    header = {**header, "modopedal": "faixa_completa"}
    songs.update("u1", entry["slug"], header, songs.get("u1", entry["slug"])["body"])
    clips.save_clip("u1", entry["slug"], _FakeFile("a.mp3"), "Intro")
    k = KaraokeService(songs, audio, clips)
    payload = k.payload("u1", entry["slug"])
    assert payload["modo_pedal"] == "faixa_completa"
    assert payload["clips"] == []
