"""Códigos de erro estáveis pra cada condição de erro da API — permite o
frontend traduzir a mensagem certa em qualquer um dos 9 idiomas (Fase 2/3
do plano de i18n), sem depender do texto em português (que continua
voltando em `error`, mantido como fallback/log — nunca removido).

A maioria das rotas já captura um tipo de exceção específico pra UMA
condição só (ex.: SongNotFound só significa "música não encontrada"), então
o código correspondente é escrito direto no ponto onde a rota já captura a
exceção — sem precisar de nada daqui. As exceções genéricas usadas pra
VÁRIAS condições diferentes dentro do mesmo tipo (AuthError, BillingError,
QuotaExceeded) têm um texto fixo em português por trás de cada condição
(mesmo quando uma parte da mensagem é dinâmica, como o detalhe de um erro
vindo da própria Stripe) — as funções abaixo mapeiam por correspondência de
texto/prefixo, sem tocar nas classes de exceção nem nas mensagens delas."""
from __future__ import annotations

_AUTH_EXACT = {
    "Usuário e senha são obrigatórios.": "AUTH_CREDENTIALS_REQUIRED",
    "A senha deve ter pelo menos 6 caracteres.": "AUTH_PASSWORD_TOO_SHORT",
    "E-mail inválido.": "AUTH_EMAIL_INVALID",
    "Este usuário já existe.": "AUTH_USERNAME_TAKEN",
    "Este e-mail já está cadastrado.": "AUTH_EMAIL_TAKEN",
    "Usuário ou senha inválidos.": "AUTH_INVALID_CREDENTIALS",
    "Você não pode excluir sua própria conta.": "AUTH_CANNOT_DELETE_SELF",
    "Não é possível excluir o último administrador.": "AUTH_CANNOT_DELETE_LAST_ADMIN",
    "Usuário não encontrado.": "AUTH_USER_NOT_FOUND",
    "Categoria inválida.": "AUTH_CATEGORY_INVALID",
    "Você não pode alterar a própria categoria.": "AUTH_CANNOT_CHANGE_OWN_CATEGORY",
    "Não é possível remover o último administrador.": "AUTH_CANNOT_DEMOTE_LAST_ADMIN",
    "Sessão expirada. Entre novamente.": "AUTH_SESSION_EXPIRED",
    "Token inválido.": "AUTH_TOKEN_INVALID",
    "Senha atual incorreta.": "AUTH_CURRENT_PASSWORD_INVALID",
    "Instrumento inválido.": "AUTH_INSTRUMENT_INVALID",
    "Nível técnico inválido.": "AUTH_SKILL_LEVEL_INVALID",
}


def auth_error_code(message: str) -> str:
    return _AUTH_EXACT.get(message, "AUTH_ERROR")


_BILLING_EXACT = {
    "Pagamentos ainda não estão configurados neste servidor.": "BILLING_NOT_CONFIGURED",
    "Usuário não encontrado.": "BILLING_USER_NOT_FOUND",
    "Plano inválido ou ainda não sincronizado com a Stripe.": "BILLING_PLAN_INVALID",
    "Você ainda não iniciou nenhuma assinatura.": "BILLING_NO_SUBSCRIPTION",
}
_BILLING_PREFIXES = (
    ("Falha ao criar cliente na Stripe", "BILLING_STRIPE_CUSTOMER_FAILED"),
    ("Falha ao iniciar o checkout", "BILLING_STRIPE_CHECKOUT_FAILED"),
    ("Falha ao abrir o portal de cobrança", "BILLING_STRIPE_PORTAL_FAILED"),
    ("Webhook inválido", "BILLING_WEBHOOK_INVALID"),
)


def billing_error_code(message: str) -> str:
    if message in _BILLING_EXACT:
        return _BILLING_EXACT[message]
    for prefix, code in _BILLING_PREFIXES:
        if message.startswith(prefix):
            return code
    return "BILLING_ERROR"


def quota_error_code(message: str) -> str:
    if "setlists do seu plano" in message:
        return "QUOTA_SETLISTS_EXCEEDED"
    if "armazenamento do seu plano" in message:
        return "QUOTA_STORAGE_EXCEEDED"
    return "QUOTA_EXCEEDED"


def band_media_error_code(message: str) -> str:
    """BandBoardService.add_media_file/add_media_link levantam ValueError
    com uma entre 4 mensagens de validação distintas (2 delas com um número
    interpolado — tamanho máximo, nº de itens — por isso substring, não
    igualdade exata como em _AUTH_EXACT)."""
    if "não parece ser" in message:
        return "BAND_MEDIA_TYPE_MISMATCH"
    if "maior que o limite" in message:
        return "BAND_MEDIA_TOO_LARGE"
    if "itens de mídia por anúncio" in message:
        return "BAND_MEDIA_LIMIT_REACHED"
    if "link válido" in message:
        return "BAND_MEDIA_URL_INVALID"
    return "BAND_MEDIA_INVALID"
