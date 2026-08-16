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
