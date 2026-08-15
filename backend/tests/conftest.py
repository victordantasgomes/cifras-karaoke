"""Fixtures compartilhadas dos testes de service — rodam contra um Postgres
real (ver TEST_DATABASE_URL em backend/.env), não um banco falso/em memória:
SQL malformado ou uma constraint violada aparece aqui, não só em produção.

Cada teste começa com as tabelas vazias (TRUNCATE ... CASCADE) em vez de um
schema novo por teste — mais rápido, e o schema é sempre o mesmo dentro da
suíte.

IMPORTANTE: isso já truncou o banco de dados real uma vez (rodar a suíte
apontando sem querer pro mesmo DATABASE_URL usado pelos dados migrados —
ver backend/scripts/migrate_to_postgres.py — apagou tudo). Por isso a suíte
exige TEST_DATABASE_URL separada de DATABASE_URL e recusa a rodar sem ela,
em vez de só usar Config.DATABASE_URL como fallback."""
from __future__ import annotations

import json
import os

import pytest
import stripe

import db
from config import Config
from services import blob_client

_TABLES = (
    "setlist_items", "setlists", "samples", "song_clips", "audio_tracks", "user_song_prefs",
    "song_plays", "song_versions", "songs", "settings", "users", "plans", "landing_page_views",
    "user_favorite_artists", "user_favorite_genres", "user_logos", "band_posts", "band_post_media",
    "activity_pings", "subscription_events", "user_instruments", "user_alert_dismissals",
)

_TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
if not _TEST_DATABASE_URL:
    pytest.exit(
        "TEST_DATABASE_URL não definida em backend/.env. A suíte faz "
        "TRUNCATE CASCADE nas tabelas a cada teste — sem uma instância "
        "Postgres separada só pra testes (ex.: uma branch do Neon), isso "
        "apaga dados reais. Veja README.md > Testes.",
        returncode=1,
    )
if _TEST_DATABASE_URL == Config.DATABASE_URL:
    pytest.exit(
        "TEST_DATABASE_URL está igual a DATABASE_URL — configure uma "
        "instância Postgres SEPARADA pra testes, não a mesma do app.",
        returncode=1,
    )
Config.DATABASE_URL = _TEST_DATABASE_URL


@pytest.fixture(scope="session", autouse=True)
def _schema():
    db.init_schema()
    yield
    db.close_pool()


@pytest.fixture(autouse=True)
def _clean_db():
    with db.get_pool().connection() as conn:
        conn.execute("truncate table " + ", ".join(_TABLES) + " cascade")
    # o truncate acima leva junto as linhas singleton kind='guest'/'admin'
    # de `plans` (seedadas só uma vez, na fixture _schema de escopo de
    # sessão) — reseeda a cada teste, senão QuotaService não encontra
    # limite nenhum pra quem não tem plano pago. init_schema() é
    # idempotente (CREATE...IF NOT EXISTS / INSERT...WHERE NOT EXISTS), então
    # rodar de novo aqui só recria essas duas linhas, sem custo a mais.
    db.init_schema()
    yield


@pytest.fixture
def user_id():
    """Cria o usuário 'u1' (FK de songs/settings) e devolve o id."""
    with db.get_pool().connection() as conn:
        conn.execute(
            "insert into users (id, username, name, password_hash) values ('u1', 'demo', 'Demo', 'x')",
        )
    return "u1"


@pytest.fixture
def other_user_id():
    """Segundo usuário ('u2') — biblioteca global: vários testes precisam
    de duas contas pra verificar visibilidade cruzada/clone-ao-editar."""
    with db.get_pool().connection() as conn:
        conn.execute(
            "insert into users (id, username, name, password_hash) values ('u2', 'outro', 'Outro', 'x')",
        )
    return "u2"


@pytest.fixture
def fake_blob_store(monkeypatch):
    """Troca blob_client.put/get/delete por fakes em memória — os testes de
    AudioService não precisam de BLOB_READ_WRITE_TOKEN nem batem na API do
    Vercel Blob de verdade (que, pra este projeto, é um store privado —
    ver blob_client.py)."""
    store: dict[str, bytes] = {}  # pathname -> bytes

    def fake_put(pathname, data, content_type=None):
        store[pathname] = data
        return {"url": f"https://fake-blob.test/{pathname}", "pathname": pathname}

    def fake_get(url):
        pathname = url.replace("https://fake-blob.test/", "")
        if pathname not in store:
            raise blob_client.BlobError("not found")
        return store[pathname], "application/octet-stream"

    def fake_delete(urls):
        for url in urls:
            store.pop(url.replace("https://fake-blob.test/", ""), None)

    def fake_size_of(url):
        pathname = url.replace("https://fake-blob.test/", "")
        if pathname not in store:
            raise blob_client.BlobError("not found")
        return len(store[pathname])

    monkeypatch.setattr(blob_client, "put", fake_put)
    monkeypatch.setattr(blob_client, "get", fake_get)
    monkeypatch.setattr(blob_client, "delete", fake_delete)
    monkeypatch.setattr(blob_client, "size_of", fake_size_of)
    return store


class _FakeStripeObject(dict):
    """Objeto Stripe fake com acesso tanto por atributo (`obj.id`, como o
    SDK real devolve) quanto por chave (`obj["id"]`) — plans_service.py e
    billing_service.py usam os dois estilos dependendo do objeto."""

    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as e:
            raise AttributeError(name) from e


class FakeStripe:
    """Estado em memória + fakes das chamadas de rede da Stripe usadas por
    plans_service.py/billing_service.py. Sem isso, com STRIPE_SECRET_KEY
    configurada em backend/.env, PlansService.create()/update() e
    BillingService bateriam na API de teste real da Stripe a cada rodada de
    pytest — lento, dependente de rede, e suja o Stripe de objetos de teste
    à toa."""

    VALID_SIG = "t=1,v1=fake-assinatura-valida"

    def __init__(self):
        self._seq = 0
        self.products: dict[str, dict] = {}
        self.prices: dict[str, dict] = {}
        self.customers: dict[str, dict] = {}
        self.subscriptions: dict[str, dict] = {}

    def _id(self, prefix: str) -> str:
        self._seq += 1
        return f"{prefix}_{self._seq}"

    def register_subscription(self, sub: dict) -> None:
        """P/ testes de webhook: registra uma assinatura fake pra que
        `stripe.Subscription.retrieve` (chamado por
        checkout.session.completed) a encontre."""
        self.subscriptions[sub["id"]] = sub

    def product_create(self, name, **_kw):
        obj = _FakeStripeObject(id=self._id("prod"), name=name)
        self.products[obj["id"]] = obj
        return obj

    def price_create(self, product, unit_amount, currency, recurring=None, **_kw):
        obj = _FakeStripeObject(
            id=self._id("price"), product=product, unit_amount=unit_amount,
            currency=currency, recurring=recurring or {},
        )
        self.prices[obj["id"]] = obj
        return obj

    def customer_create(self, email=None, name=None, metadata=None, **_kw):
        obj = _FakeStripeObject(id=self._id("cus"), email=email, name=name, metadata=metadata or {})
        self.customers[obj["id"]] = obj
        return obj

    def checkout_session_create(self, **kw):
        sid = self._id("cs")
        return _FakeStripeObject(id=sid, url=f"https://checkout.stripe.test/{sid}", **kw)

    def portal_session_create(self, **kw):
        sid = self._id("bps")
        return _FakeStripeObject(id=sid, url=f"https://billing.stripe.test/{sid}", **kw)

    def subscription_retrieve(self, subscription_id, **_kw):
        sub = self.subscriptions.get(subscription_id)
        if sub is None:
            raise stripe.error.InvalidRequestError("No such subscription", "id")
        return sub

    def construct_event(self, payload, sig_header, _secret):
        if sig_header != self.VALID_SIG:
            raise stripe.error.SignatureVerificationError("Assinatura inválida", sig_header)
        return json.loads(payload)


@pytest.fixture
def fake_stripe(monkeypatch):
    monkeypatch.setattr(Config, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(Config, "STRIPE_WEBHOOK_SECRET", "whsec_fake")

    fake = FakeStripe()
    monkeypatch.setattr(stripe.Product, "create", fake.product_create)
    monkeypatch.setattr(stripe.Price, "create", fake.price_create)
    monkeypatch.setattr(stripe.Customer, "create", fake.customer_create)
    monkeypatch.setattr(stripe.checkout.Session, "create", fake.checkout_session_create)
    monkeypatch.setattr(stripe.billing_portal.Session, "create", fake.portal_session_create)
    monkeypatch.setattr(stripe.Subscription, "retrieve", fake.subscription_retrieve)
    monkeypatch.setattr(stripe.Webhook, "construct_event", fake.construct_event)
    return fake
