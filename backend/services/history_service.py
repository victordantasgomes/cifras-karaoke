"""Histórico de versões + registro de execuções (mais tocadas / últimos acessos)."""
from __future__ import annotations

import difflib

import db
from services.songs_service import SongsService
from utils.parser import Song, serialize_song


class HistoryService:
    def __init__(self, songs: SongsService):
        self.songs = songs

    def _song_id(self, user_id: str, slug: str) -> str | None:
        return self.songs.get_id(user_id, slug)

    # ---------- versões ----------
    def versions(self, user_id: str, slug: str) -> list[dict]:
        song_id = self._song_id(user_id, slug)
        if not song_id:
            return []
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                "select id, saved_at from song_versions where song_id=%s order by saved_at desc",
                (song_id,),
            ).fetchall()
        return [{"id": str(r["id"]), "saved_at": r["saved_at"].isoformat()} for r in rows]

    def _fetch_version(self, user_id: str, slug: str, version_id: str) -> dict:
        song_id = self._song_id(user_id, slug)
        if not song_id:
            raise FileNotFoundError(version_id)
        with db.get_pool().connection() as conn:
            row = conn.execute(
                "select header, body from song_versions where id=%s and song_id=%s",
                (version_id, song_id),
            ).fetchone()
        if not row:
            raise FileNotFoundError(version_id)
        return row

    def read_version(self, user_id: str, slug: str, version_id: str) -> str:
        row = self._fetch_version(user_id, slug, version_id)
        return serialize_song(Song(header=row["header"], body=row["body"]))

    def diff(self, user_id: str, slug: str, version_id: str) -> list[str]:
        """Diff unificado entre a versão e o arquivo atual (para diff colorido no front)."""
        row = self._fetch_version(user_id, slug, version_id)
        old_body = row["body"].splitlines()
        current = self.songs.get(user_id, slug)
        new_body = current["body"].splitlines()
        return list(difflib.unified_diff(old_body, new_body, "versão", "atual", lineterm=""))

    def restore(self, user_id: str, slug: str, version_id: str) -> dict:
        row = self._fetch_version(user_id, slug, version_id)
        return self.songs.update(user_id, slug, row["header"], row["body"])

    # ---------- execuções (plays) ----------
    def register_play(self, user_id: str, slug: str) -> None:
        song_id = self._song_id(user_id, slug)
        if not song_id:
            return
        with db.get_pool().connection() as conn:
            conn.execute(
                """insert into song_plays (song_id, count, last_played_at) values (%s, 1, now())
                   on conflict (song_id) do update
                       set count = song_plays.count + 1, last_played_at = now()""",
                (song_id,),
            )

    def plays(self, user_id: str) -> dict:
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                """select s.slug, p.count, p.last_played_at from song_plays p
                   join songs s on s.id = p.song_id where s.user_id = %s""",
                (user_id,),
            ).fetchall()
        return {
            r["slug"]: {"count": r["count"], "last": r["last_played_at"].isoformat() if r["last_played_at"] else None}
            for r in rows
        }
