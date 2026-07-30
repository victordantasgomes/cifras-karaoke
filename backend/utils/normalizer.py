"""Normalização de arquivos: garante cabeçalho semântico completo."""
from __future__ import annotations

from pathlib import Path

from utils.parser import parse_song, serialize_song, HEADER_FIELDS


def normalize_file(path: Path) -> bool:
    """Reescreve o TXT com cabeçalho canônico. Retorna True se alterou.

    Campos ausentes são criados vazios; @titulo assume o nome do arquivo,
    @intérprete e o gênero assumem as pastas pai quando vazios.
    """
    original = path.read_text(encoding="utf-8", errors="replace")
    song = parse_song(original)

    if not song.header.get("titulo"):
        song.header["titulo"] = path.stem
    if not song.header.get("intérprete") and len(path.parts) >= 2:
        song.header["intérprete"] = path.parent.name
    if not song.header.get("velocidade"):
        song.header["velocidade"] = "50"

    for f in HEADER_FIELDS:
        song.header.setdefault(f, "")

    normalized = serialize_song(song)
    if normalized != original:
        path.write_text(normalized, encoding="utf-8")
        return True
    return False
