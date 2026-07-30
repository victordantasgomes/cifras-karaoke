"""Regras de negócio de músicas: CRUD, upload e transposição.

Identidade: `songs.id` (uuid) é estável — nunca muda depois de criada.
`songs.slug` é recalculado a cada update a partir de gênero+intérprete+
título (mesmo comportamento de sempre: o frontend já trata a troca de slug
depois de salvar — ver SongEditor.jsx). As colunas soltas (titulo, autor,
interprete, tom, ritmo, tags, velocidade, nota, favorita) são uma
desnormalização do `header` (JSONB) mantida em sincronia a cada
create/update — substituem o antigo IndexEntry/IndexService em memória, sem
precisar reconstruir nada: toda leitura já é uma query.
"""
from __future__ import annotations

from psycopg.types.json import Json

import db
from utils.parser import HEADER_FIELDS, parse_song
from utils.slug import slugify
from utils.transpose import semitones_between, transpose_body

_SONG_COLUMNS = (
    "id, user_id, slug, genero, titulo, autor, interprete, tom, ritmo, "
    "tags, velocidade, nota, favorita, header, body"
)


class SongNotFound(Exception):
    pass


def _denormalize(header: dict) -> dict:
    try:
        velocidade = max(1, min(100, int(header.get("velocidade") or 50)))
    except ValueError:
        velocidade = 50
    return {
        "titulo": header.get("titulo") or "",
        "autor": header.get("autor") or "",
        "interprete": header.get("intérprete") or "",
        "tom": header.get("tom") or "",
        "ritmo": header.get("ritmomusical") or "",
        "tags": [t.strip() for t in (header.get("tags") or "").split(",") if t.strip()],
        "velocidade": velocidade,
        "nota": header.get("nota") or "",
        "favorita": (header.get("favorita") or "").strip().lower() in ("sim", "true", "1", "yes"),
    }


def _row_to_dict(row: dict) -> dict:
    return {
        "slug": row["slug"], "titulo": row["titulo"], "autor": row["autor"],
        "interprete": row["interprete"], "genero": row["genero"], "tom": row["tom"],
        "tags": row["tags"], "velocidade": row["velocidade"], "nota": row["nota"],
        "favorita": row["favorita"], "ritmo": row["ritmo"],
    }


def _unique_slug(conn, user_id: str, base_slug: str, exclude_id: str | None = None) -> str:
    """Evita colidir com o slug de OUTRA música do mesmo usuário — o antigo
    índice em memória deixava isso acontecer silenciosamente (uma música
    ficava inacessível); aqui resolvemos anexando um sufixo curto."""
    slug = base_slug
    suffix = 2
    while True:
        row = conn.execute(
            "select id from songs where user_id=%s and slug=%s and id != coalesce(%s, '00000000-0000-0000-0000-000000000000'::uuid)",
            (user_id, slug, exclude_id),
        ).fetchone()
        if not row:
            return slug
        slug = f"{base_slug}-{suffix}"
        suffix += 1


class SongsService:
    def __init__(self, setlists=None, audio=None):
        self.setlists = setlists  # injetado depois para evitar ciclo
        self.audio = audio  # idem — AudioService

    # ---------- leitura ----------
    def _fetch(self, user_id: str, slug: str) -> dict | None:
        with db.get_pool().connection() as conn:
            return conn.execute(
                f"select {_SONG_COLUMNS} from songs where user_id=%s and slug=%s", (user_id, slug),
            ).fetchone()

    def get(self, user_id: str, slug: str) -> dict:
        row = self._fetch(user_id, slug)
        if not row:
            raise SongNotFound(slug)
        return {**_row_to_dict(row), "header": row["header"], "body": row["body"]}

    def get_id(self, user_id: str, slug: str) -> str | None:
        """id (uuid) estável da música — usado por outros services (histórico,
        áudio) pra referenciar via FK sem reimplementar a busca por slug."""
        row = self._fetch(user_id, slug)
        return row["id"] if row else None

    # ---------- upload / criação ----------
    def create(self, user_id: str, genre: str, artist: str, title: str, content: str) -> dict:
        song = parse_song(content)
        song.header.setdefault("titulo", title)
        song.header["titulo"] = song.header["titulo"] or title
        song.header["intérprete"] = song.header.get("intérprete") or artist
        song.header.setdefault("velocidade", "50")
        song.header.setdefault("modoexecucao", "rolagem")
        for f in HEADER_FIELDS:
            song.header.setdefault(f, "")

        denorm = _denormalize(song.header)
        base_slug = slugify(genre, song.header["intérprete"], song.header["titulo"]) or slugify(title)
        with db.get_pool().connection() as conn:
            slug = _unique_slug(conn, user_id, base_slug)
            row = conn.execute(
                f"""insert into songs (user_id, slug, genero, titulo, autor, interprete, tom, ritmo,
                                        tags, velocidade, nota, favorita, header, body)
                    values (%(user_id)s, %(slug)s, %(genero)s, %(titulo)s, %(autor)s, %(interprete)s,
                            %(tom)s, %(ritmo)s, %(tags)s, %(velocidade)s, %(nota)s, %(favorita)s,
                            %(header)s, %(body)s)
                    returning {_SONG_COLUMNS}""",
                {"user_id": user_id, "slug": slug, "genero": genre, "body": song.body,
                 "header": Json(song.header), **denorm},
            ).fetchone()
        return _row_to_dict(row)

    # ---------- edição ----------
    def update(self, user_id: str, slug: str, header: dict, body: str) -> dict:
        row = self._fetch(user_id, slug)
        if not row:
            raise SongNotFound(slug)
        full_header = {f: str(header.get(f, "")) for f in HEADER_FIELDS}
        denorm = _denormalize(full_header)

        with db.get_pool().connection() as conn:
            # versão anterior vai para o histórico
            conn.execute(
                "insert into song_versions (song_id, header, body) values (%s, %s, %s)",
                (row["id"], Json(row["header"]), row["body"]),
            )
            base_slug = slugify(row["genero"], full_header.get("intérprete", ""), full_header.get("titulo", "")) or row["slug"]
            new_slug = _unique_slug(conn, user_id, base_slug, exclude_id=row["id"])
            new_row = conn.execute(
                f"""update songs set slug=%(slug)s, titulo=%(titulo)s, autor=%(autor)s,
                           interprete=%(interprete)s, tom=%(tom)s, ritmo=%(ritmo)s, tags=%(tags)s,
                           velocidade=%(velocidade)s, nota=%(nota)s, favorita=%(favorita)s,
                           header=%(header)s, body=%(body)s, updated_at=now()
                    where id=%(id)s returning {_SONG_COLUMNS}""",
                {"id": row["id"], "slug": new_slug, "header": Json(full_header), "body": body, **denorm},
            ).fetchone()
            # poda histórico: mantém só as 50 versões mais recentes
            conn.execute(
                """delete from song_versions where song_id=%s and id not in (
                       select id from song_versions where song_id=%s order by saved_at desc limit 50
                   )""",
                (row["id"], row["id"]),
            )
        return _row_to_dict(new_row)

    def set_favorite(self, user_id: str, slug: str, value: bool) -> dict:
        data = self.get(user_id, slug)
        data["header"]["favorita"] = "sim" if value else ""
        return self.update(user_id, slug, data["header"], data["body"])

    def set_rating(self, user_id: str, slug: str, nota: int) -> dict:
        data = self.get(user_id, slug)
        data["header"]["nota"] = str(max(1, min(10, int(nota))))
        return self.update(user_id, slug, data["header"], data["body"])

    # ---------- exclusão ----------
    def delete(self, user_id: str, slug: str) -> None:
        row = self._fetch(user_id, slug)
        if not row:
            raise SongNotFound(slug)
        if self.audio:
            # limpa os bytes de verdade (disco local na Fase 1 / Blob na Fase 2)
            # — as linhas em audio_tracks/samples somem via ON DELETE CASCADE,
            # mas isso não apaga o arquivo/objeto armazenado.
            self.audio.delete_all_for_slug(user_id, row["slug"])
        with db.get_pool().connection() as conn:
            conn.execute("delete from songs where id=%s", (row["id"],))
        if self.setlists:
            self.setlists.remove_song_everywhere(user_id, row["interprete"], row["titulo"])

    # ---------- transposição ----------
    def transpose(self, user_id: str, slug: str, *, semitones: int | None = None,
                  to_key: str | None = None, save: bool = False) -> dict:
        data = self.get(user_id, slug)
        current_key = data["header"].get("tom", "")
        if semitones is None:
            if not to_key:
                raise ValueError("Informe semitones ou to_key.")
            if not current_key:
                raise ValueError("A música não possui @tom definido no cabeçalho.")
            semitones = semitones_between(current_key, to_key)
        prefer_flats = "b" in (to_key or "")

        new_body = transpose_body(data["body"], semitones, prefer_flats)
        new_key = to_key or _shift_key(current_key, semitones)
        header = dict(data["header"])
        header["tom"] = new_key

        if save:
            self.update(user_id, slug, header, new_body)
        return {"tom": new_key, "semitones": semitones, "body": new_body, "header": header}


def _shift_key(key: str, semitones: int) -> str:
    from utils.transpose import transpose_chord
    return transpose_chord(key, semitones) if key else key
