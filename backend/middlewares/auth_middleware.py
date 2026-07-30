"""Decorator @require_auth: valida o JWT e injeta g.user_id."""
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
            return fn(*args, **kwargs)
        return wrapper
    return decorator
