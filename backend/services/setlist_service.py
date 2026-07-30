"""Setlists — sequência de referências 'Intérprete/Título' resolvidas contra
as músicas do usuário na leitura (`setlist_items.ref` guarda o texto cru,
igual ao formato TXT de sempre — ver export_txt/import_txt).

Identidade: `setlists.slug` é definido na criação (a partir do nome) e NUNCA
recalculado — diferente de `songs.slug`. Renomear um setlist não muda a URL,
mesmo comportamento de sempre (o arquivo .txt nunca era renomeado ao editar
o @nome interno)."""
from __future__ import annotations

import db
from utils.slug import slugify


def _unique_setlist_slug(conn, user_id: str, base_slug: str) -> str:
    slug = base_slug
    suffix = 2
    while conn.execute("select 1 from setlists where user_id=%s and slug=%s", (user_id, slug)).fetchone():
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    return slug


class SetlistService:
    def _resolve_many(self, user_id: str, refs: list[str]) -> list[dict | None]:
        """Resolve várias refs 'Artista/Título' contra as músicas do usuário.

        Antes buscava a tabela `songs` inteira do usuário e comparava
        slugify() em Python por cima — com um acervo grande isso virou o
        gargalo real (~1 min pra abrir um setlist de 30 itens). Agora cada
        ref busca um conjunto pequeno de candidatos pelo índice trigram de
        `titulo` (mesma ideia do SearchService) e só entre esses a
        comparação exata por slugify(interprete, titulo) decide o match —
        o critério de match não muda, só deixa de escanear o acervo
        inteiro a cada ref."""
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
                       where user_id=%(user_id)s and (titulo ILIKE %(title_like)s OR titulo %% %(title)s)
                       order by similarity(titulo, %(title)s) desc
                       limit 20""",
                    {"user_id": user_id, "title": title, "title_like": f"%{title}%"},
                ).fetchall()
                target = (slugify(artist), slugify(title))
                match = next(
                    (dict(c) for c in candidates if (slugify(c["interprete"]), slugify(c["titulo"])) == target),
                    None,
                )
                out.append(match)
        return out

    # ---------- API ----------
    def list(self, user_id: str) -> list[dict]:
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                """select s.slug, s.nome, count(i.id) as count
                   from setlists s left join setlist_items i on i.setlist_id = s.id
                   where s.user_id=%s group by s.id, s.slug, s.nome, s.created_at
                   order by s.created_at""",
                (user_id,),
            ).fetchall()
        return [{"id": r["slug"], "nome": r["nome"], "count": r["count"]} for r in rows]

    def get(self, user_id: str, setlist_id: str) -> dict:
        with db.get_pool().connection() as conn:
            row = conn.execute(
                "select id, slug, nome from setlists where user_id=%s and slug=%s", (user_id, setlist_id),
            ).fetchone()
            if not row:
                raise FileNotFoundError(setlist_id)
            items = conn.execute(
                "select ref from setlist_items where setlist_id=%s order by position", (row["id"],),
            ).fetchall()
        refs = [i["ref"] for i in items]
        resolved = self._resolve_many(user_id, refs)
        return {
            "id": row["slug"], "nome": row["nome"],
            "items": [{"ref": ref, "song": song} for ref, song in zip(refs, resolved)],
        }

    def save(self, user_id: str, name: str, items: list[str], setlist_id: str | None = None) -> dict:
        with db.get_pool().connection() as conn:
            existing = None
            if setlist_id:
                existing = conn.execute(
                    "select id from setlists where user_id=%s and slug=%s", (user_id, setlist_id),
                ).fetchone()
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

    def delete(self, user_id: str, setlist_id: str) -> None:
        with db.get_pool().connection() as conn:
            conn.execute("delete from setlists where user_id=%s and slug=%s", (user_id, setlist_id))

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

    def remove_song_everywhere(self, user_id: str, artist: str, title: str) -> None:
        """Ao excluir uma música, remove-a de todos os setlists do usuário."""
        target = (slugify(artist), slugify(title))
        with db.get_pool().connection() as conn:
            setlists = conn.execute("select id from setlists where user_id=%s", (user_id,)).fetchall()
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
