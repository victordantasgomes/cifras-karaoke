"""Telemetria leve, sem dado pessoal — visitas na landing page (Fase 5).
Estendido na Fase 12 com pings de sessão (tempo médio de acesso)."""
from __future__ import annotations

import db

# gap entre dois pings acima do qual eles pertencem a sessões diferentes —
# folga sobre o intervalo do heartbeat do frontend (~45-60s, ver
# useActivityPing.js) pra tolerar uma perda pontual de ping sem quebrar a
# sessão em duas.
SESSION_GAP_SECONDS = 90


class TelemetryService:
    def record_landing_view(self) -> None:
        with db.get_pool().connection() as conn:
            conn.execute("insert into landing_page_views default values")

    def landing_view_count(self) -> int:
        with db.get_pool().connection() as conn:
            row = conn.execute("select count(*) as n from landing_page_views").fetchone()
        return row["n"]

    def record_ping(self, user_id: str) -> None:
        with db.get_pool().connection() as conn:
            conn.execute("insert into activity_pings (user_id) values (%s)", (user_id,))

    @staticmethod
    def group_into_sessions(timestamps: list) -> list[float]:
        """Agrupa timestamps (de um único usuário) em sessões por gap: dois
        pings a mais de SESSION_GAP_SECONDS de distância pertencem a
        sessões diferentes. Duração de cada sessão = último - primeiro
        ping (um ping isolado vira sessão de duração 0). Função pura,
        testável com timestamps sintéticos, sem tocar o banco."""
        if not timestamps:
            return []
        ordered = sorted(timestamps)
        sessions = [[ordered[0]]]
        for ts in ordered[1:]:
            if (ts - sessions[-1][-1]).total_seconds() > SESSION_GAP_SECONDS:
                sessions.append([ts])
            else:
                sessions[-1].append(ts)
        return [(s[-1] - s[0]).total_seconds() for s in sessions]

    def average_session_seconds(self) -> float:
        """Tempo médio de sessão em segundos, sobre todos os usuários —
        agrupa pings por usuário primeiro (sessões de usuários diferentes
        nunca se misturam), só depois por gap dentro de cada usuário.
        Aproximação heurística (ver SESSION_GAP_SECONDS), não uma medição
        exata de tempo de uso."""
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                "select user_id, pinged_at from activity_pings order by user_id, pinged_at",
            ).fetchall()
        by_user: dict[str, list] = {}
        for row in rows:
            by_user.setdefault(row["user_id"], []).append(row["pinged_at"])
        durations = [d for timestamps in by_user.values() for d in self.group_into_sessions(timestamps)]
        return sum(durations) / len(durations) if durations else 0.0
