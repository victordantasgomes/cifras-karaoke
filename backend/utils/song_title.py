"""Sufixo de título que distingue a cifra original de cópias editadas por
outro usuário (ver services/songs_service.py::update — biblioteca global).
Sempre idempotente: aplicar duas vezes nunca empilha o sufixo.

Até esta versão, uma cifra "original" (normalizada, nunca editada por
ninguém) também ganhava um marcador "- cifra original" no título — pedido
do usuário pra tirar essa etiqueta (poluía o título à toa, já que o
intérprete já aparece separado em todo canto da interface). `apply_original_suffix`
agora só acrescenta "- <intérprete>"; o marcador "- cifra editada por: X"
continua existindo (ele carrega informação de verdade: esta cópia foi
adaptada por alguém, é diferente da original).

Também tem `clean_title()`, usado só pela normalização (utils/song_normalizer.py)
pra padronizar título herdado de importação por nome de arquivo (CAIXA ALTA
ou minúsculo-com-hífen-separando-palavra, ex.: "a-alegria")."""
from __future__ import annotations

import re

_EDITED_SUFFIX_RE = re.compile(r"\s-\s.+\s-\scifra editada por: .+$")

# legado: normalize() costumava acrescentar "- cifra original" (ver acima) —
# não gera mais isso, mas o parser ainda reconhece/remove de títulos antigos
# que não passaram pela varredura de limpeza única.
_LEGACY_ORIGINAL_SUFFIX_RE = re.compile(r"\s-\s.+\s-\scifra original$")

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


def strip_title_suffix(titulo: str, interprete: str = "") -> str:
    """Remove o sufixo de título já presente, em qualquer uma das formas que
    o sistema já gerou: "- cifra editada por: X" (cópia editada por outra
    pessoa), o legado "- cifra original" (normalize() não gera mais isso,
    ver módulo), ou — quando `interprete` é informado — um "- <intérprete>"
    solto no final (o que normalize() gera agora). Usado antes de reaplicar
    o sufixo (evita empilhar, ver apply_original_suffix/apply_edited_suffix)
    e na resolução de identidade de refs de setlist contra títulos já
    sufixados de qualquer uma dessas formas (ver SetlistService._resolve_many
    e SongsService._repair_setlist_refs)."""
    titulo = titulo or ""
    titulo = _EDITED_SUFFIX_RE.sub("", titulo)
    titulo = _LEGACY_ORIGINAL_SUFFIX_RE.sub("", titulo)
    if interprete:
        suffix = f" - {interprete}"
        if titulo.lower().endswith(suffix.lower()):
            titulo = titulo[: -len(suffix)]
    return titulo.strip()


def apply_original_suffix(titulo: str, interprete: str) -> str:
    base = strip_title_suffix(titulo, interprete)
    if not interprete:
        return base
    return f"{base} - {interprete}"


def apply_edited_suffix(titulo: str, interprete: str, editor_name: str) -> str:
    base = strip_title_suffix(titulo, interprete)
    if not interprete:
        return f"{base} - cifra editada por: {editor_name}" if editor_name else base
    suffix = f" - {interprete} - cifra editada por: {editor_name}" if editor_name else f" - {interprete}"
    return f"{base}{suffix}"
