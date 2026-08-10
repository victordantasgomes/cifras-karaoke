"""Mural "monte uma banda" (Fase 9) — anúncios públicos de vaga/formação de
banda. Leitura é pública (sem login, mesmo precedente de /karaoke/:slug);
criar/editar/desativar exige ser o dono (levanta PermissionError, mesmo
padrão de setlist_service.py). Desativação nunca exclui de verdade
(active=false), espelhando SetlistService.set_shared()."""
from __future__ import annotations

import db

_FIELDS = (
    "band_name", "genero", "style_freeform", "skill_level", "goal", "bio", "contact_info",
)


def _row_to_dict(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "user_id": row["user_id"],
        "band_name": row["band_name"],
        "genero": row["genero"],
        "style_freeform": row["style_freeform"],
        "skill_level": row["skill_level"],
        "goal": row["goal"],
        "rehearsal_days": row["rehearsal_days"],
        "instruments_needed": row["instruments_needed"],
        "bio": row["bio"],
        "contact_info": row["contact_info"],
        "setlist_refs": [str(s) for s in row["setlist_refs"]],
        "active": row["active"],
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
    }


class BandBoardService:
    def _resolve_setlist_refs(self, user_id: str, setlist_ids: list[str]) -> list[str]:
        """Só entra na lista o id de setlist que o usuário É DONO — não dá
        pra linkar setlist alheio num anúncio."""
        if not setlist_ids:
            return []
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                "select id from setlists where id = any(%s::uuid[]) and user_id = %s",
                (setlist_ids, user_id),
            ).fetchall()
        return [str(r["id"]) for r in rows]

    def create(self, user_id: str, data: dict) -> dict:
        setlist_refs = self._resolve_setlist_refs(user_id, data.get("setlist_refs") or [])
        with db.get_pool().connection() as conn:
            row = conn.execute(
                """insert into band_posts
                   (user_id, band_name, genero, style_freeform, skill_level, goal,
                    rehearsal_days, instruments_needed, bio, contact_info, setlist_refs)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   returning *""",
                (
                    user_id, *(data.get(f, "") for f in _FIELDS[:5]),
                    data.get("rehearsal_days") or [], data.get("instruments_needed") or [],
                    *(data.get(f, "") for f in _FIELDS[5:]), setlist_refs,
                ),
            ).fetchone()
        return _row_to_dict(row)

    def update(self, user_id: str, post_id: str, data: dict) -> dict:
        with db.get_pool().connection() as conn:
            row = conn.execute("select user_id from band_posts where id=%s", (post_id,)).fetchone()
            if not row:
                raise FileNotFoundError(post_id)
            if row["user_id"] != user_id:
                raise PermissionError(post_id)
            setlist_refs = self._resolve_setlist_refs(user_id, data.get("setlist_refs") or [])
            conn.execute(
                """update band_posts set band_name=%s, genero=%s, style_freeform=%s, skill_level=%s,
                       goal=%s, rehearsal_days=%s, instruments_needed=%s, bio=%s, contact_info=%s,
                       setlist_refs=%s, updated_at=now()
                   where id=%s""",
                (
                    *(data.get(f, "") for f in _FIELDS[:5]),
                    data.get("rehearsal_days") or [], data.get("instruments_needed") or [],
                    *(data.get(f, "") for f in _FIELDS[5:]), setlist_refs, post_id,
                ),
            )
        return self.get(post_id, user_id)

    def set_active(self, user_id: str, post_id: str, value: bool) -> dict:
        with db.get_pool().connection() as conn:
            row = conn.execute("select user_id from band_posts where id=%s", (post_id,)).fetchone()
            if not row:
                raise FileNotFoundError(post_id)
            if row["user_id"] != user_id:
                raise PermissionError(post_id)
            conn.execute("update band_posts set active=%s, updated_at=now() where id=%s", (value, post_id))
        return self.get(post_id, user_id)

    def get(self, post_id: str, user_id: str | None = None) -> dict:
        """Post inativo só é visível pro próprio dono (ex.: tela de edição
        logo após desativar) — visitante sem login nunca vê inativo."""
        with db.get_pool().connection() as conn:
            row = conn.execute("select * from band_posts where id=%s", (post_id,)).fetchone()
        if not row or (not row["active"] and row["user_id"] != user_id):
            raise FileNotFoundError(post_id)
        return _row_to_dict(row)

    def list_active(self) -> list[dict]:
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                "select * from band_posts where active=true order by created_at desc",
            ).fetchall()
        return [_row_to_dict(r) for r in rows]

    def list_mine(self, user_id: str) -> list[dict]:
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                "select * from band_posts where user_id=%s order by created_at desc", (user_id,),
            ).fetchall()
        return [_row_to_dict(r) for r in rows]
