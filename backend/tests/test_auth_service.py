import pytest

from services.auth_service import AuthError, AuthService


@pytest.fixture
def auth():
    return AuthService()


def test_register_and_login(auth):
    user = auth.register("demo", "demo123", "Usuário Demo")
    assert user["username"] == "demo" and user["name"] == "Usuário Demo"

    result = auth.login("demo", "demo123")
    assert result["user"]["id"] == user["id"]
    payload = auth.verify_token(result["token"])
    assert payload["sub"] == user["id"] and payload["username"] == "demo"


def test_register_lowercases_username(auth):
    user = auth.register("DeMo", "demo123")
    assert user["username"] == "demo"


def test_register_defaults_name_to_username(auth):
    user = auth.register("semnome", "senha123")
    assert user["name"] == "semnome"


def test_register_duplicate_username_raises(auth):
    auth.register("demo", "demo123")
    with pytest.raises(AuthError):
        auth.register("demo", "outrasenha")


def test_register_short_password_raises(auth):
    with pytest.raises(AuthError):
        auth.register("demo", "123")


def test_register_missing_fields_raises(auth):
    with pytest.raises(AuthError):
        auth.register("", "senha123")
    with pytest.raises(AuthError):
        auth.register("demo", "")


def test_login_wrong_password_raises(auth):
    auth.register("demo", "demo123")
    with pytest.raises(AuthError):
        auth.login("demo", "senhaerrada")


def test_login_unknown_username_raises(auth):
    with pytest.raises(AuthError):
        auth.login("naoexiste", "qualquer")


def test_verify_token_rejects_garbage(auth):
    with pytest.raises(AuthError):
        auth.verify_token("token-invalido")


def test_register_defaults_is_admin_false(auth):
    user = auth.register("comum", "senha123")
    assert user["is_admin"] is False

    result = auth.login("comum", "senha123")
    assert result["user"]["is_admin"] is False
    payload = auth.verify_token(result["token"])
    assert payload["is_admin"] is False


def test_register_as_admin(auth):
    user = auth.register("chefe", "senha123", is_admin=True)
    assert user["is_admin"] is True

    result = auth.login("chefe", "senha123")
    assert result["user"]["is_admin"] is True
    payload = auth.verify_token(result["token"])
    assert payload["is_admin"] is True


def test_list_users_includes_is_admin(auth):
    auth.register("comum", "senha123")
    auth.register("chefe", "senha123", is_admin=True)

    users = auth.list_users()
    by_username = {u["username"]: u for u in users}
    assert by_username["comum"]["is_admin"] is False
    assert by_username["chefe"]["is_admin"] is True
