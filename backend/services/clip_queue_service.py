"""Fila de clipes curtos disparados manualmente por pedal (foot switch) —
ver schema.sql::song_clips. Recurso independente de `samples`
(services/audio_service.py): samples disparam sozinhos por timestamp
`[t=SEG]` no corpo da cifra; clipes daqui são avançados manualmente pelo
músico (um a um, na ordem de `position`), sem nenhuma marcação no corpo.

Bytes no Vercel Blob, igual faixa/samples — ver blob_client.py."""
from __future__ import annotations

import uuid
from pathlib import Path

import db
from services import blob_client
from services.songs_service import NotOwner, SongNotFound
from utils.slug import slugify


class ClipQueueService:
    def __init__(self, songs=None):
        self.songs = songs  # injetado depois pra evitar ciclo com SongsService

    def _require_owned_song_id(self, user_id: str, slug: str) -> str:
        song_id = self.songs.get_id(user_id, slug)
        if not song_id:
            raise SongNotFound(slug)
        if not self.songs.is_owner(user_id, slug):
            raise NotOwner(slug)
        return song_id

    def save_clip(self, user_id: str, slug: str, file_storage, nome: str) -> dict:
        song_id = self._require_owned_song_id(user_id, slug)
        nome = (nome or "").strip()
        if not nome:
            raise ValueError("Informe um nome para o clipe.")
        ext = Path(file_storage.filename or "").suffix.lower() or ".mp3"
        content_type = file_storage.mimetype or None
        data = file_storage.read()
        pathname = f"audio/{user_id}/{slug}/clips/{slugify(nome)}-{uuid.uuid4().hex[:8]}{ext}"
        blob = blob_client.put(pathname, data, content_type)
        with db.get_pool().connection() as conn:
            next_position = conn.execute(
                "select coalesce(max(position), -1) + 1 as n from song_clips where song_id=%s", (song_id,),
            ).fetchone()["n"]
            row = conn.execute(
                """insert into song_clips (song_id, position, nome, blob_url, content_type, size_bytes)
                   values (%s, %s, %s, %s, %s, %s)
                   returning id, position""",
                (song_id, next_position, nome, blob["url"], content_type or "", len(data)),
            ).fetchone()
        return {"id": str(row["id"]), "nome": nome, "position": row["position"]}

    def list_clips(self, user_id: str, slug: str) -> list[dict]:
        song_id = self.songs.get_id(user_id, slug) if self.songs else None
        if not song_id:
            return []
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                "select id, nome, position from song_clips where song_id=%s order by position", (song_id,),
            ).fetchall()
        return [{"id": str(r["id"]), "nome": r["nome"], "position": r["position"]} for r in rows]

    def reorder_clips(self, user_id: str, slug: str, ordered_ids: list[str]) -> list[dict]:
        song_id = self._require_owned_song_id(user_id, slug)
        with db.get_pool().connection() as conn:
            for position, clip_id in enumerate(ordered_ids):
                conn.execute(
                    "update song_clips set position=%s where id=%s and song_id=%s",
                    (position, clip_id, song_id),
                )
        return self.list_clips(user_id, slug)

    def _clip_url(self, user_id: str, slug: str, clip_id: str) -> str | None:
        song_id = self.songs.get_id(user_id, slug)
        if not song_id:
            return None
        with db.get_pool().connection() as conn:
            row = conn.execute(
                "select blob_url from song_clips where song_id=%s and id=%s", (song_id, clip_id),
            ).fetchone()
        return row["blob_url"] if row else None

    def clip_bytes(self, user_id: str, slug: str, clip_id: str) -> tuple[bytes, str] | None:
        url = self._clip_url(user_id, slug, clip_id)
        return blob_client.get(url) if url else None

    def delete_clip(self, user_id: str, slug: str, clip_id: str) -> None:
        song_id = self.songs.get_id(user_id, slug)
        if not song_id:
            return
        if not self.songs.is_owner(user_id, slug):
            raise NotOwner(slug)
        with db.get_pool().connection() as conn:
            row = conn.execute(
                "select blob_url from song_clips where song_id=%s and id=%s", (song_id, clip_id),
            ).fetchone()
            if row:
                blob_client.delete([row["blob_url"]])
                conn.execute("delete from song_clips where song_id=%s and id=%s", (song_id, clip_id))

    def delete_all_for_song(self, user_id: str, slug: str) -> None:
        """Igual AudioService.delete_all_for_slug — chamado por
        SongsService.delete() ANTES de apagar a linha em `songs`, mas
        também precisa funcionar chamado sozinho."""
        song_id = self.songs.get_id(user_id, slug)
        if not song_id:
            return
        with db.get_pool().connection() as conn:
            urls = [r["blob_url"] for r in conn.execute(
                "select blob_url from song_clips where song_id=%s", (song_id,),
            ).fetchall()]
            conn.execute("delete from song_clips where song_id=%s", (song_id,))
        blob_client.delete(urls)
