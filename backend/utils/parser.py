"""Parser do formato de arquivo de cifra (TXT com cabeçalho semântico).

Formato:
    @titulo: ...
    @autor: ...
    ...
    <linha em branco>
    corpo da cifra

Arquitetura preparada para tempo por linha (futuro):
    linhas do corpo podem conter marcadores ``[t=15.2]`` que hoje são
    apenas reconhecidos e preservados por ``parse_line_timing``.

Marcação explícita do corpo (ver docs/MARCACAO_CIFRAS.md):
    - ``[Texto]`` sozinho na linha       -> rótulo de seção (tipo "secao"),
      convenção já usada no acervo original (ex.: "[Refrão]", "[Solo]").
    - ``[@tipo]`` / ``[@tipo:oculta]``   -> marcação explícita nova.
      Sozinha na linha abre um bloco até ``[@/tipo]``; seguida de texto
      classifica só aquela linha. Tipos com estilo dedicado: acorde,
      observacao, solo, riff, tab, secao, sample — qualquer outra palavra
      vira tipo customizado. O modificador ``:oculta`` remove a linha do
      player karaokê (mas não do editor/impressão).
    - ``[@sample] nome-do-sample`` combinado com ``[t=SEG]`` dispara a
      reprodução automática de um trecho de áudio enviado para a música
      (ver services/audio_service.py e karaoke_service.py::payload).
    - Sem marcação: cai na heurística de ``classify_line``.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

HEADER_FIELDS = [
    "titulo", "autor", "intérprete", "tom", "tom_original", "tom_da_cifra", "velocidade",
    "ritmomusical", "introdução", "tags", "nota", "favorita", "normalizada",
    "bpm", "bateria", "guitarra", "baixo", "teclado",
    "modoexecucao", "tempoexecucao", "modopedal", "youtube_url",
]

# Aliases sem acento aceitos na leitura (a escrita usa sempre a forma canônica).
_ALIASES = {"interprete": "intérprete", "introducao": "introdução"}

_HEADER_RE = re.compile(r"^@([\wÀ-ÿ]+)\s*:\s*(.*)$")
_TIMING_RE = re.compile(r"^\[t=(\d+(?:\.\d+)?)\]\s*(.*)$")

# ---------- classificação de linha (letra / acorde / observação) ----------
_CHORD_LINE_RE = re.compile(r"^[\sA-G#b/mM0-9()ºªao+°susadimaj.,|:-]*$")
_HAS_NOTE_RE = re.compile(r"[A-G]")
_NOTE_KEYWORD_RE = re.compile(
    r"^\(?\s*(intro|introdu[çc][ãa]o|solo|ponte|refr[ãa]o|estrofe|"
    r"primeira parte|segunda parte|repete|repetir|repeti[çc][ãa]o|"
    r"final|coda|obs\.?|observa[çc][ãa]o|interl[úu]dio|riff|base|"
    r"break|improviso)\b",
    re.IGNORECASE,
)
_BRACKETED_RE = re.compile(r"^\s*[\(\[].+[\)\]]\s*$")

# ---------- marcação explícita ----------
# Rótulo de seção "solto": [Refrão], [Primeira Parte], [Riff 1] — convenção
# já usada no acervo original. Não pode começar com "@" (reservado à Regra 2).
_SECTION_LABEL_RE = re.compile(r"^\[([^\[\]@][^\[\]]*)\]\s*$")
# Marcação explícita nova: [@tipo], [@tipo:modificador], opcionalmente com
# texto na mesma linha (classifica só aquela linha em vez de abrir bloco).
_TAG_OPEN_RE = re.compile(r"^\[@([a-zA-ZÀ-ÿ_-]+)(?::([a-zA-ZÀ-ÿ_-]+))?\]\s*(.*)$")
_TAG_CLOSE_RE = re.compile(r"^\[@/([a-zA-ZÀ-ÿ_-]+)\]\s*$")

KNOWN_TYPES = {"letra", "acorde", "observacao", "solo", "riff", "tab", "secao", "sample"}


@dataclass
class Song:
    header: dict = field(default_factory=dict)
    body: str = ""

    @property
    def title(self) -> str:
        return self.header.get("titulo", "")


def parse_song(text: str) -> Song:
    """Separa cabeçalho e corpo de um TXT de cifra."""
    header: dict[str, str] = {}
    lines = text.splitlines()
    body_start = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            # primeira linha em branco após o cabeçalho encerra o header
            if header:
                body_start = i + 1
                break
            continue
        m = _HEADER_RE.match(stripped)
        if m and (header or i == 0 or all(not l.strip() for l in lines[:i])):
            key = m.group(1).lower()
            key = _ALIASES.get(key, key)
            if key in HEADER_FIELDS:
                header[key] = m.group(2).strip()
                continue
        # linha não-header antes de qualquer header -> arquivo sem cabeçalho
        body_start = i
        break
    else:
        body_start = len(lines)

    body = "\n".join(lines[body_start:]).strip("\n")
    return Song(header=header, body=body)


def serialize_song(song: Song) -> str:
    """Reconstrói o TXT com cabeçalho canônico completo + corpo."""
    out = []
    for f in HEADER_FIELDS:
        out.append(f"@{f}: {song.header.get(f, '')}".rstrip())
    out.append("")
    out.append(song.body)
    return "\n".join(out).rstrip() + "\n"


def classify_line(text: str) -> str:
    """Heurística: classifica uma linha do corpo da cifra.

    - ``observacao``: anotação para quem toca (Intro/Solo/Ponte, texto entre
      parênteses/colchetes, marcações de repetição etc.)
    - ``acorde``: linha composta só por cifras (ex.: "Gm7      C7")
    - ``letra``: linha de letra da música (default)
    """
    stripped = text.strip()
    if not stripped:
        return "letra"
    if _BRACKETED_RE.match(stripped) or _NOTE_KEYWORD_RE.match(stripped):
        return "observacao"
    if _HAS_NOTE_RE.search(stripped) and _CHORD_LINE_RE.match(stripped):
        return "acorde"
    return "letra"


def parse_body(body: str) -> list[dict]:
    """Converte o corpo da cifra em uma lista de linhas tipadas.

    Cada item: ``{"text": str, "t": float|None, "tipo": str, "visivel": bool}``.
    Aplica, nesta ordem: marcador de tempo ``[t=SEG]``, bloco explícito aberto
    (``[@tipo]``/``[@/tipo]``), rótulo de seção solto (``[Texto]``), marcação
    explícita de uma linha só, e por fim a heurística de ``classify_line``.
    As linhas de marcação em si (rótulo, abertura/fechamento de bloco) não são
    emitidas — só o efeito da marcação sobre as linhas de conteúdo.
    """
    entries: list[dict] = []
    open_block: tuple[str, bool] | None = None  # (tipo, visivel)

    for raw in body.splitlines():
        t, line = parse_line_timing(raw)
        stripped = line.strip()

        if open_block:
            close_m = _TAG_CLOSE_RE.match(stripped)
            if close_m and close_m.group(1).lower() == open_block[0]:
                open_block = None
                continue
            tipo, visivel = open_block
            entries.append({"text": line, "t": t, "tipo": tipo, "visivel": visivel})
            continue

        open_m = _TAG_OPEN_RE.match(stripped)
        if open_m:
            tipo = open_m.group(1).lower()
            visivel = (open_m.group(2) or "").lower() != "oculta"
            resto = open_m.group(3)
            if resto:
                entries.append({"text": resto, "t": t, "tipo": tipo, "visivel": visivel})
            else:
                open_block = (tipo, visivel)
            continue

        label_m = _SECTION_LABEL_RE.match(stripped)
        if label_m:
            entries.append({"text": label_m.group(1).strip(), "t": t, "tipo": "secao", "visivel": True})
            continue

        entries.append({"text": line, "t": t, "tipo": classify_line(line), "visivel": True})

    return entries


def parse_line_timing(line: str) -> tuple[Optional[float], str]:
    """(Preparação futura) Extrai marcador ``[t=SEG]`` do início da linha.

    Retorna (tempo_em_segundos | None, texto_da_linha).
    Hoje o player ignora o tempo; a API já o expõe para evolução.
    """
    m = _TIMING_RE.match(line)
    if m:
        return float(m.group(1)), m.group(2)
    return None, line
