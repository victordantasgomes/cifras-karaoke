import pytest
import stripe

from config import Config
from services.plans_service import DuplicatePlanName, PlanNotFound, PlansService, StripeSyncError


@pytest.fixture
def plans(monkeypatch):
    """Sem Stripe configurada (comportamento local puro) — os testes de
    sincronização de verdade usam `plans_with_stripe` abaixo, com
    `fake_stripe`."""
    monkeypatch.setattr(Config, "STRIPE_SECRET_KEY", "")
    return PlansService()


@pytest.fixture
def plans_with_stripe(fake_stripe):
    return PlansService()


def test_create_and_list(plans):
    plan = plans.create("Hobby", max_setlists=3, storage_limit_mb=100, price_cents=990)
    assert plan["name"] == "Hobby"
    assert plan["max_setlists"] == 3
    assert plan["storage_limit_mb"] == 100
    assert plan["price_cents"] == 990
    assert plan["active"] is True
    assert plan["stripe_product_id"] is None and plan["stripe_price_id"] is None

    listed = plans.list()
    assert [p["name"] for p in listed] == ["Hobby"]


def test_list_orders_by_price(plans):
    plans.create("Professional", max_setlists=100, storage_limit_mb=10000, price_cents=4990)
    plans.create("Hobby", max_setlists=3, storage_limit_mb=100, price_cents=990)
    plans.create("Practice", max_setlists=20, storage_limit_mb=1000, price_cents=1990)
    assert [p["name"] for p in plans.list()] == ["Hobby", "Practice", "Professional"]


def test_create_rejects_duplicate_name(plans):
    plans.create("Hobby", max_setlists=3, storage_limit_mb=100, price_cents=990)
    with pytest.raises(DuplicatePlanName):
        plans.create("Hobby", max_setlists=5, storage_limit_mb=200, price_cents=1990)


def test_create_rejects_blank_name(plans):
    with pytest.raises(ValueError):
        plans.create("   ", max_setlists=3, storage_limit_mb=100, price_cents=990)


def test_create_rejects_negative_values(plans):
    with pytest.raises(ValueError):
        plans.create("Hobby", max_setlists=-1, storage_limit_mb=100, price_cents=990)


def test_update_plan(plans):
    plan = plans.create("Hobby", max_setlists=3, storage_limit_mb=100, price_cents=990)
    updated = plans.update(plan["id"], max_setlists=5, storage_limit_mb=200, price_cents=1490)
    assert updated["max_setlists"] == 5
    assert updated["storage_limit_mb"] == 200
    assert updated["price_cents"] == 1490
    assert updated["name"] == "Hobby"  # nome não muda no update


def test_update_unknown_plan_raises(plans):
    with pytest.raises(PlanNotFound):
        plans.update("00000000-0000-0000-0000-000000000000", max_setlists=1, storage_limit_mb=1, price_cents=1)


def test_archive_and_reactivate_plan(plans):
    plan = plans.create("Hobby", max_setlists=3, storage_limit_mb=100, price_cents=990)
    archived = plans.set_active(plan["id"], False)
    assert archived["active"] is False
    reactivated = plans.set_active(plan["id"], True)
    assert reactivated["active"] is True


def test_archived_plan_still_appears_in_list(plans):
    plan = plans.create("Hobby", max_setlists=3, storage_limit_mb=100, price_cents=990)
    plans.set_active(plan["id"], False)
    assert [p["name"] for p in plans.list()] == ["Hobby"]


def test_set_active_unknown_plan_raises(plans):
    with pytest.raises(PlanNotFound):
        plans.set_active("00000000-0000-0000-0000-000000000000", False)


def test_create_syncs_product_and_price_when_stripe_enabled(plans_with_stripe, fake_stripe):
    plan = plans_with_stripe.create("Hobby", max_setlists=3, storage_limit_mb=100, price_cents=990)
    assert plan["stripe_product_id"] in fake_stripe.products
    assert plan["stripe_price_id"] in fake_stripe.prices
    assert fake_stripe.prices[plan["stripe_price_id"]]["unit_amount"] == 990


def test_update_price_creates_new_stripe_price_under_same_product(plans_with_stripe, fake_stripe):
    plan = plans_with_stripe.create("Hobby", max_setlists=3, storage_limit_mb=100, price_cents=990)
    old_price_id = plan["stripe_price_id"]
    updated = plans_with_stripe.update(plan["id"], max_setlists=3, storage_limit_mb=100, price_cents=1490)
    assert updated["stripe_price_id"] != old_price_id
    assert updated["stripe_product_id"] == plan["stripe_product_id"]  # mesmo Product, Price novo
    assert fake_stripe.prices[updated["stripe_price_id"]]["unit_amount"] == 1490
    assert old_price_id in fake_stripe.prices  # o antigo continua existindo (imutável), só não é mais o atual


def test_update_without_price_change_does_not_touch_stripe(plans_with_stripe, fake_stripe):
    plan = plans_with_stripe.create("Hobby", max_setlists=3, storage_limit_mb=100, price_cents=990)
    updated = plans_with_stripe.update(plan["id"], max_setlists=10, storage_limit_mb=500, price_cents=990)
    assert updated["stripe_price_id"] == plan["stripe_price_id"]


def test_create_raises_stripe_sync_error_on_stripe_failure(plans_with_stripe, fake_stripe, monkeypatch):
    def boom(*a, **kw):
        raise stripe.error.StripeError("falhou")

    monkeypatch.setattr(stripe.Product, "create", boom)
    with pytest.raises(StripeSyncError):
        plans_with_stripe.create("Hobby", max_setlists=3, storage_limit_mb=100, price_cents=990)


def test_list_active_excludes_archived_plans(plans):
    a = plans.create("Hobby", max_setlists=3, storage_limit_mb=100, price_cents=990)
    plans.create("Practice", max_setlists=20, storage_limit_mb=1000, price_cents=1990)
    plans.set_active(a["id"], False)
    assert [p["name"] for p in plans.list_active()] == ["Practice"]
