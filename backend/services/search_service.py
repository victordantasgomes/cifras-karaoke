"""Pesquisa sobre a tabela `songs` via SQL — substitui o índice em memória
(IndexService) por queries diretas: sempre corretas/atualizadas, sem
precisar reconstruir nada. Busca fuzzy usa `pg_trgm::similarity()` no lugar
do `rapidfuzz` de antes (mesma ideia — aproximação por texto parecido —
threshold não é diretamente comparável ao antigo, só a mesma finalidade)."""
from __future__ import annotations

import db
from services.songs_service import _row_to_dict

MAX_PAGE_SIZE = 500
_SORTABLE = {"titulo", "autor", "interprete", "genero", "tom", "ritmo", "velocidade", "nota", "slug"}
_SIMILARITY_THRESHOLD = 0.25

# Sem header/body — a listagem não usa (_row_to_dict só lê estas colunas),
# e são as colunas grandes (corpo inteiro da cifra, cabeçalho em jsonb); num
# acervo grande, incluí-las no SELECT * de toda busca/dashboard multiplicava
# o payload por linha à toa.
_LIST_COLUMNS = "slug, titulo, autor, interprete, genero, tom, ritmo, tags, velocidade, nota, favorita"


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
        page: int = 1,
        page_size: int = 50,
        sort: str = "titulo",
    ) -> dict:
        where = ["user_id = %(user_id)s"]
        params: dict = {"user_id": user_id}

        if genero:
            where.append("lower(genero) = lower(%(genero)s)")
            params["genero"] = genero
        if interprete:
            where.append("interprete ILIKE %(interprete)s")
            params["interprete"] = f"%{interprete}%"
        if tom:
            where.append("lower(trim(tom)) = lower(trim(%(tom)s))")
            params["tom"] = tom
        if ritmo:
            where.append("ritmo ILIKE %(ritmo)s")
            params["ritmo"] = f"%{ritmo}%"
        if tag:
            where.append("EXISTS (SELECT 1 FROM unnest(tags) t WHERE lower(t) = lower(%(tag)s))")
            params["tag"] = tag
        if favoritas:
            where.append("favorita = true")

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
                    WHEN titulo ILIKE %(qlike)s OR autor ILIKE %(qlike)s OR interprete ILIKE %(qlike)s
                         OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE %(qlike)s)
                    THEN 100 + (CASE WHEN titulo ILIKE %(qlike)s THEN 10 ELSE 0 END)
                    ELSE GREATEST(similarity(titulo, %(q)s), similarity(autor, %(q)s), similarity(interprete, %(q)s)) * 100
                END
            """
            sql = f"""
                SELECT {_LIST_COLUMNS}, ({score_expr}) AS score, count(*) OVER() AS total_count FROM songs
                WHERE {where_sql} AND (
                    titulo ILIKE %(qlike)s OR autor ILIKE %(qlike)s OR interprete ILIKE %(qlike)s
                    OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE %(qlike)s)
                    OR similarity(titulo, %(q)s) > {_SIMILARITY_THRESHOLD}
                    OR similarity(autor, %(q)s) > {_SIMILARITY_THRESHOLD}
                    OR similarity(interprete, %(q)s) > {_SIMILARITY_THRESHOLD}
                )
                ORDER BY score DESC, titulo ASC
                LIMIT %(limit)s OFFSET %(offset)s
            """
        else:
            sort_key = sort.lstrip("-")
            if sort_key not in _SORTABLE:
                sort_key = "titulo"
            direction = "DESC" if sort.startswith("-") else "ASC"
            sql = f"""SELECT {_LIST_COLUMNS}, count(*) OVER() AS total_count FROM songs WHERE {where_sql}
                      ORDER BY {sort_key} {direction} LIMIT %(limit)s OFFSET %(offset)s"""

        with db.get_pool().connection() as conn:
            rows = conn.execute(sql, params).fetchall()

        total = rows[0]["total_count"] if rows else 0

        return {
            "items": [_row_to_dict(r) for r in rows],
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
                f"SELECT {_LIST_COLUMNS} FROM songs WHERE user_id=%s AND slug = ANY(%s)",
                (user_id, slugs),
            ).fetchall()
        return [_row_to_dict(r) for r in rows]

    def facets(self, user_id: str) -> dict:
        """Valores distintos para popular filtros no frontend."""
        with db.get_pool().connection() as conn:
            generos = conn.execute(
                "select distinct genero from songs where user_id=%s and genero != '' order by 1", (user_id,)
            ).fetchall()
            interpretes = conn.execute(
                "select distinct interprete from songs where user_id=%s and interprete != '' order by 1", (user_id,)
            ).fetchall()
            tons = conn.execute(
                "select distinct tom from songs where user_id=%s and tom != '' order by 1", (user_id,)
            ).fetchall()
            ritmos = conn.execute(
                "select distinct ritmo from songs where user_id=%s and ritmo != '' order by 1", (user_id,)
            ).fetchall()
            tags = conn.execute(
                "select distinct unnest(tags) as tag from songs where user_id=%s order by 1", (user_id,)
            ).fetchall()
        return {
            "generos": [r["genero"] for r in generos],
            "interpretes": [r["interprete"] for r in interpretes],
            "tons": [r["tom"] for r in tons],
            "ritmos": [r["ritmo"] for r in ritmos],
            "tags": [r["tag"] for r in tags],
        }
