"""Migração única dos dados locais (backend/data/users/**) para o Postgres
(Neon) + Vercel Blob. Roda uma vez, manualmente, antes do primeiro deploy
real — depois disso o app já lê/escreve só no banco (ver services/*.py).

Reaproveita utils/parser.py::parse_song e utils/slug.py::slugify (mesma
lógica de sempre) e services/setlist_service.py::SetlistService.import_txt
(o formato de arquivo de setlist já é exatamente o que import_txt espera).

Uso:
    cd backend
    python scripts/migrate_to_postgres.py [--force]

--force é necessário se a tabela `songs` já tiver linhas (evita duplicar
23 mil músicas por engano rodando duas vezes).
"""
from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND_DIR / ".env")

import db  # noqa: E402
from psycopg.types.json import Json  # noqa: E402
from services import blob_client  # noqa: E402
from services.setlist_service import SetlistService  # noqa: E402
from services.songs_service import _denormalize  # noqa: E402
from utils.parser import HEADER_FIELDS, parse_song  # noqa: E402
from utils.slug import slugify  # noqa: E402

DATA_DIR = BACKEND_DIR / "data" / "users"

_CONTENT_TYPES = {
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
    ".ogg": "audio/ogg", ".aac": "audio/aac", ".flac": "audio/flac",
}


def read_text(path: Path) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return path.read_text(encoding=enc)
        except UnicodeDecodeError:
            continue
    return path.read_text(encoding="utf-8", errors="replace")


def unique_slug(seen: dict[str, int], base: str) -> str:
    if base not in seen:
        seen[base] = 1
        return base
    seen[base] += 1
    return f"{base}-{seen[base]}"


def build_slug_candidates(songs_by_slug: dict[str, dict]) -> dict[str, str | None]:
    """Pastas antigas (AUDIO/, HISTORY/) podem ter sido nomeadas com um slug
    de época anterior à inclusão do gênero no slug atual — mapeia variações
    (só título / intérprete+título / gênero+intérprete+título) pro id da
    música, ou None se mais de uma música cair no mesmo candidato
    (ambíguo demais pra associar sem risco)."""
    candidates: dict[str, str | None] = {}
    for song in songs_by_slug.values():
        for cand in (
            slugify(song["titulo"]),
            slugify(song["interprete"], song["titulo"]),
            slugify(song["genero"], song["interprete"], song["titulo"]),
        ):
            if not cand:
                continue
            if cand in candidates and candidates[cand] != song["id"]:
                candidates[cand] = None  # ambíguo
            else:
                candidates[cand] = song["id"]
    return candidates


# ---------------------------------------------------------------- usuários
def migrate_users(conn) -> None:
    users_json = DATA_DIR.parent / "users.json"
    if not users_json.exists():
        print("  users.json não encontrado, pulando.")
        return
    users = json.loads(users_json.read_text(encoding="utf-8"))
    rows = [
        {"id": u["id"], "username": username, "name": u.get("name", ""),
         "password_hash": u["password_hash"], "created_at": u.get("created_at")}
        for username, u in users.items()
    ]
    if rows:
        conn.cursor().executemany(
            """insert into users (id, username, name, password_hash, created_at)
               values (%(id)s, %(username)s, %(name)s, %(password_hash)s,
                       coalesce(%(created_at)s::timestamptz, now()))
               on conflict (id) do nothing""",
            rows, returning=False,
        )
    print(f"  {len(rows)} usuário(s) migrado(s).")


# ------------------------------------------------------------------ músicas
def migrate_songs(conn, user_id: str, cifras_dir: Path) -> dict[str, dict]:
    """Retorna slug -> {id, genero, interprete, titulo} das músicas inseridas."""
    seen_slugs: dict[str, int] = {}
    rows = []
    songs_by_slug: dict[str, dict] = {}
    errors = 0

    for path in sorted(cifras_dir.rglob("*.txt")):
        rel = path.relative_to(cifras_dir).parts[:-1]  # pastas entre CIFRAS e o arquivo
        if len(rel) == 0:
            genero, artist_folder = "Cifras", ""
        elif len(rel) == 1:
            genero, artist_folder = rel[0], ""
        else:
            genero, artist_folder = rel[0], rel[1]

        try:
            content = read_text(path)
            song = parse_song(content)
        except Exception as exc:  # arquivo corrompido/ilegível — não trava a migração inteira
            print(f"  [erro] {path}: {exc}")
            errors += 1
            continue

        title_fallback = path.stem
        song.header.setdefault("titulo", title_fallback)
        song.header["titulo"] = song.header["titulo"] or title_fallback
        song.header["intérprete"] = song.header.get("intérprete") or artist_folder
        song.header.setdefault("velocidade", "50")
        song.header.setdefault("modoexecucao", "rolagem")
        for f in HEADER_FIELDS:
            song.header.setdefault(f, "")

        denorm = _denormalize(song.header)
        base_slug = slugify(genero, song.header["intérprete"], song.header["titulo"]) or slugify(title_fallback) or "sem-titulo"
        slug = unique_slug(seen_slugs, base_slug)
        song_id = str(uuid.uuid4())

        rows.append({
            "id": song_id, "user_id": user_id, "slug": slug, "genero": genero,
            "header": Json(song.header), "body": song.body, **denorm,
        })
        songs_by_slug[slug] = {
            "id": song_id, "genero": genero,
            "interprete": denorm["interprete"], "titulo": denorm["titulo"],
        }

    if rows:
        for i in range(0, len(rows), 1000):
            batch = rows[i:i + 1000]
            conn.cursor().executemany(
                """insert into songs (id, user_id, slug, genero, titulo, autor, interprete,
                                       tom, ritmo, tags, velocidade, nota, favorita, header, body)
                   values (%(id)s, %(user_id)s, %(slug)s, %(genero)s, %(titulo)s, %(autor)s,
                           %(interprete)s, %(tom)s, %(ritmo)s, %(tags)s, %(velocidade)s, %(nota)s,
                           %(favorita)s, %(header)s, %(body)s)
                   on conflict (user_id, slug) do nothing""",
                batch, returning=False,
            )
            print(f"  {min(i + 1000, len(rows))}/{len(rows)} músicas inseridas...")

    print(f"  {len(rows)} música(s) migrada(s), {errors} erro(s) de leitura.")
    return songs_by_slug


# -------------------------------------------------------------------- áudio
def migrate_audio(conn, user_id: str, audio_dir: Path, songs_by_slug: dict[str, dict]) -> None:
    if not audio_dir.exists():
        return
    candidates = build_slug_candidates(songs_by_slug)
    tracks, samples = 0, 0
    for slug_dir in sorted(audio_dir.iterdir()):
        if not slug_dir.is_dir():
            continue
        song = songs_by_slug.get(slug_dir.name)
        song_id = song["id"] if song else candidates.get(slug_dir.name)
        if not song_id:
            print(f"  [aviso] AUDIO/{slug_dir.name} não corresponde a nenhuma música migrada, pulando.")
            continue

        track_files = [f for f in slug_dir.glob("track.*") if f.is_file()]
        if track_files:
            f = track_files[0]
            content_type = _CONTENT_TYPES.get(f.suffix.lower(), "audio/mpeg")
            blob = blob_client.put(f"audio/{user_id}/{slug_dir.name}/track{f.suffix.lower()}",
                                    f.read_bytes(), content_type)
            conn.execute(
                "insert into audio_tracks (song_id, blob_url, content_type) values (%s, %s, %s) "
                "on conflict (song_id) do nothing",
                (song_id, blob["url"], content_type),
            )
            tracks += 1

        samples_dir = slug_dir / "samples"
        if samples_dir.is_dir():
            for sf in sorted(samples_dir.iterdir()):
                if not sf.is_file():
                    continue
                sample_id = sf.stem
                content_type = _CONTENT_TYPES.get(sf.suffix.lower(), "audio/mpeg")
                blob = blob_client.put(f"audio/{user_id}/{slug_dir.name}/samples/{sample_id}{sf.suffix.lower()}",
                                        sf.read_bytes(), content_type)
                conn.execute(
                    "insert into samples (song_id, sample_id, nome, blob_url) values (%s, %s, %s, %s) "
                    "on conflict (song_id, sample_id) do nothing",
                    (song_id, sample_id, sample_id, blob["url"]),
                )
                samples += 1

    print(f"  {tracks} faixa(s) e {samples} sample(s) enviados ao Vercel Blob.")


# ---------------------------------------------------------------- setlists
def migrate_setlists(user_id: str, setlists_dir: Path) -> None:
    if not setlists_dir.exists():
        return
    service = SetlistService()
    count = 0
    for path in sorted(setlists_dir.glob("*.txt")):
        content = read_text(path)
        service.import_txt(user_id, content)
        count += 1
    print(f"  {count} setlist(s) importada(s).")


# ------------------------------------------------------------------- plays
def migrate_plays(conn, user_id: str, plays_json: Path, songs_by_slug: dict[str, dict]) -> None:
    if not plays_json.exists():
        return
    plays = json.loads(read_text(plays_json))
    rows = []
    unmatched = 0
    for slug, info in plays.items():
        song = songs_by_slug.get(slug)
        if not song:
            unmatched += 1
            continue
        rows.append({"song_id": song["id"], "count": info.get("count", 0), "last": info.get("last")})
    if rows:
        conn.cursor().executemany(
            """insert into song_plays (song_id, count, last_played_at)
               values (%(song_id)s, %(count)s, %(last)s::timestamptz)
               on conflict (song_id) do update set count=excluded.count, last_played_at=excluded.last_played_at""",
            rows, returning=False,
        )
    print(f"  {len(rows)} contagem(ns) de play migrada(s), {unmatched} sem música correspondente.")


# ----------------------------------------------------------------- history
def migrate_history(conn, history_dir: Path, songs_by_slug: dict[str, dict]) -> None:
    """Formato antigo (texto cru, sem cabeçalho estruturado) — só é possível
    associar a uma música quando o nome da pasta bate, sem ambiguidade, com
    alguma variação do slug atual (título só / intérprete+título / completo).
    O que não casar é ignorado (são só snapshots de histórico, não dado
    primário)."""
    if not history_dir.exists():
        return

    candidates = build_slug_candidates(songs_by_slug)

    rows = []
    matched_dirs, skipped_dirs = 0, 0
    for slug_dir in sorted(history_dir.iterdir()):
        if not slug_dir.is_dir():
            continue
        song_id = songs_by_slug.get(slug_dir.name, {}).get("id") or candidates.get(slug_dir.name)
        if not song_id:
            skipped_dirs += 1
            continue
        matched_dirs += 1
        for f in sorted(slug_dir.glob("*.txt")):
            try:
                saved_at = datetime.strptime(f.stem, "%Y%m%dT%H%M%S%f").replace(tzinfo=timezone.utc)
            except ValueError:
                saved_at = None
            rows.append({
                "song_id": song_id, "header": Json({}), "body": read_text(f),
                "saved_at": saved_at,
            })

    if rows:
        for i in range(0, len(rows), 1000):
            batch = rows[i:i + 1000]
            conn.cursor().executemany(
                """insert into song_versions (song_id, header, body, saved_at)
                   values (%(song_id)s, %(header)s, %(body)s, coalesce(%(saved_at)s, now()))""",
                batch, returning=False,
            )
    print(f"  {matched_dirs} pasta(s) de histórico associadas ({len(rows)} versão(ões)), "
          f"{skipped_dirs} ignorada(s) por ambiguidade/sem correspondência.")


# --------------------------------------------------------------- settings
def migrate_settings(conn, user_id: str, settings_json: Path) -> None:
    if not settings_json.exists():
        return
    data = json.loads(read_text(settings_json))
    conn.execute(
        "insert into settings (user_id, colors) values (%s, %s) "
        "on conflict (user_id) do update set colors=excluded.colors",
        (user_id, Json(data.get("colors", {}))),
    )
    print("  configurações (cores) migradas.")


def main() -> None:
    force = "--force" in sys.argv
    db.init_schema()

    with db.get_pool().connection() as conn:
        # autocommit: migrate_setlists() usa SetlistService, que abre sua
        # própria conexão do pool — sem isso, ela não enxergaria usuários e
        # músicas ainda não commitados nesta conexão.
        conn.autocommit = True
        existing = conn.execute("select count(*) as n from songs").fetchone()["n"]
        if existing and not force:
            print(f"A tabela songs já tem {existing} linha(s). "
                  "Rode de novo com --force se quiser mesmo assim (pode duplicar dados).")
            return

        print("Migrando usuários...")
        migrate_users(conn)

        for user_dir in sorted(DATA_DIR.iterdir()):
            if not user_dir.is_dir():
                continue
            user_id = user_dir.name
            print(f"\nMigrando usuário {user_id}...")

            print(" Músicas:")
            songs_by_slug = migrate_songs(conn, user_id, user_dir / "CIFRAS")

            print(" Áudio:")
            migrate_audio(conn, user_id, user_dir / "AUDIO", songs_by_slug)

            print(" Setlists:")
            migrate_setlists(user_id, user_dir / "SETLISTS")

            print(" Plays:")
            migrate_plays(conn, user_id, user_dir / "HISTORY" / "_plays.json", songs_by_slug)

            print(" Histórico de versões:")
            migrate_history(conn, user_dir / "HISTORY", songs_by_slug)

            print(" Configurações:")
            migrate_settings(conn, user_id, user_dir / "settings.json")

    db.close_pool()
    print("\nMigração concluída.")


if __name__ == "__main__":
    main()
