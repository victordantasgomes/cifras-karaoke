import pytest

from config import Config
from services.youtube_service import YoutubeError, YoutubeService


class _FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self.ok = 200 <= status_code < 300
        self._payload = payload
        self.text = str(payload)

    def json(self):
        return self._payload


@pytest.fixture
def youtube(monkeypatch):
    monkeypatch.setattr(Config, "YOUTUBE_API_KEY", "fake-key")
    return YoutubeService()


def test_search_returns_first_video_url(monkeypatch, youtube):
    def fake_get(url, params=None, timeout=None):
        assert params["q"] == "Yellow Coldplay"
        assert params["key"] == "fake-key"
        return _FakeResponse(200, {"items": [{"id": {"videoId": "dQw4w9WgXcQ"}}]})

    monkeypatch.setattr("requests.get", fake_get)
    url = youtube.search_video_url("Coldplay", "Yellow")
    assert url == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


def test_search_returns_none_when_no_results(monkeypatch, youtube):
    monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(200, {"items": []}))
    assert youtube.search_video_url("Ninguém", "Nada") is None


def test_search_raises_without_api_key(monkeypatch):
    monkeypatch.setattr(Config, "YOUTUBE_API_KEY", "")
    with pytest.raises(YoutubeError):
        YoutubeService().search_video_url("Coldplay", "Yellow")


def test_search_raises_on_http_error(monkeypatch, youtube):
    monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(403, {"error": "quota excedida"}))
    with pytest.raises(YoutubeError):
        youtube.search_video_url("Coldplay", "Yellow")


def test_search_empty_query_returns_none_without_calling_api(monkeypatch, youtube):
    calls = []
    monkeypatch.setattr("requests.get", lambda *a, **kw: calls.append(1))
    assert youtube.search_video_url("", "") is None
    assert calls == []


def test_search_videos_returns_multiple_candidates_from_one_call(monkeypatch, youtube):
    """A cota da API é por CHAMADA, não por resultado — pedir vários de uma
    vez (pro "sugerir outro" do modal) não custa mais caro que pedir um só."""
    calls = []

    def fake_get(url, params=None, timeout=None):
        calls.append(params)
        assert params["maxResults"] == 5
        return _FakeResponse(200, {"items": [
            {"id": {"videoId": "aaaaaaaaaaa"}, "snippet": {"title": "Yellow (Official Video)"}},
            {"id": {"videoId": "bbbbbbbbbbb"}, "snippet": {"title": "Yellow (Live)"}},
        ]})

    monkeypatch.setattr("requests.get", fake_get)
    results = youtube.search_videos("Coldplay", "Yellow")
    assert len(calls) == 1
    assert results == [
        {"video_id": "aaaaaaaaaaa", "title": "Yellow (Official Video)", "url": "https://www.youtube.com/watch?v=aaaaaaaaaaa"},
        {"video_id": "bbbbbbbbbbb", "title": "Yellow (Live)", "url": "https://www.youtube.com/watch?v=bbbbbbbbbbb"},
    ]


def test_search_strips_cifra_site_noise_from_query(monkeypatch, youtube):
    """Pedido do usuário: intérprete/título mal importados de sites de
    cifra (ex.: "CifraClub" salvo como se fosse o intérprete) não podem
    virar parte da busca no YouTube."""
    captured = {}

    def fake_get(url, params=None, timeout=None):
        captured["q"] = params["q"]
        return _FakeResponse(200, {"items": []})

    monkeypatch.setattr("requests.get", fake_get)
    youtube.search_videos("CifraClub", "Brigas - CIFRAS CLUBE")
    assert "cifra" not in captured["q"].lower()
    assert "club" not in captured["q"].lower()
    assert "Brigas" in captured["q"]


def test_search_query_with_only_noise_words_returns_empty_without_calling_api(monkeypatch, youtube):
    calls = []
    monkeypatch.setattr("requests.get", lambda *a, **kw: calls.append(1))
    assert youtube.search_videos("CifraClub", "Cifras Clube") == []
    assert calls == []
