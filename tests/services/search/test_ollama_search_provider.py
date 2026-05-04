"""Tests for the Ollama web-search provider adapter."""

from __future__ import annotations

from typing import Any

import pytest

from deeptutor.services.search.providers.ollama import OllamaSearchProvider


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, Any]) -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = ""

    def json(self) -> dict[str, Any]:
        return self._payload


def _success_payload() -> dict[str, Any]:
    return {
        "results": [
            {
                "title": "Result One",
                "url": "https://example.com/one",
                "content": "First content snippet",
            },
            {
                "title": "Result Two",
                "url": "https://example.com/two",
                "content": "Second content snippet",
            },
        ]
    }


def test_ollama_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def fake_post(url: str, **kwargs: Any) -> _FakeResponse:
        captured["url"] = url
        captured["json"] = kwargs.get("json")
        captured["headers"] = kwargs.get("headers")
        captured["timeout"] = kwargs.get("timeout")
        return _FakeResponse(200, _success_payload())

    monkeypatch.setattr(
        "deeptutor.services.search.providers.ollama.requests.post",
        fake_post,
    )

    provider = OllamaSearchProvider(api_key="test-key")
    response = provider.search("what is ollama", count=2)

    assert captured["url"] == "https://ollama.com/api/web_search"
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["headers"]["Content-Type"] == "application/json"
    assert captured["json"] == {"query": "what is ollama", "max_results": 2}
    assert "api_key" not in captured["json"]

    assert response.provider == "ollama"
    assert response.answer == ""
    assert response.model == "ollama"
    assert len(response.search_results) == 2
    first = response.search_results[0]
    assert first.title == "Result One"
    assert first.url == "https://example.com/one"
    assert first.snippet == "First content snippet"
    assert len(response.citations) == 2


def test_ollama_count_clamped(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def fake_post(url: str, **kwargs: Any) -> _FakeResponse:
        captured["json"] = kwargs.get("json")
        return _FakeResponse(200, _success_payload())

    monkeypatch.setattr(
        "deeptutor.services.search.providers.ollama.requests.post",
        fake_post,
    )
    provider = OllamaSearchProvider(api_key="test-key")
    provider.search("hello", count=999)
    assert captured["json"]["max_results"] == 10
    provider.search("hello", count=0)
    assert captured["json"]["max_results"] == 1


def test_ollama_skips_results_without_url(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "results": [
            {"title": "no url here", "content": "..."},
            {"title": "Has URL", "url": "https://example.com/x", "content": "snippet"},
        ]
    }
    monkeypatch.setattr(
        "deeptutor.services.search.providers.ollama.requests.post",
        lambda *_a, **_kw: _FakeResponse(200, payload),
    )
    provider = OllamaSearchProvider(api_key="test-key")
    response = provider.search("hello")
    assert len(response.search_results) == 1
    assert response.search_results[0].url == "https://example.com/x"


def test_ollama_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    error_payload = {"error": "unauthorized"}
    monkeypatch.setattr(
        "deeptutor.services.search.providers.ollama.requests.post",
        lambda *_a, **_kw: _FakeResponse(401, error_payload),
    )
    provider = OllamaSearchProvider(api_key="bad-key")
    with pytest.raises(Exception) as exc_info:
        provider.search("hello")
    msg = str(exc_info.value)
    assert "401" in msg
    assert "unauthorized" in msg


def test_ollama_registered_in_provider_registry() -> None:
    from deeptutor.services.search.providers import get_provider, list_providers

    assert "ollama" in list_providers()
    instance = get_provider("ollama", api_key="test-key")
    assert instance.name == "ollama"
    assert instance.display_name == "Ollama"
    assert instance.supports_answer is False


def test_ollama_listed_in_settings_choices() -> None:
    from deeptutor.api.routers.settings import _provider_choices

    choices = _provider_choices()
    search_values = [p["value"] for p in choices["search"]]
    assert "ollama" in search_values


def test_ollama_in_runtime_supported_set() -> None:
    from deeptutor.services.config.provider_runtime import (
        SEARCH_ENV_FALLBACK,
        SUPPORTED_SEARCH_PROVIDERS,
    )

    assert "ollama" in SUPPORTED_SEARCH_PROVIDERS
    assert SEARCH_ENV_FALLBACK["ollama"] == ("OLLAMA_API_KEY",)
