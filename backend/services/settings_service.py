"""Preferências do usuário — hoje, só a paleta de cores do karaokê."""
from __future__ import annotations

from psycopg.types.json import Json

import db

# valores hoje hardcoded em frontend/src/styles/global.css — usados como
# padrão até o usuário salvar uma paleta própria.
DEFAULT_COLORS = {
    "sweepSung": "#f2b544",
    "sweepUpcoming": "#ffffff",
    "amber": "#f2b544",
    "sample": "#6fa8ff",
    "ok": "#46c48a",
}


class SettingsService:
    def get(self, user_id: str) -> dict:
        with db.get_pool().connection() as conn:
            row = conn.execute("select colors, prefs from settings where user_id=%s", (user_id,)).fetchone()
        saved_colors = row["colors"] if row else {}
        saved_prefs = row["prefs"] if row else {}
        return {
            "colors": {**DEFAULT_COLORS, **{k: v for k, v in saved_colors.items() if k in DEFAULT_COLORS}},
            "prefs": saved_prefs,
        }

    def update(self, user_id: str, colors: dict | None = None, prefs: dict | None = None) -> dict:
        """`colors`/`prefs` ausentes (None) preservam o que já estava salvo —
        a tela de cores e o novo card de pedal em Settings.jsx gravam campos
        diferentes desta mesma linha, sem um pisar no do outro."""
        with db.get_pool().connection() as conn:
            row = conn.execute("select colors, prefs from settings where user_id=%s", (user_id,)).fetchone()
            current_colors = row["colors"] if row else {}
            current_prefs = row["prefs"] if row else {}
            new_colors = current_colors if colors is None else {k: v for k, v in colors.items() if k in DEFAULT_COLORS}
            new_prefs = current_prefs if prefs is None else prefs
            conn.execute(
                """insert into settings (user_id, colors, prefs) values (%s, %s, %s)
                   on conflict (user_id) do update set colors = %s, prefs = %s""",
                (user_id, Json(new_colors), Json(new_prefs), Json(new_colors), Json(new_prefs)),
            )
        return self.get(user_id)
