"""Estatísticas agregadas pro painel admin — "gestão da ferramenta"
(Fase 13, ver tools_stats()) e "vendas" (Fase 14, ver sales_stats()). Só
leitura, nunca grava nada.

"Músicas em mais setlists" reaproveita SetlistService._resolve_many() (a
mesma resolução fuzzy usada na leitura de um setlist) em vez de duplicar
essa lógica aqui — setlist_items.ref é texto livre sem FK direta pra
songs, então não dá pra fazer isso com um JOIN comum.

"Tendência de cancelamento" (sales_stats) lê subscription_events — gravado
por BillingService.handle_webhook_event() a cada mudança real de
subscription_status — em vez de só contar o estado atual, que não mostra
tendência nenhuma."""
from __future__ import annotations

import db


class AdminStatsService:
    def __init__(self, setlists, telemetry):
        self.setlists = setlists
        self.telemetry = telemetry

    def _most_setlisted_songs(self, limit: int) -> list[dict]:
        with db.get_pool().connection() as conn:
            rows = conn.execute("select ref from setlist_items").fetchall()
        resolved = self.setlists._resolve_many([r["ref"] for r in rows])

        counts: dict[str, dict] = {}
        for song in resolved:
            if not song:
                continue
            entry = counts.setdefault(
                song["slug"], {"slug": song["slug"], "titulo": song["titulo"], "interprete": song["interprete"], "count": 0},
            )
            entry["count"] += 1
        return sorted(counts.values(), key=lambda c: c["count"], reverse=True)[:limit]

    def tools_stats(self, limit: int = 10) -> dict:
        with db.get_pool().connection() as conn:
            total_users = conn.execute("select count(*) as n from users").fetchone()["n"]
            total_songs = conn.execute("select count(*) as n from songs").fetchone()["n"]

            most_played = conn.execute(
                """select s.slug, s.titulo, s.interprete, p.count
                   from song_plays p join songs s on s.id = p.song_id
                   order by p.count desc limit %s""",
                (limit,),
            ).fetchall()

            most_edited = conn.execute(
                """select s.slug, s.titulo, s.interprete, count(v.id) as edits
                   from song_versions v join songs s on s.id = v.song_id
                   group by s.id, s.slug, s.titulo, s.interprete
                   order by edits desc limit %s""",
                (limit,),
            ).fetchall()

            top_uploaders = conn.execute(
                """select u.username, u.name, count(s.id) as songs_count
                   from users u join songs s on s.user_id = u.id
                   group by u.id, u.username, u.name
                   order by songs_count desc limit %s""",
                (limit,),
            ).fetchall()

            top_by_logins = conn.execute(
                "select username, name, login_count from users order by login_count desc limit %s",
                (limit,),
            ).fetchall()

        return {
            "total_users": total_users,
            "total_songs": total_songs,
            "avg_session_seconds": self.telemetry.average_session_seconds(),
            "most_played": [dict(r) for r in most_played],
            "most_edited": [dict(r) for r in most_edited],
            "most_setlisted": self._most_setlisted_songs(limit),
            "top_uploaders": [dict(r) for r in top_uploaders],
            "top_by_logins": [dict(r) for r in top_by_logins],
        }

    def sales_stats(self) -> dict:
        with db.get_pool().connection() as conn:
            by_status = conn.execute(
                "select subscription_status, count(*) as n from users group by subscription_status",
            ).fetchall()

            by_plan = conn.execute(
                """select p.name, count(u.id) as n from users u join plans p on p.id = u.plan_id
                   where u.subscription_status in ('trialing', 'active')
                   group by p.name order by n desc""",
            ).fetchall()

            cancellations = conn.execute(
                """select date_trunc('day', occurred_at) as day, count(*) as n
                   from subscription_events where new_status = 'canceled'
                   group by day order by day""",
            ).fetchall()

        status_counts = {r["subscription_status"]: r["n"] for r in by_status}
        active_subscriptions = status_counts.get("trialing", 0) + status_counts.get("active", 0)

        return {
            "active_subscriptions": active_subscriptions,
            "by_status": status_counts,
            "by_plan": [dict(r) for r in by_plan],
            "landing_views": self.telemetry.landing_view_count(),
            "cancellations_by_day": [{"day": r["day"].date().isoformat(), "count": r["n"]} for r in cancellations],
        }
