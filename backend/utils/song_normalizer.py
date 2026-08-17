"""Normalização de uma cifra: cabeçalho completo, notação de acordes
consistente e rótulos de seção padronizados — nunca mexe na posição
horizontal de um acorde em relação à letra (ver README/plano da feature).

Função pura (sem I/O, sem banco) — quem persiste é
services/songs_service.py::normalize(), que salva via update() e por isso já
ganha histórico de versão (undo) de graça."""
from __future__ import annotations

import re

from utils.parser import HEADER_FIELDS, parse_line_timing
from utils.song_title import apply_original_suffix, clean_title, strip_title_suffix
from utils.transpose import transpose_body

_SECTION_LABEL_RE = re.compile(r"^\[([^\[\]@][^\[\]]*)\]\s*$")

# Grafia canônica dos rótulos de seção soltos mais comuns (ver
# utils/parser.py::_NOTE_KEYWORD_RE, mesmo vocabulário) — só reescreve a
# linha inteira quando o texto (sem espaços/caixa) bate com uma chave aqui;
# qualquer outro rótulo livre passa intocado.
_CANONICAL_LABELS = {
    "intro": "Introdução", "introducao": "Introdução", "introdução": "Introdução",
    "solo": "Solo", "ponte": "Ponte", "refrao": "Refrão", "refrão": "Refrão",
    "estrofe": "Estrofe", "primeiraparte": "Primeira Parte", "segundaparte": "Segunda Parte",
    "final": "Final", "coda": "Coda", "interludio": "Interlúdio", "interlúdio": "Interlúdio",
    "riff": "Riff", "base": "Base", "break": "Break", "improviso": "Improviso",
}


def _normalize_key(text: str) -> str:
    return re.sub(r"\s+", "", text).lower()


def _normalize_section_labels(body: str) -> str:
    out_lines = []
    for raw in body.splitlines():
        t, line = parse_line_timing(raw)
        m = _SECTION_LABEL_RE.match(line.strip())
        if m:
            canonical = _CANONICAL_LABELS.get(_normalize_key(m.group(1)))
            if canonical:
                line = f"[{canonical}]"
                if t is not None:
                    raw = f"[t={t}]{line}"
                else:
                    raw = line
        out_lines.append(raw)
    return "\n".join(out_lines)


def normalize_song(header: dict, body: str) -> tuple[dict, str]:
    """Devolve (header, body) normalizados. Idempotente: normalizar um
    resultado já normalizado não muda nada."""
    header = dict(header)

    for f in HEADER_FIELDS:
        header.setdefault(f, "")

    # "tom" é o campo vivo (SongsService.transpose() já o mantém atualizado a
    # cada transposição); "tom_da_cifra" é só um espelho dele criado pela
    # normalização — precisa ceder pro "tom" mais recente, não o contrário.
    tom_atual = header.get("tom") or header.get("tom_da_cifra") or ""
    header["tom_da_cifra"] = tom_atual
    header["tom"] = tom_atual
    header["tom_original"] = header.get("tom_original") or tom_atual

    # limpa a base (CAIXA ALTA / minúsculo-com-hífen herdado de nome de
    # arquivo, ver clean_title) ANTES de reaplicar o sufixo "- intérprete" —
    # nunca opera sobre o sufixo em si.
    interprete = header.get("intérprete", "")
    base_titulo = clean_title(strip_title_suffix(header.get("titulo", ""), interprete))
    header["titulo"] = apply_original_suffix(base_titulo, interprete)

    prefer_flats = "b" in tom_atual
    body = transpose_body(body, 0, prefer_flats=prefer_flats)
    body = _normalize_section_labels(body)

    header["normalizada"] = "sim"
    return header, body
