"""Testes de AudioService com o Vercel Blob mockado (ver fixture
fake_blob_store em conftest.py) — não bate na API de verdade nem precisa de
BLOB_READ_WRITE_TOKEN."""
import pytest

import db
from services.audio_service import AudioService
from services.songs_service import SongNotFound, SongsService


class _FakeFile:
    """Duck-type mínimo de werkzeug.FileStorage."""
    def __init__(self, filename, content=b"fake-audio-bytes"):
        self.filename = filename
        self.mimetype = "audio/mpeg"
        self._content = content

    def read(self):
        return self._content


@pytest.fixture
def ctx(fake_blob_store, user_id):
    songs = SongsService()
    audio = AudioService(songs)
    entry = songs.create("u1", "Rock", "Queen", "Bohemian Rhapsody",
                          "@titulo: Bohemian Rhapsody\n\ncorpo")
    return audio, entry["slug"], fake_blob_store


def test_save_and_find_track(ctx):
    audio, slug, store = ctx
    assert not audio.has_track("u1", slug)
    audio.save_track("u1", slug, _FakeFile("faixa.mp3"))
    assert audio.has_track("u1", slug)
    data, _content_type = audio.track_bytes("u1", slug)
    assert data == b"fake-audio-bytes"
    assert store[f"audio/u1/{slug}/track.mp3"] == b"fake-audio-bytes"


def test_reupload_track_replaces_url(ctx):
    audio, slug, store = ctx
    audio.save_track("u1", slug, _FakeFile("faixa.mp3", b"v1"))
    audio.save_track("u1", slug, _FakeFile("faixa.wav", b"v2"))
    data, _content_type = audio.track_bytes("u1", slug)
    assert data == b"v2"
    assert f"audio/u1/{slug}/track.wav" in store
    assert store[f"audio/u1/{slug}/track.wav"] == b"v2"


def test_delete_track(ctx):
    audio, slug, store = ctx
    audio.save_track("u1", slug, _FakeFile("faixa.mp3"))
    audio.delete_track("u1", slug)
    assert not audio.has_track("u1", slug)
    assert store == {}


def test_save_track_unknown_slug_raises(ctx):
    audio, _, _ = ctx
    with pytest.raises(SongNotFound):
        audio.save_track("u1", "musica-que-nao-existe", _FakeFile("x.mp3"))


def test_save_sample_and_list(ctx):
    audio, slug, store = ctx
    result = audio.save_sample("u1", slug, _FakeFile("x.mp3"), "Solo de Guitarra")
    assert result == {"id": "solo-de-guitarra", "nome": "Solo de Guitarra"}
    assert audio.list_samples("u1", slug) == {"solo-de-guitarra": {"nome": "Solo de Guitarra"}}
    data, _content_type = audio.sample_bytes("u1", slug, "solo-de-guitarra")
    assert data == b"fake-audio-bytes"
    assert f"audio/u1/{slug}/samples/solo-de-guitarra.mp3" in store


def test_reupload_sample_same_nome_overwrites(ctx):
    audio, slug, store = ctx
    audio.save_sample("u1", slug, _FakeFile("a.mp3", b"v1"), "Riff")
    audio.save_sample("u1", slug, _FakeFile("a.mp3", b"v2"), "Riff")
    assert len(audio.list_samples("u1", slug)) == 1
    assert store[f"audio/u1/{slug}/samples/riff.mp3"] == b"v2"


def test_save_sample_blank_nome_raises(ctx):
    audio, slug, _ = ctx
    with pytest.raises(ValueError):
        audio.save_sample("u1", slug, _FakeFile("x.mp3"), "   ")


def test_save_sample_unknown_slug_raises(ctx):
    audio, _, _ = ctx
    with pytest.raises(SongNotFound):
        audio.save_sample("u1", "musica-que-nao-existe", _FakeFile("x.mp3"), "Riff")


def test_delete_sample_removes_bytes_and_meta(ctx):
    audio, slug, store = ctx
    audio.save_sample("u1", slug, _FakeFile("x.mp3"), "Riff")
    audio.delete_sample("u1", slug, "riff")
    assert audio.list_samples("u1", slug) == {}
    assert audio.sample_bytes("u1", slug, "riff") is None
    assert store == {}


def test_delete_all_for_slug_removes_track_and_samples(ctx):
    audio, slug, store = ctx
    audio.save_track("u1", slug, _FakeFile("faixa.mp3"))
    audio.save_sample("u1", slug, _FakeFile("x.mp3"), "Riff")
    audio.delete_all_for_slug("u1", slug)
    assert store == {}
    assert not audio.has_track("u1", slug)
    assert audio.list_samples("u1", slug) == {}


def _song_id(slug):
    with db.get_pool().connection() as conn:
        return conn.execute("select id from songs where slug=%s", (slug,)).fetchone()["id"]


def test_save_track_captures_size_bytes(ctx):
    audio, slug, _ = ctx
    audio.save_track("u1", slug, _FakeFile("faixa.mp3", b"0123456789"))
    with db.get_pool().connection() as conn:
        row = conn.execute("select size_bytes from audio_tracks where song_id=%s", (_song_id(slug),)).fetchone()
    assert row["size_bytes"] == 10


def test_save_sample_captures_size_bytes(ctx):
    audio, slug, _ = ctx
    audio.save_sample("u1", slug, _FakeFile("x.mp3", b"0123456789abcde"), "Riff")
    with db.get_pool().connection() as conn:
        row = conn.execute(
            "select size_bytes from samples where song_id=%s and sample_id='riff'", (_song_id(slug),),
        ).fetchone()
    assert row["size_bytes"] == 15


def test_storage_recompute_status_counts_zero_size_rows(ctx):
    audio, slug, _ = ctx
    assert audio.storage_recompute_status() == {"remaining": 0}
    audio.save_track("u1", slug, _FakeFile("faixa.mp3"))
    with db.get_pool().connection() as conn:
        conn.execute("update audio_tracks set size_bytes=0 where song_id=%s", (_song_id(slug),))
    assert audio.storage_recompute_status() == {"remaining": 1}


def test_storage_recompute_batch_fills_in_size_from_blob(ctx):
    audio, slug, store = ctx
    audio.save_track("u1", slug, _FakeFile("faixa.mp3", b"0123456789"))
    audio.save_sample("u1", slug, _FakeFile("x.mp3", b"abc"), "Riff")
    with db.get_pool().connection() as conn:
        conn.execute("update audio_tracks set size_bytes=0 where song_id=%s", (_song_id(slug),))
        conn.execute("update samples set size_bytes=0 where song_id=%s", (_song_id(slug),))

    result = audio.storage_recompute_batch(limit=50)
    assert result == {"processed": 2, "remaining": 0}

    with db.get_pool().connection() as conn:
        track = conn.execute("select size_bytes from audio_tracks where song_id=%s", (_song_id(slug),)).fetchone()
        sample = conn.execute(
            "select size_bytes from samples where song_id=%s and sample_id='riff'", (_song_id(slug),),
        ).fetchone()
    assert track["size_bytes"] == 10
    assert sample["size_bytes"] == 3
    assert store  # blob_url continua intacto — o recálculo não mexeu no conteúdo


def test_start_track_upload_returns_scoped_presigned_url(ctx):
    import urllib.parse
    audio, slug, _ = ctx
    result = audio.start_track_upload("u1", slug, "faixa completa.mp3", "audio/mpeg")
    pathname = f"audio/u1/{slug}/track.mp3"
    assert result["pathname"] == pathname
    assert result["contentType"] == "audio/mpeg"
    assert result["uploadUrl"].startswith("https://vercel.com/api/blob/?")
    assert f"pathname={urllib.parse.quote_plus(pathname)}" in result["uploadUrl"]
    assert "vercel-blob-add-random-suffix=false" in result["uploadUrl"]
    assert "vercel-blob-allow-overwrite=true" in result["uploadUrl"]
    assert "vercel-blob-signature=" in result["uploadUrl"]


def test_start_track_upload_unknown_slug_raises(ctx):
    audio, _, _ = ctx
    with pytest.raises(SongNotFound):
        audio.start_track_upload("u1", "musica-que-nao-existe", "faixa.mp3", "audio/mpeg")


def test_start_track_upload_defaults_extension_when_filename_has_none(ctx):
    audio, slug, _ = ctx
    result = audio.start_track_upload("u1", slug, "faixa-sem-extensao", "audio/mpeg")
    assert result["pathname"] == f"audio/u1/{slug}/track.mp3"


def test_confirm_track_upload_persists_metadata(ctx):
    audio, slug, _ = ctx
    pathname = f"audio/u1/{slug}/track.mp3"
    audio.confirm_track_upload("u1", slug, pathname, "https://fake-blob.test/" + pathname, "audio/mpeg", 12345)
    assert audio.has_track("u1", slug)
    with db.get_pool().connection() as conn:
        row = conn.execute(
            "select content_type, size_bytes from audio_tracks where song_id=%s", (_song_id(slug),),
        ).fetchone()
    assert row["content_type"] == "audio/mpeg"
    assert row["size_bytes"] == 12345


def test_confirm_track_upload_rejects_pathname_outside_scope(ctx):
    audio, slug, _ = ctx
    with pytest.raises(ValueError):
        audio.confirm_track_upload("u1", slug, "audio/outro-usuario/track.mp3", "https://fake-blob.test/x", "audio/mpeg", 10)


def test_confirm_track_upload_unknown_slug_raises(ctx):
    audio, _, _ = ctx
    pathname = "audio/u1/musica-que-nao-existe/track.mp3"
    with pytest.raises(SongNotFound):
        audio.confirm_track_upload("u1", "musica-que-nao-existe", pathname, "https://fake-blob.test/" + pathname, "audio/mpeg", 10)


def test_storage_recompute_batch_respects_limit_and_is_resumable(ctx):
    audio, slug, _ = ctx
    audio.save_track("u1", slug, _FakeFile("faixa.mp3", b"0123456789"))
    audio.save_sample("u1", slug, _FakeFile("x.mp3", b"abc"), "Riff")
    with db.get_pool().connection() as conn:
        conn.execute("update audio_tracks set size_bytes=0 where song_id=%s", (_song_id(slug),))
        conn.execute("update samples set size_bytes=0 where song_id=%s", (_song_id(slug),))

    first = audio.storage_recompute_batch(limit=1)
    assert first == {"processed": 1, "remaining": 1}
    second = audio.storage_recompute_batch(limit=1)
    assert second == {"processed": 1, "remaining": 0}
