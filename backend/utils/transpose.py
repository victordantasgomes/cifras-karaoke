"""Transposição de acordes em linhas de cifra.

Suporta: C, Cm, C7, Cm7, Cmaj7, sustenidos/bemóis (C#, Db, F#, Bb, Ab),
inversões (G/B) e sufixos livres (sus4, add9, dim, aug, 9, 11, 13...).
"""
from __future__ import annotations

import re

SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
_NOTE_INDEX = {n: i for i, n in enumerate(SHARPS)} | {n: i for i, n in enumerate(FLATS)}

_CHORD_RE = re.compile(
    r"^([A-G][#b]?)"            # nota fundamental
    r"((?:m(?!aj))?(?:maj|sus|add|dim|aug|º|°)?\d*(?:[#b]\d+)?[\w()#b+-]*)"  # sufixo
    r"(?:/([A-G][#b]?))?$"      # baixo (inversão)
)

_TOKEN_RE = re.compile(r"(\s+|\S+)")


def transpose_note(note: str, semitones: int, prefer_flats: bool = False) -> str:
    idx = _NOTE_INDEX.get(note)
    if idx is None:
        return note
    scale = FLATS if prefer_flats else SHARPS
    return scale[(idx + semitones) % 12]


def transpose_chord(chord: str, semitones: int, prefer_flats: bool = False) -> str:
    m = _CHORD_RE.match(chord)
    if not m:
        return chord
    root, suffix, bass = m.groups()
    out = transpose_note(root, semitones, prefer_flats) + (suffix or "")
    if bass:
        out += "/" + transpose_note(bass, semitones, prefer_flats)
    return out


def is_chord(token: str) -> bool:
    return bool(_CHORD_RE.match(token))


def is_chord_line(line: str) -> bool:
    """Heurística: linha é de acordes se ≥70% dos tokens forem acordes."""
    tokens = [t for t in line.split() if t]
    if not tokens:
        return False
    hits = sum(1 for t in tokens if is_chord(t))
    return hits / len(tokens) >= 0.7


def transpose_line(line: str, semitones: int, prefer_flats: bool = False) -> str:
    if not is_chord_line(line):
        return line
    parts = _TOKEN_RE.findall(line)
    return "".join(
        transpose_chord(p, semitones, prefer_flats) if not p.isspace() else p
        for p in parts
    )


def transpose_body(body: str, semitones: int, prefer_flats: bool = False) -> str:
    return "\n".join(transpose_line(l, semitones, prefer_flats) for l in body.splitlines())


def semitones_between(key_from: str, key_to: str) -> int:
    a = _NOTE_INDEX.get(_root(key_from))
    b = _NOTE_INDEX.get(_root(key_to))
    if a is None or b is None:
        raise ValueError(f"Tom inválido: {key_from!r} -> {key_to!r}")
    return (b - a) % 12


def _root(key: str) -> str:
    key = key.strip()
    m = re.match(r"^([A-G][#b]?)", key)
    return m.group(1) if m else key
