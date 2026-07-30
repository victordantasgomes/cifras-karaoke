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
            row = conn.execute("select colors from settings where user_id=%s", (user_id,)).fetchone()
        saved = row["colors"] if row else {}
        return {"colors": {**DEFAULT_COLORS, **{k: v for k, v in saved.items() if k in DEFAULT_COLORS}}}

    def update(self, user_id: str, colors: dict) -> dict:
        clean = {k: v for k, v in (colors or {}).items() if k in DEFAULT_COLORS}
        with db.get_pool().connection() as conn:
            conn.execute(
                """insert into settings (user_id, colors) values (%s, %s)
                   on conflict (user_id) do update set colors = %s""",
                (user_id, Json(clean), Json(clean)),
            )
        return self.get(user_id)
