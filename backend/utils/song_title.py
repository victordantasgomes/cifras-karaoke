"""Sufixo de título que distingue a cifra original de cópias editadas por
outro usuário (ver services/songs_service.py::update — biblioteca global).
Sempre idempotente: aplicar duas vezes nunca empilha o sufixo."""
from __future__ import annotations

import re

_SUFFIX_RE = re.compile(r"\s-\s.+\s-\scifra (?:original|editada por: .+)$")


def strip_title_suffix(titulo: str) -> str:
    """Remove o sufixo "- <intérprete> - cifra original/editada por: X" se já
    presente. Usado antes de reaplicar o sufixo (evita empilhar) e na
    resolução de refs de setlist antigas contra títulos já sufixados."""
    return _SUFFIX_RE.sub("", titulo or "").strip()


def apply_original_suffix(titulo: str, interprete: str) -> str:
    base = strip_title_suffix(titulo)
    if not interprete:
        return base
    return f"{base} - {interprete} - cifra original"


def apply_edited_suffix(titulo: str, interprete: str, editor_name: str) -> str:
    base = strip_title_suffix(titulo)
    if not interprete:
        return f"{base} - cifra editada por: {editor_name}" if editor_name else base
    suffix = f" - {interprete} - cifra editada por: {editor_name}" if editor_name else f" - {interprete}"
    return f"{base}{suffix}"
