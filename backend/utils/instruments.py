"""Vocabulário fechado de instrumentos — compartilhado entre o perfil do
usuário (quais instrumentos ele toca, ver auth_service.py::user_instruments)
e "instrumentos buscados" de um anúncio do mural (band_board_service.py).
Precisa ser fechado (não texto livre) pra alertas por instrumento
(alerts_service.py) poderem comparar array contra array, sem depender de
correspondência aproximada de texto.

Não confundir com frontend/src/utils/tunings.js::INSTRUMENTS — aquela lista
é específica do Afinador (só 5 instrumentos com corda/afinação relevante),
esta é a lista geral de "instrumentos que um músico toca"."""
from __future__ import annotations

INSTRUMENTS = (
    "guitar", "bass", "drums", "vocals", "keys", "piano",
    "saxophone", "violin", "ukulele", "percussion", "other",
)

# mesma escala já usada em band_posts.skill_level (nível da banda como um
# todo) — reaproveitada aqui pro nível técnico POR instrumento do usuário.
SKILL_LEVELS = ("iniciante", "intermediario", "avancado", "profissional")
