"""Testes de ClipQueueService com o Vercel Blob mockado (ver fixture
fake_blob_store em conftest.py)."""
import pytest

from services.clip_queue_service import ClipQueueService
from services.songs_service import NotOwner, SongNotFound, SongsService


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
    clips = ClipQueueService(songs)
    entry = songs.create("u1", "Rock", "Queen", "Bohemian Rhapsody",
                          "@titulo: Bohemian Rhapsody\n\ncorpo")
    return clips, entry["slug"], fake_blob_store


def test_save_clip_and_list(ctx):
    clips, slug, store = ctx
    result = clips.save_clip("u1", slug, _FakeFile("intro.mp3"), "Introdução")
    assert result["nome"] == "Introdução" and result["position"] == 0
    listed = clips.list_clips("u1", slug)
    assert listed == [{"id": result["id"], "nome": "Introdução", "position": 0}]
    assert any(k.startswith(f"audio/u1/{slug}/clips/introducao-") for k in store)


def test_clips_get_sequential_positions(ctx):
    clips, slug, _ = ctx
    clips.save_clip("u1", slug, _FakeFile("a.mp3"), "Intro")
    clips.save_clip("u1", slug, _FakeFile("b.mp3"), "Solo")
    clips.save_clip("u1", slug, _FakeFile("c.mp3"), "Final")
    positions = [c["position"] for c in clips.list_clips("u1", slug)]
    assert positions == [0, 1, 2]


def test_reorder_clips(ctx):
    clips, slug, _ = ctx
    c1 = clips.save_clip("u1", slug, _FakeFile("a.mp3"), "Intro")
    c2 = clips.save_clip("u1", slug, _FakeFile("b.mp3"), "Solo")
    c3 = clips.save_clip("u1", slug, _FakeFile("c.mp3"), "Final")
    reordered = clips.reorder_clips("u1", slug, [c3["id"], c1["id"], c2["id"]])
    assert [c["nome"] for c in reordered] == ["Final", "Intro", "Solo"]
    assert [c["position"] for c in reordered] == [0, 1, 2]


def test_delete_clip_removes_bytes_and_meta(ctx):
    clips, slug, store = ctx
    result = clips.save_clip("u1", slug, _FakeFile("a.mp3"), "Intro")
    clips.delete_clip("u1", slug, result["id"])
    assert clips.list_clips("u1", slug) == []
    assert clips.clip_bytes("u1", slug, result["id"]) is None
    assert store == {}


def test_delete_all_for_song_removes_every_clip(ctx):
    clips, slug, store = ctx
    clips.save_clip("u1", slug, _FakeFile("a.mp3"), "Intro")
    clips.save_clip("u1", slug, _FakeFile("b.mp3"), "Solo")
    clips.delete_all_for_song("u1", slug)
    assert clips.list_clips("u1", slug) == []
    assert store == {}


def test_save_clip_unknown_slug_raises(ctx):
    clips, _, _ = ctx
    with pytest.raises(SongNotFound):
        clips.save_clip("u1", "musica-que-nao-existe", _FakeFile("x.mp3"), "Intro")


def test_save_clip_blank_nome_raises(ctx):
    clips, slug, _ = ctx
    with pytest.raises(ValueError):
        clips.save_clip("u1", slug, _FakeFile("x.mp3"), "   ")


def test_clip_bytes_playback(ctx):
    clips, slug, _ = ctx
    result = clips.save_clip("u1", slug, _FakeFile("a.mp3", b"conteudo-do-clipe"), "Intro")
    data, _content_type = clips.clip_bytes("u1", slug, result["id"])
    assert data == b"conteudo-do-clipe"


def test_non_owner_cannot_save_clip(ctx, other_user_id):
    clips, slug, _ = ctx
    with pytest.raises(NotOwner):
        clips.save_clip(other_user_id, slug, _FakeFile("x.mp3"), "Intro")


def test_non_owner_cannot_delete_clip(ctx, other_user_id):
    clips, slug, _ = ctx
    result = clips.save_clip("u1", slug, _FakeFile("x.mp3"), "Intro")
    with pytest.raises(NotOwner):
        clips.delete_clip(other_user_id, slug, result["id"])


def test_non_owner_cannot_reorder_clips(ctx, other_user_id):
    clips, slug, _ = ctx
    clips.save_clip("u1", slug, _FakeFile("x.mp3"), "Intro")
    with pytest.raises(NotOwner):
        clips.reorder_clips(other_user_id, slug, [])
