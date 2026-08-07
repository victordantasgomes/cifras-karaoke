"""Regras de negócio de músicas: CRUD, upload, transposição e normalização.

Biblioteca global: toda música é legível por qualquer usuário logado —
`user_id` deixou de ser um filtro de leitura e virou só "quem criou (ou
clonou) esta música" (pode até ser NULL, se essa pessoa for excluída depois).
Editar uma música que não é sua nunca modifica o original: clona (ver
update()/`_clone_and_update`). Excluir e mexer no áudio continuam restritos
ao criador (ou admin).

Identidade: `songs.id` (uuid) é estável — nunca muda depois de criada.
`songs.slug` é recalculado a cada update a partir de gênero+intérprete+
título — agora único GLOBALMENTE, não mais por usuário (mesmo comportamento
de sempre pro frontend: ver SongEditor.jsx tratando a troca de slug depois
de salvar). As colunas soltas (titulo, autor, interprete, tom, ritmo, tags,
velocidade, normalizada) são uma desnormalização do `header` (JSONB)
mantida em sincronia a cada create/update. `favorita`/`nota` são preferência
de QUEM VÊ a música, não da música em si — vivem em `user_song_prefs`, não
nessas colunas (que ficam paradas, sem uso, só por segurança/rollback)."""
from __future__ import annotations

from psycopg.types.json import Json

import db
from utils.parser import HEADER_FIELDS, parse_song
from utils.slug import slugify
from utils.song_normalizer import normalize_song
from utils.song_title import apply_edited_suffix
from utils.transpose import semitones_between, transpose_body

_SONG_COLUMNS = (
    "songs.id, songs.user_id, songs.slug, songs.genero, songs.titulo, songs.autor, songs.interprete, "
    "songs.tom, songs.ritmo, songs.tags, songs.velocidade, songs.nota, songs.favorita, songs.normalizada, "
    "songs.header, songs.body"
)


class SongNotFound(Exception):
    pass


class NotOwner(Exception):
    """Ação restrita a quem criou a música (ou a um admin) — ex.: excluir,
    mexer no áudio. Editar é sempre permitido (clona em vez de bloquear)."""
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
        "normalizada": (header.get("normalizada") or "").strip().lower() in ("sim", "true", "1", "yes"),
    }


def _row_to_dict(row: dict) -> dict:
    return {
        "slug": row["slug"], "titulo": row["titulo"], "autor": row["autor"],
        "interprete": row["interprete"], "genero": row["genero"], "tom": row["tom"],
        "tags": row["tags"], "velocidade": row["velocidade"], "nota": row["nota"],
        "favorita": row["favorita"], "ritmo": row["ritmo"], "normalizada": row["normalizada"],
        "user_id": row["user_id"],
    }


def _unique_slug(conn, base_slug: str, exclude_id: str | None = None) -> str:
    """Slug único GLOBALMENTE (biblioteca compartilhada) — antes era só por
    usuário. Colisão vira sufixo curto, mesma ideia de sempre."""
    slug = base_slug
    suffix = 2
    while True:
        row = conn.execute(
            "select id from songs where slug=%s and id != coalesce(%s, '00000000-0000-0000-0000-000000000000'::uuid)",
            (slug, exclude_id),
        ).fetchone()
        if not row:
            return slug
        slug = f"{base_slug}-{suffix}"
        suffix += 1


class SongsService:
    def __init__(self, setlists=None, audio=None, clips=None):
        self.setlists = setlists  # injetado depois para evitar ciclo
        self.audio = audio  # idem — AudioService
        self.clips = clips  # idem — ClipQueueService

    # ---------- leitura ----------
    def _fetch(self, slug: str) -> dict | None:
        """Busca global — não filtra por usuário (biblioteca compartilhada)."""
        with db.get_pool().connection() as conn:
            return conn.execute(
                f"select {_SONG_COLUMNS} from songs where slug=%s", (slug,),
            ).fetchone()

    def get(self, user_id: str, slug: str) -> dict:
        with db.get_pool().connection() as conn:
            row = conn.execute(
                f"""select {_SONG_COLUMNS}, coalesce(p.favorita, false) as pref_favorita,
                           coalesce(p.nota, '') as pref_nota
                    from songs left join user_song_prefs p
                           on p.song_id = songs.id and p.user_id = %(user_id)s
                    where songs.slug = %(slug)s""",
                {"user_id": user_id, "slug": slug},
            ).fetchone()
        if not row:
            raise SongNotFound(slug)
        data = _row_to_dict(row)
        data["favorita"] = row["pref_favorita"]
        data["nota"] = row["pref_nota"]
        return {**data, "header": row["header"], "body": row["body"]}

    def get_id(self, user_id: str, slug: str) -> str | None:
        """id (uuid) estável da música — usado por outros services (histórico,
        áudio) pra referenciar via FK sem reimplementar a busca por slug.
        `user_id` não filtra mais nada aqui (busca é global) — mantido na
        assinatura porque os chamadores (AudioService/HistoryService) ainda
        o usam pra decidir dono em métodos de escrita (ver is_owner)."""
        row = self._fetch(slug)
        return row["id"] if row else None

    def is_owner(self, user_id: str, slug: str) -> bool:
        row = self._fetch(slug)
        return bool(row) and row["user_id"] == user_id

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
            slug = _unique_slug(conn, base_slug)
            row = conn.execute(
                f"""insert into songs (user_id, slug, genero, titulo, autor, interprete, tom, ritmo,
                                        tags, velocidade, nota, favorita, normalizada, header, body)
                    values (%(user_id)s, %(slug)s, %(genero)s, %(titulo)s, %(autor)s, %(interprete)s,
                            %(tom)s, %(ritmo)s, %(tags)s, %(velocidade)s, %(nota)s, %(favorita)s,
                            %(normalizada)s, %(header)s, %(body)s)
                    returning {_SONG_COLUMNS}""",
                {"user_id": user_id, "slug": slug, "genero": genre, "body": song.body,
                 "header": Json(song.header), **denorm},
            ).fetchone()
        return _row_to_dict(row)

    # ---------- edição ----------
    def update(self, user_id: str, slug: str, header: dict, body: str, editor_name: str = "") -> dict:
        """Dono (ou música "órfã", sem dono) edita in-place, como sempre.
        Não-dono NUNCA mexe no original: gera uma cópia nova, sua, com
        origin_song_id apontando pra original e o título marcado como
        "cifra editada por: <editor_name>" (ver utils/song_title.py)."""
        row = self._fetch(slug)
        if not row:
            raise SongNotFound(slug)
        if row["user_id"] is not None and row["user_id"] != user_id:
            return self._clone_and_update(user_id, editor_name, row, header, body)
        return self._update_owned(row, header, body)

    def _update_owned(self, row: dict, header: dict, body: str) -> dict:
        full_header = {f: str(header.get(f, "")) for f in HEADER_FIELDS}
        denorm = _denormalize(full_header)

        with db.get_pool().connection() as conn:
            # versão anterior vai para o histórico
            conn.execute(
                "insert into song_versions (song_id, header, body) values (%s, %s, %s)",
                (row["id"], Json(row["header"]), row["body"]),
            )
            base_slug = slugify(row["genero"], full_header.get("intérprete", ""), full_header.get("titulo", "")) or row["slug"]
            new_slug = _unique_slug(conn, base_slug, exclude_id=row["id"])
            new_row = conn.execute(
                f"""update songs set slug=%(slug)s, titulo=%(titulo)s, autor=%(autor)s,
                           interprete=%(interprete)s, tom=%(tom)s, ritmo=%(ritmo)s, tags=%(tags)s,
                           velocidade=%(velocidade)s, nota=%(nota)s, favorita=%(favorita)s,
                           normalizada=%(normalizada)s, header=%(header)s, body=%(body)s, updated_at=now()
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

    def _clone_and_update(self, user_id: str, editor_name: str, row: dict, header: dict, body: str) -> dict:
        full_header = {f: str(header.get(f, "")) for f in HEADER_FIELDS}
        full_header["titulo"] = apply_edited_suffix(
            full_header.get("titulo", ""), full_header.get("intérprete", ""), editor_name,
        )
        denorm = _denormalize(full_header)
        base_slug = slugify(row["genero"], full_header.get("intérprete", ""), full_header["titulo"]) or row["slug"]

        with db.get_pool().connection() as conn:
            new_slug = _unique_slug(conn, base_slug)
            new_row = conn.execute(
                f"""insert into songs (user_id, slug, genero, origin_song_id, titulo, autor, interprete,
                                        tom, ritmo, tags, velocidade, nota, favorita, normalizada, header, body)
                    values (%(user_id)s, %(slug)s, %(genero)s, %(origin_song_id)s, %(titulo)s, %(autor)s,
                            %(interprete)s, %(tom)s, %(ritmo)s, %(tags)s, %(velocidade)s, %(nota)s,
                            %(favorita)s, %(normalizada)s, %(header)s, %(body)s)
                    returning {_SONG_COLUMNS}""",
                {"user_id": user_id, "slug": new_slug, "genero": row["genero"], "origin_song_id": row["id"],
                 "header": Json(full_header), "body": body, **denorm},
            ).fetchone()
        return _row_to_dict(new_row)

    def set_favorite(self, user_id: str, slug: str, value: bool) -> dict:
        song_id = self.get_id(user_id, slug)
        if not song_id:
            raise SongNotFound(slug)
        with db.get_pool().connection() as conn:
            conn.execute(
                """insert into user_song_prefs (user_id, song_id, favorita) values (%s, %s, %s)
                   on conflict (user_id, song_id) do update set favorita=excluded.favorita""",
                (user_id, song_id, value),
            )
        return self.get(user_id, slug)

    def set_rating(self, user_id: str, slug: str, nota: int) -> dict:
        song_id = self.get_id(user_id, slug)
        if not song_id:
            raise SongNotFound(slug)
        nota_str = str(max(1, min(10, int(nota))))
        with db.get_pool().connection() as conn:
            conn.execute(
                """insert into user_song_prefs (user_id, song_id, nota) values (%s, %s, %s)
                   on conflict (user_id, song_id) do update set nota=excluded.nota""",
                (user_id, song_id, nota_str),
            )
        return self.get(user_id, slug)

    # ---------- exclusão ----------
    def delete(self, user_id: str, slug: str, is_admin: bool = False) -> None:
        row = self._fetch(slug)
        if not row:
            raise SongNotFound(slug)
        if row["user_id"] is not None and row["user_id"] != user_id and not is_admin:
            raise NotOwner(slug)
        if self.audio:
            # limpa os bytes de verdade (disco local na Fase 1 / Blob na Fase 2)
            # — as linhas em audio_tracks/samples somem via ON DELETE CASCADE,
            # mas isso não apaga o arquivo/objeto armazenado.
            self.audio.delete_all_for_slug(user_id, row["slug"])
        if self.clips:
            self.clips.delete_all_for_song(user_id, row["slug"])
        with db.get_pool().connection() as conn:
            conn.execute("delete from songs where id=%s", (row["id"],))
        if self.setlists:
            self.setlists.remove_song_everywhere(row["interprete"], row["titulo"])

    # ---------- transposição ----------
    def transpose(self, user_id: str, slug: str, *, semitones: int | None = None,
                  to_key: str | None = None, save: bool = False, editor_name: str = "") -> dict:
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
            self.update(user_id, slug, header, new_body, editor_name=editor_name)
        return {"tom": new_key, "semitones": semitones, "body": new_body, "header": header}

    # ---------- normalização ----------
    def normalize(self, user_id: str, slug: str, editor_name: str = "") -> dict:
        """Padroniza cabeçalho, notação de acordes e rótulos de seção — nunca
        mexe no espaçamento entre acorde e letra (ver utils/song_normalizer.py).
        Salva via update(), que já arquiva o estado anterior em song_versions
        quando é dono (tanto o "desfazer" imediato quanto o "restaurar
        versão" no histórico funcionam sem nenhum mecanismo novo) — e clona
        do mesmo jeito que qualquer edição, se quem normaliza não é o dono."""
        data = self.get(user_id, slug)
        header, body = normalize_song(data["header"], data["body"])
        result = self.update(user_id, slug, header, body, editor_name=editor_name)
        # update() só devolve as colunas soltas (mesmo formato de create()) —
        # o editor precisa do header/body completos pra atualizar a tela sem
        # esperar o refetch.
        return self.get(user_id, result["slug"])

    def normalize_status(self) -> dict:
        with db.get_pool().connection() as conn:
            row = conn.execute("select count(*) as remaining from songs where normalizada = false").fetchone()
        return {"remaining": row["remaining"]}

    def normalize_batch(self, limit: int = 50) -> dict:
        """Normaliza até `limit` músicas ainda não-normalizadas (índice
        idx_songs_normalizada cobre esse filtro). Reescrita administrativa,
        sem checagem de dono — reaproveita _update_owned diretamente (mesma
        gravação in-place + arquivamento em song_versions do fluxo comum),
        chamada em lotes pelo cliente (Settings.jsx) já que o Vercel não tem
        fila/worker pra processar as ~24 mil músicas de uma vez só."""
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                f"select {_SONG_COLUMNS} from songs where normalizada = false limit %s", (limit,),
            ).fetchall()
        for row in rows:
            header, body = normalize_song(row["header"], row["body"])
            self._update_owned(dict(row), header, body)
        return {"processed": len(rows), **self.normalize_status()}


def _shift_key(key: str, semitones: int) -> str:
    from utils.transpose import transpose_chord
    return transpose_chord(key, semitones) if key else key
