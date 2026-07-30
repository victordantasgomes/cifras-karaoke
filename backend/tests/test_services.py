import pytest

import db
from services.audio_service import AudioService
from services.search_service import SearchService
from services.setlist_service import SetlistService
from services.songs_service import SongsService
from services.karaoke_service import KaraokeService, velocity_to_ms


@pytest.fixture
def ctx(fake_blob_store, user_id):
    setlists = SetlistService()
    audio = AudioService()
    songs = SongsService(setlists=setlists, audio=audio)
    audio.songs = songs
    return songs, setlists, audio


def _create(songs, title="Yellow", artist="Coldplay", genre="Pop"):
    return songs.create("u1", genre, artist, title,
                        f"@titulo: {title}\n@tom: B\n@velocidade: 55\n\nB\nLook at the stars")


class _FakeFile:
    """Duck-type mínimo de werkzeug.FileStorage para os testes."""
    def __init__(self, filename, content=b"fake-audio-bytes"):
        self.filename = filename
        self.mimetype = "audio/mpeg"
        self._content = content

    def read(self):
        return self._content


def test_create_and_get(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    data = songs.get("u1", entry["slug"])
    assert data["titulo"] == "Yellow" and "stars" in data["body"]


def test_search_and_pagination(ctx):
    songs, _, _ = ctx
    for i in range(12):
        _create(songs, title=f"Música {i:02d}")
    search = SearchService()
    page = search.search("u1", page=1, page_size=5)
    assert page["total"] == 12 and len(page["items"]) == 5 and page["total_pages"] == 3
    hit = search.search("u1", q="musica 07")
    assert hit["total"] >= 1


def test_update_creates_history_version(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    data = songs.get("u1", entry["slug"])
    songs.update("u1", entry["slug"], data["header"], "novo corpo")
    song_id = songs.get_id("u1", "pop--coldplay--yellow")
    with db.get_pool().connection() as conn:
        count = conn.execute(
            "select count(*) as n from song_versions where song_id=%s", (song_id,),
        ).fetchone()["n"]
    assert count == 1


def test_delete_removes_from_setlists(ctx):
    songs, setlists, _ = ctx
    entry = _create(songs)
    created = setlists.save("u1", "Show", ["Coldplay/Yellow", "Queen/Love of My Life"])
    songs.delete("u1", entry["slug"])
    remaining = setlists.get("u1", created["id"])["items"]
    assert all("Yellow" not in i["ref"] for i in remaining)


def test_delete_song_removes_audio(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    audio.save_track("u1", entry["slug"], _FakeFile("track.mp3"))
    audio.save_sample("u1", entry["slug"], _FakeFile("solo.mp3"), "Solo de Guitarra")
    assert audio.has_track("u1", entry["slug"])
    songs.delete("u1", entry["slug"])
    assert not audio.has_track("u1", entry["slug"])
    assert audio.list_samples("u1", entry["slug"]) == {}


def test_transpose_updates_key(ctx):
    songs, _, _ = ctx
    entry = _create(songs)
    result = songs.transpose("u1", entry["slug"], semitones=2)
    assert result["tom"] == "C#"


def test_velocity_mapping():
    assert velocity_to_ms(1) == 10000
    assert velocity_to_ms(100) == 500
    assert 500 < velocity_to_ms(50) < 10000


def test_karaoke_payload(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["ms_per_line"] > 0 and len(payload["lines"]) >= 2


def test_karaoke_payload_classifies_lines(ctx):
    songs, _, audio = ctx
    entry = songs.create(
        "u1", "Rock", "Queen", "Bohemian Rhapsody",
        "@titulo: Bohemian Rhapsody\n@tom: Bb\n@velocidade: 40\n\n"
        "Intro:\nGm7          C7\nIs this the real life?\n(repete)",
    )
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    tipos = [l["tipo"] for l in payload["lines"]]
    assert tipos == ["observacao", "acorde", "letra", "observacao"]


def test_karaoke_payload_hides_oculta_lines(ctx):
    songs, _, audio = ctx
    entry = songs.create(
        "u1", "Rock", "Queen", "Bohemian Rhapsody",
        "@titulo: Bohemian Rhapsody\n@tom: Bb\n@velocidade: 40\n\n"
        "[@observacao:oculta] conferir acorde com o áudio original\n"
        "Is this the real life?",
    )
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert len(payload["lines"]) == 1
    assert payload["lines"][0]["text"] == "Is this the real life?"


def test_karaoke_payload_has_audio_false_by_default(ctx):
    """Regressão crítica: músicas sem áudio (todo o acervo hoje) não podem mudar de comportamento."""
    songs, _, audio = ctx
    entry = _create(songs)
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["has_audio"] is False
    assert payload["samples"] == []


def test_karaoke_payload_has_audio_true_after_upload(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    audio.save_track("u1", entry["slug"], _FakeFile("faixa.mp3"))
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["has_audio"] is True


def test_karaoke_payload_synth_ready_defaults_false(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["bpm"] is None
    assert payload["instrumentos"] == {"bateria": False, "guitarra": False, "baixo": False, "teclado": False}
    assert payload["synth_ready"] is False


def test_karaoke_payload_synth_ready_true_with_bpm_and_instrument(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    header = songs.get("u1", entry["slug"])["header"]
    header = {**header, "bpm": "90", "bateria": "sim"}
    songs.update("u1", entry["slug"], header, songs.get("u1", entry["slug"])["body"])
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["bpm"] == 90
    assert payload["instrumentos"]["bateria"] is True
    assert payload["synth_ready"] is True


def test_karaoke_payload_synth_ready_false_when_audio_uploaded(ctx):
    """Regressão: acompanhamento sintetizado nunca assume o palco por cima de áudio real."""
    songs, _, audio = ctx
    entry = _create(songs)
    header = songs.get("u1", entry["slug"])["header"]
    header = {**header, "bpm": "90", "bateria": "sim"}
    songs.update("u1", entry["slug"], header, songs.get("u1", entry["slug"])["body"])
    audio.save_track("u1", entry["slug"], _FakeFile("faixa.mp3"))
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["synth_ready"] is False


def test_karaoke_payload_synth_ready_false_without_instrument(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    header = songs.get("u1", entry["slug"])["header"]
    header = {**header, "bpm": "90"}
    songs.update("u1", entry["slug"], header, songs.get("u1", entry["slug"])["body"])
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["synth_ready"] is False


def test_karaoke_payload_defaults_to_rolagem_mode(ctx):
    """Acervo existente (sem @modoexecucao) deve tocar em modo rolagem por padrão."""
    songs, _, audio = ctx
    entry = _create(songs)
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["modo_execucao"] == "rolagem"
    assert payload["tempo_execucao_segundos"] is None


def test_karaoke_payload_respects_karaoke_mode(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    header = songs.get("u1", entry["slug"])["header"]
    header = {**header, "modoexecucao": "karaoke"}
    songs.update("u1", entry["slug"], header, songs.get("u1", entry["slug"])["body"])
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["modo_execucao"] == "karaoke"


def test_karaoke_payload_parses_tempo_execucao(ctx):
    songs, _, audio = ctx
    entry = _create(songs)
    header = songs.get("u1", entry["slug"])["header"]
    header = {**header, "tempoexecucao": "03:30"}
    songs.update("u1", entry["slug"], header, songs.get("u1", entry["slug"])["body"])
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["tempo_execucao"] == "03:30"
    assert payload["tempo_execucao_segundos"] == 210


def test_karaoke_payload_resolves_sample_with_time_and_upload(ctx):
    songs, _, audio = ctx
    entry = songs.create(
        "u1", "Rock", "Queen", "Bohemian Rhapsody",
        "@titulo: Bohemian Rhapsody\n@tom: Bb\n@velocidade: 40\n\n"
        "[t=42.5] [@sample] Solo de Guitarra\n"
        "[@sample] Sem Tempo Marcado\n"
        "[t=50] [@sample] Nunca Enviado\n"
        "Letra normal",
    )
    audio.save_sample("u1", entry["slug"], _FakeFile("solo.mp3"), "Solo de Guitarra")
    k = KaraokeService(songs, audio)
    payload = k.payload("u1", entry["slug"])
    assert payload["samples"] == [{"id": "solo-de-guitarra", "nome": "Solo de Guitarra", "t": 42.5}]
