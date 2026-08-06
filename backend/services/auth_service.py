"""Autenticação multiusuário com JWT.

Usuários persistidos na tabela `users` (ver schema.sql). Senhas com hash via
werkzeug.security — inalterado em relação à versão baseada em arquivo.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt
from werkzeug.security import check_password_hash, generate_password_hash

import db
from config import Config


class AuthError(Exception):
    pass


class AuthService:
    def register(self, username: str, password: str, name: str = "", is_admin: bool = False) -> dict:
        """Não existe rota pública de auto-registro — contas só são criadas
        por um admin (POST /admin/users, que pode passar is_admin=True) ou
        pelo seed.py. `is_admin` default False cobre os dois casos."""
        username = username.strip().lower()
        if not username or not password:
            raise AuthError("Usuário e senha são obrigatórios.")
        if len(password) < 6:
            raise AuthError("A senha deve ter pelo menos 6 caracteres.")
        user_id = f"user-{uuid.uuid4().hex[:10]}"
        name = name or username
        with db.get_pool().connection() as conn:
            exists = conn.execute("select 1 from users where username = %s", (username,)).fetchone()
            if exists:
                raise AuthError("Este usuário já existe.")
            conn.execute(
                "insert into users (id, username, name, password_hash, is_admin) values (%s, %s, %s, %s, %s)",
                (user_id, username, name, generate_password_hash(password), is_admin),
            )
        return {"id": user_id, "username": username, "name": name, "is_admin": is_admin}

    def login(self, username: str, password: str) -> dict:
        with db.get_pool().connection() as conn:
            record = conn.execute(
                "select id, username, name, password_hash, is_admin from users where username = %s",
                (username.strip().lower(),),
            ).fetchone()
            if not record or not check_password_hash(record["password_hash"], password):
                raise AuthError("Usuário ou senha inválidos.")
            conn.execute(
                "update users set login_count = login_count + 1, last_login_at = now() where id = %s",
                (record["id"],),
            )
        token = self.issue_token(record["id"], record["username"], record["is_admin"], record["name"])
        return {
            "token": token,
            "user": {
                "id": record["id"], "username": record["username"], "name": record["name"],
                "is_admin": record["is_admin"],
            },
        }

    def list_users(self) -> list[dict]:
        """Só pra área de administração (rota exige is_admin). Indicadores de
        uso: contagem de acessos + último login (baratos, já dá pra ter sem
        infra de sessão/heartbeat) e setlists/favoritas criadas por cada um —
        "tempo de permanência" fica de fora, não existe nada pra medir isso."""
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                """select u.id, u.username, u.name, u.is_admin, u.created_at,
                          u.last_login_at, u.login_count,
                          (select count(*) from setlists s where s.user_id = u.id) as setlists_count,
                          (select count(*) from user_song_prefs p
                                  where p.user_id = u.id and p.favorita = true) as favorites_count
                   from users u order by u.created_at""",
            ).fetchall()
        return [dict(r) for r in rows]

    def delete_user(self, user_id: str, requesting_user_id: str) -> None:
        """Conteúdo do usuário excluído sobrevive (ON DELETE SET NULL em
        songs.user_id/setlists.user_id — ver schema.sql), só perde o autor."""
        if user_id == requesting_user_id:
            raise AuthError("Você não pode excluir sua própria conta.")
        with db.get_pool().connection() as conn:
            row = conn.execute("select is_admin from users where id=%s", (user_id,)).fetchone()
            if not row:
                return  # idempotente, como as exclusões dos outros services
            if row["is_admin"]:
                remaining = conn.execute(
                    "select count(*) as n from users where is_admin = true and id != %s", (user_id,),
                ).fetchone()["n"]
                if remaining == 0:
                    raise AuthError("Não é possível excluir o último administrador.")
            conn.execute("delete from users where id=%s", (user_id,))

    def reset_password(self, user_id: str, new_password: str) -> None:
        if len(new_password) < 6:
            raise AuthError("A senha deve ter pelo menos 6 caracteres.")
        with db.get_pool().connection() as conn:
            row = conn.execute("select 1 from users where id=%s", (user_id,)).fetchone()
            if not row:
                raise AuthError("Usuário não encontrado.")
            conn.execute(
                "update users set password_hash=%s where id=%s",
                (generate_password_hash(new_password), user_id),
            )

    def issue_token(self, user_id: str, username: str, is_admin: bool = False, name: str = "") -> str:
        payload = {
            "sub": user_id,
            "username": username,
            "is_admin": is_admin,
            "name": name,  # usado pro sufixo "cifra editada por: <name>" — ver songs_service.py
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=Config.JWT_HOURS),
        }
        return jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")

    def verify_token(self, token: str) -> dict:
        try:
            return jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            raise AuthError("Sessão expirada. Entre novamente.")
        except jwt.InvalidTokenError:
            raise AuthError("Token inválido.")
