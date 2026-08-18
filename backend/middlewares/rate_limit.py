"""Limitador simples de requisições por IP, janela deslizante em memória.

Mitigação básica contra abuso da biblioteca pública (`/api/public/*`) — não é
uma solução distribuída: cada instância serverless (Vercel) mantém seu
próprio dicionário, então um visitante que bata em instâncias "frias"
diferentes não compartilha contador entre elas. Aceitável como primeira
camada; revisar com um store compartilhado (Redis/Upstash) se abuso real
aparecer nos logs.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str) -> tuple[dict, int] | None:
        """None = liberado. Senão, (corpo_json, status) pra devolver direto."""
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window_seconds:
            hits.popleft()
        if len(hits) >= self.max_requests:
            return {
                "error": "Muitas requisições — aguarde um momento e tente de novo.",
                "error_code": "RATE_LIMIT_EXCEEDED",
            }, 429
        hits.append(now)
        return None


def client_ip(request) -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"
