"""Pesquisa sobre a tabela `songs` via SQL — substitui o índice em memória
(IndexService) por queries diretas: sempre corretas/atualizadas, sem
precisar reconstruir nada. Busca fuzzy usa `pg_trgm::similarity()` no lugar
do `rapidfuzz` de antes (mesma ideia — aproximação por texto parecido —
threshold não é diretamente comparável ao antigo, só a mesma finalidade).

Biblioteca compartilhada, não mais 100% global: a busca vale sobre as
músicas que o usuário PODE VER — próprias, marcadas como compartilhadas
(`songs.shared`), ou órfãs (dono excluído) — não sobre o acervo inteiro
incondicionalmente (ver `_VISIBLE_SQL`, mesma condição de
songs_service.py). `only_mine=True` restringe ainda mais, só às músicas
criadas pelo usuário. `favorita`/`nota` não são mais colunas de `songs`
(são preferência de quem vê, ver `user_song_prefs`) — todo SELECT aqui faz
LEFT JOIN nessa tabela pro usuário logado pra continuar devolvendo o valor
certo por pessoa."""
from __future__ import annotations

import db
from services.songs_service import _row_to_dict

MAX_PAGE_SIZE = 500
_SORTABLE = {"titulo", "autor", "interprete", "genero", "tom", "ritmo", "velocidade", "nota", "slug"}
_SIMILARITY_THRESHOLD = 0.25

# Sem header/body — a listagem não usa (_row_to_dict só lê estas colunas),
# e são as colunas grandes (corpo inteiro da cifra, cabeçalho em jsonb); num
# acervo grande, incluí-las no SELECT * de toda busca/dashboard multiplicava
# o payload por linha à toa. "songs." explícito porque toda query aqui faz
# LEFT JOIN com user_song_prefs, que também tem uma coluna user_id.
_LIST_COLUMNS = (
    "songs.slug, songs.titulo, songs.autor, songs.interprete, songs.genero, songs.tom, "
    "songs.ritmo, songs.tags, songs.velocidade, songs.normalizada, songs.user_id, songs.shared"
)
_PREFS_JOIN = "left join user_song_prefs p on p.song_id = songs.id and p.user_id = %(user_id)s"
_PREFS_SELECT = "coalesce(p.favorita, false) as favorita, coalesce(p.nota, '') as nota"

# visibilidade multi-tenant — mesma condição de songs_service.py::_VISIBLE_SQL
# (mantida separada aqui pra não criar um import cruzado só por uma string).
_VISIBLE_SQL = "(songs.user_id = %(user_id)s OR songs.shared = true OR songs.user_id IS NULL)"


def _rows_to_dicts(rows: list[dict]) -> list[dict]:
    return [_row_to_dict(r) for r in rows]


class SearchService:
    def search(
        self,
        user_id: str,
        q: str = "",
        genero: str = "",
        interprete: str = "",
        tom: str = "",
        ritmo: str = "",
        tag: str = "",
        favoritas: bool = False,
        only_mine: bool = False,
        page: int = 1,
        page_size: int = 50,
        sort: str = "titulo",
    ) -> dict:
        where = [_VISIBLE_SQL]
        params: dict = {"user_id": user_id}

        if only_mine:
            where.append("songs.user_id = %(user_id)s")
        if genero:
            where.append("lower(songs.genero) = lower(%(genero)s)")
            params["genero"] = genero
        if interprete:
            where.append("songs.interprete ILIKE %(interprete)s")
            params["interprete"] = f"%{interprete}%"
        if tom:
            where.append("lower(trim(songs.tom)) = lower(trim(%(tom)s))")
            params["tom"] = tom
        if ritmo:
            where.append("songs.ritmo ILIKE %(ritmo)s")
            params["ritmo"] = f"%{ritmo}%"
        if tag:
            where.append("EXISTS (SELECT 1 FROM unnest(songs.tags) t WHERE lower(t) = lower(%(tag)s))")
            params["tag"] = tag
        if favoritas:
            where.append("coalesce(p.favorita, false) = true")

        where_sql = " AND ".join(where)

        page = max(1, page)
        page_size = max(1, min(page_size, MAX_PAGE_SIZE))
        params["limit"] = page_size
        params["offset"] = (page - 1) * page_size

        # LIMIT/OFFSET no SQL (com count(*) OVER() pro total) em vez de
        # trazer a tabela inteira pra paginar em Python — com um acervo
        # grande (`body` é o texto completo da cifra), buscar tudo a cada
        # busca/dashboard não escala.
        if q:
            params["q"] = q
            params["qlike"] = f"%{q}%"
            score_expr = """
                CASE
                    WHEN songs.titulo ILIKE %(qlike)s OR songs.autor ILIKE %(qlike)s OR songs.interprete ILIKE %(qlike)s
                         OR EXISTS (SELECT 1 FROM unnest(songs.tags) t WHERE t ILIKE %(qlike)s)
                    THEN 100 + (CASE WHEN songs.titulo ILIKE %(qlike)s THEN 10 ELSE 0 END)
                    ELSE GREATEST(similarity(songs.titulo, %(q)s), similarity(songs.autor, %(q)s), similarity(songs.interprete, %(q)s)) * 100
                END
            """
            sql = f"""
                SELECT {_LIST_COLUMNS}, {_PREFS_SELECT}, ({score_expr}) AS score, count(*) OVER() AS total_count
                FROM songs {_PREFS_JOIN}
                WHERE {where_sql} AND (
                    songs.titulo ILIKE %(qlike)s OR songs.autor ILIKE %(qlike)s OR songs.interprete ILIKE %(qlike)s
                    OR EXISTS (SELECT 1 FROM unnest(songs.tags) t WHERE t ILIKE %(qlike)s)
                    OR similarity(songs.titulo, %(q)s) > {_SIMILARITY_THRESHOLD}
                    OR similarity(songs.autor, %(q)s) > {_SIMILARITY_THRESHOLD}
                    OR similarity(songs.interprete, %(q)s) > {_SIMILARITY_THRESHOLD}
                )
                ORDER BY score DESC, songs.titulo ASC
                LIMIT %(limit)s OFFSET %(offset)s
            """
        else:
            sort_key = sort.lstrip("-")
            if sort_key not in _SORTABLE:
                sort_key = "titulo"
            direction = "DESC" if sort.startswith("-") else "ASC"
            sql = f"""SELECT {_LIST_COLUMNS}, {_PREFS_SELECT}, count(*) OVER() AS total_count
                      FROM songs {_PREFS_JOIN}
                      WHERE {where_sql}
                      ORDER BY songs.{sort_key} {direction} LIMIT %(limit)s OFFSET %(offset)s"""

        with db.get_pool().connection() as conn:
            rows = conn.execute(sql, params).fetchall()

        total = rows[0]["total_count"] if rows else 0

        return {
            "items": _rows_to_dicts(rows),
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": max(1, -(-total // page_size)),
        }

    def get_by_slugs(self, user_id: str, slugs: list[str]) -> list[dict]:
        """Busca pontual por um punhado de slugs específicos (ex.: resolver
        `most_played`/`recent` do dashboard, que só precisa de ~16 músicas
        das plays, não de trazer o acervo inteiro pra achar essas poucas)."""
        if not slugs:
            return []
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                f"""SELECT {_LIST_COLUMNS}, {_PREFS_SELECT} FROM songs {_PREFS_JOIN}
                    WHERE songs.slug = ANY(%(slugs)s) AND {_VISIBLE_SQL}""",
                {"user_id": user_id, "slugs": slugs},
            ).fetchall()
        return _rows_to_dicts(rows)

    def facets(self, user_id: str) -> dict:
        """Valores distintos pra popular filtros no frontend — biblioteca
        inteira que o usuário pode ver (própria + compartilhada + órfã),
        não mais por música que ele criou, mas também não vazando valores
        de música privada alheia pros dropdowns de outra pessoa."""
        with db.get_pool().connection() as conn:
            generos = conn.execute(
                f"select distinct genero from songs where genero != '' and {_VISIBLE_SQL} order by 1",
                {"user_id": user_id},
            ).fetchall()
            interpretes = conn.execute(
                f"select distinct interprete from songs where interprete != '' and {_VISIBLE_SQL} order by 1",
                {"user_id": user_id},
            ).fetchall()
            tons = conn.execute(
                f"select distinct tom from songs where tom != '' and {_VISIBLE_SQL} order by 1",
                {"user_id": user_id},
            ).fetchall()
            ritmos = conn.execute(
                f"select distinct ritmo from songs where ritmo != '' and {_VISIBLE_SQL} order by 1",
                {"user_id": user_id},
            ).fetchall()
            tags = conn.execute(
                f"select distinct unnest(tags) as tag from songs where {_VISIBLE_SQL} order by 1",
                {"user_id": user_id},
            ).fetchall()
        return {
            "generos": [r["genero"] for r in generos],
            "interpretes": [r["interprete"] for r in interpretes],
            "tons": [r["tom"] for r in tons],
            "ritmos": [r["ritmo"] for r in ritmos],
            "tags": [r["tag"] for r in tags],
        }
