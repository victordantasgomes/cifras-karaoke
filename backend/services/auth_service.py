"""Autenticação multiusuário com JWT.

Usuários persistidos na tabela `users` (ver schema.sql). Senhas com hash via
werkzeug.security — inalterado em relação à versão baseada em arquivo.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from werkzeug.security import check_password_hash, generate_password_hash

import db
from config import Config
from utils.instruments import INSTRUMENTS, SKILL_LEVELS

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AuthError(Exception):
    pass


def _validate_instruments(instruments: list[dict]) -> list[dict]:
    """Levanta AuthError se algum item não bater com o vocabulário fechado
    (ver utils/instruments.py) — mesmo padrão de falha explícita de
    LOGO_VARIANT_INVALID em branding_service.py. Mensagem estática (sem o
    id inválido interpolado) de propósito, pra caber em _AUTH_EXACT sem
    precisar de uma função de mapeamento por prefixo."""
    cleaned = []
    for item in instruments:
        instrument = (item.get("instrument") or "").strip()
        skill_level = (item.get("skill_level") or "").strip()
        if instrument not in INSTRUMENTS:
            raise AuthError("Instrumento inválido.")
        if skill_level and skill_level not in SKILL_LEVELS:
            raise AuthError("Nível técnico inválido.")
        cleaned.append({"instrument": instrument, "skill_level": skill_level})
    return cleaned


class AuthService:
    def register(self, username: str, password: str, name: str = "", is_admin: bool = False,
                 email: str = "", share_by_default: bool = True, city: str = "",
                 instruments: list[dict] | None = None, grandfathered: bool = True) -> dict:
        """Duas portas de entrada usam este mesmo método: `POST /admin/users`
        (admin-only, sem e-mail, `share_by_default=True` — mesmo
        comportamento colaborativo de sempre pra contas de banda) e a rota
        pública `POST /api/auth/register` (Fase 5, sempre `is_admin=False`
        — nunca lido do payload da rota pública — com e-mail obrigatório e
        `share_by_default=False`, biblioteca privada por padrão pro SaaS
        multi-tenant). `email` fica opcional aqui pra não quebrar o fluxo
        admin de hoje, que nunca coletou e-mail. `city`/`instruments` também
        opcionais (melhoria de alertas) — sempre editáveis depois via
        update_city/set_instruments, não travam o cadastro.

        `grandfathered` (default True, pro cadastro admin — colega de banda
        adicionado por quem já usa o sistema) decide se esta conta fica
        SEM limite de setlists/armazenamento enquanto não tiver um plano
        pago atribuído (ver QuotaService). A rota pública passa
        `grandfathered=False` — cadastro novo pelo próprio site cai no teto
        do plano gratuito."""
        username = username.strip().lower()
        email = email.strip().lower()
        city = (city or "").strip()
        if not username or not password:
            raise AuthError("Usuário e senha são obrigatórios.")
        if len(password) < 6:
            raise AuthError("A senha deve ter pelo menos 6 caracteres.")
        if email and not _EMAIL_RE.match(email):
            raise AuthError("E-mail inválido.")
        instruments = _validate_instruments(instruments or [])
        user_id = f"user-{uuid.uuid4().hex[:10]}"
        name = name or username
        with db.get_pool().connection() as conn:
            exists = conn.execute("select 1 from users where username = %s", (username,)).fetchone()
            if exists:
                raise AuthError("Este usuário já existe.")
            if email:
                email_taken = conn.execute("select 1 from users where email = %s", (email,)).fetchone()
                if email_taken:
                    raise AuthError("Este e-mail já está cadastrado.")
            conn.execute(
                """insert into users (id, username, name, password_hash, is_admin, email,
                                       share_by_default, city, plan_grandfathered)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (user_id, username, name, generate_password_hash(password), is_admin,
                 email or None, share_by_default, city, grandfathered),
            )
            for item in instruments:
                conn.execute(
                    "insert into user_instruments (user_id, instrument, skill_level) values (%s, %s, %s)",
                    (user_id, item["instrument"], item["skill_level"]),
                )
        return {"id": user_id, "username": username, "name": name, "is_admin": is_admin, "email": email}

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

    def get_profile(self, user_id: str) -> dict:
        """Versão self-service de list_users() — uma linha só, sem exigir
        is_admin, mas incluindo o e-mail (que list_users não devolve, já
        que aquela tela é a lista de todo mundo, não a conta de quem está
        vendo). `city`/`instruments` são o perfil de correspondência usado
        por alerts_service.py (ver Fase 2 do plano de alertas)."""
        with db.get_pool().connection() as conn:
            row = conn.execute(
                """select id, username, name, email, is_admin, created_at, last_login_at, login_count, city
                   from users where id=%s""",
                (user_id,),
            ).fetchone()
        if not row:
            raise AuthError("Usuário não encontrado.")
        profile = dict(row)
        profile["instruments"] = self.list_instruments(user_id)
        return profile

    def list_instruments(self, user_id: str) -> list[dict]:
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                "select instrument, skill_level from user_instruments where user_id=%s order by instrument",
                (user_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def set_instruments(self, user_id: str, instruments: list[dict]) -> list[dict]:
        """Substitui o conjunto inteiro (delete + insert numa transação) —
        mesmo raciocínio de troca completa usado em
        BandBoardService.update para setlist_refs."""
        instruments = _validate_instruments(instruments)
        with db.get_pool().connection() as conn:
            conn.execute("delete from user_instruments where user_id=%s", (user_id,))
            for item in instruments:
                conn.execute(
                    "insert into user_instruments (user_id, instrument, skill_level) values (%s, %s, %s)",
                    (user_id, item["instrument"], item["skill_level"]),
                )
        return self.list_instruments(user_id)

    def update_city(self, user_id: str, city: str) -> None:
        with db.get_pool().connection() as conn:
            conn.execute("update users set city=%s where id=%s", ((city or "").strip(), user_id))

    def change_own_password(self, user_id: str, current_password: str, new_password: str) -> None:
        """Diferente de reset_password (admin-only, troca sem checar nada):
        aqui é o próprio dono da conta trocando a senha, então a senha
        ATUAL precisa bater com o hash salvo antes de aceitar a nova —
        senão qualquer sessão já aberta (ex.: token roubado) poderia trocar
        a senha sem nunca ter sabido a original."""
        if len(new_password) < 6:
            raise AuthError("A senha deve ter pelo menos 6 caracteres.")
        with db.get_pool().connection() as conn:
            row = conn.execute("select password_hash from users where id=%s", (user_id,)).fetchone()
            if not row:
                raise AuthError("Usuário não encontrado.")
            if not check_password_hash(row["password_hash"], current_password):
                raise AuthError("Senha atual incorreta.")
            conn.execute(
                "update users set password_hash=%s where id=%s",
                (generate_password_hash(new_password), user_id),
            )

    def change_email(self, user_id: str, new_email: str, password: str) -> None:
        """Também exige a senha atual, mesmo raciocínio de
        change_own_password — trocar o e-mail de contato é sensível o
        bastante (é pra onde vai cobrança/recuperação de conta) pra não
        aceitar só por já estar logado. Reseta email_verified pra false:
        o endereço mudou, a verificação antiga não vale mais pro novo."""
        new_email = new_email.strip().lower()
        if not new_email or not _EMAIL_RE.match(new_email):
            raise AuthError("E-mail inválido.")
        with db.get_pool().connection() as conn:
            row = conn.execute("select password_hash from users where id=%s", (user_id,)).fetchone()
            if not row:
                raise AuthError("Usuário não encontrado.")
            if not check_password_hash(row["password_hash"], password):
                raise AuthError("Senha atual incorreta.")
            taken = conn.execute(
                "select 1 from users where email=%s and id != %s", (new_email, user_id),
            ).fetchone()
            if taken:
                raise AuthError("Este e-mail já está cadastrado.")
            conn.execute(
                "update users set email=%s, email_verified=false where id=%s",
                (new_email, user_id),
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
