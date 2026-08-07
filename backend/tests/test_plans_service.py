import pytest

from services.plans_service import DuplicatePlanName, PlanNotFound, PlansService


@pytest.fixture
def plans():
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
