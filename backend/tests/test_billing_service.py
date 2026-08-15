import json

import pytest

import db
from config import Config
from services.billing_service import BillingError, BillingService
from services.plans_service import PlansService


@pytest.fixture
def billing():
    return BillingService()


@pytest.fixture
def plan(fake_stripe):
    return PlansService().create("Hobby", max_setlists=3, storage_limit_mb=100, price_cents=990)


def _webhook_payload(event_type, obj):
    return json.dumps({"type": event_type, "data": {"object": obj}}).encode()


def test_create_checkout_session_returns_stripe_url(billing, fake_stripe, plan, user_id):
    url = billing.create_checkout_session(user_id, plan["id"], "https://app.test/ok", "https://app.test/cancel")
    assert url.startswith("https://checkout.stripe.test/")


def test_create_checkout_session_creates_customer_lazily(billing, fake_stripe, plan, user_id):
    billing.create_checkout_session(user_id, plan["id"], "https://app.test/ok", "https://app.test/cancel")
    with db.get_pool().connection() as conn:
        row = conn.execute("select stripe_customer_id from users where id=%s", (user_id,)).fetchone()
    assert row["stripe_customer_id"] in fake_stripe.customers


def test_create_checkout_session_reuses_existing_customer(billing, fake_stripe, plan, user_id):
    billing.create_checkout_session(user_id, plan["id"], "https://app.test/ok", "https://app.test/cancel")
    with db.get_pool().connection() as conn:
        first = conn.execute("select stripe_customer_id from users where id=%s", (user_id,)).fetchone()
    billing.create_checkout_session(user_id, plan["id"], "https://app.test/ok", "https://app.test/cancel")
    with db.get_pool().connection() as conn:
        second = conn.execute("select stripe_customer_id from users where id=%s", (user_id,)).fetchone()
    assert first["stripe_customer_id"] == second["stripe_customer_id"]
    assert len(fake_stripe.customers) == 1


def test_create_checkout_session_rejects_unknown_plan(billing, fake_stripe, user_id):
    with pytest.raises(BillingError):
        billing.create_checkout_session(user_id, "00000000-0000-0000-0000-000000000000",
                                          "https://app.test/ok", "https://app.test/cancel")


def test_create_checkout_session_without_stripe_configured_raises(billing, plan, user_id, monkeypatch):
    # `plan` depende de fake_stripe (pra ganhar stripe_price_id), mas o
    # próprio checkout deve falhar de forma clara se a chave for removida
    # depois (ex.: servidor sem STRIPE_SECRET_KEY em produção).
    monkeypatch.setattr(Config, "STRIPE_SECRET_KEY", "")
    with pytest.raises(BillingError):
        billing.create_checkout_session(user_id, plan["id"], "https://app.test/ok", "https://app.test/cancel")


def test_create_portal_session_requires_existing_customer(billing, fake_stripe, user_id):
    with pytest.raises(BillingError):
        billing.create_portal_session(user_id, "https://app.test/back")


def test_create_portal_session_returns_stripe_url(billing, fake_stripe, plan, user_id):
    billing.create_checkout_session(user_id, plan["id"], "https://app.test/ok", "https://app.test/cancel")
    url = billing.create_portal_session(user_id, "https://app.test/back")
    assert url.startswith("https://billing.stripe.test/")


def test_get_status_defaults_to_none(billing, user_id):
    # `user_id` (fixture) é inserido sem passar por AuthService.register() —
    # cai no default da coluna (plan_grandfathered=true, is_admin=false),
    # mesma conta "legada" de sempre: sem plano pago e sem categoria alguma.
    status = billing.get_status(user_id)
    assert status == {
        "subscription_status": "none", "current_period_end": None,
        "plan_id": None, "plan_name": None, "category": None,
    }


def test_get_status_category_guest_for_non_grandfathered_without_plan(billing):
    with db.get_pool().connection() as conn:
        conn.execute(
            "insert into users (id, username, name, password_hash, plan_grandfathered) "
            "values ('u3', 'novo', 'Novo', 'x', false)",
        )
    assert billing.get_status("u3")["category"] == "guest"


def test_get_status_category_admin_for_admin_user(billing):
    with db.get_pool().connection() as conn:
        conn.execute(
            "insert into users (id, username, name, password_hash, is_admin) "
            "values ('u3', 'chefe', 'Chefe', 'x', true)",
        )
    assert billing.get_status("u3")["category"] == "admin"


def test_get_status_category_none_when_paid_plan_assigned(billing, fake_stripe, plan, user_id):
    with db.get_pool().connection() as conn:
        conn.execute("update users set plan_id=%s where id=%s", (plan["id"], user_id))
    status = billing.get_status(user_id)
    assert status["category"] is None
    assert status["plan_name"] == "Hobby"


def test_get_status_category_admin_takes_priority_over_paid_plan(billing, fake_stripe, plan):
    with db.get_pool().connection() as conn:
        conn.execute(
            "insert into users (id, username, name, password_hash, is_admin, plan_id) "
            "values ('u3', 'chefe', 'Chefe', 'x', true, %s)", (plan["id"],),
        )
    status = billing.get_status("u3")
    # plan_name presente (é o que o badge mostra) — category só entra quando
    # NÃO há plano pago, então aqui fica None mesmo sendo admin (ver
    # PlanBadge.jsx: nome do plano pago sempre tem prioridade no rótulo).
    assert status["plan_name"] == "Hobby"
    assert status["category"] is None


def test_webhook_rejects_bad_signature(billing, fake_stripe):
    payload = _webhook_payload("checkout.session.completed", {})
    with pytest.raises(BillingError):
        billing.handle_webhook_event(payload, "bad-signature")


def test_webhook_checkout_completed_syncs_subscription(billing, fake_stripe, plan, user_id):
    with db.get_pool().connection() as conn:
        conn.execute("update users set stripe_customer_id=%s where id=%s", ("cus_1", user_id))
    fake_stripe.register_subscription({
        "id": "sub_1", "customer": "cus_1", "status": "trialing",
        "items": {"data": [{"price": {"id": plan["stripe_price_id"]}}]},
        "current_period_end": 1893456000,
    })
    payload = _webhook_payload("checkout.session.completed", {"subscription": "sub_1"})
    billing.handle_webhook_event(payload, fake_stripe.VALID_SIG)

    status = billing.get_status(user_id)
    assert status["subscription_status"] == "trialing"
    assert status["plan_id"] == plan["id"]
    assert status["current_period_end"] is not None


def test_webhook_subscription_updated_syncs_status(billing, fake_stripe, plan, user_id):
    with db.get_pool().connection() as conn:
        conn.execute("update users set stripe_customer_id=%s where id=%s", ("cus_2", user_id))
    subscription = {
        "id": "sub_2", "customer": "cus_2", "status": "active",
        "items": {"data": [{"price": {"id": plan["stripe_price_id"]}}]},
        "current_period_end": 1893456000,
    }
    payload = _webhook_payload("customer.subscription.updated", subscription)
    billing.handle_webhook_event(payload, fake_stripe.VALID_SIG)

    assert billing.get_status(user_id)["subscription_status"] == "active"


def test_webhook_subscription_deleted_marks_canceled(billing, fake_stripe, user_id):
    with db.get_pool().connection() as conn:
        conn.execute(
            "update users set stripe_customer_id=%s, subscription_status=%s where id=%s",
            ("cus_3", "active", user_id),
        )
    payload = _webhook_payload("customer.subscription.deleted", {"customer": "cus_3"})
    billing.handle_webhook_event(payload, fake_stripe.VALID_SIG)

    assert billing.get_status(user_id)["subscription_status"] == "canceled"


def test_webhook_invoice_payment_failed_marks_past_due(billing, fake_stripe, user_id):
    with db.get_pool().connection() as conn:
        conn.execute(
            "update users set stripe_customer_id=%s, subscription_status=%s where id=%s",
            ("cus_4", "active", user_id),
        )
    payload = _webhook_payload("invoice.payment_failed", {"customer": "cus_4"})
    billing.handle_webhook_event(payload, fake_stripe.VALID_SIG)

    assert billing.get_status(user_id)["subscription_status"] == "past_due"


def test_webhook_ignores_unhandled_event_types(billing, fake_stripe, user_id):
    payload = _webhook_payload("customer.updated", {"customer": "cus_5"})
    billing.handle_webhook_event(payload, fake_stripe.VALID_SIG)  # não deve levantar


def _subscription_events(user_id):
    with db.get_pool().connection() as conn:
        return conn.execute(
            "select old_status, new_status from subscription_events where user_id=%s order by occurred_at",
            (user_id,),
        ).fetchall()


def test_webhook_checkout_completed_records_status_change(billing, fake_stripe, plan, user_id):
    with db.get_pool().connection() as conn:
        conn.execute("update users set stripe_customer_id=%s where id=%s", ("cus_6", user_id))
    fake_stripe.register_subscription({
        "id": "sub_6", "customer": "cus_6", "status": "trialing",
        "items": {"data": [{"price": {"id": plan["stripe_price_id"]}}]},
        "current_period_end": 1893456000,
    })
    payload = _webhook_payload("checkout.session.completed", {"subscription": "sub_6"})
    billing.handle_webhook_event(payload, fake_stripe.VALID_SIG)

    events = _subscription_events(user_id)
    assert len(events) == 1
    assert events[0]["old_status"] == "none"
    assert events[0]["new_status"] == "trialing"


def test_webhook_subscription_deleted_records_status_change(billing, fake_stripe, user_id):
    with db.get_pool().connection() as conn:
        conn.execute(
            "update users set stripe_customer_id=%s, subscription_status=%s where id=%s",
            ("cus_7", "active", user_id),
        )
    payload = _webhook_payload("customer.subscription.deleted", {"customer": "cus_7"})
    billing.handle_webhook_event(payload, fake_stripe.VALID_SIG)

    events = _subscription_events(user_id)
    assert len(events) == 1
    assert events[0]["old_status"] == "active"
    assert events[0]["new_status"] == "canceled"


def test_webhook_does_not_record_event_when_status_unchanged(billing, fake_stripe, plan, user_id):
    with db.get_pool().connection() as conn:
        conn.execute(
            "update users set stripe_customer_id=%s, subscription_status=%s where id=%s",
            ("cus_8", "active", user_id),
        )
    subscription = {
        "id": "sub_8", "customer": "cus_8", "status": "active",
        "items": {"data": [{"price": {"id": plan["stripe_price_id"]}}]},
        "current_period_end": 1893456000,
    }
    payload = _webhook_payload("customer.subscription.updated", subscription)
    billing.handle_webhook_event(payload, fake_stripe.VALID_SIG)

    assert _subscription_events(user_id) == []


@pytest.mark.parametrize("status,blocked", [
    ("none", False), ("trialing", False), ("active", False),
    ("past_due", True), ("canceled", True),
])
def test_is_creation_blocked_matches_subscription_status(billing, user_id, status, blocked):
    with db.get_pool().connection() as conn:
        conn.execute("update users set subscription_status=%s where id=%s", (status, user_id))
    assert billing.is_creation_blocked(user_id) is blocked


def test_is_creation_blocked_false_for_unknown_user(billing):
    assert billing.is_creation_blocked("nao-existe") is False
