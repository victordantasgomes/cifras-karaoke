"""Regras de negócio de músicas: CRUD, upload, transposição e normalização.

Biblioteca global: toda música é legível por qualquer usuário logado —
`user_id` deixou de ser um filtro de leitura e virou só "quem criou (ou
clonou) esta música" (pode até ser NULL, se essa pessoa for excluída depois).
Editar (in-place) é restrito a quem é dono (ou admin) — quem não é dono
precisa clonar explicitamente primeiro (ver clone()/`_clone_and_update`) e
edita a própria cópia depois. Excluir e mexer no áudio continuam restritos
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

import difflib

from psycopg.types.json import Json

import db
from utils.parser import HEADER_FIELDS, parse_song
from utils.slug import slugify
from utils.song_normalizer import normalize_song
from utils.song_title import apply_edited_suffix, strip_title_suffix
from utils.transpose import semitones_between, transpose_body

# "Muito muito similar" (pedido do usuário) — limiar alto de propósito:
# nome igual sozinho não basta pra virar "mesma música, versão diferente"
# (podem ser músicas diferentes que só compartilham título, ex.: covers com
# letra reescrita) — ver _cluster_by_lyrics.
_VERSION_SIMILARITY_THRESHOLD = 0.85

_SONG_COLUMNS = (
    "songs.id, songs.user_id, songs.slug, songs.genero, songs.titulo, songs.autor, songs.interprete, "
    "songs.tom, songs.ritmo, songs.tags, songs.velocidade, songs.nota, songs.favorita, songs.normalizada, "
    "songs.shared, songs.header, songs.body"
)

# visibilidade multi-tenant: dono vê sempre, música compartilhada ou órfã
# (dono excluído) todo mundo vê — mesmo padrão já usado em setlist_service.py.
_VISIBLE_SQL = "(songs.user_id = %(user_id)s OR songs.shared = true OR songs.user_id IS NULL)"


def _visible_sql(is_admin: bool) -> str:
    """Admin vê tudo, independente de `shared`/dono (Decisão §4 do plano de
    pedal+SaaS) — mesmo princípio já usado em SongsService.delete(...,
    is_admin=True), aplicado agora também à leitura."""
    return "true" if is_admin else _VISIBLE_SQL


class SongNotFound(Exception):
    pass


class NotOwner(Exception):
    """Ação restrita a quem criou a música (ou a um admin) — excluir, mexer
    no áudio, e agora também editar in-place (ver update()). Clonar
    (clone()) continua liberado pra qualquer um, é assim que se contorna
    essa restrição pra fazer adaptações próprias."""
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
        "user_id": row["user_id"], "shared": row["shared"],
    }


def _share_by_default(conn, user_id: str) -> bool:
    row = conn.execute("select share_by_default from users where id=%s", (user_id,)).fetchone()
    return bool(row["share_by_default"]) if row else True


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
    def __init__(self, setlists=None, audio=None, clips=None, youtube=None):
        self.setlists = setlists  # injetado depois para evitar ciclo
        self.audio = audio  # idem — AudioService
        self.clips = clips  # idem — ClipQueueService
        self.youtube = youtube  # idem — YoutubeService (busca real de vídeo)

    # ---------- leitura ----------
    def _fetch(self, slug: str) -> dict | None:
        """Busca global — não filtra por usuário (biblioteca compartilhada)."""
        with db.get_pool().connection() as conn:
            return conn.execute(
                f"select {_SONG_COLUMNS} from songs where slug=%s", (slug,),
            ).fetchone()

    def get(self, user_id: str, slug: str, is_admin: bool = False) -> dict:
        with db.get_pool().connection() as conn:
            row = conn.execute(
                f"""select {_SONG_COLUMNS}, coalesce(p.favorita, false) as pref_favorita,
                           coalesce(p.nota, '') as pref_nota
                    from songs left join user_song_prefs p
                           on p.song_id = songs.id and p.user_id = %(user_id)s
                    where songs.slug = %(slug)s and {_visible_sql(is_admin)}""",
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
        # strip_title_suffix: título já normalizado vem com "- intérprete -
        # cifra original" embutido (ver song_normalizer.py) — sem isso o
        # slug duplicava o intérprete e ganhava "cifra"/"original" como
        # segmentos soltos (ex.: "pop--coldplay--yellow---coldplay---cifra-original").
        base_slug = slugify(genre, song.header["intérprete"], strip_title_suffix(song.header["titulo"])) or slugify(title)
        with db.get_pool().connection() as conn:
            shared = _share_by_default(conn, user_id)
            slug = _unique_slug(conn, base_slug)
            row = conn.execute(
                f"""insert into songs (user_id, slug, genero, titulo, autor, interprete, tom, ritmo,
                                        tags, velocidade, nota, favorita, normalizada, shared, header, body)
                    values (%(user_id)s, %(slug)s, %(genero)s, %(titulo)s, %(autor)s, %(interprete)s,
                            %(tom)s, %(ritmo)s, %(tags)s, %(velocidade)s, %(nota)s, %(favorita)s,
                            %(normalizada)s, %(shared)s, %(header)s, %(body)s)
                    returning {_SONG_COLUMNS}""",
                {"user_id": user_id, "slug": slug, "genero": genre, "body": song.body,
                 "header": Json(song.header), "shared": shared, **denorm},
            ).fetchone()
            self._check_duplicate_versions(conn, denorm["interprete"], denorm["titulo"])
        return _row_to_dict(row)

    # ---------- edição ----------
    def update(self, user_id: str, slug: str, header: dict, body: str, editor_name: str = "",
               is_admin: bool = False) -> dict:
        """Dono (ou música "órfã", sem dono) edita in-place, como sempre —
        admin também. Quem não é dono nem admin NÃO pode editar diretamente
        (levanta NotOwner) — precisa clonar antes (ver clone()) e editar a
        própria cópia."""
        row = self._fetch(slug)
        if not row:
            raise SongNotFound(slug)
        if row["user_id"] is not None and row["user_id"] != user_id and not is_admin:
            raise NotOwner(slug)
        return self._update_owned(row, header, body)

    def clone(self, user_id: str, slug: str, editor_name: str = "", is_admin: bool = False) -> dict:
        """Cópia explícita de qualquer música visível (própria, compartilhada,
        órfã, ou qualquer uma se admin) — o jeito de "adaptar" uma música de
        outro usuário agora que update() não clona mais silenciosamente.
        Reaproveita a mesma mecânica de sempre (`_clone_and_update`): novo
        dono, origin_song_id apontando pra original, título com sufixo
        "cifra editada por: <editor_name>" — conteúdo (header/body) entra
        inalterado, só o dono muda."""
        with db.get_pool().connection() as conn:
            row = conn.execute(
                f"select {_SONG_COLUMNS} from songs where slug=%(slug)s and {_visible_sql(is_admin)}",
                {"user_id": user_id, "slug": slug},
            ).fetchone()
        if not row:
            raise SongNotFound(slug)
        return self._clone_and_update(user_id, editor_name, row, row["header"], row["body"])

    def _update_owned(self, row: dict, header: dict, body: str) -> dict:
        full_header = {f: str(header.get(f, "")) for f in HEADER_FIELDS}
        denorm = _denormalize(full_header)

        with db.get_pool().connection() as conn:
            # versão anterior vai para o histórico
            conn.execute(
                "insert into song_versions (song_id, header, body) values (%s, %s, %s)",
                (row["id"], Json(row["header"]), row["body"]),
            )
            base_slug = slugify(row["genero"], full_header.get("intérprete", ""), strip_title_suffix(full_header.get("titulo", ""))) or row["slug"]
            new_slug = _unique_slug(conn, base_slug, exclude_id=row["id"])
            new_row = conn.execute(
                f"""update songs set slug=%(slug)s, titulo=%(titulo)s, autor=%(autor)s,
                           interprete=%(interprete)s, tom=%(tom)s, ritmo=%(ritmo)s, tags=%(tags)s,
                           velocidade=%(velocidade)s, nota=%(nota)s, favorita=%(favorita)s,
                           normalizada=%(normalizada)s, header=%(header)s, body=%(body)s, updated_at=now()
                    where id=%(id)s returning {_SONG_COLUMNS}""",
                {"id": row["id"], "slug": new_slug, "header": Json(full_header), "body": body, **denorm},
            ).fetchone()
            self._repair_setlist_refs(conn, row["interprete"], row["titulo"], denorm["interprete"], denorm["titulo"])
            self._check_duplicate_versions(conn, denorm["interprete"], denorm["titulo"])
            # poda histórico: mantém só as 50 versões mais recentes
            conn.execute(
                """delete from song_versions where song_id=%s and id not in (
                       select id from song_versions where song_id=%s order by saved_at desc limit 50
                   )""",
                (row["id"], row["id"]),
            )
        return _row_to_dict(new_row)

    def _repair_setlist_refs(self, conn, old_interprete: str, old_titulo: str,
                              new_interprete: str, new_titulo: str) -> None:
        """`setlist_items.ref` guarda texto solto "Intérprete/Título" (mesmo
        formato do export/import .txt) — não aponta pro `songs.id` estável.
        Renomear intérprete ou título (ex.: corrigir um dado de importação
        ruim, como um intérprete errado tipo "CIFRAS") quebra silenciosamente
        qualquer setlist que já referenciava a música pelo nome antigo — ela
        passa a aparecer como "música não encontrada" (bug relatado), porque
        _resolve_many() casa por texto, não por id. Reescreve pro texto novo
        qualquer ref cuja identidade resolvida (intérprete + título sem
        sufixo, mesma lógica de _resolve_many) batia com a identidade
        ANTERIOR desta música — mesma ambiguidade inerente ao formato de
        texto já existente em _resolve_many (duas músicas com o mesmo nome
        antigo são indistinguíveis aqui também)."""
        old_target = (slugify(old_interprete), slugify(strip_title_suffix(old_titulo)))
        new_target = (slugify(new_interprete), slugify(strip_title_suffix(new_titulo)))
        if new_target != old_target and old_target[1]:
            old_title_stripped = strip_title_suffix(old_titulo)
            candidates = conn.execute(
                "select id, ref from setlist_items where ref ILIKE %s", (f"%{old_title_stripped}%",),
            ).fetchall()
            new_ref = f"{new_interprete}/{new_titulo}"
            for c in candidates:
                if "/" not in c["ref"]:
                    continue
                artist, title = c["ref"].split("/", 1)
                if (slugify(artist), slugify(strip_title_suffix(title))) == old_target:
                    conn.execute("update setlist_items set ref=%s where id=%s", (new_ref, c["id"]))
        # segunda passada, sempre (independente de a identidade ter mudado
        # ou não): conserta refs "órfãs" — que _resolve_many não encontra
        # HOJE — cujo intérprete é lixo de import antigo (vazio, "CIFRAS"
        # etc.) e por isso NUNCA bate na identidade exata acima, mesmo depois
        # de sucessivas edições corrigirem só o título (ex.: acento). Ver
        # _repair_orphaned_refs_for_song pro porquê disso ser necessário.
        self._repair_orphaned_refs_for_song(conn, new_interprete, new_titulo)

    def _repair_orphaned_refs_for_song(self, conn, interprete: str, titulo: str) -> int:
        """Conserta refs de setlist "órfãs" (não batem em NENHUMA música hoje
        — mesma resolução de SetlistService._resolve_many) cujo TÍTULO (sem
        sufixo, comparado via slugify — tolera acento/caixa) é exatamente o
        desta música. `_repair_setlist_refs` (acima) só conserta uma ref
        quando ela batia EXATAMENTE na identidade anterior da música — mas
        uma ref cujo intérprete já nasceu errado num import antigo (vazio,
        ou literalmente "CIFRAS", ver bug da "Brigas") nunca bate em
        identidade nenhuma, de nenhuma edição, e ficaria quebrada pra
        sempre só com aquele mecanismo. Só repara quando o título é
        inequívoco — nenhuma OUTRA música da biblioteca compartilha o mesmo
        título sem sufixo — pra não arriscar reatribuir uma ref órfã pra
        música errada. `setlist_items` tem só algumas centenas de linhas
        hoje — dá pra escanear a tabela inteira sem o cuidado de projeção
        que _songs_missing_youtube_url precisa pras ~24 mil músicas."""
        title_stripped = strip_title_suffix(titulo)
        target_title = slugify(title_stripped)
        if not target_title:
            return 0
        same_title_songs = conn.execute(
            "select interprete, titulo from songs where titulo ILIKE %s", (f"%{title_stripped}%",),
        ).fetchall()
        # duas entradas duplicadas do MESMO intérprete com esse título (dado
        # sujo, mas sem ambiguidade real de "pra qual música isso aponta")
        # não bloqueiam o reparo — só intérpretes DIFERENTES tornam o título
        # genuinamente ambíguo demais pra decidir sozinho.
        distinct_artists = {
            slugify(r["interprete"]) for r in same_title_songs
            if slugify(strip_title_suffix(r["titulo"])) == target_title
        }
        if len(distinct_artists) > 1:
            return 0
        target = (slugify(interprete), target_title)
        new_ref = f"{interprete}/{titulo}"
        fixed = 0
        for r in conn.execute("select id, ref from setlist_items").fetchall():
            if "/" not in r["ref"]:
                continue
            artist, ref_title = r["ref"].split("/", 1)
            candidate = (slugify(artist), slugify(strip_title_suffix(ref_title)))
            if candidate[1] != target_title or candidate == target:
                continue
            conn.execute("update setlist_items set ref=%s where id=%s", (new_ref, r["id"]))
            fixed += 1
        return fixed

    # ---------- músicas duplicadas ("mesmo nome, letra muito parecida") ----------
    def _duplicate_group_key(self, interprete: str, titulo: str) -> tuple[str, str]:
        return (slugify(interprete or ""), slugify(strip_title_suffix(titulo or "")))

    def _cluster_by_lyrics(self, members: list[dict]) -> list[list[dict]]:
        """Agrupa `members` (dicts com pelo menos 'body') por similaridade de
        letra (difflib.SequenceMatcher.ratio, limiar em
        _VERSION_SIMILARITY_THRESHOLD) via union-find. Nome igual sozinho não
        basta — só quem bate quase igual de verdade entra no mesmo grupo."""
        n = len(members)
        parent = list(range(n))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        for i in range(n):
            for j in range(i + 1, n):
                ratio = difflib.SequenceMatcher(None, members[i]["body"], members[j]["body"]).ratio()
                if ratio >= _VERSION_SIMILARITY_THRESHOLD:
                    ri, rj = find(i), find(j)
                    if ri != rj:
                        parent[ri] = rj

        clusters: dict[int, list[dict]] = {}
        for i in range(n):
            clusters.setdefault(find(i), []).append(members[i])
        return list(clusters.values())

    def _label_duplicate_group(self, conn, member_ids: list) -> int:
        """Recalcula do zero as etiquetas @versao de um grupo (mesmo
        intérprete + título sem sufixo): busca a letra de cada uma agora,
        reagrupa por similaridade e numera "1", "2", "3"... por ordem de
        criação dentro de cada agrupamento com 2+ membros — quem não bate
        com mais ninguém (grupo com nome igual mas letra bem diferente, ou
        encolheu porque uma música foi editada/apagada) tem @versao limpo.
        Roda dentro da MESMA conexão/transação de quem chamou, pra não
        perder atomicidade com a escrita que disparou a checagem. Devolve
        quantas músicas ganharam um número."""
        rows = conn.execute(
            "select id, body, created_at from songs where id = any(%s::uuid[])", (member_ids,),
        ).fetchall()
        labeled = 0
        for cluster in self._cluster_by_lyrics([dict(r) for r in rows]):
            is_versioned = len(cluster) > 1
            if is_versioned:
                cluster = sorted(cluster, key=lambda m: m["created_at"])
            for idx, member in enumerate(cluster):
                versao = str(idx + 1) if is_versioned else ""
                conn.execute(
                    "update songs set header = jsonb_set(header, '{versao}', %s::jsonb) where id=%s",
                    (Json(versao), member["id"]),
                )
                if versao:
                    labeled += 1
        return labeled

    def _check_duplicate_versions(self, conn, interprete: str, titulo: str) -> None:
        """Depois de criar/editar/clonar uma música que talvez tenha passado
        a colidir com outra já existente (mesmo intérprete + título), reagrupa
        só esse grupo específico na hora — não precisa esperar a próxima
        varredura manual (ver duplicate_versions_scan). Filtro ILIKE (título
        sem sufixo) é só pra não escanear a biblioteca inteira a cada
        gravação; a comparação de verdade (slugify) é feita depois, em
        Python, igual a _repair_setlist_refs."""
        key = self._duplicate_group_key(interprete, titulo)
        if not key[1]:
            return
        stripped = strip_title_suffix(titulo or "")
        candidates = conn.execute(
            "select id, interprete, titulo from songs where titulo ILIKE %s", (f"%{stripped}%",),
        ).fetchall()
        member_ids = [c["id"] for c in candidates if self._duplicate_group_key(c["interprete"], c["titulo"]) == key]
        if len(member_ids) > 1:
            self._label_duplicate_group(conn, member_ids)

    def _pending_duplicate_groups(self, conn) -> list[list]:
        """Grupos (cada um, uma lista de ids) com 2+ músicas compartilhando
        intérprete + título (sem sufixo) e que ainda não estão todas
        etiquetadas — candidatos a "mesma música, versões diferentes" pra
        duplicate_versions_scan() processar."""
        rows = conn.execute(
            "select id, interprete, titulo, header->>'versao' as versao from songs",
        ).fetchall()
        groups: dict[tuple, list[dict]] = {}
        for r in rows:
            key = self._duplicate_group_key(r["interprete"], r["titulo"])
            if not key[1]:
                continue
            groups.setdefault(key, []).append(r)
        return [
            [m["id"] for m in members]
            for members in groups.values()
            if len(members) > 1 and not all((m["versao"] or "").strip() for m in members)
        ]

    def duplicate_versions_status(self) -> dict:
        with db.get_pool().connection() as conn:
            groups = self._pending_duplicate_groups(conn)
        return {"pending_groups": len(groups)}

    def duplicate_versions_scan(self) -> dict:
        """Varre a biblioteca inteira procurando músicas com o mesmo nome
        (intérprete + título) e letra muito parecida, etiquetando cada uma
        como "Versão 1", "Versão 2"... (@versao no cabeçalho) — ação manual,
        disparada pela área de administração (Settings.jsx). O mesmo
        agrupamento roda automaticamente daqui pra frente, sempre que uma
        música nova/editada colide com uma existente (ver
        _check_duplicate_versions, chamado por create()/_update_owned()/
        _clone_and_update())."""
        with db.get_pool().connection() as conn:
            groups = self._pending_duplicate_groups(conn)
            songs_labeled = sum(self._label_duplicate_group(conn, g) for g in groups)
        return {"groups_found": len(groups), "songs_labeled": songs_labeled}

    # ---------- link do YouTube (busca real, ver YoutubeService) ----------
    def _setlist_song_keys(self, conn) -> set:
        """Identidade (intérprete, título sem sufixo) de toda música
        referenciada em QUALQUER setlist — usado só pra ORDENAR o lote de
        preenchimento do YouTube (prioriza quem está em uso de verdade),
        mesma lógica de agrupamento de _resolve_many, mas sem bater no
        banco de novo por ref (setlist_items.ref já é o texto cru)."""
        refs = conn.execute("select ref from setlist_items").fetchall()
        keys = set()
        for r in refs:
            if "/" not in r["ref"]:
                continue
            artist, title = r["ref"].split("/", 1)
            keys.add(self._duplicate_group_key(artist, title))
        return keys

    def _songs_missing_youtube_url(self, conn) -> list[dict]:
        # só campos leves (nunca o header inteiro) — rodar em ~24 mil
        # músicas puxando o JSONB completo de cada uma seria lento à toa,
        # já que jsonb_set() na escrita não precisa do header em Python.
        return conn.execute(
            "select id, interprete, titulo from songs "
            "where coalesce(header->>'youtube_url', '') = ''",
        ).fetchall()

    def youtube_link_status(self) -> dict:
        with db.get_pool().connection() as conn:
            setlist_keys = self._setlist_song_keys(conn)
            rows = self._songs_missing_youtube_url(conn)
        in_setlists = sum(
            1 for r in rows if self._duplicate_group_key(r["interprete"], r["titulo"]) in setlist_keys
        )
        return {"remaining": len(rows), "remaining_in_setlists": in_setlists}

    def youtube_link_batch(self, limit: int = 20) -> dict:
        """Preenche @youtube_url via busca real na API do YouTube (ver
        YoutubeService) pra até `limit` músicas por chamada — a cota
        gratuita da API é limitada (~100 buscas/dia), então processa aos
        poucos, de propósito. Prioriza quem está em algum setlist (pedido
        do usuário — são as músicas realmente em uso), depois o resto da
        biblioteca em ordem alfabética de título, pra ter uma ordem estável
        entre chamadas."""
        if not self.youtube:
            raise RuntimeError("YoutubeService não configurado.")
        with db.get_pool().connection() as conn:
            setlist_keys = self._setlist_song_keys(conn)
            rows = self._songs_missing_youtube_url(conn)
        prioritized = sorted(
            rows,
            key=lambda r: (
                self._duplicate_group_key(r["interprete"], r["titulo"]) not in setlist_keys,
                r["titulo"],
            ),
        )
        batch = prioritized[:limit]
        found = 0
        for row in batch:
            # search_videos (não search_video_url) pra também ganhar a
            # duração já buscada junto (ver YoutubeService.search_videos) —
            # sem isso, "Tempo de execução" ficava em branco pras músicas
            # preenchidas em lote (só os fluxos interativos do editor
            # setavam esse campo, ver acceptYoutubeSuggestion/onBlur em
            # SongEditor.jsx — bug relatado pelo usuário).
            results = self.youtube.search_videos(row["interprete"], row["titulo"], max_results=1)
            if results:
                found += 1
                url = results[0]["url"]
                duration = results[0].get("duration")
                with db.get_pool().connection() as conn:
                    if duration:
                        conn.execute(
                            """update songs set header = jsonb_set(
                                   jsonb_set(header, '{youtube_url}', %s::jsonb),
                                   '{tempoexecucao}', %s::jsonb)
                               where id=%s""",
                            (Json(url), Json(duration), row["id"]),
                        )
                    else:
                        conn.execute(
                            "update songs set header = jsonb_set(header, '{youtube_url}', %s::jsonb) where id=%s",
                            (Json(url), row["id"]),
                        )
        status = self.youtube_link_status()
        return {"processed": len(batch), "found": found, **status}

    def suggest_youtube_candidates(self, slug: str, max_results: int = 5) -> list[dict]:
        """Sugestão sob demanda pra UMA música (botão "Sugerir" no editor) —
        não salva nada, devolve até `max_results` candidatos (vídeo_id,
        título, url) pro frontend mostrar num modal com miniplayer + "Sugerir
        outro"/"Aceitar"/"Cancelar". O usuário decide qual usar — nada é
        gravado até ele aceitar (mesmo espírito da sugestão de cabeçalho via
        IA: nunca salva sozinho)."""
        if not self.youtube:
            raise RuntimeError("YoutubeService não configurado.")
        row = self._fetch(slug)
        if not row:
            raise SongNotFound(slug)
        return self.youtube.search_videos(row["interprete"], strip_title_suffix(row["titulo"]), max_results=max_results)

    def _clone_and_update(self, user_id: str, editor_name: str, row: dict, header: dict, body: str) -> dict:
        full_header = {f: str(header.get(f, "")) for f in HEADER_FIELDS}
        full_header["titulo"] = apply_edited_suffix(
            full_header.get("titulo", ""), full_header.get("intérprete", ""), editor_name,
        )
        denorm = _denormalize(full_header)
        base_slug = slugify(row["genero"], full_header.get("intérprete", ""), strip_title_suffix(full_header["titulo"])) or row["slug"]

        with db.get_pool().connection() as conn:
            # a cópia segue a preferência de compartilhamento de QUEM EDITOU
            # agora (o novo dono), não o valor da original — mesma regra de
            # create().
            shared = _share_by_default(conn, user_id)
            new_slug = _unique_slug(conn, base_slug)
            new_row = conn.execute(
                f"""insert into songs (user_id, slug, genero, origin_song_id, titulo, autor, interprete,
                                        tom, ritmo, tags, velocidade, nota, favorita, normalizada, shared,
                                        header, body)
                    values (%(user_id)s, %(slug)s, %(genero)s, %(origin_song_id)s, %(titulo)s, %(autor)s,
                            %(interprete)s, %(tom)s, %(ritmo)s, %(tags)s, %(velocidade)s, %(nota)s,
                            %(favorita)s, %(normalizada)s, %(shared)s, %(header)s, %(body)s)
                    returning {_SONG_COLUMNS}""",
                {"user_id": user_id, "slug": new_slug, "genero": row["genero"], "origin_song_id": row["id"],
                 "header": Json(full_header), "body": body, "shared": shared, **denorm},
            ).fetchone()
            self._check_duplicate_versions(conn, denorm["interprete"], denorm["titulo"])
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

    def set_shared(self, user_id: str, slug: str, value: bool) -> dict:
        row = self._fetch(slug)
        if not row:
            raise SongNotFound(slug)
        if row["user_id"] is not None and row["user_id"] != user_id:
            raise NotOwner(slug)
        with db.get_pool().connection() as conn:
            conn.execute("update songs set shared=%s where id=%s", (value, row["id"]))
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

    def reset_normalization(self) -> dict:
        """Marca a biblioteca INTEIRA como não-normalizada de novo — usado só
        quando a própria lógica de normalize_song muda (ex.: limpeza de
        título/slug nova) depois que o acervo já tinha passado pelo
        normalize_batch da versão antiga: o filtro `normalizada = false` de
        normalize_batch não pegaria mais essas músicas já marcadas, mesmo
        elas nunca tendo passado pela regra nova. Não apaga nem sobrescreve
        nenhum dado — só reabre a fila; normalize_batch (idempotente) cuida
        do resto."""
        with db.get_pool().connection() as conn:
            conn.execute("update songs set normalizada = false")
        return self.normalize_status()

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
