"""Limites de plano (Fase 9) — nº de setlists e espaço de armazenamento por
usuário. Prioridade de resolução (ver _plan_limits):
  1. Admin (`users.is_admin`) — sempre usa a linha singleton `plans` com
     kind='admin' ("Administrador"), configurável na tela de Configurações.
     Nunca fica sem limite só por ser admin (decisão explícita — antes
     disso, admin era sempre ilimitado; agora é um número de verdade,
     só que geralmente bem folgado).
  2. Plano pago atribuído (`users.plan_id`) — vale o limite daquele plano.
  3. Grandfathered (`users.plan_grandfathered` — contas de antes dos
     planos pagos, ou criadas por um admin via POST /admin/users) —
     continuam sem limite nenhum, mesmo comportamento de sempre.
  4. Qualquer outro caso (cadastro público novo, não-admin) — usa a linha
     singleton `plans` com kind='guest' ("Convidado"), também configurável
     na tela de Configurações — ver AuthService.register(grandfathered=False).

Armazenamento (Decisão §12/§13): soma `size_bytes` de faixa+samples+clipes
só das músicas alcançáveis pelos setlists dos quais o usuário É DONO — não
todas as músicas que ele criou, nem setlists de terceiros que ele só
enxerga por estarem compartilhados. `setlist_items.ref` não tem FK direta
pra `songs` (é texto cru "Artista/Título"), então a resolução usa a mesma
busca fuzzy de SetlistService._resolve_many — sem FK nova, de propósito
(mantém o escopo desta fase contido)."""
from __future__ import annotations

import db


class QuotaExceeded(Exception):
    pass


class QuotaService:
    def __init__(self, setlists=None):
        self.setlists = setlists  # injetado depois pra evitar ciclo com SetlistService

    def _kind_limits(self, conn, kind: str) -> dict | None:
        row = conn.execute(
            "select max_setlists, storage_limit_mb from plans where kind=%s", (kind,),
        ).fetchone()
        return dict(row) if row else None  # None só se o seed de schema.sql nunca rodou

    def _plan_limits(self, conn, user_id: str) -> dict | None:
        """None = sem limite nenhum (só possível pra conta grandfathered
        sem plano pago — admin e "convidado" agora sempre têm um número,
        configurável na tela de Configurações)."""
        row = conn.execute(
            """select u.is_admin, u.plan_grandfathered, p.max_setlists, p.storage_limit_mb
               from users u left join plans p on p.id = u.plan_id where u.id = %s""",
            (user_id,),
        ).fetchone()
        if not row:
            return None
        if row["is_admin"]:
            return self._kind_limits(conn, "admin")
        if row["max_setlists"] is not None:
            return {"max_setlists": row["max_setlists"], "storage_limit_mb": row["storage_limit_mb"]}
        if row["plan_grandfathered"]:
            return None
        return self._kind_limits(conn, "guest")

    def _owned_song_slugs(self, conn, user_id: str, exclude_setlist_pk: str | None = None) -> set[str]:
        setlist_rows = conn.execute(
            "select id from setlists where user_id = %s and not deleted", (user_id,),
        ).fetchall()
        slugs: set[str] = set()
        for sl in setlist_rows:
            if exclude_setlist_pk is not None and sl["id"] == exclude_setlist_pk:
                continue
            refs = [
                r["ref"] for r in conn.execute(
                    "select ref from setlist_items where setlist_id = %s", (sl["id"],),
                ).fetchall()
            ]
            for song in self.setlists._resolve_many(user_id, refs):
                if song:
                    slugs.add(song["slug"])
        return slugs

    def _sum_bytes_for_slugs(self, conn, slugs: set[str]) -> int:
        if not slugs:
            return 0
        song_ids = [
            r["id"] for r in conn.execute(
                "select id from songs where slug = any(%s)", (list(slugs),),
            ).fetchall()
        ]
        if not song_ids:
            return 0
        row = conn.execute(
            """select coalesce(sum(size_bytes), 0) as total from (
                   select size_bytes from audio_tracks where song_id = any(%(ids)s)
                   union all
                   select size_bytes from samples where song_id = any(%(ids)s)
                   union all
                   select size_bytes from song_clips where song_id = any(%(ids)s)
               ) t""",
            {"ids": song_ids},
        ).fetchone()
        return row["total"]

    def storage_used_bytes(self, user_id: str) -> int:
        with db.get_pool().connection() as conn:
            slugs = self._owned_song_slugs(conn, user_id)
            return self._sum_bytes_for_slugs(conn, slugs)

    def usage(self, user_id: str) -> dict | None:
        """Uso atual vs limite do plano — None se o usuário não tem plano
        atribuído (sem limite pra mostrar)."""
        with db.get_pool().connection() as conn:
            limits = self._plan_limits(conn, user_id)
            if not limits:
                return None
            setlists_used = conn.execute(
                "select count(*) as n from setlists where user_id = %s and not deleted", (user_id,),
            ).fetchone()["n"]
            slugs = self._owned_song_slugs(conn, user_id)
            storage_used = self._sum_bytes_for_slugs(conn, slugs)
        return {
            "setlists_used": setlists_used, "setlists_max": limits["max_setlists"],
            "storage_used_mb": round(storage_used / (1024 * 1024), 1),
            "storage_limit_mb": limits["storage_limit_mb"],
        }

    def check_setlist_creation(self, user_id: str) -> None:
        """Só chamado na CRIAÇÃO de um setlist novo — editar um setlist já
        existente nunca esbarra nesse limite, só no de armazenamento."""
        with db.get_pool().connection() as conn:
            limits = self._plan_limits(conn, user_id)
            if not limits:
                return
            count = conn.execute(
                "select count(*) as n from setlists where user_id = %s and not deleted", (user_id,),
            ).fetchone()["n"]
        if count >= limits["max_setlists"]:
            raise QuotaExceeded(
                f"Limite de {limits['max_setlists']} setlists do seu plano atingido. "
                "Exclua um setlist existente ou assine um plano maior.",
            )

    def check_setlist_storage(self, user_id: str, items: list[str], exclude_setlist_pk: str | None = None) -> None:
        """Levanta QuotaExceeded se salvar este setlist com `items` estourar
        o espaço do plano — bloqueia a gravação inteira (não salva parcial e
        avisa depois, ver Decisão do projeto)."""
        with db.get_pool().connection() as conn:
            limits = self._plan_limits(conn, user_id)
            if not limits:
                return
            other_slugs = self._owned_song_slugs(conn, user_id, exclude_setlist_pk=exclude_setlist_pk)
            new_slugs = {s["slug"] for s in self.setlists._resolve_many(user_id, items) if s}
            used = self._sum_bytes_for_slugs(conn, other_slugs | new_slugs)
        limit_bytes = limits["storage_limit_mb"] * 1024 * 1024
        if used > limit_bytes:
            raise QuotaExceeded(
                f"Limite de {limits['storage_limit_mb']} MB de armazenamento do seu plano atingido. "
                "Remova alguma faixa/sample/clipe ou assine um plano maior.",
            )
