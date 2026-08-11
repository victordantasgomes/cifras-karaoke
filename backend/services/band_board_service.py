"""Mural "monte uma banda" (Fase 9) — anúncios públicos de vaga/formação de
banda. Leitura é pública (sem login, mesmo precedente de /karaoke/:slug);
criar/editar/desativar exige ser o dono (levanta PermissionError, mesmo
padrão de setlist_service.py). Desativação nunca exclui de verdade
(active=false), espelhando SetlistService.set_shared().

Mídia anexada (melhoria posterior à Fase 9) — ver band_post_media no
schema.sql: fotos/vídeos (upload de verdade, bytes no Blob privado, mesmo
padrão de audio_tracks/song_clips) e links/vídeos do YouTube (só a URL
informada, sem upload). Cascade delete via FK cuida da limpeza da linha ao
excluir o post, mas os bytes no Blob precisam ser apagados manualmente
(delete_all() abaixo) — mesma ressalva de ClipQueueService."""
from __future__ import annotations

import uuid
from pathlib import Path

import db
from services import blob_client
from utils.instruments import INSTRUMENTS

_FIELDS = (
    "band_name", "genero", "style_freeform", "skill_level", "goal", "bio", "contact_info",
)

MEDIA_KINDS = ("photo", "video", "link", "youtube")
FILE_KINDS = ("photo", "video")
LINK_KINDS = ("link", "youtube")
MAX_MEDIA_PER_POST = 10
MAX_MEDIA_FILE_BYTES = 50 * 1024 * 1024  # 50 MB por foto/vídeo — anúncio, não acervo

# dias de ensaio, vocabulário fechado (era texto livre antes) — mesmo
# raciocínio de INSTRUMENTS, ids em português abreviado (não precisa de
# tradução própria de dia da semana em cada idioma, o frontend já traduz
# pela chave).
WEEKDAYS = ("seg", "ter", "qua", "qui", "sex", "sab", "dom")

MAX_SOCIAL_LINKS = 8


def _validate_instruments_needed(instruments_needed: list[str]) -> list[str]:
    """Vocabulário fechado desde a melhoria de alertas (ver
    utils/instruments.py) — mesmo padrão de falha explícita de
    add_media_file/add_media_link (ValueError, capturado na rota)."""
    cleaned = [(i or "").strip() for i in instruments_needed]
    for i in cleaned:
        if i not in INSTRUMENTS:
            raise ValueError("Um dos instrumentos buscados é inválido.")
    return cleaned


def _validate_rehearsal_days(rehearsal_days: list[str]) -> list[str]:
    cleaned = [(d or "").strip() for d in rehearsal_days]
    for d in cleaned:
        if d not in WEEKDAYS:
            raise ValueError("Um dos dias de ensaio é inválido.")
    return cleaned


def _validate_social_links(social_links: list[str]) -> list[str]:
    cleaned = [(u or "").strip() for u in social_links]
    if len(cleaned) > MAX_SOCIAL_LINKS:
        raise ValueError(f"Limite de {MAX_SOCIAL_LINKS} links de redes sociais atingido.")
    for u in cleaned:
        if not u.startswith(("http://", "https://")):
            raise ValueError("Um dos links de rede social não é uma URL válida (precisa começar com http:// ou https://).")
    return cleaned


def _row_to_dict(row: dict, media: list[dict]) -> dict:
    return {
        "id": str(row["id"]),
        "user_id": row["user_id"],
        "band_name": row["band_name"],
        "city": row["city"],
        "genero": row["genero"],
        "style_freeform": row["style_freeform"],
        "skill_level": row["skill_level"],
        "goal": row["goal"],
        "rehearsal_days": row["rehearsal_days"],
        "instruments_needed": row["instruments_needed"],
        "vocal_languages": row["vocal_languages"],
        "social_links": row["social_links"],
        "bio": row["bio"],
        "contact_info": row["contact_info"],
        "setlist_refs": [str(s) for s in row["setlist_refs"]],
        "active": row["active"],
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
        "media": media,
    }


def _media_row_to_dict(row: dict) -> dict:
    # blob_url nunca é exposto pro frontend (mesmo padrão de audio_tracks/
    # user_logos) — foto/vídeo são buscados via GET .../media/<id>/file,
    # proxied pelo backend; só link/youtube devolvem a própria URL.
    return {
        "id": str(row["id"]),
        "kind": row["kind"],
        "label": row["label"],
        "url": row["external_url"] if row["kind"] in LINK_KINDS else None,
        "content_type": row["content_type"],
        "size_bytes": row["size_bytes"],
        "created_at": row["created_at"].isoformat(),
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

    def _media_for_post(self, conn, post_id: str) -> list[dict]:
        rows = conn.execute(
            "select * from band_post_media where post_id=%s order by created_at", (post_id,),
        ).fetchall()
        return [_media_row_to_dict(r) for r in rows]

    def _media_for_posts(self, conn, post_ids: list[str]) -> dict[str, list[dict]]:
        if not post_ids:
            return {}
        rows = conn.execute(
            "select * from band_post_media where post_id = any(%s::uuid[]) order by created_at", (post_ids,),
        ).fetchall()
        grouped: dict[str, list[dict]] = {pid: [] for pid in post_ids}
        for r in rows:
            grouped.setdefault(str(r["post_id"]), []).append(_media_row_to_dict(r))
        return grouped

    def _require_owned_post(self, conn, user_id: str, post_id: str) -> None:
        row = conn.execute("select user_id from band_posts where id=%s", (post_id,)).fetchone()
        if not row:
            raise FileNotFoundError(post_id)
        if row["user_id"] != user_id:
            raise PermissionError(post_id)

    def create(self, user_id: str, data: dict) -> dict:
        setlist_refs = self._resolve_setlist_refs(user_id, data.get("setlist_refs") or [])
        instruments_needed = _validate_instruments_needed(data.get("instruments_needed") or [])
        rehearsal_days = _validate_rehearsal_days(data.get("rehearsal_days") or [])
        social_links = _validate_social_links(data.get("social_links") or [])
        with db.get_pool().connection() as conn:
            row = conn.execute(
                """insert into band_posts
                   (user_id, band_name, city, genero, style_freeform, skill_level, goal,
                    rehearsal_days, instruments_needed, vocal_languages, social_links,
                    bio, contact_info, setlist_refs)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   returning *""",
                (
                    user_id, *(data.get(f, "") for f in _FIELDS[:1]), (data.get("city") or "").strip(),
                    *(data.get(f, "") for f in _FIELDS[1:5]),
                    rehearsal_days, instruments_needed, (data.get("vocal_languages") or "").strip(), social_links,
                    *(data.get(f, "") for f in _FIELDS[5:]), setlist_refs,
                ),
            ).fetchone()
        return _row_to_dict(row, [])

    def update(self, user_id: str, post_id: str, data: dict) -> dict:
        instruments_needed = _validate_instruments_needed(data.get("instruments_needed") or [])
        rehearsal_days = _validate_rehearsal_days(data.get("rehearsal_days") or [])
        social_links = _validate_social_links(data.get("social_links") or [])
        with db.get_pool().connection() as conn:
            row = conn.execute("select user_id from band_posts where id=%s", (post_id,)).fetchone()
            if not row:
                raise FileNotFoundError(post_id)
            if row["user_id"] != user_id:
                raise PermissionError(post_id)
            setlist_refs = self._resolve_setlist_refs(user_id, data.get("setlist_refs") or [])
            conn.execute(
                """update band_posts set band_name=%s, city=%s, genero=%s, style_freeform=%s, skill_level=%s,
                       goal=%s, rehearsal_days=%s, instruments_needed=%s, vocal_languages=%s, social_links=%s,
                       bio=%s, contact_info=%s, setlist_refs=%s, updated_at=now()
                   where id=%s""",
                (
                    *(data.get(f, "") for f in _FIELDS[:1]), (data.get("city") or "").strip(),
                    *(data.get(f, "") for f in _FIELDS[1:5]),
                    rehearsal_days, instruments_needed, (data.get("vocal_languages") or "").strip(), social_links,
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
            media = self._media_for_post(conn, post_id)
        return _row_to_dict(row, media)

    def list_active(self) -> list[dict]:
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                "select * from band_posts where active=true order by created_at desc",
            ).fetchall()
            media_by_post = self._media_for_posts(conn, [str(r["id"]) for r in rows])
        return [_row_to_dict(r, media_by_post.get(str(r["id"]), [])) for r in rows]

    def list_mine(self, user_id: str) -> list[dict]:
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                "select * from band_posts where user_id=%s order by created_at desc", (user_id,),
            ).fetchall()
            media_by_post = self._media_for_posts(conn, [str(r["id"]) for r in rows])
        return [_row_to_dict(r, media_by_post.get(str(r["id"]), [])) for r in rows]

    # ---------------- mídia anexada ----------------

    def add_media_file(self, user_id: str, post_id: str, kind: str, file_storage, label: str = "") -> dict:
        if kind not in FILE_KINDS:
            raise ValueError(f"Tipo de mídia inválido: {kind}")
        content_type = file_storage.mimetype or ""
        expected_prefix = "image/" if kind == "photo" else "video/"
        if content_type and not content_type.startswith(expected_prefix):
            raise ValueError(f"Arquivo não parece ser um(a) {'imagem' if kind == 'photo' else 'vídeo'} válido(a).")
        data = file_storage.read()
        if len(data) > MAX_MEDIA_FILE_BYTES:
            raise ValueError(f"Arquivo maior que o limite de {MAX_MEDIA_FILE_BYTES // (1024 * 1024)} MB.")
        # dono + limite de itens checados ANTES do upload pro Blob (rede,
        # potencialmente lento) — evita subir bytes só pra descobrir depois
        # que o post não é do usuário ou que o limite já estourou. A conexão
        # fecha aqui, não fica presa durante a chamada de rede.
        with db.get_pool().connection() as conn:
            self._require_owned_post(conn, user_id, post_id)
            count = conn.execute(
                "select count(*) as n from band_post_media where post_id=%s", (post_id,),
            ).fetchone()["n"]
            if count >= MAX_MEDIA_PER_POST:
                raise ValueError(f"Limite de {MAX_MEDIA_PER_POST} itens de mídia por anúncio atingido.")
        ext = Path(file_storage.filename or "").suffix.lower() or (".jpg" if kind == "photo" else ".mp4")
        pathname = f"band-board/{user_id}/{post_id}/{kind}-{uuid.uuid4().hex[:8]}{ext}"
        blob = blob_client.put(pathname, data, content_type or None)
        with db.get_pool().connection() as conn:
            row = conn.execute(
                """insert into band_post_media (post_id, kind, label, blob_url, content_type, size_bytes)
                   values (%s, %s, %s, %s, %s, %s)
                   returning *""",
                (post_id, kind, (label or "").strip(), blob["url"], content_type, len(data)),
            ).fetchone()
        return _media_row_to_dict(row)

    def add_media_link(self, user_id: str, post_id: str, kind: str, url: str, label: str = "") -> dict:
        if kind not in LINK_KINDS:
            raise ValueError(f"Tipo de mídia inválido: {kind}")
        url = (url or "").strip()
        if not url.startswith(("http://", "https://")):
            raise ValueError("Informe um link válido (começando com http:// ou https://).")
        with db.get_pool().connection() as conn:
            self._require_owned_post(conn, user_id, post_id)
            count = conn.execute(
                "select count(*) as n from band_post_media where post_id=%s", (post_id,),
            ).fetchone()["n"]
            if count >= MAX_MEDIA_PER_POST:
                raise ValueError(f"Limite de {MAX_MEDIA_PER_POST} itens de mídia por anúncio atingido.")
            row = conn.execute(
                """insert into band_post_media (post_id, kind, label, external_url)
                   values (%s, %s, %s, %s)
                   returning *""",
                (post_id, kind, (label or "").strip(), url),
            ).fetchone()
        return _media_row_to_dict(row)

    def delete_media(self, user_id: str, post_id: str, media_id: str) -> None:
        with db.get_pool().connection() as conn:
            self._require_owned_post(conn, user_id, post_id)
            row = conn.execute(
                "select blob_url from band_post_media where id=%s and post_id=%s", (media_id, post_id),
            ).fetchone()
            if not row:
                return
            conn.execute("delete from band_post_media where id=%s and post_id=%s", (media_id, post_id))
        if row["blob_url"]:
            blob_client.delete([row["blob_url"]])

    def media_bytes(self, post_id: str, media_id: str) -> tuple[bytes, str] | None:
        """Bytes de uma foto/vídeo anexado — rota pública (mesmo padrão de
        branding logo), sem checagem de `active`: uma vez publicado o link
        do arquivo, ele continua servível mesmo se o post for desativado
        depois (evita quebrar a pré-visualização do próprio dono editando
        um post inativo, que só volta a listar como público ao reativar)."""
        with db.get_pool().connection() as conn:
            row = conn.execute(
                "select blob_url, content_type from band_post_media where id=%s and post_id=%s",
                (media_id, post_id),
            ).fetchone()
        if not row or not row["blob_url"]:
            return None
        data, _ = blob_client.get(row["blob_url"])
        return data, row["content_type"] or "application/octet-stream"
