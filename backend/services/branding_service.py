"""Logo de marca própria (whitelabel, Fase 8) — até 4 variantes por usuário
(preta/branca/colorida-clara/colorida-escura, Fase de melhorias), bytes no
Vercel Blob (mesmo padrão de audio_service.py::save_track), metadado em
`user_logos`. Diferente do áudio (sempre privado), a leitura aqui é pública
de propósito: o player de karaokê e os posts do mural (Fase 9) precisam
exibir a logo pra visitante sem login — só o upload/exclusão exige dono.

O sistema escolhe a variante mais adequada pro TEMA de quem está vendo
(ver resolve_logo) — nunca pro tema de quem enviou. Sem a variante ideal
enviada, cai numa ordem de fallback razoável em vez de não mostrar nada."""
from __future__ import annotations

from pathlib import Path

import db
from services import blob_client

VARIANTS = ("black", "white", "color_light", "color_dark")

# ordem de preferência por tema de quem está vendo — a variante ideal
# primeiro, depois as que ao menos têm contraste razoável no fundo daquele
# tema (branca/preta funcionam em qualquer tema, coloridas nem sempre).
_FALLBACK_ORDER = {
    "dark": ("color_dark", "white", "color_light", "black"),
    "light": ("color_light", "black", "color_dark", "white"),
}


class BrandingService:
    def save_logo(self, user_id: str, variant: str, file_storage) -> None:
        if variant not in VARIANTS:
            raise ValueError(f"Variante de logo inválida: {variant}")
        ext = Path(file_storage.filename or "").suffix.lower() or ".png"
        content_type = file_storage.mimetype or None
        data = file_storage.read()
        blob = blob_client.put(f"branding/{user_id}/{variant}{ext}", data, content_type)
        with db.get_pool().connection() as conn:
            conn.execute(
                """insert into user_logos (user_id, variant, blob_url, content_type, size_bytes)
                   values (%s, %s, %s, %s, %s)
                   on conflict (user_id, variant) do update
                       set blob_url = excluded.blob_url, content_type = excluded.content_type,
                           size_bytes = excluded.size_bytes, uploaded_at = now()""",
                (user_id, variant, blob["url"], content_type or "", len(data)),
            )

    def delete_logo(self, user_id: str, variant: str) -> None:
        with db.get_pool().connection() as conn:
            row = conn.execute(
                "select blob_url from user_logos where user_id=%s and variant=%s", (user_id, variant),
            ).fetchone()
            if row:
                blob_client.delete([row["blob_url"]])
                conn.execute("delete from user_logos where user_id=%s and variant=%s", (user_id, variant))

    def list_variants(self, user_id: str) -> list[str]:
        """Quais variantes este usuário já enviou — pros 4 slots de upload
        nas Configurações saberem qual mostra "enviada" vs "vazia"."""
        with db.get_pool().connection() as conn:
            rows = conn.execute("select variant from user_logos where user_id=%s", (user_id,)).fetchall()
        return [r["variant"] for r in rows]

    def variant_bytes(self, user_id: str, variant: str) -> tuple[bytes, str] | None:
        """Bytes de UMA variante exata, sem fallback — usado pela pré-visualização
        das Configurações (o dono precisa ver exatamente o que enviou em
        cada um dos 4 slots, não a resolução automática por tema)."""
        with db.get_pool().connection() as conn:
            row = conn.execute(
                "select blob_url from user_logos where user_id=%s and variant=%s", (user_id, variant),
            ).fetchone()
        return blob_client.get(row["blob_url"]) if row else None

    def has_logo(self, user_id: str) -> bool:
        with db.get_pool().connection() as conn:
            row = conn.execute("select 1 from user_logos where user_id=%s", (user_id,)).fetchone()
        return row is not None

    def resolve_logo(self, user_id: str, theme: str) -> tuple[bytes, str] | None:
        """Bytes da melhor variante disponível pro tema de quem está
        vendo (não de quem enviou) — ver _FALLBACK_ORDER. None se o
        usuário não enviou nenhuma logo ainda."""
        order = _FALLBACK_ORDER.get(theme, _FALLBACK_ORDER["dark"])
        with db.get_pool().connection() as conn:
            rows = {
                r["variant"]: r["blob_url"]
                for r in conn.execute("select variant, blob_url from user_logos where user_id=%s", (user_id,)).fetchall()
            }
        if not rows:
            return None
        for variant in order:
            if variant in rows:
                return blob_client.get(rows[variant])
        # variante enviada não bate com nenhuma da ordem conhecida — não
        # deveria acontecer (VARIANTS é fechado), mas não trava a leitura
        # por uma inconsistência de dado, devolve a primeira que achar.
        return blob_client.get(next(iter(rows.values())))
