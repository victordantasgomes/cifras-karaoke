import pytest

import db
from services.settings_service import DEFAULT_COLORS, SettingsService


@pytest.fixture
def ctx(user_id):
    return SettingsService()


def test_get_returns_defaults_when_no_row(ctx):
    assert ctx.get("u1") == {"colors": DEFAULT_COLORS}


def test_update_persists_and_get_reflects_it(ctx):
    ctx.update("u1", {"amber": "#ff0000"})
    result = ctx.get("u1")
    assert result["colors"]["amber"] == "#ff0000"
    # demais cores continuam no padrão
    assert result["colors"]["sample"] == DEFAULT_COLORS["sample"]


def test_update_ignores_unknown_keys(ctx):
    ctx.update("u1", {"amber": "#ff0000", "naoexiste": "#000000"})
    result = ctx.get("u1")
    assert "naoexiste" not in result["colors"]


def test_update_isolated_per_user(ctx):
    with db.get_pool().connection() as conn:
        conn.execute(
            "insert into users (id, username, name, password_hash) values ('u2', 'demo2', 'Demo2', 'x')",
        )
    svc = SettingsService()
    ctx.update("u1", {"amber": "#ff0000"})
    assert svc.get("u2")["colors"]["amber"] == DEFAULT_COLORS["amber"]
