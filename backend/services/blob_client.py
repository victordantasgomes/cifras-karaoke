"""Cliente mínimo pra API do Vercel Blob (upload/leitura/delete).

Não existe SDK oficial em Python — só o `@vercel/blob` em JS/TS — e a Vercel
não documenta publicamente o formato "REST cru" dessa API. Os detalhes
abaixo (URL base, endpoints, nomes de header) foram conferidos direto no
código-fonte aberto do `@vercel/blob` (github.com/vercel/storage,
packages/blob/src/{put,del,api,helpers}.ts) e na doc de "Private Storage",
não inventados.

Upload sempre com `access: private` — o store deste projeto foi criado como
privado (toda leitura exige o token), então o frontend não pode buscar a
URL do Blob direto: o backend busca os bytes autenticado e serve pro
cliente (ver AudioService + rotas de áudio em api_routes.py), papel que
antes era do `send_file` sobre o disco local.
"""
from __future__ import annotations

import urllib.parse

import requests

from config import Config

_API_URL = "https://vercel.com/api/blob"
_API_VERSION = "12"
_TIMEOUT = 30


class BlobError(Exception):
    pass


def _headers(**extra: str | None) -> dict:
    headers = {
        "authorization": f"Bearer {Config.BLOB_READ_WRITE_TOKEN}",
        "x-api-version": _API_VERSION,
    }
    headers.update({k: v for k, v in extra.items() if v is not None})
    return headers


def put(pathname: str, data: bytes, content_type: str | None = None) -> dict:
    """Envia `data` pro caminho `pathname`. Sobrescreve por padrão — reenviar
    a mesma faixa/sample substitui a anterior, mesmo comportamento de sempre.
    Devolve o JSON da Vercel: {pathname, contentType, url, downloadUrl, etag, ...}."""
    url = f"{_API_URL}?pathname={urllib.parse.quote(pathname)}"
    headers = _headers(**{
        "x-vercel-blob-access": "private",
        "x-content-type": content_type,
        "x-add-random-suffix": "0",
        "x-allow-overwrite": "1",
    })
    resp = requests.put(url, headers=headers, data=data, timeout=_TIMEOUT)
    if not resp.ok:
        raise BlobError(f"Falha ao enviar '{pathname}' pro Vercel Blob: {resp.status_code} {resp.text}")
    return resp.json()


def get(url: str) -> tuple[bytes, str]:
    """Busca os bytes de um blob privado — a leitura vai direto no domínio
    `*.private.blob.vercel-storage.com` do blob (não na API de gerência),
    autenticada com o mesmo token. Devolve (bytes, content_type)."""
    resp = requests.get(url, headers={"authorization": f"Bearer {Config.BLOB_READ_WRITE_TOKEN}"}, timeout=_TIMEOUT)
    if not resp.ok:
        raise BlobError(f"Falha ao buscar blob: {resp.status_code} {resp.text}")
    return resp.content, resp.headers.get("content-type", "application/octet-stream")


def delete(urls: list[str]) -> None:
    """Apaga um ou mais blobs pela URL. Não falha se a URL já não existir
    mais (mesma semântica do `del()` do SDK oficial)."""
    if not urls:
        return
    resp = requests.post(
        f"{_API_URL}/delete",
        headers=_headers(**{"content-type": "application/json"}),
        json={"urls": urls},
        timeout=_TIMEOUT,
    )
    if not resp.ok:
        raise BlobError(f"Falha ao apagar blobs do Vercel Blob: {resp.status_code} {resp.text}")
