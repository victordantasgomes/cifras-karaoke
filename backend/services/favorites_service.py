"""Favoritos de gênero/intérprete (Fase 6, itens 11+14 do plano — unificados
por decisão do usuário). Complementa user_song_prefs (favorito de MÚSICA
específica): aqui o favorito é sobre o VALOR do facet (texto livre, mesma
convenção de search_service.py::facets() — sem tabela normalizada de
artistas/gêneros)."""
from __future__ import annotations

import db


class FavoritesService:
    def list_favorites(self, user_id: str) -> dict:
        with db.get_pool().connection() as conn:
            artists = conn.execute(
                "select interprete from user_favorite_artists where user_id=%s order by 1",
                (user_id,),
            ).fetchall()
            genres = conn.execute(
                "select genero from user_favorite_genres where user_id=%s order by 1",
                (user_id,),
            ).fetchall()
        return {
            "artists": [r["interprete"] for r in artists],
            "genres": [r["genero"] for r in genres],
        }

    def set_favorite_artist(self, user_id: str, interprete: str, value: bool) -> None:
        interprete = interprete.strip()
        if not interprete:
            return
        with db.get_pool().connection() as conn:
            if value:
                conn.execute(
                    """insert into user_favorite_artists (user_id, interprete) values (%s, %s)
                       on conflict (user_id, interprete) do nothing""",
                    (user_id, interprete),
                )
            else:
                conn.execute(
                    "delete from user_favorite_artists where user_id=%s and interprete=%s",
                    (user_id, interprete),
                )

    def set_favorite_genre(self, user_id: str, genero: str, value: bool) -> None:
        genero = genero.strip()
        if not genero:
            return
        with db.get_pool().connection() as conn:
            if value:
                conn.execute(
                    """insert into user_favorite_genres (user_id, genero) values (%s, %s)
                       on conflict (user_id, genero) do nothing""",
                    (user_id, genero),
                )
            else:
                conn.execute(
                    "delete from user_favorite_genres where user_id=%s and genero=%s",
                    (user_id, genero),
                )
