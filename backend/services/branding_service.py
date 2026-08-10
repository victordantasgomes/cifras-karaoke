"""Logo de marca própria (whitelabel, Fase 8) — um logo por usuário, bytes
no Vercel Blob (mesmo padrão de audio_service.py::save_track), metadado em
`user_logos`. Diferente do áudio (sempre privado), a leitura aqui é pública
de propósito: o player de karaokê e os posts do mural (Fase 9) precisam
exibir a logo pra visitante sem login — só o upload/exclusão exige dono."""
from __future__ import annotations

from pathlib import Path

import db
from services import blob_client


class BrandingService:
    def save_logo(self, user_id: str, file_storage) -> None:
        ext = Path(file_storage.filename or "").suffix.lower() or ".png"
        content_type = file_storage.mimetype or None
        data = file_storage.read()
        blob = blob_client.put(f"branding/{user_id}/logo{ext}", data, content_type)
        with db.get_pool().connection() as conn:
            conn.execute(
                """insert into user_logos (user_id, blob_url, content_type, size_bytes) values (%s, %s, %s, %s)
                   on conflict (user_id) do update
                       set blob_url = excluded.blob_url, content_type = excluded.content_type,
                           size_bytes = excluded.size_bytes, uploaded_at = now()""",
                (user_id, blob["url"], content_type or "", len(data)),
            )

    def delete_logo(self, user_id: str) -> None:
        with db.get_pool().connection() as conn:
            row = conn.execute("select blob_url from user_logos where user_id=%s", (user_id,)).fetchone()
            if row:
                blob_client.delete([row["blob_url"]])
                conn.execute("delete from user_logos where user_id=%s", (user_id,))

    def has_logo(self, user_id: str) -> bool:
        with db.get_pool().connection() as conn:
            row = conn.execute("select 1 from user_logos where user_id=%s", (user_id,)).fetchone()
        return row is not None

    def logo_bytes(self, user_id: str) -> tuple[bytes, str] | None:
        with db.get_pool().connection() as conn:
            row = conn.execute("select blob_url from user_logos where user_id=%s", (user_id,)).fetchone()
        return blob_client.get(row["blob_url"]) if row else None
