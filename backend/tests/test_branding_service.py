"""Testes de BrandingService com o Vercel Blob mockado (ver fixture
fake_blob_store em conftest.py) — mesmo padrão de test_audio_service.py."""
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


def test_save_and_find_logo(fake_blob_store, user_id):
    branding = BrandingService()
    assert not branding.has_logo(user_id)
    branding.save_logo(user_id, _FakeFile("logo.png"))
    assert branding.has_logo(user_id)
    data, _content_type = branding.logo_bytes(user_id)
    assert data == b"fake-logo-bytes"
    assert fake_blob_store[f"branding/{user_id}/logo.png"] == b"fake-logo-bytes"


def test_reupload_logo_replaces_previous(fake_blob_store, user_id):
    branding = BrandingService()
    branding.save_logo(user_id, _FakeFile("logo.png", b"v1"))
    branding.save_logo(user_id, _FakeFile("logo.jpg", b"v2"))
    data, _content_type = branding.logo_bytes(user_id)
    assert data == b"v2"
    assert f"branding/{user_id}/logo.jpg" in fake_blob_store


def test_delete_logo(fake_blob_store, user_id):
    branding = BrandingService()
    branding.save_logo(user_id, _FakeFile("logo.png"))
    branding.delete_logo(user_id)
    assert not branding.has_logo(user_id)
    assert fake_blob_store == {}


def test_delete_logo_when_none_uploaded_is_a_noop(user_id):
    branding = BrandingService()
    branding.delete_logo(user_id)  # não levanta


def test_logo_bytes_when_none_uploaded_returns_none(user_id):
    branding = BrandingService()
    assert branding.logo_bytes(user_id) is None


def test_logo_is_scoped_per_user(fake_blob_store, user_id, other_user_id):
    branding = BrandingService()
    branding.save_logo(user_id, _FakeFile("logo.png", b"mine"))
    assert not branding.has_logo(other_user_id)
    assert branding.logo_bytes(other_user_id) is None


def test_deleting_user_cascades_logo(fake_blob_store, user_id):
    branding = BrandingService()
    branding.save_logo(user_id, _FakeFile("logo.png"))
    with db.get_pool().connection() as conn:
        conn.execute("delete from users where id=%s", (user_id,))
    assert not branding.has_logo(user_id)
