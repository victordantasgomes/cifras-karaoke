"""Assinaturas via Stripe Checkout — ver schema.sql (users.plan_id,
stripe_customer_id, stripe_subscription_id, subscription_status,
current_period_end) e services/plans_service.py (planos/preços).

Checkout hospedado da própria Stripe — nunca tocamos em dado de cartão
aqui, só criamos a sessão e redirecionamos. O Customer da Stripe é criado
na PRIMEIRA chamada de checkout, não no cadastro (services/auth_service.py)
— assim o cadastro público continua funcionando mesmo se a Stripe não
estiver configurada. Trial de 14 dias (`TRIAL_DAYS`): acesso liberado na
hora do checkout, cobrança automática só depois do período, a menos que
cancele — a aplicação de limites por plano fica pra Fase 9; aqui só
mantemos `subscription_status`/`plan_id`/`current_period_end` em dia via
webhook, que é a única fonte confiável desse estado (o frontend nunca sabe
por conta própria se um pagamento passou)."""
from __future__ import annotations

import stripe

import db
from config import Config

TRIAL_DAYS = 14
_CREATION_BLOCKED_STATUSES = {"past_due", "canceled"}


class BillingError(Exception):
    pass


def _require_stripe() -> None:
    if not Config.STRIPE_SECRET_KEY:
        raise BillingError("Pagamentos ainda não estão configurados neste servidor.")
    stripe.api_key = Config.STRIPE_SECRET_KEY


class BillingService:
    def get_status(self, user_id: str) -> dict:
        with db.get_pool().connection() as conn:
            row = conn.execute(
                """select u.subscription_status, u.current_period_end, p.id as plan_id, p.name as plan_name
                   from users u left join plans p on p.id = u.plan_id
                   where u.id = %s""",
                (user_id,),
            ).fetchone()
        if not row:
            raise BillingError("Usuário não encontrado.")
        return {
            "subscription_status": row["subscription_status"],
            "current_period_end": row["current_period_end"].isoformat() if row["current_period_end"] else None,
            "plan_id": str(row["plan_id"]) if row["plan_id"] else None,
            "plan_name": row["plan_name"],
        }

    def is_creation_blocked(self, user_id: str) -> bool:
        """Cartão vencido/assinatura cancelada nunca apaga dados nem
        bloqueia tocar música ao vivo — só bloqueia CRIAR conteúdo novo
        (música, setlist, upload de áudio/clipe), ver require_not_blocked
        em middlewares/auth_middleware.py."""
        with db.get_pool().connection() as conn:
            row = conn.execute("select subscription_status from users where id=%s", (user_id,)).fetchone()
        return bool(row) and row["subscription_status"] in _CREATION_BLOCKED_STATUSES

    def _get_or_create_customer(self, conn, user_id: str) -> str:
        row = conn.execute(
            "select stripe_customer_id, email, name, username from users where id=%s", (user_id,),
        ).fetchone()
        if not row:
            raise BillingError("Usuário não encontrado.")
        if row["stripe_customer_id"]:
            return row["stripe_customer_id"]
        try:
            customer = stripe.Customer.create(
                email=row["email"] or None, name=row["name"] or row["username"],
                metadata={"user_id": user_id},
            )
        except stripe.error.StripeError as e:
            raise BillingError(f"Falha ao criar cliente na Stripe: {e}") from e
        conn.execute("update users set stripe_customer_id=%s where id=%s", (customer.id, user_id))
        return customer.id

    def create_checkout_session(self, user_id: str, plan_id: str, success_url: str, cancel_url: str) -> str:
        _require_stripe()
        with db.get_pool().connection() as conn:
            plan = conn.execute("select * from plans where id=%s and active=true", (plan_id,)).fetchone()
            if not plan or not plan["stripe_price_id"]:
                raise BillingError("Plano inválido ou ainda não sincronizado com a Stripe.")
            customer_id = self._get_or_create_customer(conn, user_id)
        try:
            session = stripe.checkout.Session.create(
                customer=customer_id,
                mode="subscription",
                line_items=[{"price": plan["stripe_price_id"], "quantity": 1}],
                subscription_data={"trial_period_days": TRIAL_DAYS},
                success_url=success_url,
                cancel_url=cancel_url,
            )
        except stripe.error.StripeError as e:
            raise BillingError(f"Falha ao iniciar o checkout: {e}") from e
        return session.url

    def create_portal_session(self, user_id: str, return_url: str) -> str:
        _require_stripe()
        with db.get_pool().connection() as conn:
            row = conn.execute("select stripe_customer_id from users where id=%s", (user_id,)).fetchone()
        if not row or not row["stripe_customer_id"]:
            raise BillingError("Você ainda não iniciou nenhuma assinatura.")
        try:
            session = stripe.billing_portal.Session.create(
                customer=row["stripe_customer_id"], return_url=return_url,
            )
        except stripe.error.StripeError as e:
            raise BillingError(f"Falha ao abrir o portal de cobrança: {e}") from e
        return session.url

    # ---------- webhook ----------
    def handle_webhook_event(self, payload: bytes, sig_header: str) -> None:
        _require_stripe()
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, Config.STRIPE_WEBHOOK_SECRET)
        except (ValueError, stripe.error.SignatureVerificationError) as e:
            raise BillingError(f"Webhook inválido: {e}") from e

        etype = event["type"]
        obj = event["data"]["object"]

        if etype == "checkout.session.completed":
            self._sync_subscription_from_session(obj)
        elif etype == "customer.subscription.updated":
            self._sync_subscription(obj)
        elif etype == "customer.subscription.deleted":
            self._set_status_by_customer(obj["customer"], "canceled")
        elif etype == "invoice.payment_failed":
            self._set_status_by_customer(obj["customer"], "past_due")
        # outros tipos de evento são ignorados de propósito — só os acima
        # afetam subscription_status/plan_id/current_period_end.

    def _sync_subscription_from_session(self, session: dict) -> None:
        subscription_id = session.get("subscription")
        if not subscription_id:
            return  # checkout que não gerou assinatura (não deveria acontecer, mode=subscription sempre gera)
        subscription = stripe.Subscription.retrieve(subscription_id)
        self._sync_subscription(subscription)

    def _sync_subscription(self, subscription: dict) -> None:
        customer_id = subscription["customer"]
        status = subscription["status"]
        price_id = subscription["items"]["data"][0]["price"]["id"]
        current_period_end = subscription.get("current_period_end")
        with db.get_pool().connection() as conn:
            plan = conn.execute("select id from plans where stripe_price_id=%s", (price_id,)).fetchone()
            user = conn.execute(
                "select id, subscription_status from users where stripe_customer_id=%s", (customer_id,),
            ).fetchone()
            conn.execute(
                """update users set subscription_status=%s, stripe_subscription_id=%s,
                          plan_id=coalesce(%s, plan_id), current_period_end=to_timestamp(%s)
                   where stripe_customer_id=%s""",
                (status, subscription["id"], plan["id"] if plan else None, current_period_end, customer_id),
            )
            if user and user["subscription_status"] != status:
                self._record_status_change(conn, user["id"], user["subscription_status"], status)

    def _set_status_by_customer(self, customer_id: str, status: str) -> None:
        with db.get_pool().connection() as conn:
            user = conn.execute(
                "select id, subscription_status from users where stripe_customer_id=%s", (customer_id,),
            ).fetchone()
            conn.execute(
                "update users set subscription_status=%s where stripe_customer_id=%s",
                (status, customer_id),
            )
            if user and user["subscription_status"] != status:
                self._record_status_change(conn, user["id"], user["subscription_status"], status)

    @staticmethod
    def _record_status_change(conn, user_id: str, old_status: str, new_status: str) -> None:
        """Grava a transição pro histórico (Fase 14) — só quando o status
        de fato muda, senão um webhook de renovação sem mudança de estado
        (mesmo status repetido) inflaria a tendência de cancelamento à
        toa."""
        conn.execute(
            "insert into subscription_events (user_id, old_status, new_status) values (%s, %s, %s)",
            (user_id, old_status, new_status),
        )
