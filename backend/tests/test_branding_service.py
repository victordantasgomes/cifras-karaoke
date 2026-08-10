"""Testes de BrandingService com o Vercel Blob mockado (ver fixture
fake_blob_store em conftest.py) — mesmo padrão de test_audio_service.py.
Reescrito pra 4 variantes por usuário (preta/branca/colorida-clara/
colorida-escura) e a resolução automática pelo tema de quem está vendo."""
import db
from services.branding_service import BrandingService


class _FakeFile:
    """Duck-type mínimo de werkzeug.FileStorage."""
    def __init__(self, filename, content=b"fake-logo-bytes"):
        self.filename = filename
        self.mimetype = "image/png"
        self._content = content

    def read(self):
        return self._content


def test_save_and_resolve_logo(fake_blob_store, user_id):
    branding = BrandingService()
    assert not branding.has_logo(user_id)
    branding.save_logo(user_id, "color_dark", _FakeFile("logo.png"))
    assert branding.has_logo(user_id)
    data, _content_type = branding.resolve_logo(user_id, "dark")
    assert data == b"fake-logo-bytes"
    assert fake_blob_store[f"branding/{user_id}/color_dark.png"] == b"fake-logo-bytes"


def test_reupload_same_variant_replaces_previous(fake_blob_store, user_id):
    branding = BrandingService()
    branding.save_logo(user_id, "black", _FakeFile("logo.png", b"v1"))
    branding.save_logo(user_id, "black", _FakeFile("logo.jpg", b"v2"))
    data, _content_type = branding.resolve_logo(user_id, "light")
    assert data == b"v2"
    assert f"branding/{user_id}/black.jpg" in fake_blob_store


def test_different_variants_coexist(fake_blob_store, user_id):
    branding = BrandingService()
    branding.save_logo(user_id, "black", _FakeFile("black.png", b"preta"))
    branding.save_logo(user_id, "white", _FakeFile("white.png", b"branca"))
    assert set(branding.list_variants(user_id)) == {"black", "white"}


def test_delete_logo_removes_only_that_variant(fake_blob_store, user_id):
    branding = BrandingService()
    branding.save_logo(user_id, "black", _FakeFile("black.png"))
    branding.save_logo(user_id, "white", _FakeFile("white.png"))
    branding.delete_logo(user_id, "black")
    assert branding.list_variants(user_id) == ["white"]
    assert branding.has_logo(user_id)


def test_delete_logo_when_none_uploaded_is_a_noop(user_id):
    branding = BrandingService()
    branding.delete_logo(user_id, "black")  # não levanta


def test_resolve_logo_when_none_uploaded_returns_none(user_id):
    branding = BrandingService()
    assert branding.resolve_logo(user_id, "dark") is None


def test_logo_is_scoped_per_user(fake_blob_store, user_id, other_user_id):
    branding = BrandingService()
    branding.save_logo(user_id, "color_dark", _FakeFile("logo.png", b"mine"))
    assert not branding.has_logo(other_user_id)
    assert branding.resolve_logo(other_user_id, "dark") is None


def test_deleting_user_cascades_all_variants(fake_blob_store, user_id):
    branding = BrandingService()
    branding.save_logo(user_id, "black", _FakeFile("black.png"))
    branding.save_logo(user_id, "white", _FakeFile("white.png"))
    with db.get_pool().connection() as conn:
        conn.execute("delete from users where id=%s", (user_id,))
    assert not branding.has_logo(user_id)


def test_resolve_logo_prefers_matching_theme_variant(fake_blob_store, user_id):
    branding = BrandingService()
    branding.save_logo(user_id, "color_light", _FakeFile("cl.png", b"clara"))
    branding.save_logo(user_id, "color_dark", _FakeFile("cd.png", b"escura"))
    dark_data, _ = branding.resolve_logo(user_id, "dark")
    light_data, _ = branding.resolve_logo(user_id, "light")
    assert dark_data == b"escura"
    assert light_data == b"clara"


def test_resolve_logo_dark_theme_falls_back_to_white_then_color_light_then_black(fake_blob_store, user_id, other_user_id):
    branding = BrandingService()
    # só branca enviada — tema escuro deve preferir branca a qualquer coisa colorida ausente
    branding.save_logo(user_id, "white", _FakeFile("w.png", b"branca"))
    data, _ = branding.resolve_logo(user_id, "dark")
    assert data == b"branca"

    # com branca E colorida-clara, ainda prefere branca (mais alto na ordem pro tema escuro)
    branding.save_logo(user_id, "color_light", _FakeFile("cl.png", b"clara"))
    data, _ = branding.resolve_logo(user_id, "dark")
    assert data == b"branca"

    # só colorida-clara e preta (sem branca) — tema escuro cai pra colorida-clara antes de preta
    branding.save_logo(other_user_id, "color_light", _FakeFile("cl2.png", b"clara2"))
    branding.save_logo(other_user_id, "black", _FakeFile("b2.png", b"preta2"))
    data, _ = branding.resolve_logo(other_user_id, "dark")
    assert data == b"clara2"


def test_resolve_logo_light_theme_falls_back_to_black_then_color_dark_then_white(fake_blob_store, user_id, other_user_id):
    branding = BrandingService()
    branding.save_logo(user_id, "black", _FakeFile("b.png", b"preta"))
    data, _ = branding.resolve_logo(user_id, "light")
    assert data == b"preta"

    branding.save_logo(other_user_id, "color_dark", _FakeFile("cd.png", b"escura"))
    branding.save_logo(other_user_id, "white", _FakeFile("w2.png", b"branca2"))
    data, _ = branding.resolve_logo(other_user_id, "light")
    assert data == b"escura"


def test_variant_bytes_returns_exact_variant_no_fallback(fake_blob_store, user_id):
    branding = BrandingService()
    branding.save_logo(user_id, "white", _FakeFile("w.png", b"branca"))
    data, _ = branding.variant_bytes(user_id, "white")
    assert data == b"branca"
    # variante não enviada não cai pra outra — devolve None, sem fallback
    assert branding.variant_bytes(user_id, "black") is None


def test_variant_bytes_when_none_uploaded_returns_none(user_id):
    branding = BrandingService()
    assert branding.variant_bytes(user_id, "black") is None
