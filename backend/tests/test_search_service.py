import pytest

from services.search_service import SearchService
from services.songs_service import SongsService

DEMO_SONGS = [
    ("Rock", "Queen", "Bohemian Rhapsody", "Bb", "balada", "rock,classico"),
    ("Pop", "Coldplay", "Yellow", "B", "pop rock", "romantica"),
    ("MPB", "Legião Urbana", "Tempo Perdido", "Em", "rock nacional", "rock,nacional"),
    ("Louvor", "Fernandinho", "Grandes Coisas", "G", "adoração", "adoracao"),
]


@pytest.fixture
def ctx(user_id):
    songs = SongsService()
    for genero, artista, titulo, tom, ritmo, tags in DEMO_SONGS:
        content = f"@titulo: {titulo}\n@tom: {tom}\n@ritmomusical: {ritmo}\n@tags: {tags}\n\ncorpo"
        songs.create("u1", genero, artista, titulo, content)
    songs.set_favorite("u1", "rock--queen--bohemian-rhapsody", True)
    return songs, SearchService()


def test_search_no_filters_returns_all_sorted_by_titulo(ctx):
    _, search = ctx
    page = search.search("u1", page_size=50)
    assert page["total"] == 4
    assert [i["titulo"] for i in page["items"]] == sorted(i["titulo"] for i in page["items"])


def test_filter_by_genero(ctx):
    _, search = ctx
    page = search.search("u1", genero="Rock")
    assert [i["titulo"] for i in page["items"]] == ["Bohemian Rhapsody"]


def test_filter_by_interprete_is_substring(ctx):
    _, search = ctx
    page = search.search("u1", interprete="cold")
    assert [i["titulo"] for i in page["items"]] == ["Yellow"]


def test_filter_by_tom_exact(ctx):
    _, search = ctx
    page = search.search("u1", tom="Em")
    assert [i["titulo"] for i in page["items"]] == ["Tempo Perdido"]


def test_filter_by_favoritas(ctx):
    _, search = ctx
    page = search.search("u1", favoritas=True)
    assert [i["titulo"] for i in page["items"]] == ["Bohemian Rhapsody"]


def test_filter_by_favoritas_includes_favorite_artist_and_genre(ctx):
    """Fase 6: "favoritas" passa a ser (música favoritada) OR (artista
    favorito) OR (gênero favorito) — Bohemian Rhapsody é favoritada
    diretamente (ver fixture), Yellow entra por artista (Coldplay) e
    Grandes Coisas por gênero (Louvor); Tempo Perdido não entra em nenhum
    dos três critérios."""
    _, search = ctx
    page = search.search(
        "u1", favoritas=True,
        favorite_interpretes=["Coldplay"], favorite_generos=["Louvor"],
    )
    assert set(i["titulo"] for i in page["items"]) == {"Bohemian Rhapsody", "Yellow", "Grandes Coisas"}


def test_sort_by_created_at_descending(ctx):
    """Fase 7 (Dashboard v2): "created_at" virou uma chave de ordenação
    válida (newly_added_songs) — checa contra a ordem ascendente em vez de
    contra timestamps exatos, pra não depender de quão rápido as músicas da
    fixture foram inseridas."""
    _, search = ctx
    asc = [i["titulo"] for i in search.search("u1", sort="created_at")["items"]]
    desc = [i["titulo"] for i in search.search("u1", sort="-created_at")["items"]]
    assert desc == asc[::-1]


def test_filter_by_tag(ctx):
    _, search = ctx
    page = search.search("u1", tag="rock")
    titles = {i["titulo"] for i in page["items"]}
    assert titles == {"Bohemian Rhapsody", "Tempo Perdido"}


def test_free_text_substring_match(ctx):
    _, search = ctx
    page = search.search("u1", q="bohemi")
    assert page["items"][0]["titulo"] == "Bohemian Rhapsody"


def test_free_text_fuzzy_match_tolerates_typo(ctx):
    _, search = ctx
    page = search.search("u1", q="boemian rapsody")
    assert any(i["titulo"] == "Bohemian Rhapsody" for i in page["items"])


def test_free_text_no_match_returns_empty(ctx):
    _, search = ctx
    page = search.search("u1", q="xyzxyzxyz-nao-existe")
    assert page["total"] == 0


def test_pagination(ctx):
    _, search = ctx
    page1 = search.search("u1", page=1, page_size=2)
    page2 = search.search("u1", page=2, page_size=2)
    assert page1["total_pages"] == 2
    assert len(page1["items"]) == 2 and len(page2["items"]) == 2
    assert {i["slug"] for i in page1["items"]}.isdisjoint({i["slug"] for i in page2["items"]})


def test_sort_descending(ctx):
    _, search = ctx
    page = search.search("u1", sort="-titulo")
    assert [i["titulo"] for i in page["items"]] == sorted((i["titulo"] for i in page["items"]), reverse=True)


def test_sort_rejects_unknown_column_falls_back_to_titulo(ctx):
    """`sort` vira ORDER BY direto — precisa validar contra um allowlist, não interpolar o valor do usuário como coluna sem checar."""
    _, search = ctx
    page = search.search("u1", sort="id; drop table songs; --")
    assert page["total"] == 4  # não quebrou, só ignorou o valor inválido e ordenou por titulo


def test_facets(ctx):
    _, search = ctx
    facets = search.facets("u1")
    assert facets["generos"] == ["Louvor", "MPB", "Pop", "Rock"]
    assert set(facets["tags"]) == {"adoracao", "classico", "nacional", "romantica", "rock"}


def test_facets_are_global_not_per_user(ctx):
    """Biblioteca global: facetas cobrem o acervo inteiro, não só as músicas
    que o usuário logado criou — antes disso ficava isolado por usuário."""
    songs, search = ctx
    with_extra_user = SongsService()
    import db
    with db.get_pool().connection() as conn:
        conn.execute("insert into users (id, username, name, password_hash) values ('u2','o2','O2','x')")
    with_extra_user.create("u2", "Jazz", "Miles Davis", "So What", "@titulo: So What\n\ncorpo")
    facets = search.facets("u1")
    assert "Jazz" in facets["generos"]


def test_search_is_global_by_default(ctx, other_user_id):
    songs, search = ctx
    songs.create(other_user_id, "Jazz", "Miles Davis", "So What", "@titulo: So What\n\ncorpo")
    page = search.search("u1")
    assert "So What" in [i["titulo"] for i in page["items"]]


def test_only_mine_filters_to_own_songs(ctx, other_user_id):
    songs, search = ctx
    songs.create(other_user_id, "Jazz", "Miles Davis", "So What", "@titulo: So What\n\ncorpo")
    page = search.search("u1", only_mine=True)
    assert "So What" not in [i["titulo"] for i in page["items"]]
    assert page["total"] == len(DEMO_SONGS)


def test_favorita_is_per_user_in_search_results(ctx, other_user_id):
    _, search = ctx
    # u1 favoritou Bohemian Rhapsody (na fixture) — u2 não vê como favorita
    page = search.search(other_user_id)
    item = next(i for i in page["items"] if i["titulo"] == "Bohemian Rhapsody")
    assert item["favorita"] is False
