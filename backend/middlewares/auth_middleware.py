"""Decorators @require_auth (valida o JWT, injeta g.user_id/g.is_admin) e
@require_admin (idem, mas exige g.is_admin — pra rotas de /admin/*)."""
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
