"""Testes puros (sem rede) pra assinatura de upload direto — a lógica mais
arriscada de blob_client.py, replicada a partir do SDK oficial em JS (ver
comentário no topo de presign_put_url). issue_signed_token/put/get/delete
batem na API de verdade e não são exercitados aqui (ver fake_blob_store em
conftest.py pra esses, usado pelos testes de AudioService)."""
import base64
import hashlib
import hmac

from services import blob_client


def test_presign_put_url_is_deterministic():
    url1 = blob_client.presign_put_url("audio/u1/some-song/track.mp3", "deleg-token", "signing-key")
    url2 = blob_client.presign_put_url("audio/u1/some-song/track.mp3", "deleg-token", "signing-key")
    assert url1 == url2


def test_presign_put_url_signature_matches_expected_canonical_string():
    pathname = "audio/u1/some-song/track.mp3"
    url = blob_client.presign_put_url(pathname, "deleg-token", "signing-key")

    # mesma string canônica que canonicalString() do SDK produziria: linhas
    # "chave=valor" ordenadas por bytes UTF-8 (aqui já em ordem alfabética).
    canonical = "\n".join([
        "operation=put",
        f"pathname={pathname}",
        "vercel-blob-add-random-suffix=false",
        "vercel-blob-allow-overwrite=true",
    ])
    expected_sig = base64.urlsafe_b64encode(
        hmac.new(b"signing-key", canonical.encode("utf-8"), hashlib.sha256).digest(),
    ).decode("ascii").rstrip("=")

    assert f"vercel-blob-signature={expected_sig}" in url


def test_presign_put_url_different_pathname_changes_signature():
    url1 = blob_client.presign_put_url("audio/u1/song-a/track.mp3", "deleg-token", "signing-key")
    url2 = blob_client.presign_put_url("audio/u1/song-b/track.mp3", "deleg-token", "signing-key")
    sig1 = url1.split("vercel-blob-signature=")[1]
    sig2 = url2.split("vercel-blob-signature=")[1]
    assert sig1 != sig2


def test_presign_put_url_never_leaks_client_signing_token():
    url = blob_client.presign_put_url("audio/u1/some-song/track.mp3", "deleg-token", "super-secret-signing-key")
    assert "super-secret-signing-key" not in url
