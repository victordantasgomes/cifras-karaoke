"""Sufixo de título que distingue a cifra original de cópias editadas por
outro usuário (ver services/songs_service.py::update — biblioteca global).
Sempre idempotente: aplicar duas vezes nunca empilha o sufixo.

Também tem `clean_title()`, usado só pela normalização (utils/song_normalizer.py)
pra padronizar título herdado de importação por nome de arquivo (CAIXA ALTA
ou minúsculo-com-hífen-separando-palavra, ex.: "a-alegria")."""
from __future__ import annotations

import re

_SUFFIX_RE = re.compile(r"\s-\s.+\s-\scifra (?:original|editada por: .+)$")

# conectivos que ficam em minúsculo no meio do título (nunca na primeira
# palavra) — mesma lista básica de qualquer guia de title case em português.
_SMALL_WORDS = {
    "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na",
    "nos", "nas", "um", "uma", "uns", "umas", "para", "por", "com", "sem", "ao",
    "aos", "à", "às", "que",
}


def _titlecase(text: str) -> str:
    def cap(m):
        word = m.group(0)
        if m.start() != 0 and word.lower() in _SMALL_WORDS:
            return word.lower()
        return word[0].upper() + word[1:].lower()
    # opera sobre "palavras" (tudo que não é espaço nem parêntese) — "(" e
    # ")" sobrevivem intocados entre uma palavra e outra.
    return re.sub(r"[^\s()]+", cap, text)


def clean_title(titulo: str) -> str:
    """Padroniza um título malformado herdado de importação por nome de
    arquivo: tudo em CAIXA ALTA, ou tudo minúsculo com hífen separando
    palavra por palavra (ex.: "a-alegria" -> "A Alegria",
    "A DESCONHECIDA" -> "A Desconhecida"). Um título que já tem mistura de
    maiúsculas/minúsculas é deixado como está — assume-se que foi digitado
    por alguém, não gerado a partir de um nome de arquivo. Idempotente."""
    titulo = (titulo or "").strip()
    if not titulo:
        return titulo
    if titulo.islower():
        titulo = titulo.replace("-", " ")
    elif titulo.isupper():
        titulo = titulo.replace("-", " ").lower()
    else:
        return titulo
    titulo = re.sub(r"(?<=\S)\(", " (", titulo)
    titulo = _titlecase(titulo)
    return re.sub(r"\s+", " ", titulo).strip()


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
