"""Geração de slugs estáveis para identificar músicas e setlists."""
from __future__ import annotations

import re
import unicodedata


def slugify(*parts: str) -> str:
    """'Rock', 'Queen', 'Bohemian Rhapsody' -> 'rock--queen--bohemian-rhapsody'."""
    out = []
    for p in parts:
        p = unicodedata.normalize("NFKD", p).encode("ascii", "ignore").decode()
        p = re.sub(r"[^\w\s-]", "", p).strip().lower()
        p = re.sub(r"[\s_]+", "-", p)
        if p:
            out.append(p)
    return "--".join(out)
