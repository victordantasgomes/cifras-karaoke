"""Pool de conexão Postgres (Neon) — ver schema.sql.

Um único ConnectionPool por processo. Em desenvolvimento local (servidor
Flask de vida longa) ele abre uma vez e fica. Em função serverless (Vercel)
o mesmo pool é reaproveitado entre invocações "quentes" da mesma instância —
por isso `min_size=0` (não segura conexão ociosa entre invocações). Use
sempre a connection string *pooled* do Neon (host com "-pooler") pra não
esgotar conexões quando várias instâncias serverless sobem ao mesmo tempo.

Cada operação lógica deve abrir seu próprio `with get_pool().connection() as
conn:` — psycopg3 comita automaticamente ao sair do bloco sem erro, e faz
rollback se uma exceção escapar. Isso é o que dá atomicidade a operações de
múltiplos statements (ex.: SongsService.update() grava uma versão em
song_versions e só depois atualiza songs, tudo na mesma transação).
"""
from __future__ import annotations

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from config import Config

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            Config.DATABASE_URL,
            min_size=0,
            max_size=5,
            kwargs={"row_factory": dict_row},
            open=True,
            # Neon (ou qualquer pooler do lado do servidor) pode fechar uma
            # conexão ociosa antes do nosso próprio max_idle perceber —
            # sem isso, a próxima query que pegasse essa conexão "morta"
            # falhava com "server closed the connection unexpectedly" em
            # vez do pool simplesmente descartar e abrir outra.
            check=ConnectionPool.check_connection,
        )
    return _pool


def close_pool() -> None:
    """Fecha o pool — usado nos testes pra isolar processos/schemas diferentes."""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def init_schema(sql_path: str | None = None) -> None:
    """Aplica schema.sql (idempotente — só usa CREATE ... IF NOT EXISTS)."""
    from pathlib import Path
    path = Path(sql_path) if sql_path else Path(__file__).resolve().parent / "schema.sql"
    sql = path.read_text(encoding="utf-8")
    with get_pool().connection() as conn:
        conn.execute(sql)
