"""Planos pagos do SaaS multi-tenant — admin-only (ver schema.sql::plans).

`stripe_product_id`/`stripe_price_id` ficam None até a Fase 7 preencher —
esta fase só cuida do cadastro dos planos em si (nome, limite de setlists,
limite de armazenamento, preço), sem nenhuma integração de pagamento ainda.
Preço é editável direto por enquanto; quando a Stripe existir, editar preço
passa a criar um Price novo lá (Prices são imutáveis por natureza) em vez
de só atualizar esta linha — ver plano em .claude/plans."""
from __future__ import annotations

import db


class PlanNotFound(Exception):
    pass


class DuplicatePlanName(Exception):
    pass


def _row_to_dict(row: dict) -> dict:
    return {
        "id": str(row["id"]), "name": row["name"], "max_setlists": row["max_setlists"],
        "storage_limit_mb": row["storage_limit_mb"], "price_cents": row["price_cents"],
        "stripe_product_id": row["stripe_product_id"], "stripe_price_id": row["stripe_price_id"],
        "active": row["active"],
    }


class PlansService:
    def list(self) -> list[dict]:
        """Todos os planos, ativos e arquivados — o admin precisa ver os
        dois pra poder reativar um arquivado por engano."""
        with db.get_pool().connection() as conn:
            rows = conn.execute("select * from plans order by price_cents").fetchall()
        return [_row_to_dict(r) for r in rows]

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
            row = conn.execute(
                """insert into plans (name, max_setlists, storage_limit_mb, price_cents)
                   values (%s, %s, %s, %s) returning *""",
                (name, max_setlists, storage_limit_mb, price_cents),
            ).fetchone()
        return _row_to_dict(row)

    def update(self, plan_id: str, max_setlists: int, storage_limit_mb: int, price_cents: int) -> dict:
        """Atualização direta — nenhuma delas mexe na Stripe ainda (Fase 6).
        Quando a Fase 7 existir, editar `price_cents` passa a também criar
        um novo Price na Stripe; `max_setlists`/`storage_limit_mb` continuam
        update direto, já que a Stripe não sabe nada sobre esses dois."""
        if max_setlists < 0 or storage_limit_mb < 0 or price_cents < 0:
            raise ValueError("Limites e preço não podem ser negativos.")
        with db.get_pool().connection() as conn:
            row = conn.execute(
                """update plans set max_setlists=%s, storage_limit_mb=%s, price_cents=%s
                   where id=%s returning *""",
                (max_setlists, storage_limit_mb, price_cents, plan_id),
            ).fetchone()
        if not row:
            raise PlanNotFound(plan_id)
        return _row_to_dict(row)

    def set_active(self, plan_id: str, value: bool) -> dict:
        with db.get_pool().connection() as conn:
            row = conn.execute(
                "update plans set active=%s where id=%s returning *", (value, plan_id),
            ).fetchone()
        if not row:
            raise PlanNotFound(plan_id)
        return _row_to_dict(row)
