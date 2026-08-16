"""Busca de vídeos no YouTube (YouTube Data API v3) — usado pra sugerir um
link real pro cabeçalho da música (@youtube_url, ver utils/parser.py). Uma
chamada de IA comum (ai_service.py) não tem acesso à internet e "inventaria"
um ID de vídeo plausível mas possivelmente errado ou inexistente — pior que
deixar em branco; a API de busca de verdade do YouTube resolve isso.

Cota gratuita: 10.000 unidades/dia, cada busca (search.list) custa 100
unidades — até 100 buscas por dia sem custo (ver SongsService.youtube_link_batch,
que processa em lotes pequenos e priorizados de propósito, pra não estourar
isso numa passada só)."""
from __future__ import annotations

import requests

from config import Config

_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
_TIMEOUT = 10


class YoutubeError(Exception):
    pass


class YoutubeService:
    def search_video_url(self, interprete: str, titulo: str) -> str | None:
        """Devolve a URL do primeiro resultado de vídeo pra "título
        intérprete", ou None se a busca não achar nada — só levanta
        YoutubeError por problema de configuração/rede, nunca por "sem
        resultado" (isso é um resultado válido, não uma falha)."""
        if not Config.YOUTUBE_API_KEY:
            raise YoutubeError("YOUTUBE_API_KEY não configurada no servidor.")
        query = f"{titulo} {interprete}".strip()
        if not query:
            return None
        try:
            resp = requests.get(_SEARCH_URL, params={
                "key": Config.YOUTUBE_API_KEY, "q": query, "part": "snippet",
                "type": "video", "maxResults": 1,
            }, timeout=_TIMEOUT)
        except requests.RequestException as e:
            raise YoutubeError(f"Falha ao consultar a API do YouTube: {e}") from e
        if not resp.ok:
            raise YoutubeError(f"Falha ao consultar a API do YouTube: {resp.status_code} {resp.text}")
        items = resp.json().get("items", [])
        if not items:
            return None
        video_id = items[0].get("id", {}).get("videoId")
        return f"https://www.youtube.com/watch?v={video_id}" if video_id else None
