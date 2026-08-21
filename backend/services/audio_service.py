"""Faixa de áudio de referência + samples/solos por música — bytes no Vercel
Blob (ver blob_client.py), metadado nas tabelas `audio_tracks`/`samples`
(ver schema.sql). Fase 2 da migração pra Vercel (ver plano em .claude/plans)
— substitui o disco local usado na Fase 1.

O store deste projeto é privado (toda leitura exige autenticação — ver
blob_client.py), então `track_bytes`/`sample_bytes` buscam o conteúdo aqui
no backend (que já tem o token) pra servir pro cliente via rota — igual o
`send_file` fazia sobre o disco local antes da migração."""
from __future__ import annotations

import time
from pathlib import Path

import db
from services import blob_client
from services.songs_service import NotOwner, SongNotFound
from utils.slug import slugify

# teto de tamanho pra faixa de referência via upload direto (ver
# start_track_upload) — generoso o bastante pra um áudio sem compressão
# (WAV) de alguns minutos, sem deixar o token assinado aberto pra qualquer
# tamanho.
MAX_TRACK_UPLOAD_BYTES = 200 * 1024 * 1024
_UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000


class AudioService:
    def __init__(self, songs=None):
        self.songs = songs  # injetado depois pra evitar ciclo com SongsService

    def _require_song_id(self, user_id: str, slug: str) -> str:
        song_id = self.songs.get_id(user_id, slug)
        if not song_id:
            raise SongNotFound(slug)
        return song_id

    def _require_owned_song_id(self, user_id: str, slug: str) -> str:
        """Igual _require_song_id, mas pras escritas (upload/exclusão) —
        leitura de áudio é global (a música é), mas só o criador (ou admin,
        checado na rota) pode mexer no áudio de uma música que não é sua."""
        song_id = self._require_song_id(user_id, slug)
        if not self.songs.is_owner(user_id, slug):
            raise NotOwner(slug)
        return song_id

    # ---------- faixa de referência ----------
    def save_track(self, user_id: str, slug: str, file_storage) -> None:
        song_id = self._require_owned_song_id(user_id, slug)
        ext = Path(file_storage.filename or "").suffix.lower() or ".mp3"
        content_type = file_storage.mimetype or None
        data = file_storage.read()
        blob = blob_client.put(f"audio/{user_id}/{slug}/track{ext}", data, content_type)
        with db.get_pool().connection() as conn:
            conn.execute(
                """insert into audio_tracks (song_id, blob_url, content_type, size_bytes) values (%s, %s, %s, %s)
                   on conflict (song_id) do update
                       set blob_url = excluded.blob_url, content_type = excluded.content_type,
                           size_bytes = excluded.size_bytes, uploaded_at = now()""",
                (song_id, blob["url"], content_type or "", len(data)),
            )

    def start_track_upload(self, user_id: str, slug: str, filename: str, content_type: str | None) -> dict:
        """1º passo do upload direto: emite uma delegação assinada escopada
        a um único pathname, só pra faixa de referência dessa música — o
        navegador sobe os bytes direto pro Vercel Blob com ela (ver
        blob_client.presign_put_url), sem passar pelos bytes por aqui. Uma
        faixa completa passa fácil do teto de payload da função serverless
        (~4,5 MB) que hospeda este backend — daí não dar pra usar save_track
        (upload via Flask) pra arquivos grandes."""
        self._require_owned_song_id(user_id, slug)
        ext = Path(filename or "").suffix.lower() or ".mp3"
        pathname = f"audio/{user_id}/{slug}/track{ext}"
        valid_until_ms = int(time.time() * 1000) + _UPLOAD_TOKEN_TTL_MS
        token = blob_client.issue_signed_token(
            pathname,
            valid_until_ms=valid_until_ms,
            maximum_size_in_bytes=MAX_TRACK_UPLOAD_BYTES,
            allowed_content_types=["audio/*"],
        )
        upload_url = blob_client.presign_put_url(pathname, token["delegationToken"], token["clientSigningToken"])
        return {
            "uploadUrl": upload_url,
            "pathname": pathname,
            "contentType": content_type or "application/octet-stream",
        }

    def confirm_track_upload(self, user_id: str, slug: str, pathname: str, blob_url: str, content_type: str | None, size: int) -> None:
        """2º passo: depois que o navegador confirma que o PUT direto deu
        certo, valida que o pathname devolvido é mesmo o desta música (a
        delegação já restringe o PUT a ele, isto é só uma segunda checagem
        barata) e grava o metadado. `size` vem do próprio corpo de resposta
        do PUT (a Vercel devolve `{..., size}` — o mesmo dado que um HEAD
        devolveria, só que sem o round-trip extra); testado ao vivo que um
        HEAD logo em seguida do PUT pode dar 404 por propagação — não vale
        reconferir o tamanho aqui, e não é dado sensível (só estatística,
        nunca usado pra decidir o que é servido de volta)."""
        song_id = self._require_owned_song_id(user_id, slug)
        expected_prefix = f"audio/{user_id}/{slug}/track"
        if not pathname.startswith(expected_prefix):
            raise ValueError("pathname não corresponde à faixa desta música.")
        with db.get_pool().connection() as conn:
            conn.execute(
                """insert into audio_tracks (song_id, blob_url, content_type, size_bytes) values (%s, %s, %s, %s)
                   on conflict (song_id) do update
                       set blob_url = excluded.blob_url, content_type = excluded.content_type,
                           size_bytes = excluded.size_bytes, uploaded_at = now()""",
                (song_id, blob_url, content_type or "", size),
            )

    def delete_track(self, user_id: str, slug: str) -> None:
        song_id = self.songs.get_id(user_id, slug)
        if not song_id:
            return
        if not self.songs.is_owner(user_id, slug):
            raise NotOwner(slug)
        with db.get_pool().connection() as conn:
            row = conn.execute("select blob_url from audio_tracks where song_id=%s", (song_id,)).fetchone()
            if row:
                blob_client.delete([row["blob_url"]])
                conn.execute("delete from audio_tracks where song_id=%s", (song_id,))

    def has_track(self, user_id: str, slug: str) -> bool:
        return self._track_url(user_id, slug) is not None

    def _track_url(self, user_id: str, slug: str) -> str | None:
        song_id = self.songs.get_id(user_id, slug)
        if not song_id:
            return None
        with db.get_pool().connection() as conn:
            row = conn.execute("select blob_url from audio_tracks where song_id=%s", (song_id,)).fetchone()
        return row["blob_url"] if row else None

    def track_bytes(self, user_id: str, slug: str) -> tuple[bytes, str] | None:
        url = self._track_url(user_id, slug)
        return blob_client.get(url) if url else None

    # ---------- samples ----------
    def save_sample(self, user_id: str, slug: str, file_storage, nome: str) -> dict:
        song_id = self._require_owned_song_id(user_id, slug)
        nome = (nome or "").strip()
        sample_id = slugify(nome)
        if not sample_id:
            raise ValueError("Informe um nome para o sample.")
        ext = Path(file_storage.filename or "").suffix.lower() or ".mp3"
        content_type = file_storage.mimetype or None
        data = file_storage.read()
        blob = blob_client.put(f"audio/{user_id}/{slug}/samples/{sample_id}{ext}", data, content_type)
        with db.get_pool().connection() as conn:
            conn.execute(
                """insert into samples (song_id, sample_id, nome, blob_url, size_bytes) values (%s, %s, %s, %s, %s)
                   on conflict (song_id, sample_id) do update
                       set nome = excluded.nome, blob_url = excluded.blob_url, size_bytes = excluded.size_bytes""",
                (song_id, sample_id, nome, blob["url"], len(data)),
            )
        return {"id": sample_id, "nome": nome}

    def list_samples(self, user_id: str, slug: str) -> dict[str, dict]:
        song_id = self.songs.get_id(user_id, slug) if self.songs else None
        if not song_id:
            return {}
        with db.get_pool().connection() as conn:
            rows = conn.execute("select sample_id, nome from samples where song_id=%s", (song_id,)).fetchall()
        return {r["sample_id"]: {"nome": r["nome"]} for r in rows}

    def _sample_url(self, user_id: str, slug: str, sample_id: str) -> str | None:
        song_id = self.songs.get_id(user_id, slug)
        if not song_id:
            return None
        with db.get_pool().connection() as conn:
            row = conn.execute(
                "select blob_url from samples where song_id=%s and sample_id=%s", (song_id, sample_id),
            ).fetchone()
        return row["blob_url"] if row else None

    def sample_bytes(self, user_id: str, slug: str, sample_id: str) -> tuple[bytes, str] | None:
        url = self._sample_url(user_id, slug, sample_id)
        return blob_client.get(url) if url else None

    def delete_sample(self, user_id: str, slug: str, sample_id: str) -> None:
        song_id = self.songs.get_id(user_id, slug)
        if not song_id:
            return
        if not self.songs.is_owner(user_id, slug):
            raise NotOwner(slug)
        with db.get_pool().connection() as conn:
            row = conn.execute(
                "select blob_url from samples where song_id=%s and sample_id=%s", (song_id, sample_id),
            ).fetchone()
            if row:
                blob_client.delete([row["blob_url"]])
                conn.execute("delete from samples where song_id=%s and sample_id=%s", (song_id, sample_id))

    # ---------- limpeza ----------
    def delete_all_for_slug(self, user_id: str, slug: str) -> None:
        """Apaga a faixa + todos os samples da música, bytes e metadado.
        Independente de a música em si estar sendo apagada ou não — apaga as
        linhas de audio_tracks/samples explicitamente aqui (não dá pra
        confiar só no ON DELETE CASCADE de `songs`: SongsService.delete
        chama isto ANTES de apagar a linha em `songs`, mas o método também
        precisa funcionar chamado sozinho, sem a música ser apagada)."""
        song_id = self.songs.get_id(user_id, slug)
        if not song_id:
            return
        with db.get_pool().connection() as conn:
            urls = [
                r["blob_url"]
                for r in conn.execute(
                    """select blob_url from audio_tracks where song_id=%s
                       union all
                       select blob_url from samples where song_id=%s""",
                    (song_id, song_id),
                ).fetchall()
            ]
            conn.execute("delete from audio_tracks where song_id=%s", (song_id,))
            conn.execute("delete from samples where song_id=%s", (song_id,))
        blob_client.delete(urls)

    # ---------- recálculo de tamanho (Fase 8 — linhas antigas sem size_bytes) ----------
    def storage_recompute_status(self) -> dict:
        with db.get_pool().connection() as conn:
            row = conn.execute(
                """select (select count(*) from audio_tracks where size_bytes = 0)
                        + (select count(*) from samples where size_bytes = 0) as remaining""",
            ).fetchone()
        return {"remaining": row["remaining"]}

    def storage_recompute_batch(self, limit: int = 50) -> dict:
        """Preenche `size_bytes` de linhas antigas (upload novo já grava o
        valor certo na hora, ver save_track/save_sample) via HEAD contra o
        blob — sem baixar o conteúdo inteiro. Processa faixas primeiro, e só
        usa o que sobrar do limite em samples, mesmo padrão de lote pequeno
        do SongsService.normalize_batch (sem fila/worker no Vercel)."""
        processed = 0
        with db.get_pool().connection() as conn:
            tracks = conn.execute(
                "select song_id, blob_url from audio_tracks where size_bytes = 0 limit %s", (limit,),
            ).fetchall()
            for t in tracks:
                size = blob_client.size_of(t["blob_url"])
                conn.execute("update audio_tracks set size_bytes=%s where song_id=%s", (size, t["song_id"]))
                processed += 1
            remaining_limit = limit - processed
            if remaining_limit > 0:
                samples = conn.execute(
                    "select id, blob_url from samples where size_bytes = 0 limit %s", (remaining_limit,),
                ).fetchall()
                for s in samples:
                    size = blob_client.size_of(s["blob_url"])
                    conn.execute("update samples set size_bytes=%s where id=%s", (size, s["id"]))
                    processed += 1
        return {"processed": processed, **self.storage_recompute_status()}
