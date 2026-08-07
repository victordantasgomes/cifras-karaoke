"""Decorators @require_auth (valida o JWT, injeta g.user_id/g.is_admin),
@require_admin (idem, mas exige g.is_admin — pra rotas de /admin/*) e
@require_not_blocked (bloqueia CRIAR conteúdo novo se a assinatura estiver
com pagamento pendente/cancelada — ver BillingService.is_creation_blocked;
nunca bloqueia leitura/reprodução, só as rotas que criam música/setlist/
áudio novo). Aplicado DEPOIS de @require_auth na pilha de decorators (mais
perto da função — precisa de g.user_id já definido)."""
from __future__ import annotations

from functools import wraps

from flask import g, jsonify, request

from services.auth_service import AuthError


def require_auth(auth_service):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                return jsonify({"error": "Autenticação necessária."}), 401
            try:
                payload = auth_service.verify_token(header[7:])
            except AuthError as e:
                return jsonify({"error": str(e)}), 401
            g.user_id = payload["sub"]
            g.username = payload.get("username", "")
            g.is_admin = payload.get("is_admin", False)
            g.name = payload.get("name", "")
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def require_not_blocked(billing_service):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if billing_service.is_creation_blocked(g.user_id):
                return jsonify({
                    "error": "Sua assinatura está com pagamento pendente ou cancelada — regularize pra "
                             "criar conteúdo novo. Suas músicas e setlists continuam disponíveis.",
                }), 402
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def require_admin(auth_service):
    auth_decorator = require_auth(auth_service)

    def decorator(fn):
        @auth_decorator
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not g.is_admin:
                return jsonify({"error": "Acesso restrito a administradores."}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
