"""Busca de vídeos no YouTube (YouTube Data API v3) — usado pra sugerir um
link real pro cabeçalho da música (@youtube_url, ver utils/parser.py). Uma
chamada de IA comum (ai_service.py) não tem acesso à internet e "inventaria"
um ID de vídeo plausível mas possivelmente errado ou inexistente — pior que
deixar em branco; a API de busca de verdade do YouTube resolve isso.

Cota gratuita: 10.000 unidades/dia, cada busca (search.list) custa 100
unidades — até 100 buscas por dia sem custo (ver SongsService.youtube_link_batch,
que processa em lotes pequenos e priorizados de propósito, pra não estourar
isso numa passada só). A cota é por CHAMADA, não por resultado devolvido —
por isso search_videos() já busca vários resultados de uma vez (ver
max_results): dá pra oferecer "sugerir outro" no modal sem gastar outra
chamada pra cada clique."""
from __future__ import annotations

import re

import requests

from config import Config

_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
_TIMEOUT = 10

# Título/intérprete importados de sites de cifra costumam carregar o nome
# do próprio site como ruído (ex.: intérprete salvo como "CifraClub" numa
# música mal categorizada) — isso ia direto pra busca e fazia o YouTube
# procurar o vídeo errado. Filtra antes de montar a query (pedido do
# usuário). \b nas bordas evita cortar pedaço de palavra que só por acaso
# contém "cifra" (ex.: um título real que tivesse essa palavra).
_NOISE_RE = re.compile(
    r"\b(cifras?\s*clube?|cifras?club|cifras?)\b", re.IGNORECASE,
)

# "�" (caractere de substituição Unicode, "�") — sobra de acento
# corrompido em parte do acervo importado há muito tempo com a codificação
# errada (ex.: "Zezé" virou "Zez�"). Mandar isso direto pra busca deixa o
# resultado instável (às vezes o resto do texto "salva" a busca, às vezes
# não) — relatado pelo usuário com "TARDE DEMAIS" de Zezé Di Camargo e
# Luciano voltando "nenhum vídeo encontrado". Não dá pra RECONSTRUIR a
# letra original a partir do caractere de substituição (o byte de verdade
# já foi perdido) — só dá pra tirar do caminho da busca.
_REPLACEMENT_CHAR_RE = re.compile("�")


def _clean_query_text(text: str) -> str:
    cleaned = _NOISE_RE.sub(" ", text or "")
    cleaned = _REPLACEMENT_CHAR_RE.sub(" ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


# vídeos normais do YouTube só usam PT#H#M#S (sem componente de dias/meses/
# anos, que só apareceria em durações absurdamente longas fora de escopo
# aqui) — ver contentDetails.duration na resposta de videos.list.
_ISO8601_DURATION_RE = re.compile(r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$")


def _parse_iso8601_duration_seconds(iso: str) -> int:
    m = _ISO8601_DURATION_RE.match(iso or "")
    if not m:
        return 0
    h, mi, s = (int(g) if g else 0 for g in m.groups())
    return h * 3600 + mi * 60 + s


class YoutubeError(Exception):
    pass


class YoutubeService:
    def search_videos(self, interprete: str, titulo: str, max_results: int = 5) -> list[dict]:
        """Devolve até `max_results` resultados de vídeo pra "título
        intérprete" (cada um com `video_id`, `title`, `url`) — lista vazia
        se a busca não achar nada. Só levanta YoutubeError por problema de
        configuração/rede, nunca por "sem resultado" (isso é um resultado
        válido, não uma falha)."""
        if not Config.YOUTUBE_API_KEY:
            raise YoutubeError("YOUTUBE_API_KEY não configurada no servidor.")
        query = f"{_clean_query_text(titulo)} {_clean_query_text(interprete)}".strip()
        query = re.sub(r"\s+", " ", query)
        if not query:
            return []
        try:
            resp = requests.get(_SEARCH_URL, params={
                "key": Config.YOUTUBE_API_KEY, "q": query, "part": "snippet",
                "type": "video", "maxResults": max_results,
            }, timeout=_TIMEOUT)
        except requests.RequestException as e:
            raise YoutubeError(f"Falha ao consultar a API do YouTube: {e}") from e
        if not resp.ok:
            raise YoutubeError(f"Falha ao consultar a API do YouTube: {resp.status_code} {resp.text}")
        results = []
        for item in resp.json().get("items", []):
            video_id = item.get("id", {}).get("videoId")
            if not video_id:
                continue
            results.append({
                "video_id": video_id,
                "title": item.get("snippet", {}).get("title", ""),
                "url": f"https://www.youtube.com/watch?v={video_id}",
            })
        if results:
            # busca a duração real de cada candidato (ver get_durations) pra
            # já vir pronta pro modal de sugestão preencher o campo "Tempo de
            # execução" assim que o usuário aceitar um deles — 1 unidade de
            # cota (videos.list) contra as 100 já gastas na busca acima, não
            # é motivo pra falhar a sugestão inteira se der erro.
            try:
                durations = self.get_durations([r["video_id"] for r in results])
            except YoutubeError:
                durations = {}
            for r in results:
                r["duration"] = durations.get(r["video_id"])
        return results

    def search_video_url(self, interprete: str, titulo: str) -> str | None:
        """Atalho pro primeiro resultado (usado no preenchimento em lote,
        que não tem revisão humana — ver SongsService.youtube_link_batch)."""
        results = self.search_videos(interprete, titulo, max_results=1)
        return results[0]["url"] if results else None

    def get_durations(self, video_ids: list[str]) -> dict[str, str]:
        """Duração real (mm:ss) de cada vídeo, numa chamada só (videos.list,
        contentDetails) — bem mais barata que search.list (1 unidade de
        cota contra 100), por isso não tem problema chamar toda vez que um
        vídeo é vinculado à cifra (ver rota /youtube/duration e o campo
        "Tempo de execução (mm:ss)" do cabeçalho). IDs que não resultarem
        numa duração válida (vídeo inexistente/privado, ou duração zerada de
        transmissão ao vivo) ficam de fora do dict devolvido."""
        if not Config.YOUTUBE_API_KEY:
            raise YoutubeError("YOUTUBE_API_KEY não configurada no servidor.")
        ids = [v for v in video_ids if v]
        if not ids:
            return {}
        try:
            resp = requests.get(_VIDEOS_URL, params={
                "key": Config.YOUTUBE_API_KEY, "id": ",".join(ids), "part": "contentDetails",
            }, timeout=_TIMEOUT)
        except requests.RequestException as e:
            raise YoutubeError(f"Falha ao consultar a API do YouTube: {e}") from e
        if not resp.ok:
            raise YoutubeError(f"Falha ao consultar a API do YouTube: {resp.status_code} {resp.text}")
        result = {}
        for item in resp.json().get("items", []):
            video_id = item.get("id")
            seconds = _parse_iso8601_duration_seconds(item.get("contentDetails", {}).get("duration", ""))
            if video_id and seconds:
                result[video_id] = f"{seconds // 60}:{seconds % 60:02d}"
        return result

    def get_duration(self, video_id: str) -> str | None:
        """Atalho de get_durations pra um vídeo só (ver rota
        /youtube/duration, usada quando o usuário cola manualmente uma URL
        no campo do cabeçalho em vez de usar o botão "Sugerir")."""
        return self.get_durations([video_id]).get(video_id)
