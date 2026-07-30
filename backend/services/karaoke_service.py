"""Prepara o payload do player karaokê.

Converte @velocidade (1-100) em ms por linha e expõe, por linha, os campos
``t`` (tempo em segundos via marcador [t=SEG] — o frontend interpola o que
falta usando a duração real do áudio) e ``tipo`` (letra/acorde/observação/
solo/riff/tab/secao/sample/customizado — ver utils/parser.py::parse_body).
Linhas marcadas como ``:oculta`` não entram no payload — o palco nunca as
recebe.

``has_audio`` indica se há uma faixa de referência enviada para a música
(ver AudioService); quando ausente, o player usa o cronômetro fixo de
``ms_per_line`` como sempre fez. ``samples`` lista os trechos de áudio
(solos/riffs) com disparo automático: só entra na lista uma linha
``[@sample] nome`` que tenha tempo explícito (``[t=SEG]``) *e* um sample
enviado cujo nome, slugificado, bata com o texto da linha — sem os dois,
o disparo automático não é confiável o suficiente para uma apresentação
ao vivo (a linha continua aparecendo no palco como aviso visual).

``bpm``/``instrumentos``/``synth_ready`` habilitam o acompanhamento
sintetizado (bateria/guitarra/baixo/teclado, ver frontend/src/utils/
bandSynth.js): ``synth_ready`` só fica verdadeiro quando a música NÃO tem
áudio real, tem ``@bpm`` definido e pelo menos um instrumento ligado — o
acompanhamento sintetizado só assume o palco no lugar de uma gravação de
verdade, nunca por cima dela.

``modo_execucao`` (``@modoexecucao``, padrão "rolagem" quando ausente/
inválido) escolhe qual dos dois modos de palco o frontend monta: "rolagem"
rola a página inteira (letra/acordes/observações/solos/riffs/tablaturas,
sem troca de cor) numa velocidade fixa derivada de ``tempo_execucao``
(``@tempoexecucao``, formato mm:ss); "karaoke" é o modo linha-a-linha já
existente acima. ``tempo_execucao_segundos`` é o mm:ss já convertido (None
se ausente/mal formatado — o frontend cai de volta para uma estimativa
baseada em ``ms_per_line``).
"""
from __future__ import annotations

import re

from services.audio_service import AudioService
from services.songs_service import SongsService
from utils.parser import parse_body
from utils.slug import slugify

MS_SLOWEST = 10000  # velocidade = 1
MS_FASTEST = 500    # velocidade = 100

_MMSS_RE = re.compile(r"^(\d+):([0-5]?\d)$")


def velocity_to_ms(velocidade: int) -> int:
    v = max(1, min(100, int(velocidade)))
    span = MS_SLOWEST - MS_FASTEST
    return round(MS_SLOWEST - (v - 1) / 99 * span)


def mmss_to_seconds(value: str) -> int | None:
    """Converte "mm:ss" em segundos; None se ausente ou mal formatado."""
    m = _MMSS_RE.match((value or "").strip())
    if not m:
        return None
    minutos, segundos = int(m.group(1)), int(m.group(2))
    return minutos * 60 + segundos


class KaraokeService:
    def __init__(self, songs: SongsService, audio: AudioService):
        self.songs = songs
        self.audio = audio

    def payload(self, user_id: str, slug: str) -> dict:
        data = self.songs.get(user_id, slug)
        entries = parse_body(data["body"])
        lines = [
            {"text": e["text"], "t": e["t"], "tipo": e["tipo"]}
            for e in entries
            if e["visivel"]
        ]
        velocidade = int(data["header"].get("velocidade") or 50)

        sample_meta = self.audio.list_samples(user_id, slug)
        samples = []
        for e in entries:
            if e["tipo"] != "sample" or e["t"] is None or not e["visivel"]:
                continue
            sample_id = slugify(e["text"].strip())
            if sample_id in sample_meta:
                samples.append({"id": sample_id, "nome": sample_meta[sample_id]["nome"], "t": e["t"]})

        bpm_raw = (data["header"].get("bpm") or "").strip()
        bpm = int(bpm_raw) if bpm_raw.isdigit() else None
        instrumentos = {
            k: data["header"].get(k) == "sim"
            for k in ("bateria", "guitarra", "baixo", "teclado")
        }
        has_audio = self.audio.has_track(user_id, slug)
        synth_ready = (not has_audio) and bpm is not None and any(instrumentos.values())

        modo_execucao = (data["header"].get("modoexecucao") or "rolagem").strip().lower()
        if modo_execucao not in ("rolagem", "karaoke"):
            modo_execucao = "rolagem"
        tempo_execucao = data["header"].get("tempoexecucao", "")

        return {
            "slug": slug,
            "titulo": data["titulo"],
            "interprete": data["interprete"],
            "tom": data["header"].get("tom", ""),
            "velocidade": velocidade,
            "ms_per_line": velocity_to_ms(velocidade),
            "lines": lines,
            "has_audio": has_audio,
            "samples": samples,
            "bpm": bpm,
            "instrumentos": instrumentos,
            "synth_ready": synth_ready,
            "modo_execucao": modo_execucao,
            "tempo_execucao": tempo_execucao,
            "tempo_execucao_segundos": mmss_to_seconds(tempo_execucao),
        }
