import pytest

from utils.error_codes import auth_error_code, band_media_error_code, billing_error_code, quota_error_code


@pytest.mark.parametrize("message,expected", [
    ("Usuário e senha são obrigatórios.", "AUTH_CREDENTIALS_REQUIRED"),
    ("A senha deve ter pelo menos 6 caracteres.", "AUTH_PASSWORD_TOO_SHORT"),
    ("E-mail inválido.", "AUTH_EMAIL_INVALID"),
    ("Este usuário já existe.", "AUTH_USERNAME_TAKEN"),
    ("Este e-mail já está cadastrado.", "AUTH_EMAIL_TAKEN"),
    ("Usuário ou senha inválidos.", "AUTH_INVALID_CREDENTIALS"),
    ("Você não pode excluir sua própria conta.", "AUTH_CANNOT_DELETE_SELF"),
    ("Não é possível excluir o último administrador.", "AUTH_CANNOT_DELETE_LAST_ADMIN"),
    ("Usuário não encontrado.", "AUTH_USER_NOT_FOUND"),
    ("Sessão expirada. Entre novamente.", "AUTH_SESSION_EXPIRED"),
    ("Token inválido.", "AUTH_TOKEN_INVALID"),
    ("Senha atual incorreta.", "AUTH_CURRENT_PASSWORD_INVALID"),
])
def test_auth_error_code_maps_known_messages(message, expected):
    assert auth_error_code(message) == expected


def test_auth_error_code_falls_back_for_unknown_message():
    assert auth_error_code("uma mensagem que não existe no mapa") == "AUTH_ERROR"


@pytest.mark.parametrize("message,expected", [
    ("Pagamentos ainda não estão configurados neste servidor.", "BILLING_NOT_CONFIGURED"),
    ("Usuário não encontrado.", "BILLING_USER_NOT_FOUND"),
    ("Plano inválido ou ainda não sincronizado com a Stripe.", "BILLING_PLAN_INVALID"),
    ("Você ainda não iniciou nenhuma assinatura.", "BILLING_NO_SUBSCRIPTION"),
    ("Falha ao criar cliente na Stripe: algum detalhe técnico", "BILLING_STRIPE_CUSTOMER_FAILED"),
    ("Falha ao iniciar o checkout: algum detalhe técnico", "BILLING_STRIPE_CHECKOUT_FAILED"),
    ("Falha ao abrir o portal de cobrança: algum detalhe técnico", "BILLING_STRIPE_PORTAL_FAILED"),
    ("Webhook inválido: assinatura não bate", "BILLING_WEBHOOK_INVALID"),
])
def test_billing_error_code_maps_known_messages(message, expected):
    assert billing_error_code(message) == expected


def test_billing_error_code_falls_back_for_unknown_message():
    assert billing_error_code("mensagem desconhecida") == "BILLING_ERROR"


def test_quota_error_code_distinguishes_setlists_from_storage():
    assert quota_error_code("Limite de 3 setlists do seu plano atingido.") == "QUOTA_SETLISTS_EXCEEDED"
    assert quota_error_code("Limite de 100 MB de armazenamento do seu plano atingido.") == "QUOTA_STORAGE_EXCEEDED"


def test_quota_error_code_falls_back_for_unknown_message():
    assert quota_error_code("mensagem desconhecida") == "QUOTA_EXCEEDED"


@pytest.mark.parametrize("message,expected", [
    ("Arquivo não parece ser um(a) imagem válido(a).", "BAND_MEDIA_TYPE_MISMATCH"),
    ("Arquivo não parece ser um(a) vídeo válido(a).", "BAND_MEDIA_TYPE_MISMATCH"),
    ("Arquivo maior que o limite de 50 MB.", "BAND_MEDIA_TOO_LARGE"),
    ("Limite de 10 itens de mídia por anúncio atingido.", "BAND_MEDIA_LIMIT_REACHED"),
    ("Informe um link válido (começando com http:// ou https://).", "BAND_MEDIA_URL_INVALID"),
])
def test_band_media_error_code_maps_known_messages(message, expected):
    assert band_media_error_code(message) == expected


def test_band_media_error_code_falls_back_for_unknown_message():
    assert band_media_error_code("mensagem desconhecida") == "BAND_MEDIA_INVALID"
