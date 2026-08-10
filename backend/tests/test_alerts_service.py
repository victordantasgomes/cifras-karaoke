import pytest

import db
from services.alerts_service import AlertsService
from services.auth_service import AuthService
from services.band_board_service import BandBoardService

POST_DATA = {
    "band_name": "Banda do Zé",
    "city": "São Paulo",
    "genero": "Rock",
    "style_freeform": "",
    "skill_level": "",
    "goal": "",
    "rehearsal_days": [],
    "instruments_needed": ["bass", "drums"],
    "bio": "",
    "contact_info": "",
}


@pytest.fixture
def alerts():
    return AlertsService()


@pytest.fixture
def board():
    return BandBoardService()


@pytest.fixture
def auth():
    return AuthService()


def _set_profile(auth, user_id, city, instruments):
    auth.update_city(user_id, city)
    auth.set_instruments(user_id, [{"instrument": i, "skill_level": ""} for i in instruments])


def test_matches_by_city_and_instrument(alerts, board, auth, user_id, other_user_id):
    board.create(user_id, POST_DATA)
    _set_profile(auth, other_user_id, "São Paulo", ["bass"])
    result = alerts.list_alerts(other_user_id)
    assert len(result) == 1
    assert result[0]["band_name"] == "Banda do Zé"


def test_no_match_different_city(alerts, board, auth, user_id, other_user_id):
    board.create(user_id, POST_DATA)
    _set_profile(auth, other_user_id, "Rio de Janeiro", ["bass"])
    assert alerts.list_alerts(other_user_id) == []


def test_no_match_different_instrument(alerts, board, auth, user_id, other_user_id):
    board.create(user_id, POST_DATA)
    _set_profile(auth, other_user_id, "São Paulo", ["guitar"])
    assert alerts.list_alerts(other_user_id) == []


def test_city_match_ignores_case_and_whitespace(alerts, board, auth, user_id, other_user_id):
    board.create(user_id, {**POST_DATA, "city": "  São Paulo  "})
    _set_profile(auth, other_user_id, "SÃO PAULO", ["bass"])
    assert len(alerts.list_alerts(other_user_id)) == 1


def test_no_match_without_own_city(alerts, board, auth, user_id, other_user_id):
    board.create(user_id, POST_DATA)
    auth.set_instruments(other_user_id, [{"instrument": "bass", "skill_level": ""}])
    assert alerts.list_alerts(other_user_id) == []


def test_no_match_without_own_instruments(alerts, board, auth, user_id, other_user_id):
    board.create(user_id, POST_DATA)
    auth.update_city(other_user_id, "São Paulo")
    assert alerts.list_alerts(other_user_id) == []


def test_ignores_inactive_posts(alerts, board, auth, user_id, other_user_id):
    post = board.create(user_id, POST_DATA)
    board.set_active(user_id, post["id"], False)
    _set_profile(auth, other_user_id, "São Paulo", ["bass"])
    assert alerts.list_alerts(other_user_id) == []


def test_ignores_own_posts(alerts, board, auth, user_id):
    board.create(user_id, POST_DATA)
    _set_profile(auth, user_id, "São Paulo", ["bass"])
    assert alerts.list_alerts(user_id) == []


def test_dismiss_removes_from_list(alerts, board, auth, user_id, other_user_id):
    post = board.create(user_id, POST_DATA)
    _set_profile(auth, other_user_id, "São Paulo", ["bass"])
    assert len(alerts.list_alerts(other_user_id)) == 1
    alerts.dismiss(other_user_id, post["id"])
    assert alerts.list_alerts(other_user_id) == []


def test_dismiss_is_scoped_per_user(alerts, board, auth, user_id, other_user_id):
    post = board.create(user_id, POST_DATA)
    _set_profile(auth, other_user_id, "São Paulo", ["bass"])
    alerts.dismiss(other_user_id, post["id"])
    # um terceiro usuário com o mesmo perfil ainda vê o alerta — dispensar é por usuário
    with db.get_pool().connection() as conn:
        conn.execute("insert into users (id, username, name, password_hash) values ('u3', 'terceiro', 'T', 'x')")
    _set_profile(auth, "u3", "São Paulo", ["bass"])
    assert len(alerts.list_alerts("u3")) == 1


def test_dismiss_unknown_post_is_a_noop(alerts, user_id):
    alerts.dismiss(user_id, "00000000-0000-0000-0000-000000000000")  # não levanta
