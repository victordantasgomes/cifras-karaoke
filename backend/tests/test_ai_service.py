import json

import openai
import pytest

from services.ai_service import AIError, AIService


class _FakeMessage:
    def __init__(self, content):
        self.content = content


class _FakeChoice:
    def __init__(self, content):
        self.message = _FakeMessage(content)


class _FakeCompletion:
    def __init__(self, content):
        self.choices = [_FakeChoice(content)]


class _FakeCompletions:
    def __init__(self, content):
        self._content = content
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeCompletion(self._content)


class _FakeChat:
    def __init__(self, content):
        self.completions = _FakeCompletions(content)


class _FakeClient:
    def __init__(self, content):
        self.chat = _FakeChat(content)


HEADER_EMPTY = {"titulo": "Yellow", "intérprete": "", "tom": "", "ritmomusical": "", "tags": "", "autor": "", "bpm": ""}
HEADER_FULL = {"titulo": "Yellow", "intérprete": "Coldplay", "tom": "B", "ritmomusical": "Rock", "tags": "rock, pop",
                "autor": "Chris Martin", "bpm": "120"}
BODY = "B\nLook at the stars\nLook how they shine for you\n"


def test_returns_empty_dict_when_nothing_missing():
    ai = AIService()
    assert ai.suggest_header(HEADER_FULL, BODY) == {}


def test_never_calls_api_when_nothing_missing(monkeypatch):
    fake = _FakeClient(json.dumps({}))
    monkeypatch.setattr(AIService, "_client", lambda self: fake)
    ai = AIService()
    ai.suggest_header(HEADER_FULL, BODY)
    assert fake.chat.completions.calls == []


def test_suggests_only_missing_fields(monkeypatch):
    fake = _FakeClient(json.dumps({
        "intérprete": "Coldplay", "tom": "B", "ritmomusical": "Rock", "tags": ["rock", "pop"],
        "autor": "Chris Martin", "bpm": "88",
    }))
    monkeypatch.setattr(AIService, "_client", lambda self: fake)
    ai = AIService()
    result = ai.suggest_header(HEADER_EMPTY, BODY)
    assert result == {
        "intérprete": "Coldplay", "tom": "B", "ritmomusical": "Rock", "tags": "rock, pop",
        "autor": "Chris Martin", "bpm": "88",
    }


def test_never_asks_about_fields_already_filled(monkeypatch):
    fake = _FakeClient(json.dumps({"tom": "B", "tags": "rock"}))
    monkeypatch.setattr(AIService, "_client", lambda self: fake)
    ai = AIService()
    header = {**HEADER_FULL, "tom": "", "tags": ""}
    ai.suggest_header(header, BODY)
    prompt = fake.chat.completions.calls[0]["messages"][0]["content"]
    assert "intérprete" not in prompt.split("faltantes:")[1].split("\n")[0]


def test_ignores_fields_the_model_left_empty(monkeypatch):
    fake = _FakeClient(json.dumps({"intérprete": "", "tom": "B", "ritmomusical": "", "tags": ""}))
    monkeypatch.setattr(AIService, "_client", lambda self: fake)
    ai = AIService()
    result = ai.suggest_header(HEADER_EMPTY, BODY)
    assert result == {"tom": "B"}


def test_ignores_fields_where_model_echoed_the_instruction(monkeypatch):
    fake = _FakeClient(json.dumps({
        "intérprete": "Coldplay", "tom": "string vazia", "ritmomusical": "Vazio", "tags": "",
    }))
    monkeypatch.setattr(AIService, "_client", lambda self: fake)
    ai = AIService()
    header = {**HEADER_EMPTY, "autor": "x", "bpm": "1"}
    result = ai.suggest_header(header, BODY)
    assert result == {"intérprete": "Coldplay"}


def test_malformed_json_response_yields_no_suggestions(monkeypatch):
    fake = _FakeClient("isso não é JSON")
    monkeypatch.setattr(AIService, "_client", lambda self: fake)
    ai = AIService()
    assert ai.suggest_header(HEADER_EMPTY, BODY) == {}


def test_openai_error_becomes_ai_error(monkeypatch):
    class _FailingCompletions:
        def create(self, **kwargs):
            raise openai.OpenAIError("sem créditos")

    class _FailingChat:
        completions = _FailingCompletions()

    class _FailingClient:
        chat = _FailingChat()

    monkeypatch.setattr(AIService, "_client", lambda self: _FailingClient())
    ai = AIService()
    with pytest.raises(AIError):
        ai.suggest_header(HEADER_EMPTY, BODY)


def test_client_raises_without_api_key(monkeypatch):
    from config import Config
    monkeypatch.setattr(Config, "OPENAI_API_KEY", "")
    ai = AIService()
    with pytest.raises(AIError):
        ai.suggest_header(HEADER_EMPTY, BODY)


def test_body_excerpt_is_limited_to_40_lines(monkeypatch):
    fake = _FakeClient(json.dumps({"intérprete": "X"}))
    monkeypatch.setattr(AIService, "_client", lambda self: fake)
    ai = AIService()
    long_body = "\n".join(f"linha {i}" for i in range(200))
    ai.suggest_header(HEADER_EMPTY, long_body)
    prompt = fake.chat.completions.calls[0]["messages"][0]["content"]
    assert "linha 39" in prompt and "linha 40" not in prompt
