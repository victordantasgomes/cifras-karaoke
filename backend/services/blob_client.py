"""Cliente mínimo pra API do Vercel Blob (upload/leitura/delete).

Não existe SDK oficial em Python — só o `@vercel/blob` em JS/TS — e a Vercel
não documenta publicamente o formato "REST cru" dessa API. Os detalhes
abaixo (URL base, endpoints, nomes de header) foram conferidos direto no
código-fonte aberto do `@vercel/blob` (github.com/vercel/storage,
packages/blob/src/{put,del,api,helpers,signed-token,presign-query-params}.ts)
e na doc de "Private Storage", não inventados.

Upload sempre com `access: private` — o store deste projeto foi criado como
privado (toda leitura exige o token), então o frontend não pode buscar a
URL do Blob direto: o backend busca os bytes autenticado e serve pro
cliente (ver AudioService + rotas de áudio em api_routes.py), papel que
antes era do `send_file` sobre o disco local.

`issue_signed_token`/`presign_put_url` existem à parte de `put()`: uma
faixa de áudio completa passa fácil de uns poucos MB, e este backend roda
como função serverless na Vercel — o corpo da requisição HTTP pra própria
função tem um teto bem menor que isso (~4,5 MB), imposto pela plataforma
antes mesmo do Flask rodar. Pra faixas grandes, o navegador precisa subir
os bytes DIRETO pro Vercel Blob, sem passar pelo Flask — daí a delegação
assinada (token de curta duração, escopado a um pathname/tamanho/tipo
específico) que só autoriza aquele upload, sem nunca expor o token mestre
(`BLOB_READ_WRITE_TOKEN`, acesso total ao store) pro navegador."""
from __future__ import annotations

import base64
import hashlib
import hmac
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


def size_of(url: str) -> int:
    """HEAD no blob — só o tamanho, sem baixar o conteúdo. Usado no
    recálculo em lote de linhas antigas que nasceram sem `size_bytes`
    (upload novo já grava o tamanho na hora, via `len(data)`)."""
    resp = requests.head(url, headers={"authorization": f"Bearer {Config.BLOB_READ_WRITE_TOKEN}"}, timeout=_TIMEOUT)
    if not resp.ok:
        raise BlobError(f"Falha ao consultar tamanho do blob: {resp.status_code} {resp.text}")
    return int(resp.headers.get("content-length", 0))


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


def issue_signed_token(
    pathname: str,
    *,
    valid_until_ms: int,
    maximum_size_in_bytes: int | None = None,
    allowed_content_types: list[str] | None = None,
) -> dict:
    """POST /signed-token — emite uma delegação de escrita escopada a um
    único `pathname` (SDK: `issueSignedToken`, packages/blob/src/signed-token.ts).
    Autenticado com o token mestre (papel de servidor); o resultado é que
    pode ser repassado com segurança pro navegador (ver presign_put_url)."""
    body: dict = {"pathname": pathname, "operations": ["put"], "validUntil": valid_until_ms}
    if maximum_size_in_bytes is not None:
        body["maximumSizeInBytes"] = maximum_size_in_bytes
    if allowed_content_types is not None:
        body["allowedContentTypes"] = allowed_content_types
    resp = requests.post(
        f"{_API_URL}/signed-token",
        headers=_headers(**{"content-type": "application/json"}),
        json=body,
        timeout=_TIMEOUT,
    )
    if not resp.ok:
        raise BlobError(f"Falha ao emitir signed-token: {resp.status_code} {resp.text}")
    return resp.json()  # {delegationToken, clientSigningToken, validUntil}


def presign_put_url(pathname: str, delegation_token: str, client_signing_token: str) -> str:
    """Constrói a URL de PUT pré-assinada (SDK: `presign()` + `buildPresignedPutUrl()`,
    packages/blob/src/signed-token.ts). Sempre com `addRandomSuffix=false` +
    `allowOverwrite=true` — mesmo comportamento de sempre do `put()` server-side
    acima (reenviar a mesma faixa substitui a anterior, não empilha lixo no
    store) — e SEM nenhum header `x-vercel-blob-*`/`x-api-version` no PUT
    final: testado ao vivo contra a API real, o preflight de CORS do
    endpoint rejeita qualquer header fora do allowlist do navegador (só
    `content-type` passa), então essas duas opções só podem ir embutidas
    nos query params assinados abaixo, nunca em header.

    A assinatura é HMAC-SHA256 da string canônica — linhas
    `operation=put`, `pathname=<pathname>` e as duas acima, ordenadas por
    bytes UTF-8 (replica `canonicalString()`) — usando `clientSigningToken`
    como chave. É o mesmo cálculo que o navegador faria com a Web Crypto
    API, feito aqui pra não precisar replicar HMAC em JS. Devolve uma URL
    pronta pra o navegador fazer PUT direto, sem nunca ver
    `clientSigningToken` nem o token mestre."""
    constraint_params = {
        "vercel-blob-add-random-suffix": "false",
        "vercel-blob-allow-overwrite": "true",
    }
    lines = sorted([f"operation=put", f"pathname={pathname}", *(f"{k}={v}" for k, v in constraint_params.items())])
    canonical = "\n".join(lines)
    signature_bytes = hmac.new(client_signing_token.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).digest()
    signature = base64.urlsafe_b64encode(signature_bytes).decode("ascii").rstrip("=")
    params = urllib.parse.urlencode({
        "pathname": pathname,
        **constraint_params,
        "vercel-blob-delegation": delegation_token,
        "vercel-blob-signature": signature,
    })
    return f"{_API_URL}/?{params}"
