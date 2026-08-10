"""Alertas de mural por cidade + instrumento (melhoria posterior à Fase 9).

Nunca persiste a lista de correspondências em si — GET /me/alerts calcula
na hora (cidade normalizada + overlap de array de instrumentos, ver
list_alerts abaixo). Só o que o usuário já dispensou precisa de memória
entre uma consulta e outra (user_alert_dismissals). Sem e-mail/push — só
in-app (ver AlertsBell.jsx), mesma decisão já tomada pro resto do projeto
(favorites_service.py também não tem infra de notificação).

Consulta as tabelas direto (users, user_instruments, band_posts), sem
injeção de outro serviço — mesmo padrão de QuotaService."""
from __future__ import annotations

import db


class AlertsService:
    def list_alerts(self, user_id: str) -> list[dict]:
        with db.get_pool().connection() as conn:
            user = conn.execute("select city from users where id=%s", (user_id,)).fetchone()
            city = (user["city"] or "").strip() if user else ""
            if not city:
                return []
            instruments = [
                r["instrument"] for r in conn.execute(
                    "select instrument from user_instruments where user_id=%s", (user_id,),
                ).fetchall()
            ]
            if not instruments:
                return []
            rows = conn.execute(
                """select bp.id, bp.band_name, bp.city, bp.genero, bp.instruments_needed, bp.created_at
                   from band_posts bp
                   where bp.active = true
                     and bp.user_id != %(user_id)s
                     and lower(trim(bp.city)) = lower(trim(%(city)s))
                     and bp.instruments_needed && %(instruments)s::text[]
                     and not exists (
                         select 1 from user_alert_dismissals d
                         where d.user_id = %(user_id)s and d.post_id = bp.id
                     )
                   order by bp.created_at desc""",
                {"user_id": user_id, "city": city, "instruments": instruments},
            ).fetchall()
        return [
            {
                "id": str(r["id"]), "band_name": r["band_name"], "city": r["city"], "genero": r["genero"],
                "instruments_needed": r["instruments_needed"], "created_at": r["created_at"].isoformat(),
            }
            for r in rows
        ]

    def dismiss(self, user_id: str, post_id: str) -> None:
        with db.get_pool().connection() as conn:
            exists = conn.execute("select 1 from band_posts where id=%s", (post_id,)).fetchone()
            if not exists:
                return
            conn.execute(
                """insert into user_alert_dismissals (user_id, post_id) values (%s, %s)
                   on conflict (user_id, post_id) do nothing""",
                (user_id, post_id),
            )
