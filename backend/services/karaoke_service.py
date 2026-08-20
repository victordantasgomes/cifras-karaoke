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

``modo_pedal`` (``@modopedal``) habilita o controle por pedal (foot switch)
durante a apresentação: "fila_clipes" expõe a lista ordenada de ``clips``
(ver ClipQueueService) que o pedal avança manualmente, um a um; "faixa_completa"
usa a faixa de referência já existente (``has_audio``), só precisando de uma
tecla dedicada pro pedal ligar/desligar — o sincronismo de rolagem já
prioriza áudio real sobre velocidade, sem nada novo aqui.
"""
from __future__ import annotations

import re

from services.audio_service import AudioService
from services.songs_service import SongsService
from utils.parser import parse_body
from utils.slug import slugify
from utils.transpose import transpose_body, transpose_chord

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
    def __init__(self, songs: SongsService, audio: AudioService, clips=None):
        self.songs = songs
        self.audio = audio
        self.clips = clips

    def payload(self, user_id: str, slug: str, is_admin: bool = False, semitones: int = 0) -> dict:
        """`semitones`: transposição ao vivo, só pra esta resposta — NUNCA
        grava nada (ver SongsService.transpose, que é quem persiste, com
        save=True explícito, usado pelo editor). Existe pro medley
        (SetlistDetail.jsx::buildMedleyItems / ScrollPlayer.jsx): a partir
        da 2ª música do grupo, toca no tom da 1ª, sem alterar o @tom
        cadastrado em nenhuma delas — cada nova consulta a este payload
        recalcula do zero a partir do body original."""
        data = self.songs.get(user_id, slug, is_admin=is_admin)
        body = transpose_body(data["body"], semitones) if semitones else data["body"]
        entries = parse_body(body)
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

        modo_pedal = (data["header"].get("modopedal") or "").strip().lower()
        if modo_pedal not in ("fila_clipes", "faixa_completa"):
            modo_pedal = ""
        clips = self.clips.list_clips(user_id, slug) if (self.clips and modo_pedal == "fila_clipes") else []

        return {
            "slug": slug,
            "titulo": data["titulo"],
            "interprete": data["interprete"],
            # dono da música — o player usa pra buscar a marca própria dele
            # (nome da banda + logo, Fase 8), se configurada; None pra
            # música órfã (dono excluído), o frontend simplesmente não
            # mostra marca nenhuma nesse caso.
            "owner_id": data["user_id"],
            "tom": transpose_chord(data["header"].get("tom", ""), semitones) if semitones else data["header"].get("tom", ""),
            "youtube_url": data["header"].get("youtube_url", ""),
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
            "modo_pedal": modo_pedal,
            "clips": [{"id": c["id"], "nome": c["nome"]} for c in clips],
        }
