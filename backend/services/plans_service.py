"""Planos pagos do SaaS multi-tenant — admin-only (ver schema.sql::plans).

Sincroniza com a Stripe quando `STRIPE_SECRET_KEY` está configurada
(Fase 7): criar um plano cria um Product + Price lá; editar `price_cents`
cria um Price NOVO sob o mesmo Product (Prices da Stripe são imutáveis por
natureza — nunca mutamos o existente, só passamos a apontar pra um novo em
`stripe_price_id`, o que preserva quem já assinou no preço antigo).
`max_setlists`/`storage_limit_mb` nunca tocam a Stripe — ela não sabe nada
sobre esses dois. Sem `STRIPE_SECRET_KEY` (dev local sem chave, ou enquanto
a Fase 6 ainda não tinha Stripe), planos continuam funcionando só como
cadastro local, com os campos `stripe_*` vazios."""
from __future__ import annotations

import stripe

import db
from config import Config

_CURRENCY = "brl"


class PlanNotFound(Exception):
    pass


class DuplicatePlanName(Exception):
    pass


class StripeSyncError(Exception):
    pass


def _row_to_dict(row: dict) -> dict:
    return {
        "id": str(row["id"]), "name": row["name"], "max_setlists": row["max_setlists"],
        "storage_limit_mb": row["storage_limit_mb"], "price_cents": row["price_cents"],
        "stripe_product_id": row["stripe_product_id"], "stripe_price_id": row["stripe_price_id"],
        "active": row["active"], "kind": row["kind"],
    }


def _stripe_enabled() -> bool:
    return bool(Config.STRIPE_SECRET_KEY)


def _create_stripe_product_and_price(name: str, price_cents: int) -> tuple[str, str]:
    stripe.api_key = Config.STRIPE_SECRET_KEY
    try:
        product = stripe.Product.create(name=name)
        price = stripe.Price.create(
            product=product.id, unit_amount=price_cents, currency=_CURRENCY,
            recurring={"interval": "month"},
        )
        return product.id, price.id
    except stripe.error.StripeError as e:
        raise StripeSyncError(str(e)) from e


def _create_stripe_price(product_id: str, price_cents: int) -> str:
    stripe.api_key = Config.STRIPE_SECRET_KEY
    try:
        price = stripe.Price.create(
            product=product_id, unit_amount=price_cents, currency=_CURRENCY,
            recurring={"interval": "month"},
        )
        return price.id
    except stripe.error.StripeError as e:
        raise StripeSyncError(str(e)) from e


class PlansService:
    def list(self) -> list[dict]:
        """Todos os planos, ativos e arquivados — o admin precisa ver os
        dois pra poder reativar um arquivado por engano."""
        with db.get_pool().connection() as conn:
            rows = conn.execute("select * from plans order by price_cents").fetchall()
        return [_row_to_dict(r) for r in rows]

    def list_active(self) -> list[dict]:
        """Pra tela de escolha de plano (qualquer usuário logado, não só
        admin) — só os planos PAGOS ativos, que podem ser assinados de
        verdade. Convidado/Administrador (kind != 'paid') nunca aparecem
        aqui — não são assináveis via Stripe, ver get_kind()."""
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                "select * from plans where active=true and kind='paid' order by price_cents",
            ).fetchall()
        return [_row_to_dict(r) for r in rows]

    def list_public(self) -> list[dict]:
        """Pra seção de preços da landing page e pro modal de convite da área
        pública (visitante sem login) — inclui também o plano Convidado/
        gratuito (kind='guest'), que list_active() propositalmente omite
        (não é assinável via Stripe, mas é real e vale mostrar pra quem
        ainda nem tem conta). Sem os ids internos da Stripe."""
        with db.get_pool().connection() as conn:
            rows = conn.execute(
                "select * from plans where active=true and kind in ('paid', 'guest') order by price_cents",
            ).fetchall()
        return [
            {k: v for k, v in _row_to_dict(r).items() if k not in ("stripe_product_id", "stripe_price_id")}
            for r in rows
        ]

    def get_kind(self, kind: str) -> dict | None:
        """Busca a linha singleton 'guest' ou 'admin' (ver schema.sql —
        sempre existe, seedada no startup) — usada por QuotaService e pela
        tela de Planos pra mostrar/editar os limites de quem não paga."""
        with db.get_pool().connection() as conn:
            row = conn.execute("select * from plans where kind=%s", (kind,)).fetchone()
        return _row_to_dict(row) if row else None

    def create(self, name: str, max_setlists: int, storage_limit_mb: int, price_cents: int) -> dict:
        name = name.strip()
        if not name:
            raise ValueError("Nome do plano é obrigatório.")
        if max_setlists < 0 or storage_limit_mb < 0 or price_cents < 0:
            raise ValueError("Limites e preço não podem ser negativos.")
        with db.get_pool().connection() as conn:
            exists = conn.execute("select 1 from plans where name=%s", (name,)).fetchone()
            if exists:
                raise DuplicatePlanName(name)
            stripe_product_id = stripe_price_id = None
            if _stripe_enabled():
                stripe_product_id, stripe_price_id = _create_stripe_product_and_price(name, price_cents)
            row = conn.execute(
                """insert into plans (name, max_setlists, storage_limit_mb, price_cents,
                                       stripe_product_id, stripe_price_id, kind)
                   values (%s, %s, %s, %s, %s, %s, 'paid') returning *""",
                (name, max_setlists, storage_limit_mb, price_cents, stripe_product_id, stripe_price_id),
            ).fetchone()
        return _row_to_dict(row)

    def update(self, plan_id: str, max_setlists: int, storage_limit_mb: int, price_cents: int) -> dict:
        if max_setlists < 0 or storage_limit_mb < 0 or price_cents < 0:
            raise ValueError("Limites e preço não podem ser negativos.")
        with db.get_pool().connection() as conn:
            current = conn.execute("select * from plans where id=%s", (plan_id,)).fetchone()
            if not current:
                raise PlanNotFound(plan_id)
            # Convidado/Administrador (kind != 'paid') são sempre gratuitos —
            # só max_setlists/storage_limit_mb são editáveis por esta tela,
            # preço nunca muda (nem tenta sincronizar com a Stripe).
            if current["kind"] != "paid":
                price_cents = 0
            stripe_price_id = current["stripe_price_id"]
            price_changed = price_cents != current["price_cents"]
            if price_changed and _stripe_enabled() and current["stripe_product_id"]:
                stripe_price_id = _create_stripe_price(current["stripe_product_id"], price_cents)
            row = conn.execute(
                """update plans set max_setlists=%s, storage_limit_mb=%s, price_cents=%s, stripe_price_id=%s
                   where id=%s returning *""",
                (max_setlists, storage_limit_mb, price_cents, stripe_price_id, plan_id),
            ).fetchone()
        return _row_to_dict(row)

    def resync_stripe(self, plan_id: str) -> dict:
        """Cria um Product+Price NOVO na Stripe (conta/modo atualmente
        configurado em STRIPE_SECRET_KEY) e reaponta o plano pra eles —
        pensado pra planos criados sem Stripe habilitada (stripe_* nulos) ou
        pra rebindar planos que apontam pra outro modo/conta (ex.: mudar de
        test pra live, ou trocar de conta Stripe). Não tenta reaproveitar
        nada do Product/Price anterior — sempre cria do zero; o antigo (se
        existia) continua existindo do lado da Stripe, só deixa de ser
        referenciado por este plano."""
        if not _stripe_enabled():
            raise StripeSyncError("STRIPE_SECRET_KEY não configurada neste ambiente.")
        with db.get_pool().connection() as conn:
            current = conn.execute("select * from plans where id=%s", (plan_id,)).fetchone()
            if not current:
                raise PlanNotFound(plan_id)
            stripe_product_id, stripe_price_id = _create_stripe_product_and_price(
                current["name"], current["price_cents"],
            )
            row = conn.execute(
                "update plans set stripe_product_id=%s, stripe_price_id=%s where id=%s returning *",
                (stripe_product_id, stripe_price_id, plan_id),
            ).fetchone()
        return _row_to_dict(row)

    def set_active(self, plan_id: str, value: bool) -> dict:
        with db.get_pool().connection() as conn:
            row = conn.execute(
                "update plans set active=%s where id=%s returning *", (value, plan_id),
            ).fetchone()
        if not row:
            raise PlanNotFound(plan_id)
        return _row_to_dict(row)
