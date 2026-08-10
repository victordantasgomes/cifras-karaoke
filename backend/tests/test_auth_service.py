import pytest

import db
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


def test_login_increments_count_and_sets_last_login(auth):
    user = auth.register("demo", "demo123")
    users = auth.list_users()
    assert users[0]["login_count"] == 0 and users[0]["last_login_at"] is None

    auth.login("demo", "demo123")
    auth.login("demo", "demo123")
    users = auth.list_users()
    assert users[0]["login_count"] == 2
    assert users[0]["last_login_at"] is not None
    assert users[0]["id"] == user["id"]


def test_failed_login_does_not_increment_count(auth):
    auth.register("demo", "demo123")
    with pytest.raises(AuthError):
        auth.login("demo", "senhaerrada")
    assert auth.list_users()[0]["login_count"] == 0


def test_list_users_includes_setlists_and_favorites_count(auth):
    from services.setlist_service import SetlistService
    from services.songs_service import SongsService

    user = auth.register("demo", "demo123")
    songs = SongsService()
    setlists = SetlistService()
    entry = songs.create(user["id"], "Pop", "Coldplay", "Yellow", "@titulo: Yellow\n\nB\nletra")
    songs.set_favorite(user["id"], entry["slug"], True)
    setlists.save(user["id"], "Show", [])

    row = auth.list_users()[0]
    assert row["setlists_count"] == 1
    assert row["favorites_count"] == 1


def test_cannot_delete_own_account(auth):
    user = auth.register("demo", "demo123")
    with pytest.raises(AuthError):
        auth.delete_user(user["id"], user["id"])


def test_cannot_delete_last_admin(auth):
    admin = auth.register("chefe", "senha123", is_admin=True)
    other = auth.register("comum", "senha123")
    with pytest.raises(AuthError):
        auth.delete_user(admin["id"], other["id"])


def test_can_delete_admin_when_another_admin_remains(auth):
    admin1 = auth.register("chefe1", "senha123", is_admin=True)
    admin2 = auth.register("chefe2", "senha123", is_admin=True)
    auth.delete_user(admin1["id"], admin2["id"])
    assert admin1["username"] not in {u["username"] for u in auth.list_users()}


def test_delete_user_removes_regular_user(auth):
    admin = auth.register("chefe", "senha123", is_admin=True)
    user = auth.register("comum", "senha123")
    auth.delete_user(user["id"], admin["id"])
    assert user["username"] not in {u["username"] for u in auth.list_users()}


def test_delete_unknown_user_is_idempotent(auth):
    admin = auth.register("chefe", "senha123", is_admin=True)
    auth.delete_user("nao-existe", admin["id"])  # não levanta


def test_reset_password_updates_login(auth):
    user = auth.register("demo", "demo123")
    auth.reset_password(user["id"], "novasenha123")
    result = auth.login("demo", "novasenha123")
    assert result["user"]["id"] == user["id"]
    with pytest.raises(AuthError):
        auth.login("demo", "demo123")


def test_reset_password_rejects_short_password(auth):
    user = auth.register("demo", "demo123")
    with pytest.raises(AuthError):
        auth.reset_password(user["id"], "123")


def test_reset_password_unknown_user_raises(auth):
    with pytest.raises(AuthError):
        auth.reset_password("nao-existe", "senhaboa123")


def _share_by_default(user_id: str) -> bool:
    with db.get_pool().connection() as conn:
        row = conn.execute("select share_by_default from users where id=%s", (user_id,)).fetchone()
    return row["share_by_default"]


def test_register_defaults_share_by_default_true(auth):
    """Conta admin-criada (fluxo de hoje) continua colaborativa por padrão."""
    user = auth.register("banda", "senha123")
    assert _share_by_default(user["id"]) is True


def test_public_signup_style_register_accepts_email(auth):
    user = auth.register("novato", "senha123", email="novato@example.com", share_by_default=False)
    assert user["email"] == "novato@example.com"
    assert _share_by_default(user["id"]) is False


def test_register_rejects_invalid_email(auth):
    with pytest.raises(AuthError):
        auth.register("novato", "senha123", email="nao-e-um-email")


def test_register_rejects_duplicate_email(auth):
    auth.register("um", "senha123", email="mesmo@example.com")
    with pytest.raises(AuthError):
        auth.register("outro", "senha123", email="mesmo@example.com")


def test_register_allows_multiple_users_without_email(auth):
    """Índice único parcial: várias linhas com email NULL não colidem."""
    auth.register("um", "senha123")
    auth.register("outro", "senha123")  # não levanta


def test_register_lowercases_email(auth):
    user = auth.register("novato", "senha123", email="Novato@Example.COM")
    assert user["email"] == "novato@example.com"


def test_get_profile_includes_email(auth):
    user = auth.register("demo", "demo123", email="demo@example.com")
    profile = auth.get_profile(user["id"])
    assert profile["username"] == "demo"
    assert profile["email"] == "demo@example.com"
    assert profile["login_count"] == 0
    assert profile["last_login_at"] is None


def test_get_profile_unknown_user_raises(auth):
    with pytest.raises(AuthError):
        auth.get_profile("nao-existe")


def test_change_own_password_requires_correct_current_password(auth):
    user = auth.register("demo", "demo123")
    with pytest.raises(AuthError):
        auth.change_own_password(user["id"], "senhaerrada", "novasenha123")
    # senha antiga continua valendo — a troca não deve ter acontecido
    auth.login("demo", "demo123")


def test_change_own_password_succeeds_with_correct_current_password(auth):
    user = auth.register("demo", "demo123")
    auth.change_own_password(user["id"], "demo123", "novasenha123")
    auth.login("demo", "novasenha123")
    with pytest.raises(AuthError):
        auth.login("demo", "demo123")


def test_change_own_password_rejects_short_new_password(auth):
    user = auth.register("demo", "demo123")
    with pytest.raises(AuthError):
        auth.change_own_password(user["id"], "demo123", "123")


def test_change_email_requires_correct_password(auth):
    user = auth.register("demo", "demo123", email="old@example.com")
    with pytest.raises(AuthError):
        auth.change_email(user["id"], "new@example.com", "senhaerrada")
    assert auth.get_profile(user["id"])["email"] == "old@example.com"


def test_change_email_succeeds_with_correct_password(auth):
    user = auth.register("demo", "demo123", email="old@example.com")
    auth.change_email(user["id"], "new@example.com", "demo123")
    assert auth.get_profile(user["id"])["email"] == "new@example.com"


def test_change_email_rejects_invalid_format(auth):
    user = auth.register("demo", "demo123")
    with pytest.raises(AuthError):
        auth.change_email(user["id"], "nao-e-um-email", "demo123")


def test_change_email_rejects_already_taken(auth):
    auth.register("outro", "senha123", email="ocupado@example.com")
    user = auth.register("demo", "demo123")
    with pytest.raises(AuthError):
        auth.change_email(user["id"], "ocupado@example.com", "demo123")


def test_change_email_resets_email_verified(auth):
    user = auth.register("demo", "demo123", email="old@example.com")
    with db.get_pool().connection() as conn:
        conn.execute("update users set email_verified=true where id=%s", (user["id"],))
    auth.change_email(user["id"], "new@example.com", "demo123")
    with db.get_pool().connection() as conn:
        row = conn.execute("select email_verified from users where id=%s", (user["id"],)).fetchone()
    assert row["email_verified"] is False
