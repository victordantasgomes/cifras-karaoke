"""Setlists — sequência de referências 'Intérprete/Título' resolvidas contra
a biblioteca de músicas na leitura (`setlist_items.ref` guarda o texto cru,
igual ao formato TXT de sempre — ver export_txt/import_txt).

Identidade: `setlists.slug` é definido na criação (a partir do nome) e NUNCA
recalculado — diferente de `songs.slug`. Renomear um setlist não muda a URL,
mesmo comportamento de sempre (o arquivo .txt nunca era renomeado ao editar
o @nome interno).

Compartilhamento: `shared` (default true) controla se OUTROS usuários
enxergam/tocam o setlist — quem não é dono só tem leitura (ver/tocar); криar,
renomear, reordenar, excluir e alternar o compartilhamento continuam
restritos ao dono (levanta `PermissionError`, não silenciosamente cria outro
setlist como acontecia antes)."""
from __future__ import annotations

import db
from utils.slug import slugify
from utils.song_title import strip_title_suffix


def _unique_setlist_slug(conn, user_id: str, base_slug: str) -> str:
    slug = base_slug
    suffix = 2
    while conn.execute("select 1 from setlists where user_id=%s and slug=%s", (user_id, slug)).fetchone():
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    return slug


class SetlistService:
    def __init__(self, quota=None):
        self.quota = quota  # injetado depois pra evitar ciclo com QuotaService

    def _resolve_many(self, refs: list[str]) -> list[dict | None]:
        """Resolve várias refs 'Artista/Título' contra a biblioteca inteira
        (biblioteca global — não filtra mais por dono do setlist).

        Cada ref busca um conjunto pequeno de candidatos pelo índice trigram
        de `titulo` (mesma ideia do SearchService) e só entre esses a
        comparação exata por slugify(interprete, titulo) decide o match —
        `strip_title_suffix` porque títulos normalizados/clonados ganham um
        sufixo ("... - cifra original"/"... - cifra editada por: X") que uma
        ref escrita antes disso não tem."""
        out: list[dict | None] = []
        with db.get_pool().connection() as conn:
            # operador "%" do pg_trgm (não a função similarity()) é o que o
            # planner consegue acelerar com o índice GIN de titulo — usar só
            # a função em WHERE cai pra seq scan (ver histórico do commit).
            conn.execute("set pg_trgm.similarity_threshold = 0.25")
            for ref in refs:
                if "/" not in ref:
                    out.append(None)
                    continue
                artist, title = ref.split("/", 1)
                candidates = conn.execute(
                    """select slug, titulo, autor, interprete, genero, tom, tags, velocidade,
                              nota, favorita, ritmo from songs
                       where titulo ILIKE %(title_like)s OR titulo %% %(title)s
                       order by similarity(titulo, %(title)s) desc
                       limit 20""",
                    {"title": title, "title_like": f"%{title}%"},
                ).fetchall()
                target = (slugify(artist), slugify(title))
                match = next(
                    (dict(c) for c in candidates
                     if (slugify(c["interprete"]), slugify(strip_title_suffix(c["titulo"]))) == target),
                    None,
                )
                out.append(match)
        return out

    # ---------- API ----------
    def list(self, user_id: str) -> list[dict]:
        """Setlists do usuário + de qualquer outra pessoa que estejam
        `shared=true` (biblioteca global de setlists, com privacidade
        opcional por setlist)."""
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                """select s.slug, s.nome, s.user_id, s.shared, count(i.id) as count
                   from setlists s left join setlist_items i on i.setlist_id = s.id
                   where s.user_id = %(user_id)s or s.shared = true or s.user_id is null
                   group by s.id, s.slug, s.nome, s.user_id, s.shared, s.created_at
                   order by s.created_at""",
                {"user_id": user_id},
            ).fetchall()
        return [
            {"id": r["slug"], "nome": r["nome"], "count": r["count"],
             "is_owner": r["user_id"] is None or r["user_id"] == user_id, "shared": r["shared"]}
            for r in rows
        ]

    def get(self, user_id: str, setlist_id: str) -> dict:
        with db.get_pool().connection() as conn:
            row = conn.execute(
                "select id, slug, nome, user_id, shared from setlists where slug=%s", (setlist_id,),
            ).fetchone()
            is_owner = not row or row["user_id"] is None or row["user_id"] == user_id
            if not row or (not is_owner and not row["shared"]):
                raise FileNotFoundError(setlist_id)
            items = conn.execute(
                "select ref from setlist_items where setlist_id=%s order by position", (row["id"],),
            ).fetchall()
        refs = [i["ref"] for i in items]
        resolved = self._resolve_many(refs)
        return {
            "id": row["slug"], "nome": row["nome"],
            "is_owner": is_owner, "shared": row["shared"],
            "items": [{"ref": ref, "song": song} for ref, song in zip(refs, resolved)],
        }

    def save(self, user_id: str, name: str, items: list[str], setlist_id: str | None = None) -> dict:
        """Setlist órfão (dono excluído — ver AuthService.delete_user) pode
        ser editado por qualquer um, mesma lógica de "música órfã" em
        SongsService.update: conteúdo sobrevive à exclusão do usuário, mas
        sem dono ninguém ficaria travado pra sempre incapaz de mexer nele.

        Limites de plano (ver QuotaService) são checados ANTES de qualquer
        escrita — estourar o limite não grava nada parcial pra depois
        avisar, a ação inteira é bloqueada de cara."""
        existing = None
        if setlist_id:
            with db.get_pool().connection() as conn:
                existing = conn.execute(
                    "select id, user_id from setlists where slug=%s", (setlist_id,),
                ).fetchone()
            if existing and existing["user_id"] is not None and existing["user_id"] != user_id:
                raise PermissionError(setlist_id)

        if self.quota:
            if not existing:
                self.quota.check_setlist_creation(user_id)
            self.quota.check_setlist_storage(user_id, items, exclude_setlist_pk=existing["id"] if existing else None)

        with db.get_pool().connection() as conn:
            if existing:
                setlist_pk, slug = existing["id"], setlist_id
                conn.execute("update setlists set nome=%s where id=%s", (name, setlist_pk))
                conn.execute("delete from setlist_items where setlist_id=%s", (setlist_pk,))
            else:
                slug = _unique_setlist_slug(conn, user_id, slugify(setlist_id or name) or "setlist")
                new_row = conn.execute(
                    "insert into setlists (user_id, slug, nome) values (%s, %s, %s) returning id",
                    (user_id, slug, name),
                ).fetchone()
                setlist_pk = new_row["id"]
            for position, ref in enumerate(items):
                conn.execute(
                    "insert into setlist_items (setlist_id, position, ref) values (%s, %s, %s)",
                    (setlist_pk, position, ref),
                )
        return {"id": slug, "nome": name, "count": len(items)}

    def set_shared(self, user_id: str, setlist_id: str, value: bool) -> dict:
        with db.get_pool().connection() as conn:
            row = conn.execute(
                "select id, user_id from setlists where slug=%s", (setlist_id,),
            ).fetchone()
            if not row:
                raise FileNotFoundError(setlist_id)
            if row["user_id"] is not None and row["user_id"] != user_id:
                raise PermissionError(setlist_id)
            conn.execute("update setlists set shared=%s where id=%s", (value, row["id"]))
        return self.get(user_id, setlist_id)

    def delete(self, user_id: str, setlist_id: str) -> None:
        with db.get_pool().connection() as conn:
            row = conn.execute(
                "select user_id from setlists where slug=%s", (setlist_id,),
            ).fetchone()
            if not row:
                return  # já não existe — idempotente, como sempre foi
            if row["user_id"] is not None and row["user_id"] != user_id:
                raise PermissionError(setlist_id)
            conn.execute("delete from setlists where slug=%s", (setlist_id,))

    def export_txt(self, user_id: str, setlist_id: str) -> str:
        data = self.get(user_id, setlist_id)
        items = [i["ref"] for i in data["items"]]
        return f"@nome: {data['nome']}\n\n" + "\n".join(items) + "\n"

    def import_txt(self, user_id: str, content: str) -> dict:
        name, items = "", []
        for line in content.splitlines():
            line = line.strip()
            if not line:
                continue
            if line.lower().startswith("@nome:"):
                name = line.split(":", 1)[1].strip()
            else:
                items.append(line)
        return self.save(user_id, name or "Setlist importado", items)

    def remove_song_everywhere(self, artist: str, title: str) -> None:
        """Ao excluir uma música, remove-a dos setlists de TODOS os usuários
        (biblioteca global — não só dos setlists de quem excluiu)."""
        target = (slugify(artist), slugify(title))
        with db.get_pool().connection() as conn:
            setlists = conn.execute("select id from setlists").fetchall()
            for sl in setlists:
                items = conn.execute(
                    "select id, ref from setlist_items where setlist_id=%s", (sl["id"],),
                ).fetchall()
                for item in items:
                    ref = item["ref"]
                    if "/" not in ref:
                        continue
                    artist_part, title_part = ref.split("/", 1)
                    if (slugify(artist_part), slugify(title_part)) == target:
                        conn.execute("delete from setlist_items where id=%s", (item["id"],))
