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
        # espaço colado num hífen literal do texto original (ex.: "Vamos
        # Fugir- Skank") vira dois hífens seguidos aqui — sem isso, o mesmo
        # título com/sem esse hífen solto gera slugs diferentes e nunca bate
        # na comparação fuzzy usada por setlist/duplicidade (ref presa como
        # "não encontrada" mesmo com a música existindo). Só colapsa DENTRO
        # de uma parte — o separador "--" entre parts (ver "--".join abaixo)
        # é aplicado depois de todo esse loop, não é afetado.
        p = re.sub(r"-{2,}", "-", p)
        if p:
            out.append(p)
    return "--".join(out)
